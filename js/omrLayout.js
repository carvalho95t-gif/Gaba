(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PAGE_W_MM = 210;
  var PAGE_H_MM = 297;
  var MARGIN_MM = 14;
  var MAX_QUESTIONS = 90;
  /* vai impresso no prefixo do QR (GABA3): suba sempre que marca, QR ou bolha mudar de lugar,
     senao o leitor le papel velho com a grade nova e erra as respostas sem avisar.
     1 = marcas a 6mm (antes de 423dc4f), 2 = marcas a 12mm, 3 = marcas em volta do cartao */
  var GEOMETRIA = 3;

  /* as marcas abracam o bloco de bolhas, alinhadas a primeira e a ultima alternativa, como no
     modelo. entre a marca de cima e a primeira linha mora a fileira A B C D E de cada coluna;
     embaixo, a marca vem logo depois da ultima bolha. */
  var MARCA_FOLGA_MM = 4;
  /* o rodape da folha sobe ate ~281mm: a moldura do cartao para antes dele */
  var RODAPE_MM = 17;
  var MOLDURA_FOLGA_MM = 1.5;
  var FIDUCIAL_MM = 10;
  /* QR no canto de cima a esquerda: libera a largura toda a direita para a tabela do cabecalho */
  var QR_PADRAO = { xMm: 14, yMm: 12, wMm: 40, hMm: 40 };
  /* o recorte que o leitor entrega ao jsQR: nenhum preto de marca pode entrar aqui */
  var FOLGA_RECORTE_QR_MM = 6;
  /* faixa de instrucoes entre o cabecalho e o cartao. ela entra ou nao so pelo numero de
     questoes — o leitor nao sabe o texto, e a grade tem que cair no mesmo lugar para ele */
  var INSTRUCOES_MM = 22;
  var INSTRUCOES_FOLGA_MM = 2;
  var LINHA_MIN_COM_INSTRUCOES_MM = 7.5;
  /* a grade recua 3mm de cada lado: a moldura do cartao fica nos mesmos 14..196mm do cabecalho */
  var GRADE_RECUO_MM = 3;

  /* constantes que o editor de layout pode sobrescrever — o objeto e exportado para o
     painel copiar os valores-padrao e o compute() mesclar com o preset do professor */
  var PADRAO = {
    pageWmm: PAGE_W_MM,
    pageHmm: PAGE_H_MM,
    marginMm: MARGIN_MM,
    fiducialMm: FIDUCIAL_MM,
    marcaFolgaMm: MARCA_FOLGA_MM,
    rodapeMm: RODAPE_MM,
    molduraFolgaMm: MOLDURA_FOLGA_MM,
    qr: { xMm: QR_PADRAO.xMm, yMm: QR_PADRAO.yMm, wMm: QR_PADRAO.wMm, hMm: QR_PADRAO.hMm },
    folgaRecorteQrMm: FOLGA_RECORTE_QR_MM,
    instrucoesMm: INSTRUCOES_MM,
    instrucoesFolgaM: INSTRUCOES_FOLGA_MM,
    linhaMinComInstrucoesMm: LINHA_MIN_COM_INSTRUCOES_MM,
    gradeRecuoMm: GRADE_RECUO_MM
  };

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function round1(v) {
    return Math.round(v * 10) / 10;
  }

  function mesclar(overrides) {
    if (!overrides) return copiarPadrao();
    var c = copiarPadrao();
    var chaves = ["pageWmm","pageHmm","marginMm","fiducialMm","marcaFolgaMm","rodapeMm",
      "molduraFolgaMm","folgaRecorteQrMm","instrucoesMm","instrucoesFolgaM",
      "linhaMinComInstrucoesMm","gradeRecuoMm"];
    chaves.forEach(function (k) {
      if (overrides[k] != null && isFinite(Number(overrides[k]))) c[k] = Number(overrides[k]);
    });
    if (overrides.qr && typeof overrides.qr === "object") {
      ["xMm","yMm","wMm","hMm"].forEach(function (k) {
        if (overrides.qr[k] != null && isFinite(Number(overrides.qr[k]))) c.qr[k] = Number(overrides.qr[k]);
      });
    }
    return c;
  }

  function copiarPadrao() {
    return {
      pageWmm: PADRAO.pageWmm, pageHmm: PADRAO.pageHmm, marginMm: PADRAO.marginMm,
      fiducialMm: PADRAO.fiducialMm, marcaFolgaMm: PADRAO.marcaFolgaMm,
      rodapeMm: PADRAO.rodapeMm, molduraFolgaMm: PADRAO.molduraFolgaMm,
      qr: { xMm: PADRAO.qr.xMm, yMm: PADRAO.qr.yMm, wMm: PADRAO.qr.wMm, hMm: PADRAO.qr.hMm },
      folgaRecorteQrMm: PADRAO.folgaRecorteQrMm, instrucoesMm: PADRAO.instrucoesMm,
      instrucoesFolgaM: PADRAO.instrucoesFolgaM, linhaMinComInstrucoesMm: PADRAO.linhaMinComInstrucoesMm,
      gradeRecuoMm: PADRAO.gradeRecuoMm
    };
  }

  function gridUsableWidth(c) {
    return c.pageWmm - 2 * (c.marginMm + c.gradeRecuoMm);
  }

  function cartaoTopo(c, comInstrucoes) {
    var base = c.qr.yMm + c.qr.hMm + c.folgaRecorteQrMm + 0.5;
    return comInstrucoes ? base + c.instrucoesFolgaM * 2 + c.instrucoesMm : base;
  }

  function gridTop(c, comInstrucoes) {
    return cartaoTopo(c, comInstrucoes) + c.molduraFolgaMm + c.fiducialMm + c.marcaFolgaMm;
  }

  function gridBottom(c) {
    return c.pageHmm - c.rodapeMm - c.molduraFolgaMm - c.fiducialMm - c.marcaFolgaMm;
  }

  function compute(totalQuestoes, optionCount, overrides) {
    var c = mesclar(overrides);
    var maxQ = MAX_QUESTIONS;
    var total = clamp(Math.round(totalQuestoes || 10), 1, maxQ);
    var nOpts = clamp(Math.round(optionCount || 5), 2, 5);
    var cols = total <= 24 ? 2 : 3;
    var rowsPerCol = Math.ceil(total / cols);
    var comInstrucoes = (gridBottom(c) - gridTop(c, true)) / rowsPerCol >= c.linhaMinComInstrucoesMm;
    var topo = gridTop(c, comInstrucoes);
    var rowGap = round1(clamp((gridBottom(c) - topo) / rowsPerCol, 6.0, 9.6));
    var bubble = round1(clamp(rowGap * 0.62, 3.2, 4.2));
    var optionGap = round1(clamp(bubble + 2.4, 5.8, 8.2));
    var numberWidth = 9;
    var colContent = numberWidth + (nOpts - 1) * optionGap + bubble;
    var availW = gridUsableWidth(c);
    var colGap = cols > 1 ? Math.min(92, (availW - colContent) / (cols - 1)) : 0;
    var blockWidth = colGap * (cols - 1) + colContent;
    var xMm = c.marginMm + c.gradeRecuoMm + Math.max(0, (availW - blockWidth) / 2);
    var base = cartaoTopo(c, false);
    var layout = {
      pageWmm: c.pageWmm,
      pageHmm: c.pageHmm,
      total: total,
      options: nOpts,
      optionLetters: ["A", "B", "C", "D", "E"].slice(0, nOpts),
      fiducialMm: c.fiducialMm,
      qrFolgaRecorteMm: c.folgaRecorteQrMm,
      qr: { xMm: c.qr.xMm, yMm: c.qr.yMm, wMm: c.qr.wMm, hMm: c.qr.hMm },
      cartaoTopoMm: round1(cartaoTopo(c, comInstrucoes)),
      instrucoes: comInstrucoes ? { yMm: base + c.instrucoesFolgaM, hMm: c.instrucoesMm } : null,
      grid: {
        xMm: round1(xMm),
        yMm: round1(topo),
        cols: cols,
        questionsPerCol: rowsPerCol,
        bubbleMm: bubble,
        optionGapMm: optionGap,
        rowGapMm: rowGap,
        numberWidthMm: numberWidth,
        colGapMm: round1(colGap),
        colContentMm: round1(colContent)
      },
      _cfg: c
    };
    layout.colRow = function (qIndex) { return colRow(layout, qIndex); };
    layout.bubbleCenterMm = function (qIndex, optIndex) { return bubbleCenterMm(layout, qIndex, optIndex); };
    layout.fiducialCenters = function () { return fiducialCentersMm(layout); };
    layout.cartaoFundoMm = function () { return fiducialCentersMm(layout)[2].y + c.fiducialMm / 2 + c.molduraFolgaMm; };
    layout.qrRoiMm = function (folga) { return qrRoiMm(layout, folga); };
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
    var g = layout.grid;
    var s = layout.fiducialMm;
    var c = layout._cfg || PADRAO;
    var x0 = g.xMm + g.numberWidthMm + s / 2;
    var x1 = g.xMm + (g.cols - 1) * g.colGapMm + g.colContentMm - s / 2;
    var y0 = g.yMm - c.marcaFolgaMm - s / 2;
    var y1 = g.yMm + (g.questionsPerCol - 1) * g.rowGapMm + g.bubbleMm + c.marcaFolgaMm + s / 2;
    return [
      { x: x0, y: y0, name: "tl" },
      { x: x1, y: y0, name: "tr" },
      { x: x1, y: y1, name: "br" },
      { x: x0, y: y1, name: "bl" }
    ];
  }

  function qrRoiMm(layout, folga) {
    var f = folga === undefined ? (layout.qrFolgaRecorteMm || FOLGA_RECORTE_QR_MM) : folga;
    return {
      x0: Math.max(0, layout.qr.xMm - f),
      y0: Math.max(0, layout.qr.yMm - f),
      x1: Math.min(layout.pageWmm, layout.qr.xMm + layout.qr.wMm + f),
      y1: Math.min(layout.pageHmm, layout.qr.yMm + layout.qr.hMm + f)
    };
  }

  function validate(layout) {
    var g = layout.grid;
    var c = layout._cfg || PADRAO;
    var problems = [];
    var right = g.xMm + (g.cols - 1) * g.colGapMm + g.colContentMm;
    var bottom = g.yMm + (g.questionsPerCol - 1) * g.rowGapMm + g.bubbleMm;
    if (right > layout.pageWmm - 8) problems.push("grade ultrapassa a margem direita em " + round1(right - (layout.pageWmm - 8)) + "mm");
    if (bottom > gridBottom(c)) problems.push("grade invade a faixa das marcas de baixo em " + round1(bottom - gridBottom(c)) + "mm");
    if (g.yMm < layout.qr.yMm + layout.qr.hMm) problems.push("grade começa sobre o QR Code");
    if (g.cols * g.questionsPerCol < layout.total) problems.push("grade comporta apenas " + g.cols * g.questionsPerCol + " questões");
    var meio = layout.fiducialMm / 2;
    fiducialCentersMm(layout).forEach(function (fc) {
      var borda = Math.min(fc.x - meio, layout.pageWmm - fc.x - meio, fc.y - meio, layout.pageHmm - fc.y - meio);
      if (borda < 10) problems.push("marca " + fc.name + " a " + round1(borda) + "mm da borda: a impressora e o alimentador cortam");
    });
    if (layout.cartaoFundoMm() > layout.pageHmm - c.rodapeMm) {
      problems.push("cartao invade o rodape em " + round1(layout.cartaoFundoMm() - (layout.pageHmm - c.rodapeMm)) + "mm");
    }
    var roi = qrRoiMm(layout);
    fiducialCentersMm(layout).forEach(function (fc) {
      if (fc.x + meio > roi.x0 && fc.x - meio < roi.x1 && fc.y + meio > roi.y0 && fc.y - meio < roi.y1) {
        problems.push("marca " + fc.name + " encosta no recorte do QR Code");
      }
    });
    return problems;
  }

  return {
    MAX_QUESTIONS: MAX_QUESTIONS,
    GEOMETRIA: GEOMETRIA,
    PADRAO: PADRAO,
    compute: compute,
    colRow: colRow,
    bubbleCenterMm: bubbleCenterMm,
    fiducialCentersMm: fiducialCentersMm,
    qrRoiMm: qrRoiMm,
    validate: validate
  };
});
