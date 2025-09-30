
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
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

// Optional: small access log for content-type
app.use((req,res,next)=>{ console.log(`${req.method} ${req.url} ct=${req.headers['content-type']||''}`); next(); });

// ---- S3 Client (IDrive e2 compatible) ----
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

// ---- health/diag ----
app.get(['/','/salud','/api/health'], (_req,res)=> sendOk(res, { service: 'Mixtli Relay', allowed, t: Date.now() }));
app.get(['/diag','/api/diag'], (_req,res)=> sendOk(res, {
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    bucket: BUCKET,
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
    hasKey: !!process.env.S3_ACCESS_KEY_ID,
    hasSecret: !!process.env.S3_SECRET_ACCESS_KEY
  },
  cors: { allowed }
}));
app.get(['/check-bucket','/api/check-bucket'], async (_req,res) => {
  try { await s3.send(new HeadBucketCommand({ Bucket: BUCKET })); sendOk(res, { bucketExists: true }); }
  catch(e){ sendErr(res, 500, e); }
});

// ---- presign PUT (opcional) ----
app.post(['/presign','/api/presign'], async (req,res) => {
  try{
    const { filename, contentType, bytes } = req.body || {};
    if(!filename) return sendErr(res, 400, { name:'BadRequest', message:'Missing filename' });
    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g,'_');
    const key = `uploads/${Date.now()}_${safe}`;
    const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType || 'application/octet-stream', ContentLength: bytes || undefined });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 900 });
    sendOk(res, { url, key });
  }catch(e){ sendErr(res, 500, e); }
});

// ---- upload via server (Multer, memoryStorage) ----
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 * 1024 } }); // 10GB
app.post(['/upload','/api/upload'], upload.single('file'), async (req, res) => {
  try{
    if (!req.file) return sendErr(res, 400, { name:'NoFile', message:'no file' });
    const safe = String(req.file.originalname || 'file.bin').replace(/[^a-zA-Z0-9._-]/g,'_');
    const key = `uploads/${Date.now()}_${safe}`;

    // Usa multipart upload si pesa mucho; si no, un solo put también funciona.
    const uploader = new Upload({
      client: s3,
      params: { Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype || 'application/octet-stream' },
      queueSize: 4,
      partSize: 8 * 1024 * 1024
    });
    await uploader.done();
    sendOk(res, { key });
  }catch(e){ sendErr(res, 500, e); }
});

// ---- presign GET ----
app.post(['/presign-get','/api/presign-get'], async (req,res) => {
  try{
    const { key } = req.body || {};
    if(!key) return sendErr(res, 400, { name:'BadRequest', message:'Missing key' });
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 900 });
    sendOk(res, { url, expiresIn: 900 });
  }catch(e){ sendErr(res, 500, e); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log('Mixtli Relay on', PORT));
