import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = express();
app.use(cors({ origin: true, credentials: true }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024*1024*1024 } });
const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;

function rid(n=8){ return crypto.randomBytes(n).toString("hex"); }

function mkClient(){
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "us-east-1";
  const forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE || "false") === "true";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if(!endpoint || !accessKeyId || !secretAccessKey || !process.env.S3_BUCKET){
    throw new Error("Missing S3 env vars");
  }
  return new S3Client({
    endpoint, region, forcePathStyle,
    credentials: { accessKeyId, secretAccessKey }
  });
}

app.get("/salud",(req,res)=>{ res.json({ ok:true, relay:true, now:new Date().toISOString() }); });

app.post("/api/upload", upload.single("file"), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({ ok:false, error:"missing file field" });
    const client = mkClient();
    const bucket = process.env.S3_BUCKET;
    const now = new Date();
    const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}`;
    const key = `uploads/${folder}/${rid(6)}-${req.file.originalname}`;
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: req.file.buffer,
      ContentType: req.file.mimetype || "application/octet-stream"
    }));
    const get = new GetObjectCommand({ Bucket: bucket, Key: key });
    const downloadUrl = await getSignedUrl(client, get, { expiresIn: 7*24*3600 });
    res.json({ ok:true, key, size:req.file.size, contentType:req.file.mimetype, downloadUrl });
  }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
});

app.listen(PORT, ()=>console.log("Mixtli Relay on", PORT));