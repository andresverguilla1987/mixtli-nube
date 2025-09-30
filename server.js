
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('node:path');
const {
  S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand,
  ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');

const app = express();
app.use(express.json({ limit: '2mb' }));

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

function sendOk(res, data = {}) { if (!res.headersSent) res.json({ ok: true, ...data }); }
function sendErr(res, code, e) {
  if (res.headersSent) return;
  const body = e && e.name ? { ok:false, name:e.name, message:e.message } : { ok:false, error:String(e||'error') };
  res.status(code).json(body);
}
const slug = (s)=> String(s||'').normalize('NFKD').replace(/[^\w\s.-]/g,'').trim().replace(/\s+/g,'-').toLowerCase().slice(0,80);
const safeName = (n)=> String(n||'file.bin').replace(/[^a-zA-Z0-9._-]/g,'_');

app.get(['/','/salud','/api/health'], (_req,res)=> sendOk(res, { service: 'Mixtli Relay', allowed, t: Date.now() }));

// presign
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

// upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 * 1024 } });
app.post(['/upload','/api/upload'], upload.single('file'), async (req, res) => {
  try{
    if (!req.file) return sendErr(res, 400, { name:'NoFile', message:'no file' });
    const album = slug(req.body?.album || '');
    const base = album ? `albums/${album}` : 'uploads';
    const fname = safeName(req.file.originalname);
    const key = `${base}/${Date.now()}_${fname}`;

    const uploader = new Upload({
      client: s3,
      params: { Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype || 'application/octet-stream' },
      queueSize: 4, partSize: 8 * 1024 * 1024
    });
    await uploader.done();
    sendOk(res, { key });
  }catch(e){ sendErr(res, 500, e); }
});

// list albums
app.get(['/albums','/api/albums'], async (req,res) => {
  try{
    const Prefix = 'albums/'; const Delimiter = '/';
    const cmd = new ListObjectsV2Command({ Bucket: BUCKET, Prefix, Delimiter, MaxKeys: 1000 });
    const resp = await s3.send(cmd);
    const out = (resp.CommonPrefixes || []).map(p => (p.Prefix||'').slice(Prefix.length, -1)).filter(Boolean);
    sendOk(res, { albums: out });
  }catch(e){ sendErr(res, 500, e); }
});

// list items
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
        ext: path.extname(o.Key||'').slice(1).toLowerCase()
      }));
    sendOk(res, { items, nextToken: r.IsTruncated ? r.NextContinuationToken : null, prefix });
  }catch(e){ sendErr(res, 500, e); }
});

// --- Admin middleware ---
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
function requireAdmin(req,res,next){
  const t = req.header('X-Admin-Token') || req.query.adminToken;
  if(!ADMIN_TOKEN || t === ADMIN_TOKEN) return next();
  return sendErr(res, 401, { name:'Unauthorized', message:'Bad or missing admin token' });
}

// delete -> move to trash/ + delete original thumb if exists
app.post(['/delete','/api/delete'], requireAdmin, async (req,res)=>{
  try{
    const { key } = req.body || {};
    if(!key) return sendErr(res, 400, { name:'BadRequest', message:'Missing key' });
    const trashKey = `trash/${Date.now()}_${key.replace(/^albums\//,'').replace(/^uploads\//,'')}`;

    // copy to trash
    await s3.send(new CopyObjectCommand({ Bucket: BUCKET, CopySource: `/${BUCKET}/${encodeURIComponent(key).replace(/%2F/g,'/')}`, Key: trashKey }));
    // delete original
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    // delete thumb if exists (best-effort)
    const tkey = `thumbs/${key}.jpg`;
    try{ await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: tkey })); } catch(_){}

    sendOk(res, { trashed: trashKey });
  }catch(e){ sendErr(res, 500, e); }
});

// rename -> copy to new key + delete old + move thumb
app.post(['/rename','/api/rename'], requireAdmin, async (req,res)=>{
  try{
    const { key, newName } = req.body || {};
    if(!key || !newName) return sendErr(res, 400, { name:'BadRequest', message:'Missing key/newName' });
    const base = key.split('/').slice(0,-1).join('/');
    const ext = path.extname(key);
    const clean = newName.endsWith(ext) ? newName : (newName + ext);
    const newKey = `${base}/${clean}`;

    if(newKey === key) return sendOk(res, { key });

    await s3.send(new CopyObjectCommand({ Bucket: BUCKET, CopySource: `/${BUCKET}/${encodeURIComponent(key).replace(/%2F/g,'/')}`, Key: newKey }));
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

    // move thumb if exists
    const oldThumb = `thumbs/${key}.jpg`;
    const newThumb = `thumbs/${newKey}.jpg`;
    try{
      await s3.send(new CopyObjectCommand({ Bucket: BUCKET, CopySource: `/${BUCKET}/${encodeURIComponent(oldThumb).replace(/%2F/g,'/')}`, Key: newThumb }));
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldThumb }));
    } catch(_){}

    sendOk(res, { key: newKey });
  }catch(e){ sendErr(res, 500, e); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log('Mixtli Relay on', PORT));
