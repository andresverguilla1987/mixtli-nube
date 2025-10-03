// Mixtli Relay • PRIVADO (sin links públicos). Upload + PIN + Admin + ZIP
import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import archiver from "archiver";
import {
  S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command,
  CopyObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  PORT = 8080,
  S3_ENDPOINT, S3_REGION = "auto", S3_BUCKET,
  S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE = "true",
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
  allowedHeaders: ["Content-Type","x-admin-token","x-album-token"]
}));
app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({ storage: multer.memoryStorage() });

// Utils
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

// Salud/diag
app.get("/", (req,res)=> res.json({ ok:true, service:"Mixtli Relay PRIVATE", use:"/api/*" }));
app.get("/api/diag", (req,res)=> res.json({ ok:true, bucket:S3_BUCKET||null, endpoint:S3_ENDPOINT||null }));

// Upload directo (opcional)
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

// Listar álbum
app.get("/api/album/list", async (req,res)=>{
  try{
    const album = String(req.query.album||"").replace(/^\/+|\/+$/g,"");
    if(!album) return res.status(400).json({ ok:false, message:"album requerido" });
    const Bucket = need("S3_BUCKET");
    const Key = pinKey(album);
    let hasPin=false; try{ await s3.send(new HeadObjectCommand({ Bucket, Key })); hasPin=true; }catch{}
    if (hasPin){
      const tok = req.headers["x-album-token"];
      const payload = verify(tok);
      if (!payload || payload.album !== album) return res.status(401).json({ ok:false, message:"token inválido/expirado" });
    }
    const keys = await listAll(`albums/${album}/`);
    res.json({ ok:true, album, protected: hasPin, items: keys.map(k=>({key:k, url:`/${k}`})) });
  }catch(e){ res.status(500).json({ ok:false, where:"album.list", message:String(e?.message||e) }); }
});

// ZIP (privado)
app.post("/api/album/zip", async (req,res)=>{
  try{
    const { album, keys } = req.body || {};
    if(!album) return res.status(400).json({ ok:false, message:"album requerido" });
    // validar token si protegido
    const Bucket = need("S3_BUCKET");
    const Key = pinKey(album);
    let hasPin=false; try{ await s3.send(new HeadObjectCommand({ Bucket, Key })); hasPin=true; }catch{}
    if (hasPin){
      const tok = req.headers["x-album-token"];
      const payload = verify(tok);
      if (!payload || payload.album !== album) return res.status(401).json({ ok:false, message:"token inválido/expirado" });
    }
    let list = Array.isArray(keys) && keys.length ? keys.map(clean) : await listAll(`albums/${album}/`);
    if (!list.length) return res.status(404).json({ ok:false, message:"No hay archivos" });

    const fname = `${album}-${Date.now()}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", () => { try{ res.status(500).end(); }catch{} });
    archive.pipe(res);
    for (const k of list){
      const obj = await s3.send(new GetObjectCommand({ Bucket, Key: k }));
      const stream = obj.Body;
      const rel = k.split("/").slice(2).join("/");
      archive.append(stream, { name: rel || k.split("/").pop() });
    }
    archive.finalize();
  }catch(e){ res.status(500).json({ ok:false, where:"album.zip", message:String(e?.message||e) }); }
});

// Admin básico
app.post("/api/admin/item/delete", async (req,res)=>{
  try{
    const tok = req.headers["x-admin-token"];
    if (String(tok) !== String(ADMIN_TOKEN)) return res.status(401).json({ ok:false, message:"Token inválido" });
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ ok:false, message:"key requerido" });
    const ts = new Date().toISOString().replace(/[:.]/g,"-");
    const fromKey = clean(key);
    const toKey = clean(`trash/${ts}/${fromKey}`);
    await copyOne(fromKey, toKey); await deleteMany([fromKey]);
    return res.json({ ok:true, moved: toKey });
  }catch(e){ return res.status(500).json({ ok:false, where:"item.delete", message:String(e?.message||e) }); }
});
app.post("/api/admin/item/rename", async (req,res)=>{
  try{
    const tok = req.headers["x-admin-token"];
    if (String(tok) !== String(ADMIN_TOKEN)) return res.status(401).json({ ok:false, message:"Token inválido" });
    const { from, to } = req.body || {};
    if (!from || !to) return res.status(400).json({ ok:false, message:"from y to requeridos" });
    const fromKey = clean(from); const toKey = clean(to);
    await copyOne(fromKey, toKey); await deleteMany([fromKey]);
    return res.json({ ok:true, from: fromKey, to: toKey });
  }catch(e){ return res.status(500).json({ ok:false, where:"item.rename", message:String(e?.message||e) }); }
});

// 404
app.use((req,res)=> res.status(404).json({ ok:false, message:"Ruta no encontrada", path:req.path }));
app.listen(PORT, ()=> console.log("Mixtli Relay PRIVATE on", PORT));
