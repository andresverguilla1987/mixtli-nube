// Mixtli Nube — Backend iDrive e2 (root 200 JSON)
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import sharp from "sharp";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  PORT = 8080,
  ALLOWED_ORIGINS = '["*"]',
  E2_ENDPOINT,
  E2_ACCESS_KEY_ID,
  E2_SECRET_ACCESS_KEY,
  E2_BUCKET,
  E2_PUBLIC_BASE,
} = process.env;

// ---- Helpers ----
const need = (n) => {
  const v = process.env[n];
  if (!v || !String(v).trim()) throw new Error(`Falta variable ${n}`);
  return String(v).trim();
};
const clean = (k="") => k.replace(/^\/+/, "");
const album = (k="") => (k.match(/^albums\/([^\/]+)\//)||[])[1]||"misc";
const tkey  = (k="") => {
  const p = k.split("/");
  const f = p.pop() || "file";
  const a = p.length>=2 && p[0]==="albums" ? p[1] : "misc";
  return `thumbs/${a}/${f.replace(/\.(png|jpg|jpeg|webp|gif|avif|heic)$/i,"")}.jpg`;
};
const pub = (b,k)=> `${b.replace(/\/+$/,"")}/${encodeURIComponent(k).replace(/%2F/g,"/")}`;

// ---- App & CORS ----
const app = express();
app.use(express.json({limit:"10mb"}));
let allowed; try{ allowed = JSON.parse(ALLOWED_ORIGINS); } catch { allowed = ["*"]; }
app.use(cors({
  origin: (o,cb)=>{
    if(!o || allowed.includes("*") || allowed.includes(o)) return cb(null,true);
    return cb(new Error("Origin not allowed: "+o));
  },
  methods:["GET","POST","PUT","OPTIONS"],
  allowedHeaders:["Content-Type"]
}));
app.options("*", cors());

// ---- S3 Client (path-style ON) ----
function makeClient(){
  const endpoint = need("E2_ENDPOINT");
  const accessKeyId = need("E2_ACCESS_KEY_ID");
  const secretAccessKey = need("E2_SECRET_ACCESS_KEY");
  need("E2_BUCKET"); // validate presence now
  return new S3Client({
    region:"auto",
    endpoint,
    forcePathStyle:true,
    credentials:{ accessKeyId, secretAccessKey }
  });
}
const s3 = makeClient();

// ---- Router ----
const r = express.Router();

r.get("/salud", (req,res)=> res.json({ok:true, ts: Date.now()}));

r.get("/debug-env", (req,res)=>{
  res.json({
    ok:true,
    E2_ENDPOINT: !!E2_ENDPOINT,
    E2_BUCKET: E2_BUCKET || null,
    E2_PUBLIC_BASE: E2_PUBLIC_BASE || null,
    ALLOWED_ORIGINS
  });
});

// Sign PUT URL
r.post("/presign", async (req,res)=>{
  try{
    const Bucket = need("E2_BUCKET");
    const { key, contentType="application/octet-stream" } = req.body || {};
    if(!key) return res.status(400).json({ok:false, where:"input", message:"key requerida"});
    const Key = clean(key);
    const cmd = new PutObjectCommand({ Bucket, Key, ContentType: contentType });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60*5 });
    res.json({ ok:true, url });
  }catch(err){
    res.status(500).json({ ok:false, where:"presign", message: String(err?.message || err) });
  }
});

// Complete → generate 480x320
r.post("/complete", async (req,res)=>{
  try{
    const Bucket = need("E2_BUCKET");
    const { key } = req.body || {};
    if(!key) return res.status(400).json({ok:false, where:"input", message:"key requerida"});
    const Key = clean(key);

    let buf;
    if(E2_PUBLIC_BASE){
      const u = pub(E2_PUBLIC_BASE, Key);
      const rr = await fetch(u);
      if(!rr.ok) throw new Error("GET public "+rr.status);
      buf = Buffer.from(await rr.arrayBuffer());
    } else {
      const go = await s3.send(new GetObjectCommand({ Bucket, Key }));
      buf = Buffer.from(await go.Body.transformToByteArray());
    }

    const out = await sharp(buf).rotate().resize(480,320,{fit:"cover"}).jpeg({quality:80}).toBuffer();
    const TK = tkey(Key);
    await s3.send(new PutObjectCommand({ Bucket, Key: TK, Body: out, ContentType:"image/jpeg" }));
    res.json({ ok:true, thumbKey: TK });
  }catch(err){
    res.status(500).json({ ok:false, where:"complete", message: String(err?.message || err) });
  }
});

// List
r.get("/list", async (req,res)=>{
  try{
    const Bucket = need("E2_BUCKET");
    let CT; const all=[];
    do{
      const out = await s3.send(new ListObjectsV2Command({ Bucket, Prefix:"albums/", ContinuationToken: CT }));
      (out.Contents||[]).forEach(o=>all.push(o));
      CT = out.IsTruncated ? out.NextContinuationToken : undefined;
    }while(CT);
    const albums=new Map();
    for(const o of all){
      const k = String(o.Key);
      const a = album(k);
      const entry = {
        key:k,
        size:Number(o.Size||0),
        url: E2_PUBLIC_BASE ? pub(E2_PUBLIC_BASE,k) : null,
        updatedAt: o.LastModified ? new Date(o.LastModified).toISOString() : null
      };
      if(!albums.has(a)) albums.set(a,{id:a,name:a,items:[],updatedAt:entry.updatedAt});
      const A = albums.get(a);
      A.items.push(entry);
      A.updatedAt = entry.updatedAt || A.updatedAt;
    }
    res.json({ ok:true, albums: [...albums.values()] });
  }catch(err){
    res.status(500).json({ ok:false, where:"list", message: String(err?.message || err) });
  }
});

// JSON 404 para rutas no encontradas dentro del router
r.use((req,res)=> res.status(404).json({ ok:false, message:"Ruta no encontrada", path: req.path }));

// Mount (accept both /api/* and /*)
app.use("/api", r);
app.use("/", r);

// Root now responds 200 JSON
app.get("/", (req,res)=> res.json({ ok:true, service:"Mixtli API", use:"/api/*" }));

// Start
app.listen(PORT, ()=> console.log("Mixtli API on", PORT));
