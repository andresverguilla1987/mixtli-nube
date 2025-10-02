// Mixtli Relay (multer upload) — compatible con iDrive e2
import express from "express";
import cors from "cors";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ===== Env (como en tu captura de pantalla) =====
const {
  PORT = 8080,
  S3_ENDPOINT,
  S3_REGION = "auto",
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE = "true",
  ALLOWED_ORIGINS = '["*"]'
} = process.env;

// ===== Util =====
const need = (k) => {
  const v = process.env[k];
  if (!v || !String(v).trim()) throw new Error(`Falta env ${k}`);
  return String(v).trim();
};
const clean = (k="") => String(k).replace(/^\/+/, "");

// ===== S3 client (iDrive e2) =====
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
  allowedHeaders: ["Content-Type"]
}));
app.options("*", cors());
app.use(express.json({ limit: "10mb" }));

// ===== Multer (memoria) =====
const upload = multer({ storage: multer.memoryStorage() });

// ===== Endpoints =====
app.get("/", (req,res)=> res.json({ ok:true, service:"Mixtli Relay Upload (multer)", use:"/api/*" }));
app.get("/api/salud", (req,res)=> res.json({ ok:true, ts: Date.now() }));

// Diagnóstico simple de headers y origen
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
// FormData:  field "file", query: ?key=albums/<album>/<archivo>
app.post("/api/upload", upload.single("file"), async (req,res)=>{
  try {
    const Bucket = need("S3_BUCKET");
    const Key = clean(String(req.query.key || ""));
    if (!Key) return res.status(400).json({ ok:false, where:"input", message:"?key=albums/<album>/<archivo> requerido" });
    if (!req.file || !req.file.buffer) return res.status(400).json({ ok:false, where:"input", message:"FormData 'file' requerido" });

    const ContentType = req.file.mimetype || "application/octet-stream";
    await s3.send(new PutObjectCommand({
      Bucket, Key, Body: req.file.buffer, ContentType
    }));

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

// 404 JSON
app.use((req,res)=> res.status(404).json({ ok:false, message:"Ruta no encontrada", path:req.path }));

app.listen(PORT, ()=> console.log("Mixtli Relay Upload (multer) on", PORT));
