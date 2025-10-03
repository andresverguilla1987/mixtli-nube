// Mixtli Relay + Admin + PIN + ZIP por álbum
import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import archiver from "archiver";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  PORT = 8080,
  S3_ENDPOINT,
  S3_REGION = "auto",
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE = "true",
  ALLOWED_ORIGINS = '["*"]',
  ADMIN_TOKEN = "",
  ACCESS_SECRET
} = process.env;

const need = (k) => {
  const v = process.env[k];
  if (!v || !String(v).trim()) throw new Error(`Falta env ${k}`);
  return String(v).trim();
};
const clean = (k="") => String(k).replace(/^\/+/, "");

// S3
const s3 = new S3Client({
  region: S3_REGION || "auto",
  endpoint: need("S3_ENDPOINT"),
  forcePathStyle: String(S3_FORCE_PATH_STYLE).toLowerCase() !== "false",
  credentials: { accessKeyId: need("S3_ACCESS_KEY_ID"), secretAccessKey: need("S3_SECRET_ACCESS_KEY") },
});

// App + CORS
const app = express();
let allowed; try { allowed = JSON.parse(ALLOWED_ORIGINS); } catch { allowed = ["*"]; }
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes("*") || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed: " + origin));
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","x-admin-token","x-album-token"]
}));
app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

// Multer
const upload = multer({ storage: multer.memoryStorage() });

// Helpers
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
  await s3.send(new CopyObjectCommand({ Bucket, CopySource: `/${Bucket}/${encodeURIComponent(fromKey).replace(/%2F/g,"/")}`, Key: toKey }));
}
async function deleteMany(keys){
  const Bucket = need("S3_BUCKET");
  if (!keys.length) return;
  if (keys.length === 1){
    await s3.send(new DeleteObjectCommand({ Bucket, Key: keys[0] }));
  } else {
    for (let i=0; i<keys.length; i+=1000){
      const chunk = keys.slice(i,i+1000);
      await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: chunk.map(Key=>({Key})) } }));
    }
  }
}
const h256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const sign = (payload) => {
  const secret = String(ACCESS_SECRET || ADMIN_TOKEN || "mixtli");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
};
const verify = (token) => {
  const secret = String(ACCESS_SECRET || ADMIN_TOKEN || "mixtli");
  const [body,sig] = String(token||"").split(".");
  if(!body||!sig) return null;
  const check = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (check!==sig) return null;
  try{
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  }catch{return null;}
};

function requireAdmin(req,res,next){
  if (!ADMIN_TOKEN || !ADMIN_TOKEN.trim()){
    return res.status(500).json({ ok:false, where:"admin", message:"Configura ADMIN_TOKEN en el servidor." });
  }
  const tok = req.headers["x-admin-token"];
  if (tok && String(tok) === String(ADMIN_TOKEN)) return next();
  return res.status(401).json({ ok:false, where:"admin", message:"Token inválido" });
}

// Públicos
app.get("/", (req,res)=> res.json({ ok:true, service:"Mixtli Relay + Admin + PIN + ZIP", use:"/api/*" }));
app.get("/api/salud", (req,res)=> res.json({ ok:true, ts: Date.now() }));
app.get("/api/diag", (req,res)=>{
  res.json({ ok:true, origin:req.headers.origin||null, contentType:req.headers["content-type"]||null, allowedOrigins: allowed,
    bucket:S3_BUCKET||null, endpoint:S3_ENDPOINT||null, forcePathStyle: String(S3_FORCE_PATH_STYLE).toLowerCase()!=="false" });
});

app.post("/api/upload", upload.single("file"), async (req,res)=>{
  try {
    const Bucket = need("S3_BUCKET");
    const Key = clean(String(req.query.key || ""));
    if (!Key) return res.status(400).json({ ok:false, where:"input", message:"?key=albums/<album>/<archivo> requerido" });
    if (!req.file || !req.file.buffer) return res.status(400).json({ ok:false, where:"input", message:"FormData 'file' requerido" });
    const ContentType = req.file.mimetype || "application/octet-stream";
    await s3.send(new PutObjectCommand({ Bucket, Key, Body: req.file.buffer, ContentType }));
    res.json({ ok:true, key: Key, size: req.file.size, contentType: ContentType });
  } catch (e) { res.status(500).json({ ok:false, where:"upload", message: String(e?.message || e) }); }
});

app.post("/api/presign-get", async (req,res)=>{
  try {
    const Bucket = need("S3_BUCKET");
    const { key, expiresIn = 900 } = req.body || {};
    if (!key) return res.status(400).json({ ok:false, where:"input", message:"key requerido" });
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: clean(key) }), { expiresIn });
    res.json({ ok:true, url, expiresIn });
  } catch (e) { res.status(500).json({ ok:false, where:"presign-get", message: String(e?.message || e) }); }
});

// PIN por álbum
const pinKey = (album) => `meta/albums/${album}.pin`;

app.post("/api/admin/album/pin/set", requireAdmin, async (req,res)=>{
  try{
    const { album, pin } = req.body || {};
    if(!album || !pin) return res.status(400).json({ ok:false, message:"album y pin requeridos" });
    const Bucket = need("S3_BUCKET");
    const Key = pinKey(album);
    const Body = Buffer.from(h256(String(pin)), "utf8");
    await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType:"text/plain" }));
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ ok:false, where:"pin.set", message:String(e?.message||e) }); }
});

app.post("/api/album/pin/check", async (req,res)=>{
  try{
    const { album, pin } = req.body || {};
    if(!album || !pin) return res.status(400).json({ ok:false, message:"album y pin requeridos" });
    const Bucket = need("S3_BUCKET");
    const Key = pinKey(album);
    try{ await s3.send(new HeadObjectCommand({ Bucket, Key })); }
    catch(e){ return res.json({ ok:false, message:"álbum sin PIN o no existe" }); }
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: 60 });
    const txt = await fetch(url).then(r=>r.text());
    const hash = txt.trim();
    if (hash !== h256(String(pin))) return res.json({ ok:false, message:"PIN incorrecto" });
    const exp = Date.now() + 60*60*1000; // 1h
    const accessToken = sign({ album, exp });
    res.json({ ok:true, accessToken, exp });
  }catch(e){ res.status(500).json({ ok:false, where:"pin.check", message:String(e?.message||e) }); }
});

app.get("/api/album/list", async (req,res)=>{
  try{
    const album = String(req.query.album||"").replace(/^\/+|\/+$/g,"");
    if(!album) return res.status(400).json({ ok:false, message:"album requerido" });
    const Bucket = need("S3_BUCKET");
    const Key = pinKey(album);
    let hasPin = false;
    try{ await s3.send(new HeadObjectCommand({ Bucket, Key })); hasPin = true; }catch{ hasPin = false; }
    if (hasPin){
      const tok = req.headers["x-album-token"];
      const payload = verify(tok);
      if (!payload || payload.album !== album) return res.status(401).json({ ok:false, message:"token inválido/expirado" });
    }
    const prefix = `albums/${album}/`;
    const keys = await listAll(prefix);
    const items = keys.map(k => ({ key:k, url:`/${k}` }));
    res.json({ ok:true, album, items, protected: hasPin });
  }catch(e){ res.status(500).json({ ok:false, where:"album.list", message:String(e?.message||e) }); }
});

// -------- ZIP por álbum o selección --------
app.post("/api/album/zip", async (req,res)=>{
  try{
    const { album, keys } = req.body || {};
    if(!album) return res.status(400).json({ ok:false, message:"album requerido" });
    // validar token si está protegido
    const Bucket = need("S3_BUCKET");
    const Key = pinKey(album);
    let hasPin=false;
    try{ await s3.send(new HeadObjectCommand({ Bucket, Key })); hasPin = true; }catch{ hasPin=false; }
    if (hasPin){
      const tok = req.headers["x-album-token"];
      const payload = verify(tok);
      if (!payload || payload.album !== album) return res.status(401).json({ ok:false, message:"token inválido/expirado" });
    }

    // determinar lista de archivos
    let list = Array.isArray(keys) && keys.length ? keys.map(clean) : await listAll(`albums/${album}/`);
    if (!list.length) return res.status(404).json({ ok:false, message:"No hay archivos" });

    // headers de descarga
    const fname = `${album}-${Date.now()}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

    // crear zip y hacer pipe al response
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", err => { try{ res.status(500).end(); }catch{} });
    archive.pipe(res);

    // ir anexando streams desde S3
    for (const k of list){
      const cmd = new GetObjectCommand({ Bucket, Key: k });
      const obj = await s3.send(cmd);
      const stream = obj.Body; // Readable
      const rel = k.split("/").slice(2).join("/"); // remover albums/<album>/
      archive.append(stream, { name: rel || k.split("/").pop() });
    }
    archive.finalize();
  }catch(e){
    res.status(500).json({ ok:false, where:"album.zip", message:String(e?.message||e) });
  }
});

// Admin
app.post("/api/admin/ping", requireAdmin, (req,res)=> res.json({ ok:true, admin:true }));
app.post("/api/admin/item/delete", requireAdmin, async (req,res)=>{
  try{
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ ok:false, message:"key requerido" });
    const ts = new Date().toISOString().replace(/[:.]/g,"-");
    const fromKey = clean(key);
    const toKey = clean(`trash/${ts}/${fromKey}`);
    await copyOne(fromKey, toKey); await deleteMany([fromKey]);
    return res.json({ ok:true, moved: toKey });
  }catch(e){ return res.status(500).json({ ok:false, where:"item.delete", message:String(e?.message||e) }); }
});
app.post("/api/admin/item/rename", requireAdmin, async (req,res)=>{
  try{
    const { from, to } = req.body || {};
    if (!from || !to) return res.status(400).json({ ok:false, message:"from y to requeridos" });
    const fromKey = clean(from); const toKey = clean(to);
    await copyOne(fromKey, toKey); await deleteMany([fromKey]);
    return res.json({ ok:true, from: fromKey, to: toKey });
  }catch(e){ return res.status(500).json({ ok:false, where:"item.rename", message:String(e?.message||e) }); }
});
app.post("/api/admin/album/trash", requireAdmin, async (req,res)=>{
  try{
    const { album } = req.body || {};
    if (!album) return res.status(400).json({ ok:false, message:"album requerido" });
    const prefix = `albums/${album.replace(/^\/+|\/+$/g,"")}/`;
    const keys = await listAll(prefix);
    if (!keys.length) return res.json({ ok:true, moved: 0 });
    const ts = new Date().toISOString().replace(/[:.]/g,"-");
    for (const k of keys){ await copyOne(k, `trash/${ts}/${k}`); }
    await deleteMany(keys);
    return res.json({ ok:true, moved: keys.length, prefix });
  }catch(e){ return res.status(500).json({ ok:false, where:"album.trash", message:String(e?.message||e) }); }
});
app.post("/api/admin/album/restore", requireAdmin, async (req,res)=>{
  try{
    const { album } = req.body || {};
    if (!album) return res.status(400).json({ ok:false, message:"album requerido" });
    const trashKeys = await listAll(`trash/`);
    const snaps = trashKeys
      .filter(k => /trash\/[^/]+\/albums\//.test(k) && k.includes(`/albums/${album}/`))
      .map(k => k.split("/").slice(0,2).join("/"));
    const uniq = Array.from(new Set(snaps)).sort();
    if (!uniq.length) return res.json({ ok:false, message:"no hay snapshot en trash para ese álbum" });
    const lastSnap = uniq[uniq.length-1];
    const snapPrefix = `${lastSnap}/albums/${album.replace(/^\/+|\/+$/g,"")}/`;
    const files = trashKeys.filter(k => k.startsWith(snapPrefix));
    for (const k of files){ const rel = k.substring(`${lastSnap}/`.length); await copyOne(k, rel); }
    return res.json({ ok:true, restored: files.length, snapshot: lastSnap });
  }catch(e){ return res.status(500).json({ ok:false, where:"album.restore", message:String(e?.message||e) }); }
});

app.use((req,res)=> res.status(404).json({ ok:false, message:"Ruta no encontrada", path:req.path }));
app.listen(PORT, ()=> console.log("Mixtli Relay + Admin + PIN + ZIP on", PORT));
