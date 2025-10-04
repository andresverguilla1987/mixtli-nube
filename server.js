// server.js (Mixtli backend e2 – fast, batch, delete, keep-alive)
import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { HttpsAgent } from 'agentkeepalive';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import {
  S3Client,
  ListObjectsV2Command,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ====== ENV (iDrive e2 mapeado a S3_*) ======
const S3_ENDPOINT = process.env.S3_ENDPOINT;             // p.ej. https://x3j7.or2.idrivee2-60.com  (SIN /bucket)
const S3_BUCKET   = process.env.S3_BUCKET;               // p.ej. 1mixtlinube3
const S3_REGION   = process.env.S3_REGION || 'us-east-1';
const FORCE_PATH_STYLE = String(process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false'; // e2 => true
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';       // para borrar

if (!S3_ENDPOINT || !S3_BUCKET) {
  console.warn('[WARN] Faltan S3_ENDPOINT y/o S3_BUCKET');
}

// ====== HTTP keep-alive para el SDK ======
const httpsAgent = new HttpsAgent({
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 100,
  maxFreeSockets: 20,
  timeout: 20_000,      // socket timeout
  freeSocketTimeout: 15_000
});

const requestHandler = new NodeHttpHandler({
  httpsAgent,
  connectionTimeout: 2_000,
  socketTimeout: 20_000
});

// ====== S3 CLIENT (e2) ======
const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  forcePathStyle: FORCE_PATH_STYLE,
  requestHandler,
  retryMode: 'adaptive',
  maxAttempts: 3,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
});

// ====== APP / CORS / Seguridad / Compresión ======
const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginOpenerPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// ALLOWED_ORIGINS puede venir como JSON '["https://foo","https://*.netlify.app"]' o CSV:
function parseAllowedOrigins(src) {
  if (!src) return [];
  const t = src.trim();
  if (t.startsWith('[')) { try { return JSON.parse(t); } catch { /* noop */ } }
  return t.split(',').map(s => s.trim()).filter(Boolean);
}
const allowListRaw = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

// Convierte wildcard *.dominio a RegExp
const allowRegexes = allowListRaw
  .filter(p => p.includes('*'))
  .map(p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '.*') + '$'));
const allowListExact = new Set(allowListRaw.filter(p => !p.includes('*')));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowListRaw.length === 0 || allowListRaw.includes('*')) return cb(null, true);
    if (allowListExact.has(origin)) return cb(null, true);
    if (allowRegexes.some(rx => rx.test(origin))) return cb(null, true);
    return cb(new Error('CORS not allowed for ' + origin));
  }
}));

// ====== HELPERS ======
function safeAlbum(name) {
  const a = String(name || '').trim() || 'personal';
  return a.replace(/^\.+/, '').replace(/\/{2,}/g, '/').replace(/^\//, '').replace(/\.\./g, '');
}
function cacheShort(res) {
  res.set('Cache-Control', 'public, max-age=30'); // micro-cache para list/presign json
}

// ====== RUTAS ======

// Salud simple
app.get(['/salud', '/api/health', '/healthz'], async (_req, res) => {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    res.json({ ok: true, storage: 'up', bucket: S3_BUCKET });
  } catch (e) {
    res.status(200).json({ ok: true, storage: 'down', bucket: S3_BUCKET, error: e?.name || 'unknown', detail: e?.message });
  }
});

// Diagnóstico
app.get('/api/diag', async (_req, res) => {
  const diag = { s3: { endpoint: S3_ENDPOINT, bucket: S3_BUCKET, region: S3_REGION, forcePathStyle: FORCE_PATH_STYLE }, allowed_origins: allowListRaw };
  try { await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET })); diag.headBucket = { ok: true }; }
  catch (e) { diag.headBucket = { ok: false, error: { name: e?.name || 'unknown', message: e?.message, http: e?.$metadata?.httpStatusCode } }; }
  cacheShort(res); res.json({ ok: true, diag });
});

// Listar (paginado)  /api/list?album=personal&limit=500&token=XYZ
app.get(['/api/list', '/api/album/list'], async (req, res) => {
  const album = safeAlbum(req.query.album);
  const Prefix = album.endsWith('/') ? album : album + '/';
  const MaxKeys = Math.min(1000, Math.max(1, parseInt(req.query.limit || '1000', 10)));
  const ContinuationToken = req.query.token ? String(req.query.token) : undefined;
  try {
    const out = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix, MaxKeys, ContinuationToken }));
    const items = (out.Contents || []).map(o => ({ key: o.Key, size: o.Size, etag: o.ETag, lastModified: o.LastModified }));
    cacheShort(res);
    res.json({ ok: true, album, items, isTruncated: !!out.IsTruncated, nextToken: out.NextContinuationToken || null });
  } catch (e) {
    console.error('list error', e);
    res.status(502).json({ ok: false, code: 'STORAGE_DOWN', message: 'Error consultando almacenamiento', detail: e?.message });
  }
});

// Pre-firma subida (single)
app.post('/api/presign', async (req, res) => {
  try {
    const { filename, key, contentType, album } = req.body || {};
    const cleanName = (filename || key || '').toString().trim();
    if (!cleanName) return res.status(400).json({ ok: false, message: 'filename o key requerido' });
    const folder = safeAlbum(album);
    const Key = (folder.endsWith('/') ? folder : (folder + '/')) + cleanName;
    const putCmd = new PutObjectCommand({ Bucket: S3_BUCKET, Key, ContentType: contentType || 'application/octet-stream' });
    const url = await getSignedUrl(s3, putCmd, { expiresIn: 60 * 5 });
    cacheShort(res); res.json({ ok: true, url, key: Key, expiresIn: 300 });
  } catch (e) {
    console.error('presign error', e);
    res.status(500).json({ ok: false, message: 'No se pudo presignar', detail: e?.message });
  }
});

// Pre-firma subida (batch)
app.post('/api/presign-batch', async (req, res) => {
  try {
    const { files, album } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ ok: false, message: 'files[] requerido' });
    const folder = safeAlbum(album);
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
    cacheShort(res); res.json({ ok: true, results });
  } catch (e) {
    console.error('presign-batch error', e);
    res.status(500).json({ ok: false, message: 'No se pudo presignar batch', detail: e?.message });
  }
});

// Firma de lectura (single)
app.get('/api/sign-get', async (req, res) => {
  try {
    const key = String(req.query.key || '').trim();
    const expires = Math.min(900, Math.max(30, parseInt(req.query.expires || '300', 10)));
    if (!key) return res.status(400).json({ ok: false, message: 'key requerido' });
    const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, ResponseCacheControl: 'public,max-age=86400,immutable' });
    const url = await getSignedUrl(s3, cmd, { expiresIn: expires });
    cacheShort(res); res.json({ ok: true, url });
  } catch (e) {
    console.error('sign-get error', e);
    res.status(500).json({ ok: false, message: 'sign-get failed', detail: e?.message });
  }
});

// Firma de lectura (batch)
app.post('/api/sign-get-batch', async (req, res) => {
  try {
    const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
    const expires = Math.min(900, Math.max(30, parseInt(req.body?.expires || '300', 10)));
    if (!keys.length) return res.status(400).json({ ok: false, message: 'keys[] requerido' });
    const results = await Promise.all(keys.map(async (key) => {
      try {
        const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: String(key), ResponseCacheControl: 'public,max-age=86400,immutable' });
        const url = await getSignedUrl(s3, cmd, { expiresIn: expires });
        return { key, url };
      } catch (e) {
        return { key, url: null, error: e?.name || 'err' };
      }
    }));
    cacheShort(res); res.json({ ok: true, results });
  } catch (e) {
    console.error('sign-get-batch error', e);
    res.status(500).json({ ok: false, message: 'sign-get-batch failed', detail: e?.message });
  }
});

// Borrado (batch) – requiere header X-Admin-Token
app.post('/api/delete-batch', async (req, res) => {
  if (!ADMIN_TOKEN) return res.status(403).json({ ok:false, message:'ADMIN_TOKEN no configurado' });
  const tok = req.get('X-Admin-Token') || '';
  if (tok !== ADMIN_TOKEN) return res.status(401).json({ ok:false, message:'Token inválido' });

  const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
  if (!keys.length) return res.status(400).json({ ok:false, message:'keys[] requerido' });

  try {
    const Objects = keys.map(Key => ({ Key:String(Key) }));
    const out = await s3.send(new DeleteObjectsCommand({ Bucket: S3_BUCKET, Delete: { Objects, Quiet: true }}));
    res.json({ ok:true, results:[{ deleted:(out?.Deleted||[]).map(d=>d.Key) }] });
  } catch (e) {
    console.error('delete-batch error', e);
    res.status(500).json({ ok:false, message:'delete-batch failed', detail:e?.message });
  }
});

// Raíz
app.get('/', (_req, res) => res.json({ ok: true, name: 'Mixtli backend (e2) fast', time: new Date().toISOString() }));

// ====== START ======
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('Mixtli backend on :' + PORT);
  console.log('[Tip] iDrive e2 -> S3_FORCE_PATH_STYLE=true, endpoint = hostname sin /bucket');
});
