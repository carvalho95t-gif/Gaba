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

(async function documento() {
  console.log("\n== " + AMOSTRA + " ==");
  var t0 = Date.now();
  var lido = await GabaPdf.parsePdf(bytesDe(AMOSTRA));
  check("le todas as paginas sem aviso de fonte quebrada",
    lido.paginas === 176 && lido.avisos.length === 0, { paginas: lido.paginas, avisos: lido.avisos });
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
