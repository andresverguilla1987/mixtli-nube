import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { S3Client, ListObjectsV2Command, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function errInfo(e){
  return {
    name: e?.name,
    message: e?.message,
    code: e?.$metadata?.httpStatusCode,
    meta: e?.$metadata || null
  };
}

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION || 'auto';
const FORCE_PATH_STYLE = String(process.env.S3_FORCE_PATH_STYLE||'true').toLowerCase()!=='false';

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

// CORS allow-list (wildcards supported)
const allowListRaw = (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const allowRegexes = allowListRaw.filter(p => p.includes('*')).map(p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '.*') + '$'));
const allowListExact = new Set(allowListRaw.filter(p => !p.includes('*')));
app.use((req, _res, next) => {
  if (req.headers.origin) console.log('[CORS] Origin:', req.headers.origin);
  next();
});
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowListRaw.length===0 || allowListRaw.includes('*')) return cb(null, true);
    if (allowListExact.has(origin)) return cb(null, true);
    if (allowRegexes.some(rx => rx.test(origin))) return cb(null, true);
    return cb(new Error('CORS not allowed for '+origin));
  }
}));
app.options('*', cors());

app.use(express.json({limit: '2mb'}));
app.use(morgan('dev'));

// Health + detailed storage check
app.get(['/salud','/api/health','/healthz'], async (req,res) => {
  try {
    const r = await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    res.json({ ok:true, storage:'up', bucket:S3_BUCKET, code:r?.$metadata?.httpStatusCode||200 });
  } catch (e) {
    res.json({ ok:true, storage:'down', bucket:S3_BUCKET, error: errInfo(e) });
  }
});

// Diagnostics endpoint
app.get('/api/diag', async (req,res) => {
  const diag = {
    endpoint: S3_ENDPOINT,
    bucket: S3_BUCKET,
    region: S3_REGION,
    forcePathStyle: FORCE_PATH_STYLE,
    allowed_origins: allowListRaw.length ? allowListRaw : '(empty -> allow all)'
  };
  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    diag.headBucket = { ok:true };
  } catch(e){
    diag.headBucket = { ok:false, error: errInfo(e) };
  }
  res.json({ ok:true, diag });
});

// Self-test upload (server-side PUT) - no CORS involved
app.post('/api/self-test-upload', async (req,res) => {
  try{
    const album = (req.body?.album || 'personal').toString().trim() || 'personal';
    const key = (album.endsWith('/')?album:(album+'/')) + '__diag_' + Date.now() + '.txt';
    const put = await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: 'ok',
      ContentType: 'text/plain'
    }));
    res.json({ ok:true, key, code: put?.$metadata?.httpStatusCode||200 });
  } catch(e){
    res.status(502).json({ ok:false, message:'Self test failed', error: errInfo(e) });
  }
});

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
    res.status(502).json({ ok:false, code:'STORAGE_DOWN', detail: errInfo(e) });
  }
});

app.post('/api/presign', async (req, res) => {
  try {
    const { filename, key, contentType, album } = req.body || {};
    const cleanName = (filename||key||'').toString().trim();
    if (!cleanName) {
      return res.status(400).json({ ok:false, message:'filename o key requerido' });
    }
    const folder = (album||'personal').toString().trim() || 'personal';
    const Key = (folder.endsWith('/')?folder:(folder+'/')) + cleanName;
    const putCmd = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key,
      ContentType: contentType || 'application/octet-stream'
    });
    const url = await getSignedUrl(s3, putCmd, { expiresIn: 60*5 });
    res.json({ ok:true, url, key: Key, expiresIn: 300 });
  } catch (e) {
    console.error('presign error', e);
    res.status(500).json({ ok:false, message:'No se pudo presignar', detail: errInfo(e) });
  }
});

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
    res.status(500).json({ ok:false, message:'No se pudo presignar batch', detail: errInfo(e) });
  }
});

app.get('/', (req,res)=>res.json({ ok:true, name:'Mixtli backend fix v3', time:new Date().toISOString() }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>{
  console.log('Mixtli backend fix on :'+PORT);
  console.log('[Tip] Use /api/diag y /api/self-test-upload para diagnosticar credenciales y endpoint.');
});
