
import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = express();
app.use(cors({ origin: true, credentials: true }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024*1024*1024 } }); // 1GB

function rid(n=8){ return crypto.randomBytes(n).toString("hex"); }

function mkClient(){
  const cfg = {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || "false") === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
  };
  const missing = [];
  if (!cfg.endpoint) missing.push("S3_ENDPOINT");
  if (!process.env.S3_BUCKET) missing.push("S3_BUCKET");
  if (!cfg.credentials.accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!cfg.credentials.secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  if (missing.length) return { client: null, cfg, missing };
  return { client: new S3Client(cfg), cfg, missing: [] };
}

app.get("/salud", (req,res)=>{
  const { cfg, missing } = mkClient();
  res.json({ ok: missing.length===0, relay:true, cfg, missing, now: new Date().toISOString() });
});

// Upload via backend (no CORS needed)
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const { client, cfg, missing } = mkClient();
    if (missing.length) return res.status(400).json({ ok:false, stage:"env-missing", missing, cfg });
    if (!req.file) return res.status(400).json({ ok:false, stage:"no-file" });

    const bucket = process.env.S3_BUCKET;
    const now = new Date();
    const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}`;
    const key = `uploads/${folder}/${rid(6)}-${req.file.originalname}`;

    const put = new PutObjectCommand({
      Bucket: bucket, Key: key, Body: req.file.buffer,
      ContentType: req.file.mimetype || "application/octet-stream"
    });
    try {
      const putResp = await client.send(put);
      const get = new GetObjectCommand({ Bucket: bucket, Key: key });
      const downloadUrl = await getSignedUrl(client, get, { expiresIn: 7*24*3600 });
      return res.json({ ok:true, key, size:req.file.size, contentType:req.file.mimetype, downloadUrl, putResp });
    } catch (e) {
      const diag = {
        ok:false, stage:"put-object", message: String(e),
        name: e?.name, code: e?.Code || e?.code, $meta: e?.$metadata || null,
        cf: cfg, bucket
      };
      return res.status(500).json(diag);
    }
  } catch (e) {
    res.status(500).json({ ok:false, stage:"server", error:String(e) });
  }
});

// Minimal diag to test signing/endpoint quickly
app.get("/diag/put", async (req,res)=>{
  try{
    const { client, cfg, missing } = mkClient();
    if (missing.length) return res.status(400).json({ ok:false, stage:"env-missing", missing, cfg });
    const bucket = process.env.S3_BUCKET;
    const key = `uploads/_diag_${rid(4)}.txt`;
    const body = Buffer.from("ok");
    const put = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" });
    try{
      const r = await client.send(put);
      // cleanup (best-effort)
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch {}
      return res.json({ ok:true, key, r, cfg });
    }catch(e){
      return res.status(500).json({
        ok:false, stage:"put-object", message:String(e),
        name:e?.name, code:e?.Code || e?.code, $meta:e?.$metadata || null, cfg
      });
    }
  }catch(e){
    res.status(500).json({ ok:false, stage:"server", error:String(e) });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;
app.listen(PORT, ()=>console.log("Relay (diag) on", PORT));
