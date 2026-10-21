/* Gaba OMR engine — OpenCV.js + jsQR in a Web Worker */
/* global cv, jsQR */

var OPENCV_URL = "https://docs.opencv.org/4.9.0/opencv.js";
var JSQR_URL = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";

var LAYOUT = {
  pageWmm: 210,
  pageHmm: 297,
  pxPerMm: 8,
  fiducialMm: 12,
  fiducialInsetMm: 6,
  qr: { xMm: 18, yMm: 22, wMm: 42, hMm: 42 },
  grid: {
    xMm: 18,
    yMm: 72,
    cols: 2,
    questionsPerCol: 25,
    bubbleMm: 4.2,
    optionGapMm: 8.2,
    rowGapMm: 8.4,
    numberWidthMm: 10,
    colGapMm: 92
  },
  options: ["A", "B", "C", "D", "E"],
  fillRatio: 0.38
};

var cvReady = false;
var loadError = null;

function pageSize() {
  return {
    w: Math.round(LAYOUT.pageWmm * LAYOUT.pxPerMm),
    h: Math.round(LAYOUT.pageHmm * LAYOUT.pxPerMm)
  };
}

function mm(v) {
  return Math.round(v * LAYOUT.pxPerMm);
}

self.Module = {
  onRuntimeInitialized: function () {
    markCvReady("opencv");
  }
};

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

function findFiducials(src) {
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
    var minArea = (src.rows * src.cols) * 0.00035;
    var maxArea = (src.rows * src.cols) * 0.04;
    var candidates = [];
    for (var i = 0; i < contours.size(); i++) {
      var cnt = contours.get(i);
      var area = cv.contourArea(cnt);
      if (area < minArea || area > maxArea) continue;
      if (!isSquare(cnt, minArea)) continue;
      var c = contourCenter(cnt);
      if (c) candidates.push({ x: c.x, y: c.y, area: area });
    }
    if (candidates.length < 4) return null;
    candidates.sort(function (a, b) {
      return b.area - a.area;
    });
    var best = pickFourCorners(candidates, src.cols, src.rows);
    return best;
  } finally {
    gray.delete();
    blur.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function pickFourCorners(candidates, w, h) {
  var corners = [
    { x: 0, y: 0, name: "tl" },
    { x: w, y: 0, name: "tr" },
    { x: w, y: h, name: "br" },
    { x: 0, y: h, name: "bl" }
  ];
  var used = {};
  var chosen = [];
  for (var i = 0; i < corners.length; i++) {
    var target = corners[i];
    var best = null;
    var bestD = Infinity;
    for (var j = 0; j < candidates.length; j++) {
      if (used[j]) continue;
      var dx = candidates[j].x - target.x;
      var dy = candidates[j].y - target.y;
      var d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best == null) return null;
    used[best] = true;
    chosen.push({ x: candidates[best].x, y: candidates[best].y });
  }
  return orderCorners(chosen);
}

function warpPage(src, corners) {
  var size = pageSize();
  var srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners[0].x, corners[0].y,
    corners[1].x, corners[1].y,
    corners[2].x, corners[2].y,
    corners[3].x, corners[3].y
  ]);
  var dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    size.w, 0,
    size.w, size.h,
    0, size.h
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

function decodeQr(warpedRgba) {
  if (typeof jsQR !== "function") return null;
  var x = mm(LAYOUT.qr.xMm);
  var y = mm(LAYOUT.qr.yMm);
  var w = mm(LAYOUT.qr.wMm + 8);
  var h = mm(LAYOUT.qr.hMm + 8);
  w = Math.min(w, warpedRgba.cols - x);
  h = Math.min(h, warpedRgba.rows - y);
  var roi = warpedRgba.roi(new cv.Rect(x, y, w, h));
  var imageData = matToImageData(roi);
  roi.delete();
  var result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
  if (result && result.data) return result.data;
  var full = matToImageData(warpedRgba);
  result = jsQR(full.data, full.width, full.height, { inversionAttempts: "attemptBoth" });
  return result && result.data ? result.data : null;
}

function bubbleCenters() {
  var points = [];
  var g = LAYOUT.grid;
  var total = g.cols * g.questionsPerCol;
  for (var q = 0; q < total; q++) {
    var col = Math.floor(q / g.questionsPerCol);
    var row = q % g.questionsPerCol;
    var baseX = mm(g.xMm + col * g.colGapMm + g.numberWidthMm);
    var baseY = mm(g.yMm + row * g.rowGapMm);
    var opts = [];
    for (var o = 0; o < LAYOUT.options.length; o++) {
      opts.push({
        x: baseX + mm(o * g.optionGapMm) + mm(g.bubbleMm / 2),
        y: baseY + mm(g.bubbleMm / 2),
        r: mm(g.bubbleMm / 2)
      });
    }
    points.push(opts);
  }
  return points;
}

function fillRatio(binInv, cx, cy, r) {
  var x0 = clamp(Math.round(cx - r), 0, binInv.cols - 1);
  var y0 = clamp(Math.round(cy - r), 0, binInv.rows - 1);
  var x1 = clamp(Math.round(cx + r), 0, binInv.cols - 1);
  var y1 = clamp(Math.round(cy + r), 0, binInv.rows - 1);
  var w = Math.max(1, x1 - x0);
  var h = Math.max(1, y1 - y0);
  var roi = binInv.roi(new cv.Rect(x0, y0, w, h));
  var mean = cv.mean(roi);
  roi.delete();
  return mean[0] / 255;
}

function readBubbles(warped) {
  var gray = new cv.Mat();
  var blur = new cv.Mat();
  var thresh = new cv.Mat();
  cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);
  cv.adaptiveThreshold(blur, thresh, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 21, 10);
  var centers = bubbleCenters();
  var answers = [];
  var confidences = [];
  for (var q = 0; q < centers.length; q++) {
    var ratios = [];
    for (var o = 0; o < centers[q].length; o++) {
      var b = centers[q][o];
      ratios.push(fillRatio(thresh, b.x, b.y, b.r * 0.82));
    }
    var ranked = ratios.map(function (v, i) {
      return { i: i, v: v };
    }).sort(function (a, b) {
      return b.v - a.v;
    });
    var top = ranked[0];
    var second = ranked[1];
    var marked = top.v >= LAYOUT.fillRatio;
    var ambiguous = marked && second && top.v - second.v < 0.08 && second.v >= LAYOUT.fillRatio * 0.9;
    answers.push(marked && !ambiguous ? LAYOUT.options[top.i] : null);
    confidences.push(marked ? clamp(top.v, 0, 1) : 1 - top.v);
  }
  gray.delete();
  blur.delete();
  thresh.delete();
  var meanConf = confidences.reduce(function (a, b) {
    return a + b;
  }, 0) / Math.max(confidences.length, 1);
  return { answers: answers, confidence: meanConf };
}

function fallbackProcess(imageData) {
  var qr = null;
  if (typeof jsQR === "function") {
    var decoded = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
    if (decoded) qr = decoded.data;
  }
  return {
    ok: Boolean(qr),
    engine: "fallback",
    qr: qr,
    answers: [],
    confidence: qr ? 0.4 : 0,
    message: qr ? "QR lido sem OpenCV; bolhas não detectadas." : "Não foi possível ler a folha."
  };
}

function matFromImageData(imageData) {
  if (cv.matFromImageData) return cv.matFromImageData(imageData);
  var mat = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
  mat.data.set(imageData.data);
  return mat;
}

function processFrame(imageData, options) {
  options = options || {};
  if (!cvReady || typeof cv === "undefined" || !cv.Mat) {
    return fallbackProcess(imageData);
  }
  var src = matFromImageData(imageData);
  var warped = null;
  try {
    var corners = findFiducials(src);
    if (!corners) {
      return {
        ok: false,
        engine: "opencv",
        qr: null,
        answers: [],
        confidence: 0,
        message: "Enquadre a folha para ver as 4 marcas pretas dos cantos."
      };
    }
    warped = warpPage(src, corners);
    var qr = decodeQr(warped);
    var read = readBubbles(warped);
    var maxQ = options.totalQuestoes || read.answers.length;
    var answers = read.answers.slice(0, maxQ);
    return {
      ok: true,
      engine: "opencv",
      qr: qr,
      answers: answers,
      confidence: read.confidence,
      corners: corners,
      message: qr ? "Folha lida." : "Bolhas lidas; QR não encontrado."
    };
  } catch (err) {
    return {
      ok: false,
      engine: "opencv",
      qr: null,
      answers: [],
      confidence: 0,
      message: "Falha no OMR: " + (err && err.message ? err.message : String(err))
    };
  } finally {
    src.delete();
    if (warped) warped.delete();
  }
}

self.onmessage = function (event) {
  var msg = event.data || {};
  if (msg.type === "ping") {
    postMessage({ type: "pong", cvReady: cvReady });
    return;
  }
  if (msg.type !== "process") return;
  var imageData = new ImageData(new Uint8ClampedArray(msg.buffer), msg.width, msg.height);
  var result = processFrame(imageData, msg.options || {});
  result.type = "result";
  result.requestId = msg.requestId;
  postMessage(result);
};
