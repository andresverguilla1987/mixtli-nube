
// Mixtli Transfer backend — Diagnostics build
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;
const ALLOWED_ORIGINS = (() => { try { return JSON.parse(process.env.ALLOWED_ORIGINS || "[]"); } catch { return []; } })();

// ----- Startup diagnostics (console) -----
function logPresence(name, val) {
  const ok = !!val;
  console.log(`${ok ? "✅":"❌"} ${name}:`, ok ? (name.startsWith("STRIPE_SECRET_KEY") ? (val.startsWith("sk_") ? val.slice(0,10)+"..." : "present") : "present") : "MISSING");
}
console.log("=== Mixtli Diagnostics ===");
["S3_ENDPOINT","S3_BUCKET","S3_ACCESS_KEY_ID","S3_SECRET_ACCESS_KEY","S3_REGION","S3_FORCE_PATH_STYLE"].forEach(k => logPresence(k, process.env[k]));
logPresence("ALLOWED_ORIGINS", process.env.ALLOWED_ORIGINS);
logPresence("REQUIRE_STRIPE", process.env.REQUIRE_STRIPE);
logPresence("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
logPresence("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET);
console.log("==========================");

const app = express();
app.use(express.json());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS: Origin not allowed: " + origin));
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "x-mixtli-token"],
  methods: ["GET","POST","OPTIONS"],
  maxAge: 86400,
}));

app.get(["/salud","/api/health"], (req, res) => {
  res.json({ ok: true, service: "mixtli-transfer", time: new Date().toISOString() });
});

// Stripe diag
app.get("/api/diag/stripe", (req, res) => {
  const k = process.env.STRIPE_SECRET_KEY || "";
  res.json({
    ok: true,
    stripe_secret_present: Boolean(k),
    webhook_present: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    mode: k.startsWith("sk_live_") ? "live" : k.startsWith("sk_test_") ? "test" : "unknown",
    require_stripe: process.env.REQUIRE_STRIPE === "1"
  });
});

// Env diag (booleans; no secrets)
app.get("/api/diag/env", (req, res) => {
  const masked = (v, prefix="") => !!v;
  res.json({
    ok: true,
    s3: {
      endpoint: masked(process.env.S3_ENDPOINT),
      bucket: masked(process.env.S3_BUCKET),
      access_key_id: masked(process.env.S3_ACCESS_KEY_ID),
      secret_access_key: masked(process.env.S3_SECRET_ACCESS_KEY),
      region: masked(process.env.S3_REGION || "auto"),
      force_path_style: String(process.env.S3_FORCE_PATH_STYLE || "true")
    },
    cors: {
      allowed_origins: (()=>{ try { return JSON.parse(process.env.ALLOWED_ORIGINS || "[]"); } catch { return "bad_json"; } })()
    },
    stripe: {
      require: process.env.REQUIRE_STRIPE === "1",
      secret_present: !!process.env.STRIPE_SECRET_KEY
    }
  });
});

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

function rid(n=8){ return crypto.randomBytes(n).toString("hex"); }

app.post("/api/presign", async (req, res) => {
  try {
    const client = s3();
    if (!client) return res.status(500).json({ ok:false, error:"S3/R2 not configured. Missing env." });
    const bucket = process.env.S3_BUCKET;
    const { filename, contentType } = req.body || {};
    if (!filename) return res.status(400).json({ ok:false, error:"filename required" });
    const ct = contentType || "application/octet-stream";
    const now = new Date();
    const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}`;
    const key = `uploads/${folder}/${rid(6)}-${filename}`;

    const putCmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: ct });
    const uploadUrl = await getSignedUrl(client, putCmd, { expiresIn: 60 * 5 });
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const downloadUrl = await getSignedUrl(client, getCmd, { expiresIn: 60 * 60 * 24 * 7 });

    res.json({ ok:true, key, uploadUrl, downloadUrl, expiresAt: new Date(Date.now()+7*24*60*60*1000).toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

app.get("/api/list-check", async (req, res) => {
  try {
    const client = s3();
    if (!client) return res.status(500).json({ ok:false, error:"S3/R2 not configured. Missing env." });
    const bucket = process.env.S3_BUCKET;
    const cmd = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 });
    const data = await client.send(cmd);
    res.json({ ok:true, can_list:true, sample: (data.Contents||[]).slice(0,1).map(o=>o.Key) });
  } catch (err) {
    res.status(500).json({ ok:false, error:String(err) });
  }
});

app.listen(PORT, () => {
  console.log("Mixtli Diagnostics on port", PORT);
});
