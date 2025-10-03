// Example server showing where to mount the CORS middleware.
// If you already have a server.js, just copy the corsMw import and the app.use(corsMw) lines.
import express from "express";
import { corsMw } from "./corsMw.js";

const app = express();
const PORT = process.env.PORT || 8080;

// Mount CORS (MUST be before routes)
app.use(corsMw);
app.options("*", corsMw);

app.use(express.json());

// Basic health endpoints (keep your real ones)
app.get("/api/salud", (req,res)=> res.json({ ok:true, ts: Date.now() }));
app.get("/salud", (req,res)=> res.json({ ok:true, ts: Date.now() }));

// Demo list endpoint (replace with your real /api/album/list logic)
app.get(["/api/list","/list","/api/album/list","/album/list"], (req,res)=>{
  const album = String(req.query.album||"personal");
  return res.json({ ok:true, album, items:[] });
});

app.listen(PORT, ()=> console.log("Mixtli API (example) on", PORT));
