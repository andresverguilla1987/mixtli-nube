import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { S3Client, ListObjectsV2Command, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ---- CONFIG ----
const REQUIRED = ['S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'];
const missing = REQUIRED.filter(k => !process.env[k] || String(process.env[k]).trim()==='');
if (missing.length) {
  console.warn('[BOOT] Missing env:', missing.join(', '));
}

const S3_ENDPOINT = process.env.S3_ENDPOINT; // e.g. https://<accountid>.r2.cloudflarestorage.com
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION || 'auto';
const FORCE_PATH_STYLE = String(process.env.S3_FORCE_PATH_STYLE||'true').toLowerCase()!=='false';

// Important: use HOSTNAME endpoint (no bucket suffix). Do NOT use raw IP.
// R2 requires SNI; connecting to an IP will fail TLS.
const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  forcePathStyle: FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
});

const app = express();
app.use(cors({
  origin: (origin, cb) => {
    // Simple CORS allow-list using comma-separated env ALLOWED_ORIGINS
    const allowList = (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
    if (!origin || allowList.length===0 || allowList.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed for '+origin));
  },
  credentials: false
}));
app.use(express.json({limit: '2mb'}));
app.use(morgan('dev'));

// ---- HEALTH ----
app.get(['/salud','/api/health','/healthz'], async (req,res) => {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    res.json({ ok:true, storage:'up', bucket:S3_BUCKET });
  } catch (e) {
    res.status(200).json({ ok:true, storage:'down', bucket:S3_BUCKET, error: e?.name || 'unknown' });
  }
});

// ---- LIST ----
app.get(['/api/list','/api/album/list'], async (req, res) => {
  const album = String(req.query.album || '').trim() || 'personal';
  const Prefix = album.endsWith('/') ? album : album + '/';
  try {
    const out = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix }));
    const items = (out.Contents||[]).map(o => ({
      key: o.Key,
      size: o.Size,
      etag: o.ETag,
      lastModified: o.LastModified
    }));
    res.json({ ok:true, album, items });
  } catch (e) {
    console.error('list error', e);
    res.status(502).json({ ok:false, code:'STORAGE_DOWN', message:'Error consultando almacenamiento', detail: e?.message });
  }
});

// ---- PRESIGN (single) ----
app.post('/api/presign', async (req, res) => {
  try {
    const { filename, key, contentType, album } = req.body || {};
    const cleanName = (filename||key||'').toString().trim();
    if (!cleanName) {
      // Match prior logs: "filename o key requerido"
      return res.status(400).json({ ok:false, message:'filename o key requerido' });
    }
    const folder = (album||'personal').toString().trim() || 'personal';
    const Key = (folder.endsWith('/')?folder:(folder+'/')) + cleanName;
    const putCmd = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key,
      ContentType: contentType || 'application/octet-stream'
    });
    const url = await getSignedUrl(s3, putCmd, { expiresIn: 60*5 }); // 5 min
    res.json({ ok:true, url, key: Key, expiresIn: 300 });
  } catch (e) {
    console.error('presign error', e);
    res.status(500).json({ ok:false, message:'No se pudo presignar', detail: e?.message });
  }
});

// ---- PRESIGN BATCH (optional) ----
app.post('/api/presign-batch', async (req, res) => {
  try {
    const { files, album } = req.body || {};
    if (!Array.isArray(files) || files.length===0) {
      return res.status(400).json({ ok:false, message:'files[] requerido' });
    }
    const folder = (album||'personal').toString().trim() || 'personal';
    const results = [];
    for (const f of files) {
      const name = (f?.filename||f?.key||'').toString().trim();
      const ctype = (f?.contentType)||'application/octet-stream';
      if (!name) {
        results.push({ ok:false, error:'filename o key requerido' });
        continue;
      }
      const Key = (folder.endsWith('/')?folder:(folder+'/')) + name;
      const putCmd = new PutObjectCommand({ Bucket:S3_BUCKET, Key, ContentType: ctype });
      const url = await getSignedUrl(s3, putCmd, { expiresIn: 60*5 });
      results.push({ ok:true, url, key: Key, expiresIn:300 });
    }
    res.json({ ok:true, results });
  } catch (e) {
    console.error('presign-batch error', e);
    res.status(500).json({ ok:false, message:'No se pudo presignar batch', detail: e?.message });
  }
});

// ---- ROOT ----
app.get('/', (req,res)=>res.json({ ok:true, name:'Mixtli backend fix', time:new Date().toISOString() }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>{
  console.log('Mixtli backend fix on :'+PORT);
  console.log('[Tip] Ensure S3_ENDPOINT is a HOSTNAME (no bucket, no IP). Example: https://<accountid>.r2.cloudflarestorage.com');
});
