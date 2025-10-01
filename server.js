
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('node:path');
const sharp = require('sharp');
const {
  S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');

const app = express();
app.use(express.json({ limit: '2mb' }));

// ---- Defensive ALLOWED_ORIGINS parsing ----
function parseAllowedOrigins(raw) {
  if (!raw) return ['http://localhost:3000','http://localhost:8888'];
  const cleaned = String(raw).replace(/^ALLOWED_ORIGINS\s*=/i, '').trim();
  if (!cleaned) return ['http://localhost:3000','http://localhost:8888'];
  if (cleaned.startsWith('[')) {
    try {
      const arr = JSON.parse(cleaned);
      if (Array.isArray(arr) && arr.length) return arr.map(s=>String(s).trim()).filter(Boolean);
    } catch (_) {}
    return ['http://localhost:3000','http://localhost:8888'];
  }
  return cleaned.split(',').map(s=>s.trim()).filter(Boolean);
}
const allowed = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
app.use(cors({ origin: allowed }));

// ---- S3 Client ----
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
});
const BUCKET = process.env.S3_BUCKET;

// ---- helpers ----
function sendOk(res, data = {}) { if (!res.headersSent) res.json({ ok: true, ...data }); }
function sendErr(res, code, e) {
  if (res.headersSent) return;
  const body = e && e.name ? { ok:false, name:e.name, message:e.message } : { ok:false, error:String(e||'error') };
  res.status(code).json(body);
}
const slug = (s)=> String(s||'').normalize('NFKD').replace(/[^\w\s.-]/g,'').trim().replace(/\s+/g,'-').toLowerCase().slice(0,80);
const safeName = (n)=> String(n||'file.bin').replace(/[^a-zA-Z0-9._-]/g,'_');

// ---- health ----
app.get(['/','/salud','/api/health'], (_req,res)=> sendOk(res, { service: 'Mixtli Relay', allowed, t: Date.now() }));

// ---- presign GET / batch ----
app.post(['/presign-get','/api/presign-get'], async (req,res) => {
  try{
    const { key, expiresIn=900 } = req.body || {};
    if(!key) return sendErr(res, 400, { name:'BadRequest', message:'Missing key' });
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
    sendOk(res, { url, expiresIn });
  }catch(e){ sendErr(res, 500, e); }
});
app.post(['/presign-batch','/api/presign-batch'], async (req,res) => {
  try{
    const { keys, expiresIn=900 } = req.body || {};
    if(!Array.isArray(keys) || !keys.length) return sendErr(res, 400, { name:'BadRequest', message:'Missing keys' });
    const out = {};
    await Promise.all(keys.map(async (k)=>{
      out[k] = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: k }), { expiresIn });
    }));
    sendOk(res, { urls: out, expiresIn });
  }catch(e){ sendErr(res, 500, e); }
});

// ---- upload (multer) + thumbnail generation ----
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 * 1024 } }); // 10GB
app.post(['/upload','/api/upload'], upload.single('file'), async (req, res) => {
  try{
    if (!req.file) return sendErr(res, 400, { name:'NoFile', message:'no file' });
    const album = slug(req.body?.album || '');
    const base = album ? `albums/${album}` : 'uploads';
    const fname = safeName(req.file.originalname);
    const key = `${base}/${Date.now()}_${fname}`;

    // Upload original
    const uploader = new Upload({
      client: s3,
      params: { Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype || 'application/octet-stream' },
      queueSize: 4, partSize: 8 * 1024 * 1024
    });
    await uploader.done();

    // If image, generate thumbnail to thumbs/<key>.jpg
    const isImg = /image\/(png|jpe?g|webp|gif|avif)/i.test(req.file.mimetype || '');
    let thumbKey = null;
    if (isImg) {
      try{
        const tbuf = await sharp(req.file.buffer).rotate().resize({ width: 480, height: 320, fit: 'cover' }).jpeg({ quality: 78 }).toBuffer();
        thumbKey = `thumbs/${key}.jpg`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET, Key: thumbKey, Body: tbuf, ContentType: 'image/jpeg'
        }));
      }catch(thErr){
        console.warn('thumb failed:', thErr?.message || thErr);
      }
    }

    sendOk(res, { key, thumbKey });
  }catch(e){ sendErr(res, 500, e); }
});

// ---- list albums ----
app.get(['/albums','/api/albums'], async (req,res) => {
  try{
    const Prefix = 'albums/'; const Delimiter = '/';
    const cmd = new ListObjectsV2Command({ Bucket: BUCKET, Prefix, Delimiter, MaxKeys: 1000 });
    const resp = await s3.send(cmd);
    const out = (resp.CommonPrefixes || []).map(p => (p.Prefix||'').slice(Prefix.length, -1)).filter(Boolean);
    sendOk(res, { albums: out });
  }catch(e){ sendErr(res, 500, e); }
});

// ---- list items (excluye manifest) ----
app.get(['/list','/api/list'], async (req,res) => {
  try{
    const album = slug(req.query.album || '');
    const prefix = album ? `albums/${album}/` : 'uploads/';
    const max = Math.min(parseInt(req.query.max || '60',10), 1000);
    const token = req.query.token || undefined;

    const cmd = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: max, ContinuationToken: token });
    const r = await s3.send(cmd);
    const items = (r.Contents || [])
      .filter(o=>o.Key !== prefix && !o.Key.endsWith('/manifest.json'))
      .sort((a,b)=> (b.LastModified?.getTime()||0) - (a.LastModified?.getTime()||0))
      .map(o => ({
        key: o.Key,
        size: o.Size,
        lastModified: o.LastModified ? o.LastModified.toISOString() : null,
        ext: path.extname(o.Key||'').slice(1).toLowerCase(),
        thumb: `thumbs/${o.Key}.jpg`
      }));
    sendOk(res, { items, nextToken: r.IsTruncated ? r.NextContinuationToken : null, prefix });
  }catch(e){ sendErr(res, 500, e); }
});

// ---- album manifest (favorites) ----
async function getManifest(album){
  const mkey = `albums/${album}/manifest.json`;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: mkey }));
    const buf = await obj.Body.transformToByteArray();
    const txt = Buffer.from(buf).toString('utf8');
    const json = JSON.parse(txt);
    return { key: mkey, json: json && typeof json==='object' ? json : {} };
  } catch (e) {
    return { key: mkey, json: {} };
  }
}
app.get(['/album-manifest','/api/album-manifest'], async (req,res) => {
  try{
    const album = slug(req.query.album || '');
    if(!album) return sendErr(res, 400, { name:'BadRequest', message:'Missing album' });
    const m = await getManifest(album);
    sendOk(res, { key: m.key, manifest: m.json });
  }catch(e){ sendErr(res, 500, e); }
});
app.post(['/album-manifest','/api/album-manifest'], async (req,res) => {
  try{
    const album = slug(req.body?.album || '');
    const favorites = Array.isArray(req.body?.favorites) ? req.body.favorites : [];
    if(!album) return sendErr(res, 400, { name:'BadRequest', message:'Missing album' });
    const mkey = `albums/${album}/manifest.json`;
    const body = Buffer.from(JSON.stringify({ favorites }, null, 2));
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: mkey, Body: body, ContentType: 'application/json; charset=utf-8'
    }));
    sendOk(res, { key: mkey, favorites });
  }catch(e){ sendErr(res, 500, e); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log('Mixtli Relay on', PORT));
