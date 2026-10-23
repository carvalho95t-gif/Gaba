/* Importar prova de PDF de verdade: o extrator de texto, o reflow e a entrega ao parser de blocos.
   Roda so no node: node tests/pdf.test.js */
"use strict";

var fs = require("fs");
var path = require("path");

global.GabaDocx = require("../js/docxParser.js");
require("../js/pdfParser.js");
var GabaPdf = global.GabaPdf;
var GabaDocx = global.GabaDocx;

var FIX = path.join(__dirname, "fixtures");
var AMOSTRA = "PROVA_2SERIE_45_ALUNOS_INDIVIDUALIZADAS-v2.pdf";

function bytesDe(arquivo) {
  return new Uint8Array(fs.readFileSync(path.join(FIX, arquivo)));
}

/* pdf de mentira montado byte a byte: o que se confere aqui e o corte dos streams,
   e nenhum gravador de verdade escreve um arquivo desses */
function bruto(txt) { return Buffer.from(txt, "latin1"); }
function cabeca() { return bruto("%PDF-1.4\n"); }
function peca(n, dict) { return bruto(n + " 0 obj " + dict + " endobj\n"); }

function comStream(n, dict, dados) {
  return Buffer.concat([bruto(n + " 0 obj " + dict + " stream\n"), dados, bruto("\nendstream\nendobj\n")]);
}

/* camada de texto de digitalizado: um glifo por BT..ET, cada um na sua coordenada absoluta.
   o codigo do glifo vem deslocado de 100 para a fonte errada nao sair com a mesma letra */
function camadaDeGlifos(linhas) {
  var partes = [];
  var usados = {};
  linhas.forEach(function (linha, k) {
    var x = 0;
    String(linha).split("").forEach(function (ch) {
      if (ch === " ") { x += 20; return; }
      var code = ch.charCodeAt(0) + 100;
      usados[code] = ch.charCodeAt(0);
      partes.push("BT 1 0 0 1 " + x + " " + (-15 * k) + " Tm /F1 10 Tf <" +
        ("0000" + code.toString(16).toUpperCase()).slice(-4) + "> Tj ET");
      x += 5;
    });
  });
  return { conteudo: partes.join("\n"), codigos: Object.keys(usados).map(Number), dest: usados };
}

function cmapDe(camada) {
  var pares = camada.codigos.map(function (c) {
    var origem = ("0000" + c.toString(16).toUpperCase()).slice(-4);
    var alvo = ("0000" + camada.dest[c].toString(16).toUpperCase()).slice(-4);
    return "<" + origem + "> <" + alvo + ">";
  });
  return ["/CMapName /Gaba-Teste def", "/CMapType 2 def",
    "1 begincodespacerange", "<0000> <FFFF>", "endcodespacerange",
    pares.length + " beginbfchar"].concat(pares).concat(["endbfchar"]).join("\n");
}

var falhas = 0;
function check(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (detalhe !== undefined && !cond ? "  ->  " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas += 1;
}

(function mapaDeUnicode() {
  console.log("\n== mapa ToUnicode ==");
  var cmap = [
    "/CMapName /Adobe-Identity-UCS def",
    "begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    "2 beginbfchar",
    "<0041> <00E7>",
    "<0042> <00C3>",
    "endbfchar",
    "1 beginbfrange",
    "<0050> <0052> <0061>",
    "endbfrange"
  ].join("\n");
  var mapa = GabaPdf.parseCMap(cmap);
  check("begincodespacerange diz que o codigo tem 2 bytes", mapa.largura === 2, mapa.largura);
  check("bfchar troca a letra codificada pelo caractere real",
    mapa.mapa[0x41] === "ç" && mapa.mapa[0x42] === "Ã", mapa.mapa);
  check("bfrange percorre o destino a partir da base",
    mapa.mapa[0x50] === "a" && mapa.mapa[0x51] === "b" && mapa.mapa[0x52] === "c", mapa.mapa);
})();

(function textoDosStreams() {
  console.log("\n== operadores de texto ==");
  var semMapa = { mapa: null, largura: 1 };
  var bruto = GabaPdf.textoDoConteudo(
    ["BT", "/F1 10 Tf", "(Quest\\343o 01 \\(leia\\)) Tj", "0 -12 Td",
      "[(Aban-)260(donar)] TJ", "(hex) Tj", "ET",
      "BT", "/F2 10 Tf", "<0041 0042> Tj", "T*", "(segunda) Tj", "ET"].join("\n"),
    { F1: semMapa, F2: { mapa: { 0x41: "ç", 0x42: "Ã" }, largura: 2 } }
  );
  check("escapa parenteses e decodifica o octal da codificacao do PDF",
    /Questão 01 \(leia\)/.test(bruto), JSON.stringify(bruto));
  check("emenda as pedacas do TJ sem o espaco do kerning miudo", /Aban-donar/.test(bruto), JSON.stringify(bruto));
  check("string hexadecimal sai pelo mapa da fonte", /çÃ/.test(bruto), JSON.stringify(bruto));
  check("cada BT..ET vira um paragrafo", bruto.split("\n\n").length >= 2, JSON.stringify(bruto));

  var comKerning = GabaPdf.textoDoConteudo("BT [(A)-300(B) -190(C)] TJ ET", { F1: semMapa });
  check("os numeros do array TJ sao kerning e nao viram espaco nem letra", comKerning === "ABC", JSON.stringify(comKerning));

  /* o Chrome imprime o tamanho com 7 decimais; se o Tf nao e reconhecido a pagina inteira sai
     como codigo de 1 byte — letra por letra com caractere nulo no meio */
  var doChrome = GabaPdf.textoDoConteudo(
    ["BT", "/F1 10.3999996 Tf", "1 0 0 -1 45.5 1172 Tm", "<0041> Tj", "6.1012421 0 Td <0042> Tj", "ET"].join("\n"),
    { F1: { mapa: { 0x41: "ç", 0x42: "Ã" }, largura: 2 } }
  );
  check("o tamanho da fonte com 7 decimais ainda troca de fonte (PDF impresso no navegador)",
    /çÃ/.test(doChrome.replace(/\s+/g, "")), JSON.stringify(doChrome));
})();

(function refluio() {
  console.log("\n== remendando as linhas do PDF ==");
  var juntas = GabaPdf.refluir([
    [
      "QUESTÃO 01 —",
      "“Um texto que o PDF",
      "quebrou no meio da frase;",
      "(FULANO, 2026).",
      "O auriga representa:",
      "A)",
      "Governar com firmeza as forças",
      "passionais da psique.",
      "B) Ceder o comando."
    ].join("\n"),
    ["C) Eliminar os cavalos.", "GOVERNO DO ESTADO", "QUESTÃO 02 — Outra"].join("\n")
  ]);
  var linhas = juntas.split("\n");
  check("o marcador sozinho e a quebra de linha viram o enunciado de uma vez",
    linhas[0] === "QUESTÃO 01 — “Um texto que o PDF quebrou no meio da frase;",
    JSON.stringify(linhas[0]));
  check("uma linha que fecha frase comeca bloco novo", linhas[1] === "(FULANO, 2026)." &&
    linhas[2] === "O auriga representa:", JSON.stringify(linhas.slice(1, 3)));
  check("a alternativa dividida em duas linhas sai inteira",
    linhas[3] === "A) Governar com firmeza as forças passionais da psique.", JSON.stringify(linhas[3]));
  check("o marcador de alternativa emenda no texto dele",
    linhas[4] === "B) Ceder o comando.", JSON.stringify(linhas[4]));
  check("a primeira linha da pagina seguinte nunca emende na anterior",
    linhas[5] === "C) Eliminar os cavalos." && linhas[6] === "GOVERNO DO ESTADO",
    JSON.stringify(linhas.slice(5, 7)));
  check("questao e comando continuam blocos separados",
    linhas[7] === "QUESTÃO 02 — Outra", JSON.stringify(linhas[7]));
})();

(function largurasDoCidFont() {
  console.log("\n== larguras do CIDFont (/W) ==");
  var w = GabaPdf.parseW("3 [ 1000 20 30 ] 40 60 500 700 9000 250");
  check("cid com lista de larguras guarda cada posicao da lista",
    w.pontos[3] === 1000 && w.pontos[5] === 30, w.pontos);
  check("cidInicial cidFinal largura preenche a faixa toda",
    w.pontos[40] === 500 && w.pontos[60] === 500, w.pontos);
  check("faixa longa nao vira mapa: fica como faixa e o /DW responde pelo padrao",
    w.faixas.length === 1 && w.faixas[0][0] === 700 && w.faixas[0][2] === 250 && w.pontos[8000] == null,
    { faixas: w.faixas, pontos: Object.keys(w.pontos).length });
  check("sem /W no dicionario a largura e desconhecida", GabaPdf.parseW("").pontos[3] === undefined);
})();

(function linhasPorPosicao() {
  console.log("\n== linha pela coordenada do papel ==");
  var pedacos = [
    { x: 20, y: 0, fim: 25, tamanho: 10, texto: "OFICIAL" },
    { x: 0, y: 0, fim: 5, tamanho: 10, texto: "GA" },
    { x: 5, y: 0, fim: 10, tamanho: 10, texto: "BARITO" },
    { x: 0, y: -13, fim: 5, tamanho: 10, texto: "TIPO" },
    { x: 0, y: -60, fim: 5, tamanho: 10, texto: "FOLHA" }
  ];
  var saida = GabaPdf.textoDasRuns(pedacos);
  var linhas = saida.split("\n").filter(Boolean);
  check("as pedacas saem na ordem em que caem no papel, nao na ordem do stream",
    linhas[0] === "GABARITO OFICIAL", JSON.stringify(linhas[0]));
  check("pedaca colada na anterior emenda sem espaco", /GABARITO OFICIAL/.test(saida), JSON.stringify(saida));
  check("a linha de baixo fica em outra linha", linhas[1] === "TIPO", JSON.stringify(linhas[1]));
  check("salto grande de linha fecha o paragrafo", saida.indexOf("TIPO\n\nFOLHA") >= 0, JSON.stringify(saida));

  var perto = GabaPdf.textoDasRuns([
    { x: 0, y: 0, fim: 5, tamanho: 10, texto: "A" },
    { x: 0, y: -3, fim: 5, tamanho: 10, texto: "B" }
  ]);
  check("fios de linha diferentes nao se emendam, por pouco que fiquem separados",
    perto === "A\nB", JSON.stringify(perto));

  var folhaNormal = "BT /F1 10 Tf (PRIMEIRA LINHA DO ENUNCIADO) Tj 0 -12 Td (SEGUNDA LINHA DO ENUNCIADO) Tj ET";
  check("uma folha desenhada linha a linha nao e picada, entao fica no caminho de sempre",
    GabaPdf.textoPicado(GabaPdf.textoDoConteudo(folhaNormal, { F1: { mapa: null, largura: 1 } })) === false);
  var letraPorLetra = "BT <00> Tj ET BT <01> Tj ET BT <02> Tj ET BT <03> Tj ET BT <04> Tj ET BT <05> Tj ET";
  check("uma letra por bloco e o sinal de que falta reconstruir pela posicao",
    GabaPdf.textoPicado(GabaPdf.textoDoConteudo(letraPorLetra, { F1: { mapa: null, largura: 1 } })) === true);
})();

(async function documento() {
  console.log("\n== " + AMOSTRA + " ==");
  var t0 = Date.now();
  var lido = await GabaPdf.parsePdf(bytesDe(AMOSTRA));
  check("le todas as paginas sem aviso de fonte quebrada",
    lido.paginas === 182 && lido.avisos.length === 0, { paginas: lido.paginas, avisos: lido.avisos });

  check("o texto sai com os acentos do documento",
    /AVALIAÇÃO DE FILOSOFIA — 2ª SÉRIE/.test(lido.texto) && /carruagem/.test(lido.texto), lido.texto.slice(0, 80));
  console.log("  (" + lido.texto.length + " caracteres em " + (Date.now() - t0) + " ms)");

  var parsed = GabaDocx.parsePlain(lido.texto);
  var prova = GabaDocx.toProva(parsed, "PROVA_2SERIE");
  check("as dez questoes do banco saem do PDF", parsed.questoes.length === 10, parsed.questoes.length);
  check("cada questao traz as cinco alternativas inteiras",
    parsed.questoes.every(function (q) { return Object.keys(q.alternativas).length === 5; }),
    parsed.questoes.map(function (q) { return Object.keys(q.alternativas).length; }));
  check("nenhuma alternativa morreu no meio da linha",
    parsed.questoes.every(function (q) {
      return Object.keys(q.alternativas).every(function (l) { return q.alternativas[l].length > 20; });
    }),
    parsed.questoes[0] && parsed.questoes[0].alternativas);
  check("o gabarito oficial do tipo 1 entrou nas questoes",
    parsed.questoes.map(function (q) { return q.gabarito; }).join("") === "ABECDEBBAB",
    parsed.questoes.map(function (q) { return q.gabarito; }));
  check("o enunciado e o comando ficaram separados como no Word",
    /“Imaginemos a alma/.test(parsed.questoes[0].enunciado) &&
    /consiste em:$/.test(parsed.questoes[0].comando),
    parsed.questoes[0]);
  check("a materia e o titulo vao para a prova",
    prova.disciplina === "Filosofia" && /^AVALIAÇÃO DE FILOSOFIA/.test(prova.titulo) && prova.titulo.length < 100,
    { disciplina: prova.disciplina, titulo: prova.titulo });
  check("as folhas repetidas dos 45 cadernos viram um banco unico",
    parsed.avisos.length === 1 && /repetidas/.test(parsed.avisos[0]), parsed.avisos);
  check("a lista nominal dos 45 alunos sai do PDF com o tipo de cada um",
    parsed.alunos.length === 45 && parsed.alunos.every(function (a) { return a.tipo && a.nome.length > 4; }),
    { alunos: parsed.alunos.length, semTipo: parsed.alunos.filter(function (a) { return !a.tipo; }).length });
  check("o gabarito individual de cada aluno do PDF veio completo",
    parsed.alunos.every(function (a) { return (a.gabarito || []).length === 10; }),
    parsed.alunos.slice(0, 2).map(function (a) { return a.nome + "=" + a.gabarito.join(""); }));
  check("os dez tipos de prova do documento aparecem na prova importada",
    parsed.tipos.length === 10 && prova.tipos.length === 10, { tipos: parsed.tipos.length });

  console.log("\n== aparas e ordem dos streams ==");
  var zlib = require("zlib");
  /* o deflate pode terminar em 0x0A e o PDF ainda escreve a quebra antes de endstream:
     aparar todas as linhas do fim rouba um byte dos dados e a pagina inteira cala */
  function streamAcabandoEmLinha(prefixo) {
    for (var k = 0; k < 6000; k++) {
      var texto = prefixo + new Array(k + 2).join("x");
      var dados = zlib.deflateSync(bruto("BT /F1 10 Tf (" + texto + ") Tj ET"));
      if (dados[dados.length - 1] === 0x0a) return { dados: dados, texto: texto };
    }
    return null;
  }
  var aparado = streamAcabandoEmLinha("APARAS");
  check("dei um jeito de o deflate terminar em quebra de linha", !!aparado);
  var fonteSolta = peca(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  if (aparado) {
    var pdfAparas = new Uint8Array(Buffer.concat([
      cabeca(),
      peca(1, "<< /Type /Catalog /Pages 2 0 R >>"),
      peca(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
      peca(3, "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"),
      fonteSolta,
      comStream(4, "<< /Filter /FlateDecode /Length " + aparado.dados.length + " >>", aparado.dados)
    ]));
    var lidoAparas = await GabaPdf.parsePdf(pdfAparas);
    check("o ultimo byte do deflate, que e uma linha, nao e aparado",
      lidoAparas.porPagina[0] === aparado.texto && lidoAparas.avisos.length === 0,
      { texto: lidoAparas.porPagina[0], avisos: lidoAparas.avisos });

    var semDeclarado = new Uint8Array(Buffer.concat([
      cabeca(),
      peca(1, "<< /Type /Catalog /Pages 2 0 R >>"),
      peca(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
      peca(3, "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"),
      fonteSolta,
      comStream(4, "<< >>", bruto("BT /F1 10 Tf (SEM LENGTH) Tj ET\n\n"))
    ]));
    var lidoSem = await GabaPdf.parsePdf(semDeclarado);
    check("sem /Length as quebras sobrando antes de endstream nao comem o texto",
      /SEM LENGTH/.test(lidoSem.porPagina[0]), lidoSem.porPagina[0]);

    var eco = bruto(".... 6 0 obj ....");
    var pdfOrdem = new Uint8Array(Buffer.concat([
      cabeca(),
      peca(1, "<< /Type /Catalog /Pages 2 0 R >>"),
      peca(2, "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>"),
      comStream(9, "<< >>", eco),
      peca(3, "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>"),
      fonteSolta,
      peca(6, "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 8 0 R >>"),
      comStream(7, "<< >>", bruto("BT /F1 10 Tf (PRIMEIRA) Tj ET")),
      comStream(8, "<< >>", bruto("BT /F1 10 Tf (SEGUNDA) Tj ET"))
    ]));
    var lidoOrdem = await GabaPdf.parsePdf(pdfOrdem);
    check("um \"6 0 obj\" escrito dentro de um stream binario nao embaralha as paginas",
      lidoOrdem.porPagina[0] === "PRIMEIRA" && lidoOrdem.porPagina[1] === "SEGUNDA",
      lidoOrdem.porPagina);
  }

  console.log("\n== texto escondido dentro de form XObject ==");
  var pdfForm = new Uint8Array(Buffer.concat([
    cabeca(),
    peca(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    peca(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    peca(3, "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> " +
      "/XObject << /Fm0 8 0 R >> >> /Contents 4 0 R >>"),
    fonteSolta,
    comStream(4, "<< >>", bruto("q 0.24 0 0 0.24 0 850 cm /Fm0 Do Q")),
    comStream(8, "<< /Type /XObject /Subtype /Form /BBox [0 0 595 842] >>",
      bruto("BT /F1 10 Tf (O TEXTO MORA DENTRO DO FORM) Tj ET"))
  ]));
  var lidoForm = await GabaPdf.parsePdf(pdfForm);
  check("a pagina que so desenha um form XObject entrega o texto que esta la dentro",
    /O TEXTO MORA DENTRO DO FORM/.test(lidoForm.porPagina[0]) &&
    !/sao imagem/.test(lidoForm.avisos.join(" ")),
    { texto: lidoForm.porPagina[0], avisos: lidoForm.avisos });

  /* form aninhado, com o PROPRIO /Resources e o mesmo nome /F1 para outra fonte: quem-cache
     pelo nome entrega o mapa da pagina e o <0041> do form vira lixo */
  var cmap = [
    "/CMapName /Adobe-Identity-UCS def", "begincodespacerange", "<0000> <FFFF>",
    "endcodespacerange", "1 beginbfchar", "<0041> <00E7>", "endbfchar"
  ].join("\n");
  var pdfNinho = new Uint8Array(Buffer.concat([
    cabeca(),
    peca(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    peca(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    peca(3, "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> " +
      "/XObject << /FmA 8 0 R >> >> /Contents 4 0 R >>"),
    fonteSolta,
    comStream(4, "<< >>", bruto("BT /F1 10 Tf (PAGINA) Tj ET Q /FmA Do q")),
    comStream(8, "<< /Type /XObject /Subtype /Form /Resources << /Font << /F1 9 0 R >> " +
      "/XObject << /FmB 12 0 R >> >> >>", bruto("BT /F1 10 Tf <0041> Tj ET /FmB Do")),
    peca(9, "<< /Type /Font /Subtype /Type0 /BaseFont /CO /Encoding /Identity-H " +
      "/DescendantFonts [11 0 R] /ToUnicode 10 0 R >>"),
    comStream(10, "<< /Length " + bruto(cmap).length + " >>", bruto(cmap)),
    peca(11, "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /CO /CIDSystemInfo << >> >>"),
    comStream(12, "<< /Type /XObject /Subtype /Form /Resources << /XObject << /FmA 8 0 R >> >> >>",
      bruto("BT /F1 10 Tf (FILA) Tj ET /FmA Do"))
  ]));
  var lidoNinho = await GabaPdf.parsePdf(pdfNinho);
  check("form dentro de form, e cada um com sua fonte do mesmo nome, sai por inteiro",
    /PAGINA/.test(lidoNinho.porPagina[0]) && lidoNinho.porPagina[0].indexOf("ç") >= 0 &&
    /FILA/.test(lidoNinho.porPagina[0]), JSON.stringify(lidoNinho.porPagina[0]));
  check("form que se referencia de volta nao prende nem duplica o texto",
    lidoNinho.paginas === 1 && /PAGINA/.test(lidoNinho.porPagina[0]) &&
    (lidoNinho.porPagina[0].match(/FILA/g) || []).length === 1,
    JSON.stringify(lidoNinho.porPagina[0]));

  console.log("\n== camada de texto desenhada glifo a glifo ==");

  /* digitalizado com camada de texto letra por letra, cada glifo no seu Tm e tudo dentro de um
     form escalado: o legado devolve uma letra por linha e so a coordenada do papel emenda */
  var glifos = camadaDeGlifos(["GABARITO OFICIAL", "TIPO 1 VERDE", "FOLHA A4"]);
  var mapaGlifos = cmapDe(glifos);
  var pdfGlifos = new Uint8Array(Buffer.concat([
    cabeca(),
    peca(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    peca(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    peca(3, "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 9 0 R >> " +
      "/XObject << /Fm0 5 0 R >> >> /Contents 4 0 R >>"),
    comStream(4, "<< >>", bruto("q 2 0 0 2 40 60 cm /Fm0 Do Q")),
    comStream(5, "<< /Type /XObject /Subtype /Form /Resources << /Font << /F1 7 0 R >> >> >>",
      bruto(glifos.conteudo)),
    peca(7, "<< /Type /Font /Subtype /Type0 /BaseFont /GLIFO /Encoding /Identity-H " +
      "/DescendantFonts [8 0 R] /ToUnicode 10 0 R >>"),
    peca(8, "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GLIFO /CIDSystemInfo << >> " +
      "/FontDescriptor 11 0 R /DW 1000 /W [ 0 1000 500 ] >>"),
    peca(9, "<< /Type /Font /Subtype /Type1 /BaseFont /TIMES >>"),
    comStream(10, "<< /Length " + bruto(mapaGlifos).length + " >>", bruto(mapaGlifos)),
    peca(11, "<< /Type /FontDescriptor /FontName /GLIFO /Flags 4 >>")
  ]));
  var lidoGlifos = await GabaPdf.parsePdf(pdfGlifos);
  var linhasGlifos = String(lidoGlifos.porPagina[0]).split("\n").filter(Boolean);
  check("a folha desenhada glifo a glifo e reconstruida nas linhas do papel",
    linhasGlifos[0] === "GABARITO OFICIAL" && linhasGlifos[1] === "TIPO 1 VERDE" &&
    linhasGlifos[2] === "FOLHA A4", JSON.stringify(linhasGlifos));
  check("o /F1 do form e outro que o /F1 da pagina: cada fonte decodifica pelo numero do objeto",
    lidoGlifos.porPagina[0].replace(/\s+/g, "") === "GABARITOOFICIALTIPO1VERDEFOLHAA4",
    JSON.stringify(lidoGlifos.porPagina[0]));

  /* o form entra escalado e transladado: sem compor a matriz do pai com o Tm, o x do glifo
     sai na coordenada do form e as linhas de cima se emendam com as de baixo */
  var corrida = { runs: [], matriz: [2, 0, 0, 2, 40, 60], dos: null };
  GabaPdf.textoDoConteudo("BT 1 0 0 1 5 -3 Tm /F1 10 Tf (AB) Tj ET",
    { F1: { mapa: null, largura: 1 } }, corrida);
  check("a coordenada do glifo ja sai composta com a matriz do form",
    corrida.runs.length === 1 && corrida.runs[0].x === 50 && corrida.runs[0].y === 54 &&
    corrida.runs[0].tamanho === 20, JSON.stringify(corrida.runs[0]));

  console.log("\n== PDF que o app nao deve tentar ler ==");


  var senha = new Uint8Array(64);
  var cab = "%PDF-1.7\n1 0 obj << /Encrypt 5 0 R >> endobj\n";
  for (var i = 0; i < cab.length; i++) senha[i] = cab.charCodeAt(i);
  var protegido = await GabaPdf.parsePdf(senha);
  check("um PDF cifrado e barrado em portugues",
    protegido.texto === "" && /protegido com senha/.test(protegido.avisos.join(" ")), protegido.avisos);

  var digitalizado = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj",
    "4 0 obj << /Length 26 >> stream",
    "q 1 0 0 1 0 0 cm /Im0 Do Q",
    "endstream",
    "endobj"
  ].join("\n");
  var varredura = await GabaPdf.parsePdf(new Uint8Array(Buffer.from(digitalizado, "latin1")));
  check("um PDF de imagem explica que falta OCR",
    varredura.texto === "" && /sao imagem/.test(varredura.avisos.join(" ")) && /OCR/.test(varredura.avisos.join(" ")),
    varredura.avisos);

  var quebrado = await GabaPdf.parsePdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]));
  check("um PDF truncado diz que nao achou pagina nenhuma",
    /nenhuma pagina/.test(quebrado.avisos.join(" ")), quebrado.avisos);
  check("ehPdf so aceita o cabecalho %PDF-",
    GabaPdf.ehPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])) &&
    !GabaPdf.ehPdf(new Uint8Array([0x50, 0x4b, 0x03, 0x04])));

  if (falhas) {
    console.log("\n" + falhas + " check(s) falharam");
    process.exit(1);
  }
  console.log("\nimportacao de PDF: tudo certo");
})();
