
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;

function s3(){
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey || !process.env.S3_BUCKET) return null;
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || "true") === "true",
    credentials: { accessKeyId, secretAccessKey }
  });
}
function rid(n=8){ return crypto.randomBytes(n).toString("hex"); }

app.get("/salud",(req,res)=>res.json({ ok:true, time:new Date().toISOString() }));

// NOTE: No ContentType in presign to avoid header-mismatch 403 on some S3-compat providers
app.post("/api/presign", async (req,res)=>{
  try{
    const client = s3();
    if (!client) return res.status(500).json({ ok:false, error:"S3/R2 not configured. Missing env." });
    const bucket = process.env.S3_BUCKET;
    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ ok:false, error:"filename required" });
    const now = new Date();
    const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}`;
    const key = `uploads/${folder}/${rid(6)}-${filename}`;

    const put = new PutObjectCommand({ Bucket: bucket, Key: key }); // <-- no ContentType
    const uploadUrl = await getSignedUrl(client, put, { expiresIn: 300 });
    const get = new GetObjectCommand({ Bucket: bucket, Key: key });
    const downloadUrl = await getSignedUrl(client, get, { expiresIn: 7*24*3600 });
    res.json({ ok:true, key, uploadUrl, downloadUrl, expiresAt: new Date(Date.now()+7*24*3600*1000).toISOString() });
  }catch(e){
    res.status(500).json({ ok:false, error:String(e) });
  }
});

app.listen(PORT, ()=>console.log("Mixtli Transfer (no ContentType presign) on", PORT));
