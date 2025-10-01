import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import sharp from 'sharp'
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const app = express()
app.use(express.json({ limit: '5mb' }))
app.use(morgan('tiny'))

const ALLOWED_ORIGINS = (()=>{
  try { return JSON.parse(process.env.ALLOWED_ORIGINS||'[]') } catch { return [] }
})()

app.use(cors({
  origin: (origin, cb)=>{
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    return cb(new Error('CORS blocked: ' + origin))
  },
  credentials: true
}))

// -------- NEW: friendly root + health --------
app.get('/', (req, res) => {
  res.type('application/json').send({
    ok: true,
    service: 'mixtli-nube',
    endpoints: ['/salud', '/api/health', '/api/presign', '/api/complete', '/api/list']
  });
});
app.get('/api/health', (req, res) => {
  res.json({ ok: true, t: new Date().toISOString() });
});
// ---------------------------------------------

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'auto',
  forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE||'true')==='true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
})

const BUCKET = process.env.S3_BUCKET
const PUBLIC_BASE = process.env.S3_PUBLIC_BASE || null
const SIGNED_GET_EXPIRES = Number(process.env.SIGNED_GET_EXPIRES || 3600)
const SIGNED_PUT_EXPIRES = Number(process.env.SIGNED_PUT_EXPIRES || 3600)

const isImage = (key, contentType='') => {
  if (contentType.startsWith('image/')) return true
  return /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(key)
}

const keyToThumbKey = (key) => `thumbs/${key}.jpg`

app.get('/salud', (req,res)=> res.json({ ok:true, service:'mixtli-thumbs', time:new Date().toISOString() }))

app.post('/api/presign', async (req,res) => {
  try {
    const { key, contentType } = req.body || {}
    if (!key) return res.status(400).json({ ok:false, message:'key requerido' })
    const put = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType||'application/octet-stream' })
    const url = await getSignedUrl(s3, put, { expiresIn: SIGNED_PUT_EXPIRES })
    res.json({ ok:true, url, key })
  } catch (e) {
    res.status(500).json({ ok:false, message: e.message })
  }
})

app.post('/api/presign-batch', async (req,res) => {
  try {
    const { items } = req.body || {}
    if (!Array.isArray(items)) return res.status(400).json({ ok:false, message:'items[] requerido' })
    const out = []
    for (const it of items) {
      const put = new PutObjectCommand({ Bucket: BUCKET, Key: it.key, ContentType: it.contentType||'application/octet-stream' })
      const url = await getSignedUrl(s3, put, { expiresIn: SIGNED_PUT_EXPIRES })
      out.push({ key: it.key, url })
    }
    res.json({ ok:true, items: out })
  } catch (e) {
    res.status(500).json({ ok:false, message: e.message })
  }
})

app.post('/api/complete', async (req,res) => {
  try {
    const { key } = req.body || {}
    if (!key) return res.status(400).json({ ok:false, message:'key requerido' })

    let contentType = ''
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
      contentType = head.ContentType || ''
    } catch {}

    if (isImage(key, contentType)) {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
      const buf = await obj.Body.transformToByteArray()
      const thumbBuf = await sharp(buf).resize(480, 320, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer()
      const tkey = keyToThumbKey(key)
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: tkey, Body: thumbBuf, ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000' }))
    }

    res.json({ ok:true })
  } catch (e) {
    res.status(500).json({ ok:false, message: e.message })
  }
})

const buildGetUrl = async (key) => {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/${key}`
  const get = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return await getSignedUrl(s3, get, { expiresIn: SIGNED_GET_EXPIRES })
}

app.get('/api/list', async (req,res) => {
  try {
    const prefix = 'albums/'
    let token
    const objects = []
    do {
      const out = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }))
      token = out.IsTruncated ? out.NextContinuationToken : null
      for (const it of (out.Contents||[])) {
        if (it.Key.endsWith('/')) continue
        objects.push({ key: it.Key, size: it.Size, updatedAt: it.LastModified?.toISOString?.() })
      }
    } while (token)

    const albums = {}
    for (const obj of objects) {
      const parts = obj.key.split('/')
      const albumId = parts.length > 2 ? parts[1] : 'root'
      if (!albums[albumId]) albums[albumId] = { id: albumId, name: albumId.replace(/[-_]/g,' ').replace(/\b\w/g, m=>m.toUpperCase()), items: [], updatedAt: obj.updatedAt }
      const url = await buildGetUrl(obj.key)
      const tkey = keyToThumbKey(obj.key)
      let turl = null
      try { turl = await buildGetUrl(tkey) } catch {}
      albums[albumId].items.push({ key: obj.key, url, thumbnail: turl, size: obj.size, updatedAt: obj.updatedAt, contentType: '' })
      if (!albums[albumId].updatedAt || (obj.updatedAt && obj.updatedAt > albums[albumId].updatedAt)) albums[albumId].updatedAt = obj.updatedAt
    }

    res.json({ ok:true, albums: Object.values(albums) })
  } catch (e) {
    res.status(500).json({ ok:false, message: e.message })
  }
})

const PORT = process.env.PORT || 8080
app.listen(PORT, '0.0.0.0', ()=> console.log('Mixtli thumbs on :' + PORT))
