/* Servidor estatico local para verificar a UI no navegador: node tests/serve.js [porta] */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var RAIZ = path.resolve(__dirname, "..");
var FIX = path.join(RAIZ, "tests", "fixtures");
var SAMPLE = path.join(FIX, "PROVA_2SERIE_45_ALUNOS_INDIVIDUALIZADAS-v2.docx");
var TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".sql": "text/plain; charset=utf-8"
};

var porta = Number(process.argv[2] || 8777);

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

/* as amostras de teste ficam no repositorio, para o teste nao depender da Area de Trabalho */
var FIXTURES = {
  "/_lista.csv": "chamada-sedu.csv",
  "/_latin1.csv": "chamada-latin1.csv",
  "/_chamada.xlsx": "chamada-excel.xlsx",
  "/_prova.pdf": "PROVA_2SERIE_45_ALUNOS_INDIVIDUALIZADAS-v2.pdf",
  "/_prova.doc": "PROVA_2SERIE_45_ALUNOS_INDIVIDUALIZADAS-v2.doc"
};

var server = http.createServer(function (req, res) {
  var url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/_sample.docx") {
    if (!fs.existsSync(SAMPLE)) return send(res, 404, "amostra nao existe");
    return send(res, 200, fs.readFileSync(SAMPLE), TYPES[".docx"]);
  }
  if (FIXTURES[url]) {
    var alvoFix = path.join(FIX, FIXTURES[url]);
    if (!fs.existsSync(alvoFix)) return send(res, 404, "fixture nao existe: " + FIXTURES[url]);
    return send(res, 200, fs.readFileSync(alvoFix), TYPES[path.extname(alvoFix).toLowerCase()]);
  }
  if (url === "/") url = "/index.html";
  var alvo = path.join(RAIZ, path.normalize(url).replace(/^(\.\.[/\\])+/, ""));
  if (!alvo.startsWith(RAIZ)) return send(res, 403, "fora da raiz");
  fs.readFile(alvo, function (err, buf) {
    if (err) return send(res, 404, "nao encontrado: " + url);
    send(res, 200, buf, TYPES[path.extname(alvo).toLowerCase()] || "application/octet-stream");
  });
});

server.listen(porta, "127.0.0.1", function () {
  console.log("gaba em http://127.0.0.1:" + porta + "/");
});
