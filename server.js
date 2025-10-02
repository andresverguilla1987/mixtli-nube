// Mixtli Relay (multer upload) + ADMIN (delete/rename/trash/restore)
import express from "express";
import cors from "cors";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ===== Env =====
const {
  PORT = 8080,
  S3_ENDPOINT,
  S3_REGION = "auto",
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE = "true",
  ALLOWED_ORIGINS = '["*"]',
  ADMIN_TOKEN = ""
} = process.env;

const need = (k) => {
  const v = process.env[k];
  if (!v || !String(v).trim()) throw new Error(`Falta env ${k}`);
  return String(v).trim();
};
const clean = (k="") => String(k).replace(/^\/+/, "");

// ===== S3 client =====
const s3 = new S3Client({
  region: S3_REGION || "auto",
  endpoint: need("S3_ENDPOINT"),
  forcePathStyle: String(S3_FORCE_PATH_STYLE).toLowerCase() !== "false",
  credentials: {
    accessKeyId: need("S3_ACCESS_KEY_ID"),
    secretAccessKey: need("S3_SECRET_ACCESS_KEY"),
  },
});

// ===== App & CORS =====
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

// ===== Multer (memoria) =====
const upload = multer({ storage: multer.memoryStorage() });

// ===== Helpers S3 =====
async function listAll(prefix){
  const Bucket = need("S3_BUCKET");
  let ContinuationToken, out = [];
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }));
    (r.Contents || []).forEach(o => out.push(o.Key));
    ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out;
}
async function copyOne(fromKey, toKey){
  const Bucket = need("S3_BUCKET");
  await s3.send(new CopyObjectCommand({
    Bucket,
    CopySource: `/${Bucket}/${encodeURIComponent(fromKey).replace(/%2F/g,"/")}`,
    Key: toKey
  }));
}
async function deleteMany(keys){
  const Bucket = need("S3_BUCKET");
  if (!keys.length) return;
  if (keys.length === 1){
    await s3.send(new DeleteObjectCommand({ Bucket, Key: keys[0] }));
  } else {
    // Batch by 1000
    for (let i=0; i<keys.length; i+=1000){
      const chunk = keys.slice(i,i+1000);
      await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: chunk.map(Key=>({Key})) } }));
    }
  }
}

// ===== Auth admin =====
function requireAdmin(req,res,next){
  if (!ADMIN_TOKEN || !ADMIN_TOKEN.trim()){
    return res.status(500).json({ ok:false, where:"admin", message:"Configura ADMIN_TOKEN en el servidor." });
  }
  const tok = req.headers["x-admin-token"];
  if (tok && String(tok) === String(ADMIN_TOKEN)) return next();
  return res.status(401).json({ ok:false, where:"admin", message:"Token inválido" });
}

// ===== Públicos =====
app.get("/", (req,res)=> res.json({ ok:true, service:"Mixtli Relay Upload + Admin", use:"/api/*" }));
app.get("/api/salud", (req,res)=> res.json({ ok:true, ts: Date.now() }));
app.get("/api/diag", (req,res)=>{
  res.json({
    ok:true,
    origin:req.headers.origin || null,
    contentType:req.headers["content-type"] || null,
    allowedOrigins: allowed,
    bucket:S3_BUCKET || null,
    endpoint:S3_ENDPOINT || null,
    forcePathStyle: String(S3_FORCE_PATH_STYLE).toLowerCase() !== "false"
  });
});

// Subida via backend (evita CORS del bucket)
app.post("/api/upload", upload.single("file"), async (req,res)=>{
  try {
    const Bucket = need("S3_BUCKET");
    const Key = clean(String(req.query.key || ""));
    if (!Key) return res.status(400).json({ ok:false, where:"input", message:"?key=albums/<album>/<archivo> requerido" });
    if (!req.file || !req.file.buffer) return res.status(400).json({ ok:false, where:"input", message:"FormData 'file' requerido" });

    const ContentType = req.file.mimetype || "application/octet-stream";
    await s3.send(new PutObjectCommand({ Bucket, Key, Body: req.file.buffer, ContentType }));

    res.json({ ok:true, key: Key, size: req.file.size, contentType: ContentType });
  } catch (e) {
    res.status(500).json({ ok:false, where:"upload", message: String(e?.message || e) });
  }
});

// Link privado temporal (GET presign)
app.post("/api/presign-get", async (req,res)=>{
  try {
    const Bucket = need("S3_BUCKET");
    const { key, expiresIn = 900 } = req.body || {};
    if (!key) return res.status(400).json({ ok:false, where:"input", message:"key requerido" });
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: clean(key) }), { expiresIn });
    res.json({ ok:true, url, expiresIn });
  } catch (e) {
    res.status(500).json({ ok:false, where:"presign-get", message: String(e?.message || e) });
  }
});

// ===== ADMIN =====
app.post("/api/admin/ping", requireAdmin, (req,res)=> res.json({ ok:true, admin:true }));

// Borrar (mover a trash con timestamp)
app.post("/api/admin/item/delete", requireAdmin, async (req,res)=>{
  try{
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ ok:false, message:"key requerido" });
    const ts = new Date().toISOString().replace(/[:.]/g,"-");
    const fromKey = clean(key);
    const toKey = clean(`trash/${ts}/${fromKey}`);
    await copyOne(fromKey, toKey);
    await deleteMany([fromKey]);
    return res.json({ ok:true, moved: toKey });
  }catch(e){
    return res.status(500).json({ ok:false, where:"item.delete", message:String(e?.message||e) });
  }
});

// Renombrar un item (copy + delete)
app.post("/api/admin/item/rename", requireAdmin, async (req,res)=>{
  try{
    const { from, to } = req.body || {};
    if (!from || !to) return res.status(400).json({ ok:false, message:"from y to requeridos" });
    const fromKey = clean(from);
    const toKey = clean(to);
    await copyOne(fromKey, toKey);
    await deleteMany([fromKey]);
    return res.json({ ok:true, from: fromKey, to: toKey });
  }catch(e){
    return res.status(500).json({ ok:false, where:"item.rename", message:String(e?.message||e) });
  }
});

// Enviar álbum completo a trash
app.post("/api/admin/album/trash", requireAdmin, async (req,res)=>{
  try{
    const { album } = req.body || {};
    if (!album) return res.status(400).json({ ok:false, message:"album requerido" });
    const prefix = `albums/${album.replace(/^\/+|\/+$/g,"")}/`;
    const keys = await listAll(prefix);
    if (!keys.length) return res.json({ ok:true, moved: 0 });

    const ts = new Date().toISOString().replace(/[:.]/g,"-");
    for (const k of keys){
      const dest = `trash/${ts}/${k}`;
      await copyOne(k, dest);
    }
    await deleteMany(keys);
    return res.json({ ok:true, moved: keys.length, prefix });
  }catch(e){
    return res.status(500).json({ ok:false, where:"album.trash", message:String(e?.message||e) });
  }
});

// Restaurar álbum desde trash (usa el último snapshot del álbum)
app.post("/api/admin/album/restore", requireAdmin, async (req,res)=>{
  try{
    const { album } = req.body || {};
    if (!album) return res.status(400).json({ ok:false, message:"album requerido" });
    // Encuentra el último snapshot en trash para ese álbum
    const trashKeys = await listAll(`trash/`);
    const snaps = trashKeys
      .filter(k => /trash\/[^/]+\/albums\//.test(k) && k.includes(`/albums/${album}/`))
      .map(k => k.split("/").slice(0,2).join("/"));// trash/<ts>
    const uniq = Array.from(new Set(snaps)).sort(); // orden asc
    if (!uniq.length) return res.json({ ok:false, message:"no hay snapshot en trash para ese álbum" });
    const lastSnap = uniq[uniq.length-1]; // último

    const snapPrefix = `${lastSnap}/albums/${album.replace(/^\/+|\/+$/g,"")}/`;
    const files = trashKeys.filter(k => k.startsWith(snapPrefix));
    for (const k of files){
      const rel = k.substring(`${lastSnap}/`.length);
      await copyOne(k, rel); // vuelve a albums/...
    }
    // No borramos el snapshot por seguridad
    return res.json({ ok:true, restored: files.length, snapshot: lastSnap });
  }catch(e){
    return res.status(500).json({ ok:false, where:"album.restore", message:String(e?.message||e) });
  }
});

// Listar trash (simple)
app.get("/api/admin/trash/list", requireAdmin, async (req,res)=>{
  try{
    const prefix = clean(String(req.query.prefix || "trash/"));
    const keys = await listAll(prefix);
    res.json({ ok:true, prefix, keys });
  }catch(e){
    res.status(500).json({ ok:false, where:"trash.list", message:String(e?.message||e) });
  }
});

// 404 JSON
app.use((req,res)=> res.status(404).json({ ok:false, message:"Ruta no encontrada", path:req.path }));

app.listen(PORT, ()=> console.log("Mixtli Relay Upload + Admin on", PORT));
