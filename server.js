// Mixtli Relay • Thumbs al vuelo + rebuild por álbum
import express from "express";
import cors from "cors";
import sharp from "sharp";
import {
  S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command,
  HeadObjectCommand
} from "@aws-sdk/client-s3";

const {
  PORT = 8080,
  S3_ENDPOINT, S3_REGION = "auto", S3_BUCKET,
  S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE = "true",
  ALLOWED_ORIGINS = '["*"]',
  ADMIN_TOKEN = "",
  THUMB_WIDTH = "480",
  THUMB_HEIGHT = "320",
  THUMB_QUALITY = "76"
} = process.env;

const need = (k) => {
  const v = process.env[k];
  if (!v || !String(v).trim()) throw new Error(`Falta env ${k}`);
  return String(v).trim();
};
const clean = (k="") => String(k).replace(/^\/+/, "");

const s3 = new S3Client({
  region: S3_REGION || "auto",
  endpoint: need("S3_ENDPOINT"),
  forcePathStyle: String(S3_FORCE_PATH_STYLE).toLowerCase() !== "false",
  credentials: { accessKeyId: need("S3_ACCESS_KEY_ID"), secretAccessKey: need("S3_SECRET_ACCESS_KEY") },
});

const app = express();
let allowed; try { allowed = JSON.parse(ALLOWED_ORIGINS); } catch { allowed = ["*"]; }
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes("*") || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed: " + origin));
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","x-admin-token"]
}));
app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (req,res)=> res.json({ ok:true, service:"Mixtli Thumbs Runtime", paths:["GET /thumbs/<album>/<file>.jpg","POST /api/thumbs/rebuild?album=<name>"] }));

function isImageKey(k){
  return /\.(png|jpg|jpeg|webp|gif|avif|heic|tif|tiff)$/i.test(k);
}
function thumbKeyForOriginal(origKey){
  const parts = origKey.split("/");
  if (parts[0] !== "albums") return null;
  const album = parts[1];
  const base = parts.slice(2).join("/").replace(/\.[a-z0-9]+$/i,"") + ".jpg";
  return `thumbs/${album}/${base}`;
}
function origKeyForThumbPath(thumbPath){
  const parts = thumbPath.split("/");
  const album = parts.shift();
  const fileJpg = parts.join("/");
  return { album, base: fileJpg.replace(/\.jpg$/i,"").toLowerCase() };
}

async function exists(Bucket, Key){
  try{ await s3.send(new HeadObjectCommand({ Bucket, Key })); return true; }catch{ return false; }
}
async function listAlbumKeys(album){
  const Bucket = need("S3_BUCKET");
  let ContinuationToken, out = [];
  do{
    const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: `albums/${album}/`, ContinuationToken }));
    (r.Contents||[]).forEach(o=> out.push(o.Key));
    ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
  }while(ContinuationToken);
  return out.filter(isImageKey);
}
async function findOriginalForBase(album, base){
  const keys = await listAlbumKeys(album);
  const match = keys.find(k=> k.toLowerCase().replace(/\.[a-z0-9]+$/i,"").endsWith("/"+base));
  return match || null;
}
async function readObject(Bucket, Key){
  const obj = await s3.send(new GetObjectCommand({ Bucket, Key }));
  const chunks = []; for await (const ch of obj.Body) chunks.push(ch);
  return Buffer.concat(chunks);
}
async function makeThumbBuffer(buffer){
  const w = parseInt(process.env.THUMB_WIDTH||"480", 10);
  const h = parseInt(process.env.THUMB_HEIGHT||"320", 10);
  const q = parseInt(process.env.THUMB_QUALITY||"76", 10);
  return await sharp(buffer, { failOn:"none" })
    .rotate()
    .resize(w, h, { fit: "cover", position: "center", withoutEnlargement: true })
    .jpeg({ quality: q, mozjpeg: true })
    .toBuffer();
}

// GET /thumbs/<album>/<file>.jpg
app.get("/thumbs/*", async (req,res)=>{
  try{
    const Bucket = need("S3_BUCKET");
    const path = clean(req.params[0]||"");
    if (!path) return res.status(400).send("thumb path requerido");
    const Key = `thumbs/${path}`;

    if (await exists(Bucket, Key)){
      const buf = await readObject(Bucket, Key);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.end(buf);
    }

    const [album, ...rest] = path.split("/");
    const base = rest.join("/").replace(/\.jpg$/i,"").toLowerCase();
    const origKey = await findOriginalForBase(album, base);
    if (!origKey) return res.status(404).send("original no encontrado");

    const origBuf = await readObject(Bucket, origKey);
    const tbuf = await makeThumbBuffer(origBuf);
    await s3.send(new PutObjectCommand({ Bucket, Key, Body: tbuf, ContentType:"image/jpeg", CacheControl: "public, max-age=31536000, immutable" }));

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.end(tbuf);
  }catch(e){ return res.status(500).send(String(e?.message||e)); }
});

// POST /api/thumbs/rebuild?album=personal   (admin)
app.post("/api/thumbs/rebuild", async (req,res)=>{
  try{
    if (!ADMIN_TOKEN || String(req.headers["x-admin-token"]) !== String(ADMIN_TOKEN)){
      return res.status(401).json({ ok:false, message:"Token inválido" });
    }
    const album = String(req.query.album||"").trim();
    if (!album) return res.status(400).json({ ok:false, message:"album requerido" });
    const Bucket = need("S3_BUCKET");

    const keys = await listAlbumKeys(album);
    let created=0, skipped=0, failed=0;
    for (const k of keys){
      const tk = thumbKeyForOriginal(k);
      if (!tk) { skipped++; continue; }
      const has = await exists(Bucket, tk);
      if (has){ skipped++; continue; }
      try{
        const buf = await readObject(Bucket, k);
        const tb = await makeThumbBuffer(buf);
        await s3.send(new PutObjectCommand({ Bucket, Key: tk, Body: tb, ContentType:"image/jpeg", CacheControl: "public, max-age=31536000, immutable" }));
        created++;
      }catch{ failed++; }
    }
    return res.json({ ok:true, album, created, skipped, failed });
  }catch(e){ return res.status(500).json({ ok:false, message:String(e?.message||e) }); }
});

app.use((req,res)=> res.status(404).json({ ok:false, message:"Ruta no encontrada", path:req.path }));
app.listen(PORT, ()=> console.log("Mixtli Thumbs Runtime on", PORT));
