/* Gaba OMR engine — OpenCV.js + jsQR in a Web Worker */
/* global cv, jsQR */

var OPENCV_URL = "https://docs.opencv.org/4.9.0/opencv.js";
var JSQR_URL = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";

var GLayout = null;
var GQR = null;
var PX_PER_MM = 8;
var PARAMS = { fillRatio: 0.38, ambigDelta: 0.08, roiScale: 0.82 };

var cvReady = false;
var loadError = null;

function layoutApi() {
  if (!GLayout) {
    GLayout = self.GabaLayout || null;
  }
  if (!GLayout) throw new Error("omrWorker: omrLayout.js nao carregou via importScripts.");
  return GLayout;
}

function qrApi() {
  if (!GQR) {
    GQR = self.GabaQR || null;
  }
  return GQR;
}

function layoutPara(total, alternativas) {
  var t = Math.max(1, Math.min(layoutApi().MAX_QUESTIONS, parseInt(total, 10) || 10));
  var a = Math.max(2, Math.min(5, parseInt(alternativas, 10) || 5));
  return layoutApi().compute(t, a);
}

function pageSize(layout) {
  layout = layout || layoutPara(10, 5);
  return {
    w: Math.round(layout.pageWmm * PX_PER_MM),
    h: Math.round(layout.pageHmm * PX_PER_MM)
  };
}

function mm(v) {
  return Math.round(v * PX_PER_MM);
}

/* sensibilidade > 1 aceita marcas mais fracas (lapis); < 1 exige marca mais escura.
   o piso 0,30 fica acima do ruido de uma bolha impressa vazia (~0,23) */
function sensibilidade(opts) {
  var mult = Math.max(0.5, Math.min(1.6, Number(opts && opts.sensibilidade) || 1));
  return Math.max(0.3, Math.min(0.8, PARAMS.fillRatio / mult));
}

self.Module = {
  onRuntimeInitialized: function () {
    markCvReady("opencv");
  }
};

try {
  importScripts("omrLayout.js", "qrPayload.js");
  GLayout = self.GabaLayout || null;
  GQR = self.GabaQR || null;
} catch (err) {
  loadError = "layout: " + String(err);
  postMessage({ type: "engine-error", error: loadError });
}

try {
  importScripts(JSQR_URL, OPENCV_URL);
} catch (err) {
  loadError = String(err);
  postMessage({ type: "engine-error", error: loadError });
}

function markCvReady(engine) {
  if (cvReady) return;
  cvReady = true;
  postMessage({ type: "ready", engine: engine });
}

if (typeof cv !== "undefined" && cv) {
  if (cv.ready && typeof cv.ready.then === "function") {
    cv.ready.then(function () {
      markCvReady("opencv");
    }).catch(function (err) {
      loadError = String(err);
    });
  } else if (cv.Mat) {
    markCvReady("opencv-sync");
  }
}

setTimeout(function () {
  if (!cvReady) {
    postMessage({ type: "ready", engine: "fallback", error: loadError || "OpenCV ainda não inicializou" });
  }
}, 12000);

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function orderCorners(pts) {
  var sorted = pts.slice().sort(function (a, b) {
    return a.y - b.y;
  });
  var top = sorted.slice(0, 2).sort(function (a, b) {
    return a.x - b.x;
  });
  var bottom = sorted.slice(2).sort(function (a, b) {
    return a.x - b.x;
  });
  return [top[0], top[1], bottom[1], bottom[0]];
}

function contourCenter(contour) {
  var m = cv.moments(contour);
  if (!m.m00) return null;
  return { x: m.m10 / m.m00, y: m.m01 / m.m00 };
}

function isSquare(contour, minArea) {
  var peri = cv.arcLength(contour, true);
  var approx = new cv.Mat();
  cv.approxPolyDP(contour, approx, 0.04 * peri, true);
  var ok = false;
  if (approx.rows >= 4) {
    var rect = cv.boundingRect(contour);
    var area = cv.contourArea(contour);
    var ratio = rect.width / Math.max(rect.height, 1);
    ok = area >= minArea && ratio > 0.65 && ratio < 1.45;
  }
  approx.delete();
  return ok;
}

function findFiducials(src, layout) {
  var gray = new cv.Mat();
  var blur = new cv.Mat();
  var thresh = new cv.Mat();
  var contours = new cv.MatVector();
  var hierarchy = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.adaptiveThreshold(blur, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 8);
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    var px = src.cols / layout.pageWmm;
    var lado = layout.fiducialMm * px;
    var minArea = lado * lado * 0.35;
    var maxArea = lado * lado * 3.2;
    var qrX0 = (layout.qr.xMm - 3) * px;
    var qrX1 = (layout.qr.xMm + layout.qr.wMm + 3) * px;
    var qrY0 = (layout.qr.yMm - 3) * px;
    var qrY1 = (layout.qr.yMm + layout.qr.hMm + 3) * px;
    var candidates = [];
    for (var i = 0; i < contours.size(); i++) {
      var cnt = contours.get(i);
      var area = cv.contourArea(cnt);
      if (area < minArea || area > maxArea) continue;
      if (!isSquare(cnt, minArea)) continue;
      var c = contourCenter(cnt);
      if (!c) continue;
      if (c.x > qrX0 && c.x < qrX1 && c.y > qrY0 && c.y < qrY1) continue;
      candidates.push({ x: c.x, y: c.y, area: area });
    }
    if (candidates.length < 4) return null;
    candidates.sort(function (a, b) {
      return b.area - a.area;
    });
    return pickFourCorners(candidates);
  } finally {
    gray.delete();
    blur.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function pickFourCorners(candidates) {
  var xs = candidates.map(function (c) { return c.x; });
  var ys = candidates.map(function (c) { return c.y; });
  var minX = Math.min.apply(null, xs);
  var maxX = Math.max.apply(null, xs);
  var minY = Math.min.apply(null, ys);
  var maxY = Math.max.apply(null, ys);
  var spanX = Math.max(1, maxX - minX);
  var spanY = Math.max(1, maxY - minY);
  var alvos = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
  var usado = {};
  var escolhidos = [];
  for (var i = 0; i < alvos.length; i++) {
    var melhor = null;
    var melhorD = Infinity;
    for (var j = 0; j < candidates.length; j++) {
      if (usado[j]) continue;
      var dx = candidates[j].x - alvos[i].x;
      var dy = candidates[j].y - alvos[i].y;
      var d = dx * dx + dy * dy;
      if (d < melhorD) {
        melhorD = d;
        melhor = j;
      }
    }
    if (melhor === null) return null;
    usado[melhor] = true;
    escolhidos.push({ x: candidates[melhor].x, y: candidates[melhor].y });
  }
  return orderCorners(escolhidos);
}

function warpPage(src, corners, layout) {
  var size = pageSize(layout);
  var srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners[0].x, corners[0].y,
    corners[1].x, corners[1].y,
    corners[2].x, corners[2].y,
    corners[3].x, corners[3].y
  ]);
  /* as marcas ficam 12mm para dentro da folha: mapear para os cantos da pagina
     encolheria tudo e deslocaria a grade uns 4mm para fora das bolhas impressas */
  var alvos = layout.fiducialCenters();
  var dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    mm(alvos[0].x), mm(alvos[0].y),
    mm(alvos[1].x), mm(alvos[1].y),
    mm(alvos[2].x), mm(alvos[2].y),
    mm(alvos[3].x), mm(alvos[3].y)
  ]);
  var M = cv.getPerspectiveTransform(srcTri, dstTri);
  var warped = new cv.Mat();
  cv.warpPerspective(src, warped, M, new cv.Size(size.w, size.h), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
  srcTri.delete();
  dstTri.delete();
  M.delete();
  return warped;
}

function matToImageData(mat) {
  var img = new cv.Mat();
  var type = mat.type();
  if (type === cv.CV_8UC1) {
    cv.cvtColor(mat, img, cv.COLOR_GRAY2RGBA);
  } else if (type === cv.CV_8UC3) {
    cv.cvtColor(mat, img, cv.COLOR_RGB2RGBA);
  } else {
    mat.copyTo(img);
  }
  var data = new Uint8ClampedArray(img.data);
  var imageData = new ImageData(data, img.cols, img.rows);
  img.delete();
  return imageData;
}

function decodeQr(warpedRgba, layout) {
  if (typeof jsQR !== "function") return null;
  /* zona de silencio para os quatro lados: sem folga acima e a esquerda o jsQR
     perde o padrao de iniciacao quando a folha esta um pouco girada */
  var folga = 6;
  var x0 = Math.max(0, layout.qr.xMm - folga);
  var y0 = Math.max(0, layout.qr.yMm - folga);
  var x1 = Math.min(layout.pageWmm, layout.qr.xMm + layout.qr.wMm + folga);
  var y1 = Math.min(layout.pageHmm, layout.qr.yMm + layout.qr.hMm + folga);
  var x = mm(x0);
  var y = mm(y0);
  var w = Math.min(mm(x1 - x0), warpedRgba.cols - x);
  var h = Math.min(mm(y1 - y0), warpedRgba.rows - y);
  var roi = warpedRgba.roi(new cv.Rect(x, y, w, h));
  var imageData = matToImageData(roi);
  roi.delete();
  var result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
  if (result && result.data) return result.data;
  var full = matToImageData(warpedRgba);
  result = jsQR(full.data, full.width, full.height, { inversionAttempts: "attemptBoth" });
  return result && result.data ? result.data : null;
}

function bubbleCenters(layout) {
  var points = [];
  for (var q = 0; q < layout.total; q++) {
    var opts = [];
    for (var o = 0; o < layout.options; o++) {
      var c = layout.bubbleCenterMm(q, o);
      opts.push({ x: mm(c.x), y: mm(c.y), r: mm(layout.grid.bubbleMm / 2) });
    }
    points.push(opts);
  }
  return points;
}

function fillRatio(binInv, cx, cy, r) {
  var raio = Math.max(1, Math.round(r));
  var x0 = clamp(Math.round(cx - raio), 0, binInv.cols - 1);
  var y0 = clamp(Math.round(cy - raio), 0, binInv.rows - 1);
  var x1 = clamp(Math.round(cx + raio), 0, binInv.cols - 1);
  var y1 = clamp(Math.round(cy + raio), 0, binInv.rows - 1);
  var w = Math.max(1, x1 - x0);
  var h = Math.max(1, y1 - y0);
  /* amostra o circulo, nao o quadrado envolvente: no quadrado o traco impresso da
     bolha entra na media e uma folha em branco chega a ~0,35 do corte de 0,38 */
  var mask = cv.Mat.zeros(h, w, cv.CV_8UC1);
  cv.circle(mask, new cv.Point(Math.round(cx - x0), Math.round(cy - y0)), raio, new cv.Scalar(255), -1);
  var roi = binInv.roi(new cv.Rect(x0, y0, w, h));
  var mean = cv.mean(roi, mask);
  roi.delete();
  mask.delete();
  return mean[0] / 255;
}

function readBubbles(warped, layout, opts) {
  var gray = new cv.Mat();
  var blur = new cv.Mat();
  var thresh = new cv.Mat();
  var corte = sensibilidade(opts);
  var delta = Math.max(0.02, Math.min(0.4, Number(opts && opts.ambiguidade) || PARAMS.ambigDelta));
  var escala = Math.max(0.5, Math.min(1, Number(opts && opts.roi) || PARAMS.roiScale));
  cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);
  /* o bloco precisa ser bem maior que a bolha: com bloco menor que o circulo a
     propria marca vira o fundo da media local e o lapis nunca passa no corte */
  var bloco = Math.max(21, mm(layout.grid.bubbleMm * 3)) | 1;
  cv.adaptiveThreshold(blur, thresh, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, bloco, 8);
  var centers = bubbleCenters(layout);
  var respostas = [];
  var confidencial = [];
  for (var q = 0; q < centers.length; q++) {
    var v = [];
    for (var o = 0; o < centers[q].length; o++) {
      var b = centers[q][o];
      v.push(fillRatio(thresh, b.x, b.y, b.r * escala));
    }
    var ranked = v.map(function (val, i) {
      return { i: i, v: val };
    }).sort(function (a, b) {
      return b.v - a.v;
    });
    var top = ranked[0];
    var second = ranked[1] || { v: 0, i: -1 };
    var marcada = top.v >= corte;
    var ambigua = marcada && second.i >= 0 && (top.v - second.v) < delta && second.v >= corte * 0.85;
    respostas.push({
      numero: q + 1,
      letra: marcada && !ambigua ? layout.optionLetters[top.i] : null,
      ambigua: ambigua,
      marcada: marcada,
      ratios: v
    });
    confidencial.push(marcada ? clamp(top.v, 0, 1) : 1 - top.v);
  }
  gray.delete();
  blur.delete();
  thresh.delete();
  var media = confidencial.reduce(function (a, b) {
    return a + b;
  }, 0) / Math.max(confidencial.length, 1);
  return {
    respostas: respostas,
    answers: respostas.map(function (r) { return r.letra; }),
    confidence: media,
    corte: corte
  };
}

function fallbackProcess(imageData) {
  var texto = null;
  var meta = null;
  if (typeof jsQR === "function") {
    var decoded = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
    if (decoded) texto = decoded.data;
  }
  if (texto && qrApi()) {
    try {
      meta = qrApi().decode(texto);
    } catch (err) {
      meta = null;
    }
  }
  return {
    ok: Boolean(texto),
    engine: "fallback",
    qr_texto: texto,
    qr: meta,
    respostas: [],
    answers: [],
    ratio: null,
    confusao: [],
    totalLidas: 0,
    confidence: texto ? 0.4 : 0,
    message: texto ? "QR lido sem OpenCV; bolhas nao detectadas." : "Nao foi possivel ler a folha."
  };
}

function matFromImageData(imageData) {
  if (cv.matFromImageData) return cv.matFromImageData(imageData);
  var mat = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
  mat.data.set(imageData.data);
  return mat;
}

function resultadoErro(engine, msg, extra) {
  var r = {
    ok: false,
    engine: engine,
    qr_texto: null,
    qr: null,
    respostas: [],
    answers: [],
    ratio: null,
    confusao: [],
    totalLidas: 0,
    confidence: 0,
    message: msg
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      r[k] = extra[k];
    });
  }
  return r;
}

function processFrame(imageData, opts) {
  opts = opts || {};
  if (!cvReady || typeof cv === "undefined" || !cv.Mat) {
    return fallbackProcess(imageData);
  }
  var layout = layoutPara(opts.totalQuestoes, opts.alternativas);
  var src = matFromImageData(imageData);
  var warped = null;
  try {
    var corners = findFiducials(src, layout);
    if (!corners) {
      return resultadoErro("opencv", "Enquadre a folha: as 4 marcas pretas dos cantos precisam aparecer por inteiro.", { layout: layout.grid });
    }
    warped = warpPage(src, corners, layout);
    var qrTexto = decodeQr(warped, layout);
    var meta = null;
    if (qrTexto && qrApi()) {
      try {
        meta = qrApi().decode(qrTexto);
      } catch (err) {
        meta = null;
      }
    }
    var totalQ = opts.totalQuestoes || (meta && meta.total) || layout.total;
    var read = readBubbles(warped, layout, opts);
    var respostas = read.respostas.slice(0, totalQ);
    var confusao = respostas.filter(function (r) {
      return r.ambigua || (r.marcada && !r.letra);
    }).map(function (r) {
      return r.numero;
    });
    var lidas = respostas.filter(function (r) {
      return Boolean(r.letra);
    }).length;
    return {
      ok: lidas > 0 || Boolean(qrTexto),
      engine: "opencv",
      layout: layout.grid,
      corte: read.corte,
      corners: corners,
      qr_texto: qrTexto,
      qr: meta,
      respostas: respostas,
      answers: respostas.map(function (r) { return r.letra; }),
      ratio: respostas.map(function (r) { return r.ratios; }),
      confusao: confusao,
      totalLidas: lidas,
      confidence: read.confidence,
      message: !qrTexto ? "Bolhas lidas; QR nao encontrado." : (confusao.length ? "Folha lida com " + confusao.length + " duvida(s)." : "Folha lida.")
    };
  } catch (err) {
    return resultadoErro("opencv", "Falha no OMR: " + (err && err.message ? err.message : String(err)));
  } finally {
    src.delete();
    if (warped) warped.delete();
  }
}

self.onmessage = function (event) {
  var msg = event.data || {};
  if (msg.type === "ping") {
    postMessage({ type: "pong", cvReady: cvReady, layout: Boolean(GLayout), qr: Boolean(GQR) });
    return;
  }
  if (msg.type === "layout") {
    try {
      postMessage({ type: "layout-ok", layout: layoutPara(msg.total, msg.alternativas).grid });
    } catch (err) {
      postMessage({ type: "engine-error", error: String(err) });
    }
    return;
  }
  if (msg.type !== "process") return;
  var imageData = new ImageData(new Uint8ClampedArray(msg.buffer), msg.width, msg.height);
  var result = processFrame(imageData, msg.options || {});
  result.type = "result";
  result.requestId = msg.requestId;
  postMessage(result);
};
