const express = require('express');
const app = express();
app.use(express.json());

// ---- Basic CORS (restrict to your Netlify) ----
const ALLOWED = (process.env.ALLOWED_ORIGINS || '["https://lovely-bienenstitch-6344a1.netlify.app"]').split(',').map(s => s.trim()).map(s => {
  try { return JSON.parse(s); } catch { return s; }
}).flat(); // allow passing as JSON array or comma-separated

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED.includes(origin) || ALLOWED.includes("*"))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,HEAD,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-mixtli-token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ---- Health endpoints ----
app.get('/salud', (_req, res) => res.status(200).json({ ok: true, service: 'mixtli-relay', now: new Date().toISOString() }));
app.get(['/health','/api/health'], (_req, res) => res.status(200).json({ ok: true, service: 'mixtli-relay', now: new Date().toISOString() }));

// ---- S3 Client (IDrive e2 / S3 compatible) ----
const { S3Client, HeadBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const S3_ENDPOINT = process.env.S3_ENDPOINT;              // e.g. https://x3j7.or2.idrivee2-60.com
const S3_REGION = process.env.S3_REGION || 'us-east-1';   // IDrive e2 commonly uses us-east-1 for SDK
const S3_BUCKET = process.env.S3_BUCKET;                  // e.g. 1mixtlinube3
const FORCE_PATH = String(process.env.S3_FORCE_PATH_STYLE || 'true') === 'true';

const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  forcePathStyle: FORCE_PATH,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
});

// ---- Diagnostics ----
app.get('/api/diag', (_req, res) => {
  res.json({
    ok: true,
    s3: {
      endpoint: S3_ENDPOINT,
      bucket: S3_BUCKET,
      region: S3_REGION,
      forcePathStyle: FORCE_PATH,
      hasKey: !!process.env.S3_ACCESS_KEY_ID,
      hasSecret: !!process.env.S3_SECRET_ACCESS_KEY
    },
    cors: { allowed: ALLOWED }
  });
});

app.get('/api/check-bucket', async (_req, res) => {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    res.json({ ok: true, bucketExists: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.name, message: e.message });
  }
});

// ---- Presign PUT for uploads ----
// POST /api/presign  { filename, contentType, bytes }
app.post(['/presign','/api/presign'], async (req, res) => {
  try {
    const { filename, contentType, bytes } = req.body || {};
    if (!filename || !contentType) {
      return res.status(400).json({ ok: false, error: 'Missing filename/contentType' });
    }
    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `uploads/${Date.now()}_${safeName}`;
    const cmd = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ...(bytes ? { ContentLength: bytes } : {}),
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 900 }); // 15 min
    res.json({ ok: true, url, key, expiresIn: 900 });
  } catch (e) {
    res.status(500).json({ ok: false, name: e.name, message: e.message });
  }
});

// Return 405 for GET on presign to avoid confusion
app.get(['/presign','/api/presign'], (_req, res) => res.status(405).send('Use POST /api/presign'));

// ---- Start ----
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Mixtli Relay on ${PORT}`);
});
