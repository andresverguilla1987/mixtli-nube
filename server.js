import express from "express";
import cors from "cors";
import morgan from "morgan";
import { S3Client, ListObjectsV2Command, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(morgan("tiny"));

// CORS flexible
const allowed = (() => {
  try { return JSON.parse(process.env.ALLOWED_ORIGINS || "[]"); }
  catch { return []; }
})();

const corsMw = cors({
  origin: (origin, cb) => {
    // permitir llamadas server->server (Origin null) y preflights raros
    if (!origin) return cb(null, true);
    if (allowed.some(o => origin && origin.startsWith(o))) return cb(null, true);
    return cb(new Error(`Origin not allowed: ${origin}`));
  },
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type", "x-album-token"],
  credentials: false,
});
app.use(corsMw);
app.options("*", corsMw);

// Health / root
app.get("/", (_req, res) => res.status(200).send("Mixtli API OK"));

// S3/E2 client
const REQUIRED = ["E2_ENDPOINT","E2_ACCESS_KEY_ID","E2_SECRET_ACCESS_KEY","E2_BUCKET"];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.warn("⚠️  Faltan variables E2:", missing.join(", "));
}

const s3 = new S3Client({
  region: process.env.E2_REGION || "us-east-1",
  endpoint: process.env.E2_ENDPOINT,      // ej: https://s3.us-west-1.idrivee2-21.com
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.E2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.E2_SECRET_ACCESS_KEY || "",
  }
});

const BUCKET = process.env.E2_BUCKET || "";

// Helpers
const ensureAlbumPrefix = (album) => {
  if (!album) album = "personal";
  // guardamos dentro de albums/<album>/
  return `albums/${album}/`;
};

// --- LIST ----
// Soporta /api/album/list?album=ALBUM  y /api/list?album=ALBUM
const listHandler = async (req, res) => {
  try {
    const album = String(req.query.album || "personal");
    const Prefix = ensureAlbumPrefix(album);
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix,
    }));
    const items = (list.Contents || [])
      .filter(o => !o.Key.endsWith("/")) // no carpetas
      .map(o => ({
        key: o.Key,
        size: o.Size,
        lastModified: o.LastModified,
        // thumb convención: thumbs/<hash>.jpg (si existe)
        thumb: null,
        href: null,
      }));
    return res.json({ ok: true, items });
  } catch (err) {
    console.error("list error", err);
    res.status(500).json({ ok:false, message: String(err) });
  }
};

app.get("/api/list", listHandler);
app.get("/api/album/list", listHandler);

// --- PRESIGN PUT ----
// POST /api/presign { key, contentType }  -> { ok, url, headers }
app.post("/api/presign", async (req, res) => {
  try {
    const { key, contentType } = req.body || {};
    if (!key) return res.status(400).json({ ok:false, message:"key requerida" });
    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });
    res.json({ ok: true, url, headers: { "Content-Type": contentType || "application/octet-stream" } });
  } catch (err) {
    console.error("presign error", err);
    res.status(500).json({ ok:false, message: String(err) });
  }
});

// GET variante: /api/presign-get?key=...&contentType=image/jpeg
app.get("/api/presign-get", async (req, res) => {
  try {
    const { key, contentType } = req.query || {};
    if (!key) return res.status(400).json({ ok:false, message:"key requerida" });
    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });
    res.json({ ok: true, url, headers: { "Content-Type": contentType || "application/octet-stream" } });
  } catch (err) {
    console.error("presign-get error", err);
    res.status(500).json({ ok:false, message: String(err) });
  }
});

// --- DIAG ---
app.get("/api/diag", async (req, res) => {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: "__healthcheck__.txt" })
    ).catch(() => null);
    res.json({
      ok: true,
      env: {
        endpoint: process.env.E2_ENDPOINT ? "ok" : "missing",
        bucket: BUCKET || "missing",
        region: process.env.E2_REGION || "us-east-1",
        allowedOrigins: allowed,
      },
      storageOk: !!head || "unknown",
      ts: Date.now(),
    });
  } catch (e) {
    res.json({ ok: true, env: { error: String(e) }, ts: Date.now() });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Mixtli API (presign+list) on ${PORT}`));
