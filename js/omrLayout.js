(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PAGE_W_MM = 210;
  var PAGE_H_MM = 297;
  var MARGIN_MM = 14;
  var GRID_TOP_MM = 70;
  var MAX_QUESTIONS = 90;

  var fiducialMm = 12;
  var fiducialInsetMm = 6;
  var qr = { xMm: 14, yMm: 20, wMm: 40, hMm: 40 };

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function round1(v) {
    return Math.round(v * 10) / 10;
  }

  function gridUsableWidth() {
    return PAGE_W_MM - 2 * MARGIN_MM;
  }

  // Bottom limit keeps the last row clear of the corner fiducial band.
  function gridBottomMm() {
    return PAGE_H_MM - fiducialInsetMm - fiducialMm - 3;
  }

  function compute(totalQuestoes, optionCount) {
    var total = clamp(Math.round(totalQuestoes || 10), 1, MAX_QUESTIONS);
    var nOpts = clamp(Math.round(optionCount || 5), 2, 5);
    var cols = total <= 24 ? 2 : 3;
    var rowsPerCol = Math.ceil(total / cols);
    var rowGap = round1(clamp((gridBottomMm() - GRID_TOP_MM) / rowsPerCol, 6.0, 9.6));
    var bubble = round1(clamp(rowGap * 0.62, 3.2, 4.2));
    var optionGap = round1(clamp(bubble + 2.4, 5.8, 8.2));
    var numberWidth = 9;
    var colContent = numberWidth + (nOpts - 1) * optionGap + bubble;
    var availW = gridUsableWidth();
    var colGap = cols > 1 ? Math.min(92, (availW - colContent) / (cols - 1)) : 0;
    var blockWidth = colGap * (cols - 1) + colContent;
    var xMm = MARGIN_MM + Math.max(0, (availW - blockWidth) / 2);
    var layout = {
      pageWmm: PAGE_W_MM,
      pageHmm: PAGE_H_MM,
      total: total,
      options: nOpts,
      optionLetters: ["A", "B", "C", "D", "E"].slice(0, nOpts),
      fiducialMm: fiducialMm,
      fiducialInsetMm: fiducialInsetMm,
      qr: qr,
      grid: {
        xMm: round1(xMm),
        yMm: GRID_TOP_MM,
        cols: cols,
        questionsPerCol: rowsPerCol,
        bubbleMm: bubble,
        optionGapMm: optionGap,
        rowGapMm: rowGap,
        numberWidthMm: numberWidth,
        colGapMm: round1(colGap),
        colContentMm: round1(colContent)
      }
    };
    layout.colRow = function (qIndex) { return colRow(layout, qIndex); };
    layout.bubbleCenterMm = function (qIndex, optIndex) { return bubbleCenterMm(layout, qIndex, optIndex); };
    layout.fiducialCenters = function () { return fiducialCentersMm(layout); };
    layout.problemas = function () { return validate(layout); };
    return layout;
  }

  function colRow(layout, qIndex) {
    var g = layout.grid;
    return { col: Math.floor(qIndex / g.questionsPerCol), row: qIndex % g.questionsPerCol };
  }

  // Center of a bubble in mm, measured from the page top-left corner.
  function bubbleCenterMm(layout, qIndex, optIndex) {
    var g = layout.grid;
    var cr = colRow(layout, qIndex);
    return {
      x: g.xMm + cr.col * g.colGapMm + g.numberWidthMm + optIndex * g.optionGapMm + g.bubbleMm / 2,
      y: g.yMm + cr.row * g.rowGapMm + g.bubbleMm / 2
    };
  }

  function fiducialCentersMm(layout) {
    var i = layout.fiducialInsetMm;
    var s = layout.fiducialMm;
    return [
      { x: i + s / 2, y: i + s / 2, name: "tl" },
      { x: layout.pageWmm - i - s / 2, y: i + s / 2, name: "tr" },
      { x: layout.pageWmm - i - s / 2, y: layout.pageHmm - i - s / 2, name: "br" },
      { x: i + s / 2, y: layout.pageHmm - i - s / 2, name: "bl" }
    ];
  }

  function validate(layout) {
    var g = layout.grid;
    var problems = [];
    var right = g.xMm + (g.cols - 1) * g.colGapMm + g.colContentMm;
    var bottom = g.yMm + (g.questionsPerCol - 1) * g.rowGapMm + g.bubbleMm;
    if (right > layout.pageWmm - 8) problems.push("grade ultrapassa a margem direita em " + round1(right - (layout.pageWmm - 8)) + "mm");
    if (bottom > gridBottomMm()) problems.push("grade invade a faixa das marcas de canto em " + round1(bottom - gridBottomMm()) + "mm");
    if (g.yMm < layout.qr.yMm + layout.qr.hMm) problems.push("grade começa sobre o QR Code");
    if (g.cols * g.questionsPerCol < layout.total) problems.push("grade comporta apenas " + g.cols * g.questionsPerCol + " questões");
    return problems;
  }

  return {
    MAX_QUESTIONS: MAX_QUESTIONS,
    compute: compute,
    colRow: colRow,
    bubbleCenterMm: bubbleCenterMm,
    fiducialCentersMm: fiducialCentersMm,
    validate: validate
  };
});
