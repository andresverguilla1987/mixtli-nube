
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('node:path');
const crypto = require('node:crypto');
const { S3Client, HeadBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
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
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
});
const BUCKET = process.env.S3_BUCKET;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

const slug = (s)=> String(s||'').normalize('NFKD').replace(/[^\w\s.-]/g,'').trim().replace(/\s+/g,'-').toLowerCase().slice(0,80);
const safeName = (n)=> String(n||'file.bin').replace(/[^a-zA-Z0-9._-]/g,'_');

app.get('/api/health', (_req,res)=> res.json({ ok:true, service:'Mixtli Relay Lossless' }));

// LOSSLESS upload with exact bytes + metadata
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try{
    if (!req.file) return res.status(400).json({ ok:false, name:'NoFile', message:'no file' });
    const album = slug(req.body?.album || '');
    const base = album ? `albums/${album}` : 'uploads';
    const fname = safeName(req.file.originalname);
    const key = `${base}/${Date.now()}_${fname}`;

    const sha256 = require('node:crypto').createHash('sha256').update(req.file.buffer).digest('hex');

    const uploader = new Upload({
      client: s3,
      params: {
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || 'application/octet-stream',
        ContentDisposition: `inline; filename="${fname}"`,
        Metadata: {
          'original-name': fname,
          'original-size': String(req.file.size||0),
          'sha256': sha256
        }
      },
      queueSize: 4, partSize: 8 * 1024 * 1024
    });
    await uploader.done();

    res.json({ ok:true, key, sha256 });
  }catch(e){
    res.status(500).json({ ok:false, name:e.name, message:e.message });
  }
});

app.get('/api/check-bucket', async (_req,res)=>{
  try{ await s3.send(new HeadBucketCommand({ Bucket: BUCKET })); res.json({ ok:true }); }
  catch(e){ res.status(500).json({ ok:false, name:e.name, message:e.message }); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log('Mixtli Relay Lossless on', PORT));
