// routesAliases.js
// Agrega alias /api/* para backends que ya tenían rutas en raíz.
// Integra con S3/E2 si ya tienes funciones internas; si no, trae versiones mínimas.

import express from "express";
export function mountRoutes(app, deps = {}){
  const r = express.Router();
  const {
    listHandler = minimalList,
    albumListHandler = minimalAlbumList,
    zipHandler = minimalZip,
    pinCheckHandler = minimalPinCheck,
    healthHandler = (_req,res)=>res.json({ok:true,ts:Date.now()}),
  } = deps;

  // Salud / Diag
  r.get(["/api/diag","/api/salud","/salud"], healthHandler);

  // Listados (alias con y sin /api)
  r.get(["/api/list","/list"], listHandler);
  r.get(["/api/album/list","/album/list"], albumListHandler);

  // ZIP descarga por lote
  r.post(["/api/album/zip","/album/zip"], zipHandler);

  // PIN (si usas protección)
  r.post(["/api/album/pin/check","/album/pin/check"], pinCheckHandler);

  app.use(r);
}

/** ========== Handlers mínimos (reemplaza por tu lógica real) ========== **/

// Devuelve items vacíos si no hay integración todavía
async function minimalList(req,res){
  const album = String(req.query.album||"personal");
  return res.json({ ok:true, album, items:[] });
}

async function minimalAlbumList(req,res){
  const album = String(req.query.album||"personal");
  return res.json({ ok:true, album, items:[] });
}

async function minimalZip(req,res){
  res.status(501).json({ ok:false, message:"ZIP no implementado aquí" });
}

async function minimalPinCheck(req,res){
  res.json({ ok:true, accessToken:"demo", protected:false });
}
