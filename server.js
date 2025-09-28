
// Mixtli Transfer backend (server.js) — ultra-minimal + Stripe fail-fast
// Node 20+ recommended
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---- Env ----
// Required (for Cloudflare R2 as S3):
//   S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
//   S3_BUCKET=<your-bucket>
//   S3_ACCESS_KEY_ID=<R2 Access Key ID>
//   S3_SECRET_ACCESS_KEY=<R2 Secret Key>
// Optional:
//   S3_REGION=auto
//   S3_FORCE_PATH_STYLE=true
//   PORT=10000
//   ALLOWED_ORIGINS='["http://localhost:8888","https://<your-netlify>.netlify.app"]'
// Stripe gating:
//   REQUIRE_STRIPE=1 to force STRIPE_SECRET_KEY presence on boot
//   STRIPE_SECRET_KEY=sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET=whsec_... (optional if you use webhooks)

const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;
const ALLOWED_ORIGINS = (() => {
  try { return JSON.parse(process.env.ALLOWED_ORIGINS || "[]"); } catch { return []; }
})();

// --- Stripe fail-fast (only if required) ---
const REQUIRE_STRIPE = process.env.REQUIRE_STRIPE === "1";
if (REQUIRE_STRIPE) {
  const hasSecret = !!process.env.STRIPE_SECRET_KEY;
  if (!hasSecret) {
    console.error("❌ Falta STRIPE_SECRET_KEY (backend). Aborting.");
    process.exit(1);
  }
  // If you want to force webhook secret too, uncomment:
  // if (!process.env.STRIPE_WEBHOOK_SECRET) {
  //   console.error("❌ Falta STRIPE_WEBHOOK_SECRET. Aborting.");
  //   process.exit(1);
  // }
}

const app = express();

// CORS
const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow curl/postman
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS: Origin not allowed: " + origin));
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "x-mixtli-token"],
  methods: ["GET","POST","OPTIONS"],
  maxAge: 86400,
});

app.use(express.json());
app.use(corsMiddleware);

// Health
app.get(["/salud","/api/health","/api/salud"], (req, res) => {
  res.json({ ok: true, service: "mixtli-transfer", time: new Date().toISOString() });
});

// Stripe diag
app.get("/api/diag/stripe", (req, res) => {
  const k = process.env.STRIPE_SECRET_KEY || "";
  res.json({
    ok: true,
    stripe_secret_present: Boolean(k),
    webhook_present: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    mode: k.startsWith("sk_live_") ? "live" : k.startsWith("sk_test_") ? "test" : "unknown"
  });
});

// ---- S3/R2 Client ----
function s3() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey || !process.env.S3_BUCKET) {
    return null;
  }
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || "true") === "true",
    credentials: { accessKeyId, secretAccessKey }
  });
}

// Utility random id
function rid(n=8){ return crypto.randomBytes(n).toString("hex"); }

// Presign upload (PUT) and a preview download (GET) link
// Body: { filename: "my.pdf", contentType: "application/pdf", expiresSeconds?: 604800 }
app.post("/api/presign", async (req, res) => {
  try {
    const client = s3();
    if (!client) {
      return res.status(500).json({ ok:false, error:"S3/R2 not configured. Missing env." });
    }
    const bucket = process.env.S3_BUCKET;
    const { filename, contentType } = req.body || {};
    if (!filename) return res.status(400).json({ ok:false, error:"filename required" });
    const ct = contentType || "application/octet-stream";
    const now = new Date();
    const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}`;
    const key = `uploads/${folder}/${rid(6)}-${filename}`;

    const putCmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: ct
    });
    const uploadUrl = await getSignedUrl(client, putCmd, { expiresIn: 60 * 5 }); // 5 min

    // precompute download link for convenience (valid 7 days)
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const downloadUrl = await getSignedUrl(client, getCmd, { expiresIn: 60 * 60 * 24 * 7 });

    res.json({
      ok: true,
      key,
      uploadUrl,
      downloadUrl,
      expiresAt: new Date(Date.now() + 7*24*60*60*1000).toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// Sign a download link later (if you only have the key)
app.post("/api/sign-download", async (req, res) => {
  try {
    const client = s3();
    if (!client) return res.status(500).json({ ok:false, error:"S3/R2 not configured." });
    const bucket = process.env.S3_BUCKET;
    const { key, expiresSeconds } = req.body || {};
    if (!key) return res.status(400).json({ ok:false, error:"key required"});
    const exp = Math.min(Number(expiresSeconds || (7*24*60*60)), 30*24*60*60);
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const downloadUrl = await getSignedUrl(client, getCmd, { expiresIn: exp });
    res.json({ ok:true, key, downloadUrl, expiresIn: exp });
  } catch (err) {
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// Simple list prefix (debug)
app.get("/api/list", async (req, res) => {
  res.json({ ok:true, note:"Implement list with ListObjectsV2 if you need it." });
});

app.listen(PORT, () => {
  console.log("Mixtli Transfer on port", PORT);
});
