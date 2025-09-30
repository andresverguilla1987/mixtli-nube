
const express = require('express');
const cors = require('cors');
const { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const Busboy = require('busboy');

const app = express();
app.use(express.json({ limit: '2mb' }));

// CORS (del servidor) para permitir tu Netlify / localhost
const allowed = process.env.ALLOWED_ORIGINS
  ? (process.env.ALLOWED_ORIGINS.includes('[') ? JSON.parse(process.env.ALLOWED_ORIGINS) : process.env.ALLOWED_ORIGINS.split(',').map(s=>s.trim()))
  : ['http://localhost:3000','http://localhost:8888'];
app.use(cors({ origin: allowed, credentials: false }));

// SDK S3 (IDrive e2)
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

// ---------- util ----------
const ok = (res, data={}) => res.json({ ok: true, ...data });
const boom = (res, code, e) => res.status(code).json({ ok:false, name:e.name, message:e.message });

// ---------- health ----------
app.get(['/','/salud','/api/health'], (_req,res)=> ok(res, { service: 'Mixtli Relay', t: Date.now() }));

// ---------- diag ----------
app.get(['/diag','/api/diag'], (_req,res)=> {
  res.json({
    ok:true,
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      bucket: BUCKET,
      region: process.env.S3_REGION || 'us-east-1',
      forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
      hasKey: !!process.env.S3_ACCESS_KEY_ID,
      hasSecret: !!process.env.S3_SECRET_ACCESS_KEY
    },
    cors: { allowed }
  });
});

// ---------- check bucket ----------
app.get(['/check-bucket','/api/check-bucket'], async (_req,res) => {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    ok(res, { bucketExists: true });
  } catch(e) {
    boom(res, 500, e);
  }
});

// ---------- presign PUT (opcional, por si quieres mantenerlo) ----------
app.post(['/presign','/api/presign'], async (req,res) => {
  try{
    const { filename, contentType, bytes } = req.body || {};
    if(!filename) return res.status(400).json({ ok:false, error:'Missing filename' });
    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g,'_');
    const key = `uploads/${Date.now()}_${safe}`;
    const cmd = new PutObjectCommand({
      Bucket: BUCKET, Key: key,
      ContentType: contentType || 'application/octet-stream',
      ContentLength: bytes || undefined
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 900 });
    ok(res, { url, key });
  }catch(e){ boom(res, 500, e); }
});

// ---------- upload via server (no CORS en bucket) ----------
app.post(['/upload','/api/upload'], (req, res) => {
  const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 10 * 1024 * 1024 * 1024 } }); // 10GB
  let settled = false;

  bb.on('file', async (_name, file, info) => {
    const { filename, mimeType } = info;
    const safe = String(filename || 'file.bin').replace(/[^a-zA-Z0-9._-]/g,'_');
    const key = `uploads/${Date.now()}_${safe}`;

    try{
      const uploader = new Upload({
        client: s3,
        params: {
          Bucket: BUCKET,
          Key: key,
          Body: file,
          ContentType: mimeType || 'application/octet-stream'
        },
        queueSize: 4,
        partSize: 8 * 1024 * 1024
      });
      await uploader.done();
      settled = true;
      ok(res, { key });
    }catch(e){
      settled = true;
      boom(res, 500, e);
    }
  });

  bb.on('error', (err)=>{
    if (settled) return;
    settled = true;
    res.status(400).json({ ok:false, error:'bad form-data', detail: err.message });
  });
  bb.on('finish', ()=>{
    if (!settled) {
      settled = true;
      res.status(400).json({ ok:false, error:'no file' });
    }
  });

  req.pipe(bb);
});

// ---------- presign GET (descarga privada) ----------
app.post(['/presign-get','/api/presign-get'], async (req,res) => {
  try{
    const { key } = req.body || {};
    if(!key) return res.status(400).json({ ok:false, error:'Missing key' });
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 900 });
    ok(res, { url, expiresIn: 900 });
  }catch(e){ boom(res, 500, e); }
});

// ---------- start ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log('Mixtli Relay on', PORT));
