(function (global) {
  "use strict";

  var LAYOUT = {
    pageWmm: 210,
    pageHmm: 297,
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
    options: ["A", "B", "C", "D", "E"]
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function qrPayload(prova, aluno) {
    return "GABA|" + prova.id + "|" + aluno.id + "|" + aluno.numero;
  }

  async function qrDataUrl(text) {
    if (!global.QRCode || typeof QRCode.toDataURL !== "function") {
      throw new Error("Biblioteca QRCode não carregou.");
    }
    return QRCode.toDataURL(text, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M"
    });
  }

  function bubbleHtml(totalQuestoes) {
    var g = LAYOUT.grid;
    var html = "";
    var total = Math.min(totalQuestoes || 10, g.cols * g.questionsPerCol);
    for (var q = 0; q < total; q++) {
      var col = Math.floor(q / g.questionsPerCol);
      var row = q % g.questionsPerCol;
      var baseX = g.xMm + col * g.colGapMm;
      var baseY = g.yMm + row * g.rowGapMm;
      html += '<div class="folha-q" style="left:' + baseX + "mm;top:" + baseY + 'mm">';
      html += '<span class="folha-n">' + (q + 1) + "</span>";
      for (var o = 0; o < LAYOUT.options.length; o++) {
        var left = g.numberWidthMm + o * g.optionGapMm;
        html += '<span class="folha-bubble" style="left:' + left + 'mm"><i></i><b>' + LAYOUT.options[o] + "</b></span>";
      }
      html += "</div>";
    }
    return html;
  }

  async function paginaHtml(prova, aluno, turmaNome) {
    var payload = qrPayload(prova, aluno);
    var qr = await qrDataUrl(payload);
    var qtd = prova.quantidade_questoes || (prova.gabarito || []).length || 10;
    return (
      '<article class="folha-a4">' +
        '<div class="fiducial fid-tl"></div>' +
        '<div class="fiducial fid-tr"></div>' +
        '<div class="fiducial fid-bl"></div>' +
        '<div class="fiducial fid-br"></div>' +
        '<img class="folha-qr" src="' + qr + '" alt="QR">' +
        '<div class="folha-meta">' +
          "<h1>Gaba OMR</h1>" +
          "<p><strong>" + esc(prova.titulo) + "</strong></p>" +
          "<p>" + esc(prova.disciplina || "") + "</p>" +
          "<p>Turma: " + esc(turmaNome || "") + "</p>" +
          "<p>Aluno nº " + esc(aluno.numero) + " — " + esc(aluno.nome) + "</p>" +
          "<p class='folha-hint'>Preencha as bolinhas com caneta preta. Não dobre a folha.</p>" +
        "</div>" +
        '<div class="folha-grid">' + bubbleHtml(qtd) + "</div>" +
      "</article>"
    );
  }

  async function imprimir(prova, alunos, turmaNome) {
    var root = document.getElementById("print-root");
    if (!root) throw new Error("Área de impressão não encontrada.");
    var pages = [];
    for (var i = 0; i < alunos.length; i++) {
      pages.push(await paginaHtml(prova, alunos[i], turmaNome));
    }
    root.innerHTML = pages.join("");
    document.body.classList.add("printing");
    window.print();
    window.setTimeout(function () {
      document.body.classList.remove("printing");
    }, 400);
  }

  global.GabaFolha = {
    LAYOUT: LAYOUT,
    qrPayload: qrPayload,
    imprimir: imprimir
  };
})(window);
