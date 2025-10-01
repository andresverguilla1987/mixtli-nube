// Mixtli Nube — Backend (Render + iDrive e2 S3-compatible + Thumbnails)
// Express API con CORS, presign PUT, complete (sharp), y list agrupado por álbum.
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import sharp from "sharp";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---------- ENV ----------
const {
  PORT = 8080,
  ALLOWED_ORIGINS = '["*"]',
  E2_ENDPOINT,          // ej: https://<endpoint-regional>.idrivee2-<region>.com  (desde tu consola e2)
  E2_ACCESS_KEY_ID,
  E2_SECRET_ACCESS_KEY,
  E2_BUCKET,
  // Dominio público (opcional) para servir archivos/miniaturas si tu bucket/edge es público
  E2_PUBLIC_BASE,
} = process.env;

if(!E2_ENDPOINT || !E2_ACCESS_KEY_ID || !E2_SECRET_ACCESS_KEY || !E2_BUCKET){
  console.warn("⚠️  Faltan variables E2: E2_ENDPOINT, E2_ACCESS_KEY_ID, E2_SECRET_ACCESS_KEY, E2_BUCKET");
}

const app = express();
app.use(express.json({ limit: "10mb" }));

let allowed;
try { allowed = JSON.parse(ALLOWED_ORIGINS); } catch { allowed = ["*"]; }
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes("*") || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed: " + origin));
  },
  methods: ["GET","POST","OPTIONS","PUT"],
  allowedHeaders: ["Content-Type","x-mixtli-token"]
}));
app.options("*", cors());

// ---------- S3 (iDrive e2) ----------
const s3 = new S3Client({
  region: "auto",
  endpoint: E2_ENDPOINT,          // IMPORTANTE: usa el endpoint de e2 (S3 compatible)
  forcePathStyle: true,           // e2 suele requerir path-style
  credentials: {
    accessKeyId: E2_ACCESS_KEY_ID,
    secretAccessKey: E2_SECRET_ACCESS_KEY,
  },
});

// Helpers
const bytes = (n)=> n==null ? 0 : Number(n);
const cleanKey = (k="") => k.replace(/^\/+/, "");
const albumOf = (key="") => {
  const m = key.match(/^albums\/([^\/]+)\/.+$/);
  return m ? decodeURIComponent(m[1]) : "misc";
};
const thumbKeyOf = (origKey="") => {
  const parts = origKey.split("/");
  const file = parts.pop() || "file";
  const album = parts.length>=2 && parts[0]==="albums" ? parts[1] : "misc";
  const outName = file.replace(/\.(png|jpg|jpeg|webp|gif|avif|heic)$/i, "") + ".jpg";
  return `thumbs/${album}/${outName}`;
};
const joinPublic = (base, key) => `${base.replace(/\/+$/,"")}/${encodeURIComponent(key).replace(/%2F/g,"/")}`;

// ---------- Rutas API ----------
const router = express.Router();

router.get("/salud", (req,res)=> res.json({ ok:true, ts: Date.now() }));

// Presign para PUT directo al bucket
router.post("/presign", async (req,res) => {
  try{
    const { key, contentType="application/octet-stream" } = req.body || {};
    if(!key) return res.status(400).json({ ok:false, message:"key requerida" });
    const Key = cleanKey(key);
    const put = new PutObjectCommand({ Bucket: E2_BUCKET, Key, ContentType: contentType });
    const url = await getSignedUrl(s3, put, { expiresIn: 60 * 5 });
    return res.json({ ok:true, url });
  }catch(err){
    console.error("presign error", err);
    return res.status(500).json({ ok:false, message: String(err) });
  }
});

// Complete: genera miniatura 480x320 JPG y la sube a thumbs/<album>/<name>.jpg
router.post("/complete", async (req,res) => {
  try{
    const { key } = req.body || {};
    if(!key) return res.status(400).json({ ok:false, message:"key requerida" });
    const Key = cleanKey(key);

    // 1) Obtener original
    let inputBuffer;
    try{
      if(E2_PUBLIC_BASE){
        const publicUrl = joinPublic(E2_PUBLIC_BASE, Key);
        const r = await fetch(publicUrl);
        if(!r.ok) throw new Error(`GET public ${r.status}`);
        inputBuffer = Buffer.from(await r.arrayBuffer());
      }else{
        const get = new GetObjectCommand({ Bucket: E2_BUCKET, Key });
        const r = await s3.send(get);
        inputBuffer = Buffer.from(await r.Body.transformToByteArray());
      }
    }catch(err){
      console.error("complete:GetObject", err);
      return res.status(500).json({ ok:false, message:"No se pudo leer original para hacer thumb" });
    }

    // 2) Procesar con sharp
    const out = await sharp(inputBuffer).rotate().resize(480, 320, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
    const thumbKey = thumbKeyOf(Key);

    // 3) Subir thumb
    await s3.send(new PutObjectCommand({
      Bucket: E2_BUCKET, Key: thumbKey, Body: out, ContentType: "image/jpeg"
    }));

    return res.json({ ok:true, thumbKey });
  }catch(err){
    console.error("complete error", err);
    return res.status(500).json({ ok:false, message: String(err) });
  }
});

// List agrupado por álbum (usa prefijo albums/)
router.get("/list", async (req,res)=> {
  try{
    let ContinuationToken = undefined;
    const all = [];
    do{
      const out = await s3.send(new ListObjectsV2Command({
        Bucket: E2_BUCKET, Prefix: "albums/", ContinuationToken
      }));
      (out.Contents||[]).forEach(obj => all.push(obj));
      ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
    }while(ContinuationToken);

    const albums = new Map();
    for(const obj of all){
      const key = String(obj.Key);
      const album = albumOf(key);
      const size = bytes(obj.Size);
      const updatedAt = obj.LastModified ? new Date(obj.LastModified).toISOString() : null;
      const url = E2_PUBLIC_BASE ? joinPublic(E2_PUBLIC_BASE, key) : null;
      const entry = { key, size, url, updatedAt };
      if(!albums.has(album)) albums.set(album, { id: album, name: album, items: [], updatedAt });
      const a = albums.get(album);
      a.items.push(entry);
      a.updatedAt = updatedAt || a.updatedAt;
    }

    // Vincular thumbs si existen
    try{
      let CT = undefined; const thumbs = [];
      do{
        const out = await s3.send(new ListObjectsV2Command({
          Bucket: E2_BUCKET, Prefix: "thumbs/", ContinuationToken: CT
        }));
        (out.Contents||[]).forEach(obj => thumbs.push(obj.Key));
        CT = out.IsTruncated ? out.NextContinuationToken : undefined;
      }while(CT);
      const tset = new Set(thumbs);
      for(const a of albums.values()){
        for(const item of a.items){
          const tKey = thumbKeyOf(item.key);
          if(tset.has(tKey)){
            item.thumbnail = E2_PUBLIC_BASE ? joinPublic(E2_PUBLIC_BASE, tKey) : null;
          }
        }
      }
    }catch(e){ console.warn("thumbs listing skipped:", e.message); }

    const list = Array.from(albums.values()).sort((x,y)=> new Date(y.updatedAt||0) - new Date(x.updatedAt||0));
    res.json({ ok:true, albums: list });
  }catch(err){
    console.error("list error", err);
    res.status(500).json({ ok:false, message: String(err) });
  }
});

// JSON 404 para /api
router.use((req,res)=> res.status(404).json({ ok:false, message:"Ruta no encontrada", path: req.path }));

app.use("/api", router);

// Raíz (informativo)
app.get("/", (req,res)=> res.status(404).send("Mixtli API — usa /api/*"));

// Start
app.listen(PORT, ()=> console.log("Mixtli API on", PORT));
