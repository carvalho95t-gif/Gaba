/* Teste do omrWorker com OpenCV falso: prova que a bolha impressa em (q,o) e lida como a letra certa. */
/* Rode: node tests/omrWorker.test.js */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var J = function (n) { return require(path.join(__dirname, "..", "js", n)); };

var L = J("omrLayout.js");
var QR = J("qrPayload.js");
var FALHAS = 0;

function check(nome, cond, extra) {
  console.log((cond ? "ok    " : "FALHA ") + nome + (extra ? " -- " + extra : ""));
  if (!cond) FALHAS++;
}

var PX = 8;

function makeFakeCv(script) {
  function FakeMat(rows, cols, type, centerFill) {
    this.rows = rows || 0;
    this.cols = cols || 0;
    this.type_ = type || 0;
    this.centerFill = centerFill || null;
    this.data = new Uint8Array((this.rows * this.cols * 4) || 4);
  }
  FakeMat.prototype.type = function () { return this.type_; };
  FakeMat.prototype.delete = function () {};
  FakeMat.zeros = function (rows, cols, type) { return new FakeMat(rows, cols, type); };
  FakeMat.prototype.copyTo = function (other) {
    other.rows = this.rows;
    other.cols = this.cols;
    other.type_ = this.type_;
    return other;
  };
  FakeMat.prototype.roi = function (rect) {
    return new FakeMat(rect.height, rect.width, 0, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height });
  };

  var cv = {
    CV_8UC1: 0,
    CV_8UC3: 16,
    CV_8UC4: 24,
    CV_32FC2: 17,
    COLOR_RGBA2GRAY: 0,
    COLOR_GRAY2RGBA: 1,
    COLOR_RGB2RGBA: 2,
    THRESH_BINARY_INV: 1,
    ADAPTIVE_THRESH_GAUSSIAN_C: 10,
    ADAPTIVE_THRESH_MEAN_C: 11,
    RETR_EXTERNAL: 0,
    RETR_LIST: 1,
    CHAIN_APPROX_SIMPLE: 2,
    INTER_LINEAR: 1,
    BORDER_CONSTANT: 0,
    ready: null,
    Mat: FakeMat,
    Size: function (w, h) { this.width = w; this.height = h; },
    Rect: function (x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h; },
    Scalar: function () { this.v = 0; },
    Point: function (x, y) { this.x = x; this.y = y; },
    MatVector: function () {
      this.items = script.contours || [];
      this.size = function () { return this.items.length; };
      this.delete = function () {};
      var self = this;
      this.get = function (i) { return self.items[i]; };
    },
    matFromArray: function (rows, cols, type, vals) {
      var m = new FakeMat(rows, cols, type);
      m.vals = vals;
      return m;
    },
    cvtColor: function (src, dst) {
      dst.rows = src.rows;
      dst.cols = src.cols;
      return dst;
    },
    GaussianBlur: function (src, dst) {
      dst.rows = src.rows;
      dst.cols = src.cols;
      return dst;
    },
    adaptiveThreshold: function (src, dst) {
      dst.rows = src.rows;
      dst.cols = src.cols;
      return dst;
    },
    findContours: function () {},
    contourArea: function (c) { return c.area; },
    arcLength: function () { return 400; },
    approxPolyDP: function (c, out) { out.rows = 4; out.cols = 1; return out; },
    boundingRect: function (c) { return { width: c.lado, height: c.lado, x: c.x - c.lado / 2, y: c.y - c.lado / 2 }; },
    moments: function (c) { return { m00: 100, m10: 100 * c.x, m01: 100 * c.y }; },
    mean: function (m, mask) {
      var alvo = m.centerFill;
      if (!alvo) return [0, 0, 0, 0];
      /* com a mascara a amostra e o circulo da bolha, nao o quadrado envolvente */
      var raio = mask && mask.disco ? mask.disco.r : alvo.w / 2;
      var melhor = null;
      var melhorD = Infinity;
      (script.bolas || []).forEach(function (b) {
        var d = Math.pow(b.x - alvo.x, 2) + Math.pow(b.y - alvo.y, 2);
        if (d < melhorD) {
          melhorD = d;
          melhor = b;
        }
      });
      if (!melhor || melhorD > raio * raio) return [0, 0, 0, 0];
      return [script.preenchidos[melhor.q + ":" + melhor.o] ? 255 : 0, 0, 0, 0];
    },
    circle: function (mat, centro, raio) {
      mat.disco = { x: centro.x, y: centro.y, r: raio };
      return mat;
    },
    getPerspectiveTransform: function (s, d) {
      var m = new FakeMat(3, 3, 0);
      m.src = s && s.vals;
      m.dst = d && d.vals;
      return m;
    },
    warpPerspective: function (src, dst, M) {
      dst.rows = script.page.h;
      dst.cols = script.page.w;
      script.ultimoWarp = { src: M && M.src, dst: M && M.dst };
      return dst;
    }
  };
  return cv;
}

function bolaPx(layout, q, o) {
  var c = layout.bubbleCenterMm(q, o);
  return { x: Math.round(c.x * PX), y: Math.round(c.y * PX), q: q, o: o };
}

function fidu(xmm, ymm, layout) {
  return { x: Math.round(xmm * PX), y: Math.round(ymm * PX), area: Math.pow(layout.fiducialMm * PX, 2), lado: layout.fiducialMm * PX };
}

function carregarSandbox(cv, jsQR) {
  var sandbox = {
    console: console,
    setTimeout: function () { return 0; },
    Math: Math,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    JSON: JSON,
    Date: Date,
    Error: Error,
    Uint8Array: Uint8Array,
    Uint8ClampedArray: Uint8ClampedArray,
    Infinity: Infinity,
    NaN: NaN,
    isNaN: isNaN,
    parseInt: parseInt,
    parseFloat: parseFloat,
    ImageData: function (data, w, h) {
      this.data = data;
      this.width = w;
      this.height = h;
    },
    jsQR: jsQR,
    cv: cv,
    postMessage: function () {},
    GabaLayout: L,
    GabaQR: QR,
    importScripts: function () {}
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(__dirname, "..", "js", "omrWorker.js"), "utf8");
  vm.runInContext(src, sandbox, { filename: "omrWorker.js" });
  vm.runInContext("cvReady = true;", sandbox);
  return sandbox;
}

function ler(script, cv, opts, jsQR) {
  var sandbox = carregarSandbox(cv, jsQR || function () { return null; });
  var imagem = {
    data: new Uint8ClampedArray(script.page.w * script.page.h * 4),
    width: script.page.w,
    height: script.page.h
  };
  return vm.runInContext("processFrame", sandbox)(imagem, opts || {});
}

function montar(total, alternativas, preenchidos, opts) {
  opts = opts || {};
  var layout = L.compute(total, alternativas);
  var page = { w: Math.round(layout.pageWmm * PX), h: Math.round(layout.pageHmm * PX) };
  var bolas = [];
  for (var q = 0; q < layout.total; q++) {
    for (var o = 0; o < layout.options; o++) bolas.push(bolaPx(layout, q, o));
  }
  var fc = layout.fiducialCenters();
  var contours = fc.map(function (c) { return fidu(c.x, c.y, layout); });
  if (opts.incluirQrFinder) {
    contours.push({
      x: Math.round((layout.qr.xMm + 5) * PX),
      y: Math.round((layout.qr.yMm + 5) * PX),
      area: Math.pow(layout.fiducialMm * PX, 2),
      lado: layout.fiducialMm * PX
    });
  }
  if (opts.deslocarPx) {
    contours = contours.map(function (c) { return { x: c.x + opts.deslocarPx, y: c.y, area: c.area, lado: c.lado }; });
  }
  var script = { contours: contours, bolas: bolas, preenchidos: preenchidos, page: page };
  return { layout: layout, script: script, page: page };
}

function principal() {
  var total = 10;
  var letras = L.compute(total, 5).optionLetters;

  // 1. layout compartilhado: worker e impressão usam a mesma grade
  var layout = L.compute(total, 5);
  check("worker resolve o mesmo layout da impressao", layout.grid.colContentMm > 0 && layout.total === total);

  // 2. marca na bolha impressa (q,o) volta como a letra daquela coluna
  var alvos = { "0:0": 1, "1:2": 1, "2:4": 1, "3:1": 1, "4:3": 1, "5:0": 1, "6:2": 1, "7:4": 1, "8:1": 1, "9:3": 1 };
  var caso = montar(total, 5, alvos);
  var cv = makeFakeCv(caso.script);
  var r = ler(caso.script, cv, { totalQuestoes: total, alternativas: 5 });
  check("leitura ok", r.ok === true, r.message);
  check("quatro fiduciais encontrados", r.corners && r.corners.length === 4, JSON.stringify(r.corners));
  var esperado = letras;
  var lidas = r.answers;
  var esperadoLetras = [];
  for (var q = 0; q < total; q++) {
    var par = Object.keys(alvos).filter(function (k) { return k.split(":")[0] === String(q); })[0];
    esperadoLetras.push(par ? layout.optionLetters[parseInt(par.split(":")[1], 10)] : null);
  }
  check("todas as bolhas lidas na letra certa", JSON.stringify(lidas) === JSON.stringify(esperadoLetras),
    JSON.stringify(lidas) + " vs " + JSON.stringify(esperadoLetras));
  check("ratio preenchido para calibracao", Array.isArray(r.ratio) && r.ratio.length === total && r.ratio[0].length === 5,
    JSON.stringify(r.ratio && r.ratio[0]));
  check("sem duvidas quando uma bolha so esta marcada", r.confusao.length === 0, JSON.stringify(r.confusao));

  // 3. ambiguidade: duas bolhas quase iguais na mesma questao
  var amb = {};
  for (var i = 0; i < total; i++) amb[i + ":0"] = 1;
  amb["2:3"] = 1;
  amb["7:1"] = 1;
  var casoAmb = montar(total, 5, amb);
  var rAmb = ler(casoAmb.script, makeFakeCv(casoAmb.script), { totalQuestoes: total, alternativas: 5 });
  check("duvida sinalizada", rAmb.confusao.indexOf(3) >= 0 && rAmb.confusao.indexOf(8) >= 0, JSON.stringify(rAmb.confusao));
  check("resposta ambigua nao vira letra", rAmb.answers[2] === null && rAmb.answers[7] === null, JSON.stringify(rAmb.answers));

  // 4. sensibilidade: marca fraca (lápis) entra quando aumentamos a sensibilidade
  var fraco = {};
  for (var j = 0; j < total; j++) fraco[j + ":2"] = 1;
  var casoFraco = montar(total, 5, fraco);
  var cvFraco = makeFakeCv(casoFraco.script);
  var medio = cvFraco.mean;
  cvFraco.mean = function (m) {
    var v = medio.call(this, m);
    return [v[0] * 0.5, 0, 0, 0];
  };
  var rSevero = ler(casoFraco.script, cvFraco, { totalQuestoes: total, alternativas: 5, sensibilidade: 0.6 });
  var rSensivel = ler(casoFraco.script, cvFraco, { totalQuestoes: total, alternativas: 5, sensibilidade: 1.8 });
  check("corte segue a sensibilidade", rSevero.corte > rSensivel.corte, rSevero.corte + " > " + rSensivel.corte);
  var lidasSevero = rSevero.answers.filter(Boolean).length;
  var lidasSensivel = rSensivel.answers.filter(Boolean).length;
  check("mais sensivel le as marcas fracas", lidasSensivel > lidasSevero, lidasSevero + " -> " + lidasSensivel);

  // 5. fiducial falso do QR é rejeitado (senão a folha warp desloca e tudo erra de posição)
  var casoQr = montar(total, 5, alvos, { incluirQrFinder: true });
  var rQr = ler(casoQr.script, makeFakeCv(casoQr.script), { totalQuestoes: total, alternativas: 5 });
  var cantos = rQr.corners || [];
  check("achado das marcas ignora o padrao do QR", cantos.length === 4 &&
    cantos.every(function (c) { return !(c.x > (casoQr.layout.qr.xMm - 3) * PX && c.x < (casoQr.layout.qr.xMm + casoQr.layout.qr.wMm + 3) * PX && c.y < (casoQr.layout.qr.yMm + casoQr.layout.qr.hMm + 3) * PX && c.y > (casoQr.layout.qr.yMm - 3) * PX); }),
    JSON.stringify(cantos));

  // 5b. folha fora do centro: um padrao do QR escapa da caixa e fica acima das marcas do cartao
  var desloc = 12;
  var casoFora = montar(total, 5, alvos, { deslocarPx: desloc * PX });
  var g = casoFora.layout.qr;
  casoFora.script.contours = casoFora.script.contours.concat([{
    x: Math.round((g.xMm + g.wMm - 7.5 + desloc) * PX), y: Math.round((g.yMm + 7.5) * PX),
    area: Math.pow(7 * PX, 2), lado: 7 * PX
  }]);
  var simbolo = function (x, y) { return { x: (x + desloc) * PX, y: y * PX }; };
  var qrCru = {
    data: QR.encode({ id: "prova-1" }, { id: "aluno-9", numero: 9 }, { versao: 2, codigo: "ABCD" }),
    location: {
      topLeftCorner: simbolo(g.xMm + 4, g.yMm + 4), topRightCorner: simbolo(g.xMm + g.wMm - 4, g.yMm + 4),
      bottomRightCorner: simbolo(g.xMm + g.wMm - 4, g.yMm + g.hMm - 4), bottomLeftCorner: simbolo(g.xMm + 4, g.yMm + g.hMm - 4)
    }
  };
  var rFora = ler(casoFora.script, makeFakeCv(casoFora.script), { totalQuestoes: total, alternativas: 5 },
    function (data, w, h) { return w === casoFora.page.w && h === casoFora.page.h ? qrCru : null; });
  var marcasFora = casoFora.layout.fiducialCenters().map(function (c) {
    return { x: Math.round((c.x + desloc) * PX), y: Math.round(c.y * PX) };
  });
  var warpFora = casoFora.script.ultimoWarp || {};
  check("padrao do QR fora da caixa nao vira canto: as marcas saem do QR achado no quadro",
    (rFora.corners || []).length === 4 && rFora.qr_texto === qrCru.data && marcasFora.every(function (m, i) {
      return Math.abs(rFora.corners[i].x - m.x) <= 1 && Math.abs(rFora.corners[i].y - m.y) <= 1 &&
        Math.abs(warpFora.src[i * 2] - m.x) <= 1 && Math.abs(warpFora.src[i * 2 + 1] - m.y) <= 1;
    }), JSON.stringify(rFora.corners) + " vs " + JSON.stringify(marcasFora));

  // 6. sem fiduciais: mensagem clara, sem excecao
  var casoVazio = montar(total, 5, alvos);
  casoVazio.script.contours = [];
  var rVazio = ler(casoVazio.script, makeFakeCv(casoVazio.script), { totalQuestoes: total });
  check("sem folha devolve aviso", rVazio.ok === false && /marcas pretas em volta do cartao/.test(rVazio.message), rVazio.message);

  // 6b. com RETR_LIST o furo que o limiar abre em cada marca volta como outro quadrado no mesmo centro
  function comFuros(lista) {
    return lista.concat(lista.map(function (c) {
      return { x: c.x + 1, y: c.y - 1, area: c.area * 0.45, lado: c.lado * 0.67 };
    }));
  }
  var casoFuro = montar(total, 5, alvos);
  casoFuro.script.contours = comFuros(casoFuro.script.contours);
  var rFuro = ler(casoFuro.script, makeFakeCv(casoFuro.script), { totalQuestoes: total, alternativas: 5 });
  check("furo das marcas nao atrapalha a leitura", rFuro.ok && rFuro.corners.length === 4 &&
    JSON.stringify(rFuro.answers) === JSON.stringify(esperadoLetras), JSON.stringify(rFuro.answers));
  var casoMeia = montar(total, 5, alvos);
  casoMeia.script.contours = comFuros(casoMeia.script.contours.slice(0, 2));
  var rMeia = ler(casoMeia.script, makeFakeCv(casoMeia.script), { totalQuestoes: total, alternativas: 5 });
  check("duas marcas e seus furos nao viram quatro cantos", rMeia.ok === false && /marcas pretas/.test(rMeia.message),
    rMeia.message + " " + JSON.stringify(rMeia.corners));

  // 7. 90 questões: mesmo código, grade de 3 colunas
  var total90 = 90;
  var alvos90 = {};
  for (var k = 0; k < total90; k++) alvos90[k + ":" + (k % 5)] = 1;
  var caso90 = montar(total90, 5, alvos90);
  var r90 = ler(caso90.script, makeFakeCv(caso90.script), { totalQuestoes: total90, alternativas: 5 });
  check("90 questoes lidas", r90.ok && r90.answers.filter(Boolean).length === total90,
    r90.answers.filter(Boolean).length + "/" + total90 + " cols=" + caso90.layout.grid.cols);
  var conf90 = r90.answers.map(function (l, idx) { return l; });
  var ok90 = conf90.every(function (l, idx) { return l === caso90.layout.optionLetters[idx % 5]; });
  check("ordem das letras correta em 3 colunas", ok90, conf90.slice(0, 8).join(""));

  // 7b. o warp tem que levar cada marca para o lugar dela na pagina, nao para o canto
  var warp = caso.script.ultimoWarp || {};
  var fcCaso = caso.layout.fiducialCenters();
  var dstOk = Boolean(warp.dst) && fcCaso.every(function (c, i) {
    return Math.abs(warp.dst[i * 2] - c.x * PX) <= 2 && Math.abs(warp.dst[i * 2 + 1] - c.y * PX) <= 2;
  });
  check("warp mapeia as marcas para a posicao real na pagina", dstOk,
    JSON.stringify(warp.dst) + " vs " + JSON.stringify(fcCaso.map(function (c) { return [c.x * PX, c.y * PX]; })));

  // 8. QR GABA1 decodificado dentro do worker
  var payload = QR.encode({ id: "prova-1" }, { id: "aluno-9", numero: 9 }, { versao: 2, codigo: "ABCD" });
  var casoQrTxt = montar(total, 5, alvos);
  var rTxt = ler(casoQrTxt.script, makeFakeCv(casoQrTxt.script), { totalQuestoes: total, alternativas: 5 },
    function () { return { data: payload }; });
  check("worker decodifica o QR da folha", rTxt.qr && rTxt.qr.prova_id === "prova-1" && rTxt.qr.aluno_id === "aluno-9" &&
    rTxt.qr.versao === 2 && rTxt.qr.codigo === "ABCD", JSON.stringify(rTxt.qr) + " | " + rTxt.message);

  console.log(FALHAS ? "\n" + FALHAS + " FALHAS" : "\ntodos os checks passaram");
  process.exit(FALHAS ? 1 : 0);
}

principal();
