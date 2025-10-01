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

const ALLOWED_ORIGINS = (()=>{ try { return JSON.parse(process.env.ALLOWED_ORIGINS||'[]') } catch { return [] } })()
app.use(cors({ origin: (o,cb)=>{ if(!o||ALLOWED_ORIGINS.includes(o)) return cb(null,true); cb(new Error('CORS '+o)) }, credentials:true }))

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'auto',
  forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE||'true')==='true',
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
})
const BUCKET = process.env.S3_BUCKET
const PUBLIC_BASE = process.env.S3_PUBLIC_BASE || null
const SIGNED_GET_EXPIRES = Number(process.env.SIGNED_GET_EXPIRES || 3600)
const SIGNED_PUT_EXPIRES = Number(process.env.SIGNED_PUT_EXPIRES || 3600)

const isImage = (key, ct='') => ct.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(key)
const thumbKey = key => `thumbs/${key}.jpg`

app.get('/salud', (req,res)=> res.json({ ok:true, svc:'mixtli-thumbs', t:new Date().toISOString() }))

app.post('/api/presign', async (req,res)=>{
  try {
    const { key, contentType } = req.body||{}
    if(!key) return res.status(400).json({ ok:false, message:'key requerido' })
    const put = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType||'application/octet-stream' })
    const url = await getSignedUrl(s3, put, { expiresIn: SIGNED_PUT_EXPIRES })
    res.json({ ok:true, url, key })
  } catch(e){ res.status(500).json({ ok:false, message:e.message }) }
})

app.post('/api/presign-batch', async (req,res)=>{
  try {
    const { items } = req.body||{}
    if(!Array.isArray(items)) return res.status(400).json({ ok:false, message:'items[] requerido' })
    const out = []
    for (const it of items) {
      const put = new PutObjectCommand({ Bucket: BUCKET, Key: it.key, ContentType: it.contentType||'application/octet-stream' })
      const url = await getSignedUrl(s3, put, { expiresIn: SIGNED_PUT_EXPIRES })
      out.push({ key: it.key, url })
    }
    res.json({ ok:true, items: out })
  } catch(e){ res.status(500).json({ ok:false, message:e.message }) }
})

app.post('/api/complete', async (req,res)=>{
  try {
    const { key } = req.body||{}
    if(!key) return res.status(400).json({ ok:false, message:'key requerido' })
    let ct=''
    try { const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); ct = head.ContentType||'' } catch {}
    if (isImage(key, ct)) {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
      const buf = await obj.Body.transformToByteArray()
      const tbuf = await sharp(buf).resize(480,320,{fit:'cover'}).jpeg({ quality:80 }).toBuffer()
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: thumbKey(key), Body: tbuf, ContentType:'image/jpeg', CacheControl:'public, max-age=31536000' }))
    }
    res.json({ ok:true })
  } catch(e){ res.status(500).json({ ok:false, message:e.message }) }
})

const getUrl = async (key) => {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/${key}`
  const get = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return await getSignedUrl(s3, get, { expiresIn: SIGNED_GET_EXPIRES })
}

app.get('/api/list', async (req,res)=>{
  try {
    const prefix = 'albums/'
    let token; const list=[]
    do{
      const out = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }))
      token = out.IsTruncated ? out.NextContinuationToken : null
      for (const it of (out.Contents||[])) { if(!it.Key.endsWith('/')) list.push({ key: it.Key, size: it.Size, updatedAt: it.LastModified?.toISOString?.() }) }
    }while(token)
    const albums = {}
    for (const o of list) {
      const parts = o.key.split('/'); const albumId = parts[1]||'root'
      if(!albums[albumId]) albums[albumId] = { id: albumId, name: albumId.replace(/[-_]/g,' ').replace(/\b\w/g,m=>m.toUpperCase()), items: [], updatedAt: o.updatedAt }
      const url = await getUrl(o.key)
      const turl = await getUrl(thumbKey(o.key)).catch(()=>null)
      albums[albumId].items.push({ key:o.key, url, thumbnail: turl, size:o.size, updatedAt:o.updatedAt })
      if(!albums[albumId].updatedAt || (o.updatedAt && o.updatedAt > albums[albumId].updatedAt)) albums[albumId].updatedAt = o.updatedAt
    }
    res.json({ ok:true, albums: Object.values(albums) })
  } catch(e){ res.status(500).json({ ok:false, message:e.message }) }
})

const PORT = process.env.PORT || 10000
app.listen(PORT, ()=> console.log('Mixtli thumbs on :' + PORT))
