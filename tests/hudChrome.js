/* Chrome sem interface: imprime a pagina A4 em PNG e conversa com a pagina pelo CDP. */
"use strict";

var spawn = require("child_process").spawn;
var execFileSync = require("child_process").execFileSync;
var fs = require("fs");
var net = require("net");
var os = require("os");
var path = require("path");

var CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
var CDP = Number(process.env.CDP_PORT || 9333);
var FLAGS = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run"];

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function screenshot(url, destino) {
  execFileSync(CHROME, FLAGS.concat([
    "--force-device-scale-factor=1", "--window-size=794,1123",
    "--virtual-time-budget=25000", "--screenshot=" + destino, url
  ]), { stdio: "pipe" });
  return fs.statSync(destino).size;
}

function livre(porta) {
  return new Promise(function (res) {
    var s = net.createServer();
    s.once("error", function () { res(false); });
    s.once("listening", function () { s.close(function () { res(true); }); });
    s.listen(porta, "127.0.0.1");
  });
}

/* o chrome sorteia a porta quando recebe 0 e grava ela em DevToolsActivePort */
function esperaPorta(perfil) {
  var alvo = path.join(perfil, "DevToolsActivePort");
  var limite = Date.now() + 20000;
  return new Promise(function (res, rej) {
    (function tentar() {
      var txt = "";
      try { txt = fs.readFileSync(alvo, "utf8"); } catch (err) { /* ainda nao escreveu */ }
      var n = parseInt(txt, 10);
      if (n > 0) return res(n);
      if (Date.now() > limite) return rej(new Error("chrome nao abriu porta de depuracao em " + perfil));
      setTimeout(tentar, 200);
    })();
  });
}

/* porta ocupada = chrome de outra sessao. jamais conectar nele: senao o teste
   roda o javascript velho que ficou na memoria e passa verde por engano. */
async function abrirChrome(url, porta) {
  var perfil = fs.mkdtempSync(path.join(os.tmpdir(), "gaba-cdp-"));
  var pedida = Number(porta) || CDP;
  var sorteada = (await livre(pedida)) ? 0 : 1;
  var p = spawn(CHROME, FLAGS.concat([
    "--remote-debugging-port=" + (sorteada ? 0 : pedida), "--user-data-dir=" + perfil,
    "--window-size=900,700", url
  ]), { stdio: "ignore" });
  return { processo: p, perfil: perfil, porta: sorteada ? await esperaPorta(perfil) : pedida };
}

async function conectar(caminho, porta) {
  var alvo2 = Number(porta) || CDP;
  for (var i = 0; i < 60; i++) {
    try {
      var alvos = await (await fetch("http://127.0.0.1:" + alvo2 + "/json/list")).json();
      var alvo = alvos.filter(function (a) { return a.type === "page" && a.url.indexOf(caminho) >= 0; })[0];
      if (alvo && alvo.webSocketDebuggerUrl) return alvo;
    } catch (err) { /* o chrome ainda nao esta escutando */ }
    await sleep(250);
  }
  throw new Error("chrome nao expoe a pagina " + caminho + " na porta " + alvo2);
}

function cliente(alvo) {
  var seq = 0;
  var esperando = {};
  var sock = new WebSocket(alvo.webSocketDebuggerUrl);
  var aberto = new Promise(function (res, rej) {
    sock.onopen = res;
    sock.onerror = function () { rej(new Error("websocket cdp falhou")); };
  });
  sock.onmessage = function (ev) {
    var m = JSON.parse(ev.data);
    var f = esperando[m.id];
    if (!f) return;
    delete esperando[m.id];
    if (m.error) f.rej(new Error(JSON.stringify(m.error)));
    else f.res(m.result);
  };
  return {
    chama: function (metodo, params) {
      return aberto.then(function () {
        return new Promise(function (res, rej) {
          var id = ++seq;
          esperando[id] = { res: res, rej: rej };
          sock.send(JSON.stringify({ id: id, method: metodo, params: params || {} }));
          setTimeout(function () {
            if (esperando[id]) { delete esperando[id]; rej(new Error("cdp sem resposta: " + metodo)); }
          }, 180000);
        });
      });
    },
    /* a funcao da pagina e serializada para la dentro: sem closures com o node */
    naPagina: function (fn, args) {
      var expr = "(" + fn.toString() + ")(" + (args || []).map(function (a) {
        return JSON.stringify(a);
      }).join(",") + ")";
      return this.chama("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })
        .then(function (r) {
          if (r.exceptionDetails) throw new Error("erro na pagina: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
          if (!r.result || r.result.value === undefined) throw new Error("a pagina nao devolveu valor");
          return r.result.value;
        });
    },
    espera: function (expressao, ms) {
      var limite = Date.now() + (ms || 60000);
      var c = this;
      return new Promise(function (res, rej) {
        (function tentar() {
          c.chama("Runtime.evaluate", { expression: expressao, returnByValue: true }).then(function (r) {
            if (r.result && r.result.value) res(r.result.value);
            else if (Date.now() > limite) rej(new Error("tempo esgotado esperando: " + expressao));
            else setTimeout(tentar, 400);
          }).catch(function () {
            if (Date.now() > limite) rej(new Error("chrome nao respondeu"));
            else setTimeout(tentar, 600);
          });
        })();
      });
    },
    fecha: function () { try { sock.close(); } catch (err) { /* ja era */ } }
  };
}

async function fecharChrome(chrome) {
  chrome.processo.kill();
  await sleep(500);
  try {
    fs.rmSync(chrome.perfil, { recursive: true, force: true });
  } catch (err) {
    /* o chrome as vezes ainda segura o perfil no windows; fica no temp */
  }
}

module.exports = { CHROME: CHROME, CDP: CDP, sleep: sleep, screenshot: screenshot, abrirChrome: abrirChrome, conectar: conectar, cliente: cliente, fecharChrome: fecharChrome };
