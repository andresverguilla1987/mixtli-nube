import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { S3Client, ListObjectsV2Command, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/* ====== ENV esperadas (iDrive e2) ======
   S3_ENDPOINT=https://x3j7.or2.idrivee2-60.com
   S3_BUCKET=1mixtlinube3
   S3_REGION=us-east-1
   S3_FORCE_PATH_STYLE=true
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   ALLOWED_ORIGINS=https://*.netlify.app,https://mixtli-nube.onrender.com
======================================== */

const S3_ENDPOINT = process.env.S3_ENDPOINT;          // host e2 (sin /bucket)
const S3_BUCKET   = process.env.S3_BUCKET;
const S3_REGION   = process.env.S3_REGION || 'us-east-1';
const FORCE_PATH_STYLE = String(process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false';

const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  forcePathStyle: FORCE_PATH_STYLE, // e2 lo requiere
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
});

function errInfo(e) {
  return {
    name: e?.name,
    message: e?.message,
    http: e?.$metadata?.httpStatusCode,
    $metadata: e?.$metadata || null
  };
}

const app = express();

/* ---------- CORS (comodines soportados) ---------- */
const allowListRaw = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const allowRegexes = allowListRaw
  .filter(p => p.includes('*'))
  .map(p => new RegExp('^' + p
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // escapa regex
    .replace(/\\\*/g, '.*')                 // convierte * a .*
  + '$'));

const allowListExact = new Set(allowListRaw.filter(p => !p.includes('*')));

console.log('[CORS] allow =', allowListRaw.length ? allowListRaw : '(empty → allow all)');
app.use((req, _res, next) => {
  if (req.headers.origin) console.log('[CORS] Origin:', req.headers.origin);
  next();
});

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowListRaw.length === 0 || allowListRaw.includes('*')) return cb(null, true);
    if (allowListExact.has(origin)) return cb(null, true);
    if (allowRegexes.some(rx => rx.test(origin))) return cb(null, true);
    return cb(new Error('CORS not allowed for ' + origin));
  },
  credentials: false
}));
app.options('*', cors());

/* ---------- Middlewares ---------- */
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

/* ---------- Health & Diagnóstico ---------- */
app.get(['/salud','/api/health','/healthz'], async (_req, res) => {
  try {
    const r = await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    res.json({ ok: true, storage: 'up', bucket: S3_BUCKET, code: r?.$metadata?.httpStatusCode || 200 });
  } catch (e) {
    res.json({ ok: true, storage: 'down', bucket: S3_BUCKET, error: errInfo(e) });
  }
});

app.get('/api/diag', async (_req, res) => {
  const diag = {
    s3: {
      endpoint: S3_ENDPOINT,
      bucket: S3_BUCKET,
      region: S3_REGION,
      forcePathStyle: FORCE_PATH_STYLE
    },
    allowed_origins: allowListRaw.length ? allowListRaw : '(empty → allow all)'
  };
  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    diag.headBucket = { ok: true };
  } catch (e) {
    diag.headBucket = { ok: false, error: errInfo(e) };
  }
  res.json({ ok: true, diag });
});

/* ---------- Self-test upload (servidor → e2, sin CORS del navegador) ---------- */
app.post('/api/self-test-upload', async (req, res) => {
  try {
    const album = (req.body?.album || 'personal').toString().trim() || 'personal';
    const key = (album.endsWith('/') ? album : album + '/') + '__diag_' + Date.now() + '.txt';
    const put = await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET, Key: key, Body: 'ok', ContentType: 'text/plain'
    }));
    res.json({ ok: true, key, code: put?.$metadata?.httpStatusCode || 200 });
  } catch (e) {
    res.status(502).json({ ok: false, message: 'Self test failed', error: errInfo(e) });
  }
});

/* ---------- Listado ---------- */
app.get(['/api/list','/api/album/list'], async (req, res) => {
  const album = String(req.query.album || '').trim() || 'personal';
  const Prefix = album.endsWith('/') ? album : album + '/';
  try {
    const out = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix }));
    const items = (out.Contents || []).map(o => ({
      key: o.Key,
      size: o.Size,
      etag: o.ETag,
      lastModified: o.LastModified
    }));
    res.json({ ok: true, album, items });
  } catch (e) {
    console.error('list error', e);
    res.status(502).json({ ok: false, code: 'STORAGE_DOWN', message: 'Error consultando almacenamiento', detail: errInfo(e) });
  }
});

/* ---------- Presign PUT (uno) ---------- */
app.post('/api/presign', async (req, res) => {
  try {
    const { filename, key, contentType, album } = req.body || {};
    const cleanName = (filename || key || '').toString().trim();
    if (!cleanName) return res.status(400).json({ ok: false, message: 'filename o key requerido' });

    const folder = (album || 'personal').toString().trim() || 'personal';
    const Key = (folder.endsWith('/') ? folder : (folder + '/')) + cleanName;

    const putCmd = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key,
      ContentType: contentType || 'application/octet-stream'
    });
    const url = await getSignedUrl(s3, putCmd, { expiresIn: 60 * 5 });
    res.json({ ok: true, url, key: Key, expiresIn: 300 });
  } catch (e) {
    console.error('presign error', e);
    res.status(500).json({ ok: false, message: 'No se pudo presignar', detail: errInfo(e) });
  }
});

/* ---------- Presign PUT (batch) ---------- */
app.post('/api/presign-batch', async (req, res) => {
  try {
    const { files, album } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, message: 'files[] requerido' });
    }
    const folder = (album || 'personal').toString().trim() || 'personal';
    const results = [];
    for (const f of files) {
      const name = (f?.filename || f?.key || '').toString().trim();
      const ctype = (f?.contentType) || 'application/octet-stream';
      if (!name) { results.push({ ok: false, error: 'filename o key requerido' }); continue; }
      const Key = (folder.endsWith('/') ? folder : (folder + '/')) + name;
      const putCmd = new PutObjectCommand({ Bucket: S3_BUCKET, Key, ContentType: ctype });
      const url = await getSignedUrl(s3, putCmd, { expiresIn: 60 * 5 });
      results.push({ ok: true, url, key: Key, expiresIn: 300 });
    }
    res.json({ ok: true, results });
  } catch (e) {
    console.error('presign-batch error', e);
    res.status(500).json({ ok: false, message: 'No se pudo presignar batch', detail: errInfo(e) });
  }
});

/* ---------- Root ---------- */
app.get('/', (_req, res) => res.json({
  ok: true,
  name: 'Mixtli backend fix v3 (e2)',
  time: new Date().toISOString()
}));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('Mixtli backend fix on :' + PORT);
  console.log('[Tip] S3_ENDPOINT debe ser HOSTNAME e2 (sin /bucket).');
  console.log('[Tip] S3_FORCE_PATH_STYLE=true para iDrive e2.');
});
