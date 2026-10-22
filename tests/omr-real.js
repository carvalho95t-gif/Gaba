/* Imprime a folha A4 de verdade, rasteriza no Chrome e faz o motor OMR ler o PNG.
   Precisa do servidor local: node tests/serve.js  ->  node tests/omr-real.js [porta] */
"use strict";

var hud = require("./hudChrome");
var path = require("path");

var RAIZ = path.resolve(__dirname, "..");
var porta = Number(process.argv[2] || 8777);
var BASE = "http://127.0.0.1:" + porta;

async function caso(titulo, q, png) {
  var urlFolha = BASE + "/tests/scan.html" + (q ? "?q=" + q : "");
  var bytes = hud.screenshot(urlFolha, png);
  var chrome = await hud.abrirChrome(BASE + "/tests/verify.html" + (q ? "?q=" + q : ""));
  try {
    var c = hud.cliente(await hud.conectar("tests/verify.html", chrome.porta));
    await c.espera("typeof window.__rodar === 'function'", 60000);
    var relatorio = await c.chama("Runtime.evaluate", {
      expression: "window.__rodar(" + JSON.stringify(path.basename(png)) + ", " + JSON.stringify(titulo) + ")",
      awaitPromise: true,
      returnByValue: true
    });
    c.fecha();
    if (!relatorio.result || typeof relatorio.result.value !== "string") {
      throw new Error("a pagina nao devolveu o relatorio: " + JSON.stringify(relatorio));
    }
    console.log("\n== " + titulo + " (" + bytes + " bytes) ==");
    console.log(relatorio.result.value);
    return relatorio.result.value.indexOf("PASS ") === 0;
  } finally {
    await hud.fecharChrome(chrome);
  }
}

(async function principal() {
  var probe = await fetch(BASE + "/tests/verify.html").catch(function () { return null; });
  if (!probe || !probe.ok) {
    console.error("o servidor local nao respondeu em " + BASE + "/ - rode: node tests/serve.js");
    process.exit(2);
  }
  var ok = true;
  ok = await caso("cartao de 10 questoes (.docx real)", 0, path.join(RAIZ, "tests", "sheet.png")) && ok;
  ok = await caso("cartao de 90 questoes (3 colunas)", 90, path.join(RAIZ, "tests", "sheet90.png")) && ok;
  console.log(ok ? "\ntodo o caminho folha impressa -> motor OMR passou" : "\nFALHOU: veja os casos acima");
  process.exit(ok ? 0 : 1);
})().catch(function (err) {
  console.error("erro no harness: " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
