import express from "express";
import cors from "cors";
import morgan from "morgan";
import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "node:path";

// ====== ENV ======
const {
  S3_ENDPOINT,
  S3_REGION = "us-east-1",
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE = "true",
  PUBLIC_BASE, // e.g. https://x3j7.or2.idrivee2-60.com/mixtlinube3
  ALLOWED_ORIGINS = "[]",
  PORT = 8080,
} = process.env;

// CORS allowlist (supports prefixes)
let allowed = [];
try { allowed = JSON.parse(ALLOWED_ORIGINS || "[]"); } catch { allowed = []; }

const corsMw = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow server->server and some preflights
    if (allowed.some(o => origin.startsWith(o))) return cb(null, true);
    return cb(new Error(`Origin not allowed: ${origin}`));
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","x-album-token"],
  credentials: false,
});

// ====== S3 client (IDrive e2 compatible) ======
const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT, // https://x3j7.or2.idrivee2-60.com
  forcePathStyle: String(S3_FORCE_PATH_STYLE).toLowerCase() === "true",
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

// ====== App ======
const app = express();
app.use(corsMw);
app.options("*", corsMw);
app.use(express.json({ limit: "20mb" }));
app.use(morgan("tiny"));

// Helpers
const exts = [".jpg",".jpeg",".png",".webp",".gif",".bmp",".avif"];
const isImage = (key) => exts.includes(path.extname(key).toLowerCase());

function toPublicUrl(key) {
  if (!PUBLIC_BASE) return null;
  const base = PUBLIC_BASE.replace(/\/+$/,"");
  return `${base}/${key.replace(/^\/+/,"")}`;
}

// Health
app.get("/salud", (_req,res)=> res.json({ok:true, ts: Date.now()}));
app.get("/api/salud", (_req,res)=> res.json({ok:true, ts: Date.now()}));

// Diag
app.get("/api/diag", async (req,res)=>{
  res.json({
    ok:true,
    routes:["GET /api/list","GET /api/album/list","POST /api/presign","/api/diag","/api/salud"],
    bucket: !!S3_BUCKET,
    endpoint: !!S3_ENDPOINT,
    publicBase: !!PUBLIC_BASE,
    allowedOrigins: allowed,
  });
});

// List (accepts both /api/list and /api/album/list)
async function listHandler(req, res) {
  try {
    const album = String(req.query.album || "personal");
    const prefixes = [
      `${album}/`,
      `albums/${album}/`,
    ];

    let items = [];
    for (const Prefix of prefixes) {
      const out = await s3.send(new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix,
      }));
      const list = (out.Contents || [])
        .map(obj => obj.Key)
        .filter(k => k && isImage(k))
        .map(k => {
          const name = path.basename(k);
          const url = toPublicUrl(k);
          // Guess thumb path
          const baseDir = path.posix.join("thumbs", path.posix.dirname(k));
          const thumb = toPublicUrl(path.posix.join(baseDir, name));
          return ({ key: k, name, url, thumb });
        });
      items = items.concat(list);
    }

    // Dedup keys
    const map = new Map();
    for (const it of items) map.set(it.key, it);
    const final = Array.from(map.values());

    res.json({ ok:true, album, count: final.length, files: final });
  } catch (err) {
    console.error("list error", err);
    res.status(500).json({ ok:false, message:String(err?.message||err) });
  }
}

app.get("/api/list", listHandler);
app.get("/api/album/list", listHandler);

// Presign (PUT)
app.post("/api/presign", async (req,res)=>{
  try {
    let { key, album, filename, contentType } = req.body || {};
    album = album || "uploads";
    if (!key) {
      if (!filename) throw new Error("filename o key requerido");
      key = `${album}/${Date.now()}-${filename}`;
    }
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 min
    res.json({ ok:true, method:"PUT", url, key });
  } catch (err) {
    console.error("presign error", err);
    res.status(400).json({ ok:false, message:String(err?.message||err) });
  }
});

// 404 guard
app.use((req,res)=>{
  res.status(404).json({ ok:false, message:"Ruta no encontrada", path:req.path });
});

app.listen(Number(PORT), ()=> {
  console.log(`Mixtli API (presign) on ${PORT}`);
});