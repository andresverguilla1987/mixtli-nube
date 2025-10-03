import express from "express";
import morgan from "morgan";
import cors from "cors";
import { S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---- Env ----
const {
  E2_ENDPOINT,
  E2_REGION = "us-east-1",
  E2_BUCKET,
  E2_ACCESS_KEY_ID,
  E2_SECRET_ACCESS_KEY,
  E2_PUBLIC_BASE = "",
  FORCE_PATH_STYLE = "true",
  PORT = 8080,
  ALLOWED_ORIGINS = "[]"
} = process.env;

// Parse allowed origins (array of strings)
let allowed = [];
try { allowed = JSON.parse(ALLOWED_ORIGINS || "[]"); } catch { allowed = []; }

// CORS: allow null (file:// and server->server), and any origin that startsWith any allowed
const corsMw = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowed.some(o => origin.startsWith(o))) return cb(null, true);
    return cb(new Error(`Origin not allowed: ${origin}`));
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","x-album-token"],
  credentials: false,
});

const app = express();
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(corsMw);
app.options("*", corsMw);

// S3 client (IDrive e2 is S3-compatible)
const s3 = new S3Client({
  region: E2_REGION,
  endpoint: E2_ENDPOINT, // e.g. https://x3j7.or2.idrivee2-60.com
  forcePathStyle: FORCE_PATH_STYLE === "true",
  credentials: (E2_ACCESS_KEY_ID && E2_SECRET_ACCESS_KEY) ? {
    accessKeyId: E2_ACCESS_KEY_ID,
    secretAccessKey: E2_SECRET_ACCESS_KEY,
  } : undefined,
});

// Helpers
const ok = (res, data) => res.json({ ok: true, ...data });
const fail = (res, message, status=500, extra={}) => res.status(status).json({ ok:false, message, ...extra });

// Health
app.get(["/api/salud","/salud"], (req,res)=> ok(res, { ts: Date.now() }));

// Diag
app.get(["/api/diag","/diag"], (req,res)=> {
  ok(res, {
    env: {
      E2_ENDPOINT: !!E2_ENDPOINT,
      E2_REGION,
      E2_BUCKET,
      E2_PUBLIC_BASE,
      FORCE_PATH_STYLE,
      ALLOWED_ORIGINS: allowed
    }
  });
});

// List album (two route shapes for backward compat)
app.get(["/api/album/list", "/api/list", "/album/list", "/list"], async (req,res)=>{
  try {
    const album = (req.query.album || "").trim() || "personal";
    if (!E2_BUCKET) return fail(res, "Falta E2_BUCKET", 500);
    const prefix = `albums/${album}/`;

    // List objects under prefix
    const cmd = new ListObjectsV2Command({
      Bucket: E2_BUCKET,
      Prefix: prefix
    });

    const out = await s3.send(cmd);
    const items = (out.Contents || [])
      .filter(o => !o.Key.endsWith("/"))
      .map(o => {
        const key = o.Key;
        // thumb convention: thumbs/<album>/<filename>.jpg
        const baseName = key.split("/").pop();
        const thumb = `thumbs/${album}/${baseName}.jpg`;
        return {
          key,
          size: o.Size,
          etag: o.ETag,
          lastModified: o.LastModified,
          // if public base provided, build absolute preview urls (no auth)
          url: E2_PUBLIC_BASE ? `${E2_PUBLIC_BASE}/${key}` : null,
          thumbUrl: E2_PUBLIC_BASE ? `${E2_PUBLIC_BASE}/${thumb}` : null,
        };
      });

    ok(res, { album, count: items.length, items });
  } catch (err) {
    fail(res, "List error", 500, { error: String(err) });
  }
});

// presign get (15 min) for a key
app.post(["/api/presign-get", "/presign-get"], async (req,res)=>{
  try {
    const { key } = req.body || {};
    if (!key) return fail(res, "Falta key", 400);
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: E2_BUCKET, Key: key }), { expiresIn: 900 });
    ok(res, { url, key });
  } catch (err) {
    fail(res, "Presign error", 500, { error: String(err) });
  }
});

// Fallback 404 JSON
app.use((req,res)=> fail(res, "Ruta no encontrada", 404, { path: req.path }));

app.listen(PORT, ()=> {
  console.log(`Mixtli Relay FIX on ${PORT}`);
  if (!E2_BUCKET || !E2_ENDPOINT) {
    console.log("⚠️  Faltan variables E2: E2_ENDPOINT, E2_ACCESS_KEY_ID, E2_SECRET_ACCESS_KEY, E2_BUCKET");
  }
});
