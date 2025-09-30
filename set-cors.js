
const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = require("@aws-sdk/client-s3");

const ENDPOINT   = process.env.S3_ENDPOINT;
const REGION     = process.env.S3_REGION || "us-east-1";
const BUCKET     = process.env.S3_BUCKET;
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID;
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY;

if (!ENDPOINT || !BUCKET || !ACCESS_KEY || !SECRET_KEY) {
  console.error("Missing required envs. Need S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY");
  process.exit(1);
}

const OPEN = String(process.env.CORS_OPEN || "false").toLowerCase() === "true";
const DEFAULT_ORIGINS = ["https://lovely-bienenstitch-6344a1.netlify.app","http://localhost:3000"];
const ORIGINS = OPEN
  ? ["*"]
  : (process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(",").map(s=>s.trim()).filter(Boolean)
      : DEFAULT_ORIGINS);

const METHODS = (process.env.CORS_ALLOWED_METHODS
    ? process.env.CORS_ALLOWED_METHODS.split(",").map(s=>s.trim()).filter(Boolean)
    : ["GET","PUT","HEAD"]);
const HEADERS = (process.env.CORS_ALLOWED_HEADERS
    ? process.env.CORS_ALLOWED_HEADERS.split(",").map(s=>s.trim()).filter(Boolean)
    : ["*"]);
const EXPOSE  = (process.env.CORS_EXPOSE_HEADERS
    ? process.env.CORS_EXPOSE_HEADERS.split(",").map(s=>s.trim()).filter(Boolean)
    : ["ETag","x-amz-version-id"]);
const MAX_AGE = Number(process.env.CORS_MAX_AGE || 3600);

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY }
});

(async()=>{
  const params = {
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: ORIGINS,
        AllowedMethods: METHODS,
        AllowedHeaders: HEADERS,
        ExposeHeaders: EXPOSE,
        MaxAgeSeconds: MAX_AGE
      }]
    }
  };
  console.log("Applying CORS to bucket:", BUCKET);
  console.log("Endpoint:", ENDPOINT);
  console.log("Region:", REGION);
  console.log("Rules:", JSON.stringify(params.CORSConfiguration, null, 2));

  await s3.send(new PutBucketCorsCommand(params));
  console.log("CORS applied ✔");

  const res = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.log("Current CORS:", JSON.stringify(res, null, 2));
})().catch(err=>{
  console.error("Failed to set CORS:", err.name, err.message);
  process.exit(1);
});
