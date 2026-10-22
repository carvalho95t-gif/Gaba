/* Importar prova de .doc (Word 97) de verdade: contêiner OLE, FIB, tabela de peças e a
   entrega ao parser de blocos. Roda so no node: node tests/doc.test.js */
"use strict";

var fs = require("fs");
var path = require("path");

global.GabaDocx = require("../js/docxParser.js");
require("../js/docParser.js");
var GabaDoc = global.GabaDoc;
var GabaDocx = global.GabaDocx;

var FIX = path.join(__dirname, "fixtures");
var AMOSTRA = "PROVA_2SERIE_45_ALUNOS_INDIVIDUALIZADAS-v2.doc";

function bytesDe(arquivo) {
  return new Uint8Array(fs.readFileSync(path.join(FIX, arquivo)));
}

var falhas = 0;
function check(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (detalhe !== undefined && !cond ? "  ->  " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas += 1;
}

(function cabecalhoOLE() {
  console.log("\n== contêiner OLE ==");
  var doc = bytesDe(AMOSTRA);
  check("ehDoc reconhece o cabecalho D0CF11E0", GabaDoc.ehDoc(doc));
  check("ehDoc nao aceita um .docx (que comeca com PK)",
    !GabaDoc.ehDoc(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])));
  var cfb = GabaDoc.lerCfb(doc);
  var nomes = cfb.entradas.map(function (e) { return e.nome; });
  check("achou a corrente WordDocument e a de tabela",
    nomes.indexOf("WordDocument") >= 0 &&
    (nomes.indexOf("1Table") >= 0 || nomes.indexOf("0Table") >= 0), nomes);
  var wd = cfb.entradas.filter(function (e) { return e.nome === "WordDocument"; })[0];
  check("a corrente do texto e maior que a de tabela (o documento esta inteiro)",
    cfb.corpo(wd).length === wd.size && wd.size > 1e6, { size: wd.size, lido: cfb.corpo(wd).length });
})();

(function pecas() {
  console.log("\n== tabela de pecas (PlcPcd) ==");
  /* "Açã" em CP1252 numa peca de 8 bits e "aé" em UTF-16 na outra */
  var corpo = new Uint8Array([0x41, 0xE7, 0xE3, 0x61, 0x00, 0xE9, 0x00]);
  var prc = [0x01, 0x02, 0x00, 0xF0, 0x11];
  var tab = new Uint8Array(prc.length + 5 + 3 * 4 + 2 * 8);
  var dv = new DataView(tab.buffer);
  tab.set(prc, 0);
  var ini = prc.length;
  tab[ini] = 0x02;
  dv.setUint32(ini + 1, 3 * 4 + 2 * 8, true);
  [0, 3, 5].forEach(function (cp, i) { dv.setUint32(ini + 5 + i * 4, cp, true); });
  dv.setUint32(ini + 5 + 3 * 4 + 2, 0x40000000, true);
  dv.setUint32(ini + 5 + 3 * 4 + 8 + 2, 3, true);
  var lido = GabaDoc.textoDasPecas(tab, corpo, 0, tab.length);
  check("pula o Prc e decodifica a peca de 8 bits pelo CP1252", lido.indexOf("Açã") === 0, JSON.stringify(lido));
  check("a peca de 16 bits sai em UTF-16", lido.indexOf("aé") === 3, JSON.stringify(lido));

  var semTabela = new Uint8Array([0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00]);
  var deuRuim = "";
  try {
    GabaDoc.textoDasPecas(semTabela, corpo, 0, semTabela.length);
  } catch (err) {
    deuRuim = err.message;
  }
  check("um .doc sem Pcdt explica que falta a tabela de peças",
    /tabela de peças/.test(deuRuim), deuRuim);
})();

(function faxina() {
  console.log("\n== codigos de controle do Word ==");
  var bruto = "Questão 01\x13 HYPERLINK \"http://x\" \x14veja aqui\x15 fim.\r" +
    "Celula A\x07Celula B\x07\r\x08\x01 rodape\r";
  var limpo = GabaDoc.limparTexto(bruto);
  var linhas = limpo.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
  check("o codigo de campo sai e o resultado dele fica",
    /veja aqui/.test(limpo) && !/HYPERLINK/.test(limpo) && !/http/.test(limpo), JSON.stringify(limpo));
  check("fim de paragrafo e de celula viram linha",
    linhas.join("|") === "Questão 01veja aqui fim.|Celula A|Celula B|rodape", JSON.stringify(limpo));
  check("os códigos de objeto e figura nao viram texto",
    limpo.indexOf("\u0008") < 0 && limpo.indexOf("\u0001") < 0 && /rodape/.test(limpo), JSON.stringify(limpo));
})();

(async function documento() {
  console.log("\n== " + AMOSTRA + " ==");
  var b = bytesDe(AMOSTRA);
  var t0 = Date.now();
  var lido = GabaDoc.parseDoc(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  check("o .doc le sem aviso e traz o texto inteiro",
    lido.avisos.length === 0 && lido.texto.length > 6e5, { avisos: lido.avisos, chars: lido.texto.length });
  check("os acentos saem direitos do CP1252",
    /AVALIAÇÃO DE FILOSOFIA — 2ª SÉRIE DO ENSINO MÉDIO/.test(lido.texto), lido.texto.slice(0, 90));
  console.log("  (" + lido.texto.length + " caracteres em " + (Date.now() - t0) + " ms)");

  var parsed = GabaDocx.parsePlain(lido.texto);
  var prova = GabaDocx.toProva(parsed, "PROVA_2SERIE");
  check("as dez questoes do banco saem do .doc", parsed.questoes.length === 10, parsed.questoes.length);
  check("cada questao traz as cinco alternativas",
    parsed.questoes.every(function (q) { return Object.keys(q.alternativas).length === 5; }),
    parsed.questoes.map(function (q) { return Object.keys(q.alternativas).length; }));
  check("o gabarito oficial do tipo 1 entrou nas questoes",
    parsed.questoes.map(function (q) { return q.gabarito; }).join("") === "ABECDEBBAB",
    parsed.questoes.map(function (q) { return q.gabarito; }));
  check("o comando da questao chega inteiro, sem partir no meio da linha",
    /consiste em:$/.test(parsed.questoes[0].comando), JSON.stringify(parsed.questoes[0].comando));
  check("materia e titulo vao para a prova",
    prova.disciplina === "Filosofia" && prova.titulo === "AVALIAÇÃO DE FILOSOFIA — 2ª SÉRIE DO ENSINO MÉDIO",
    { disciplina: prova.disciplina, titulo: prova.titulo });
  check("a lista nominal dos 45 alunos sai do .doc com o tipo de cada um",
    parsed.alunos.length === 45 && parsed.alunos.every(function (a) { return a.tipo && a.nome.length > 4; }),
    { alunos: parsed.alunos.length, semTipo: parsed.alunos.filter(function (a) { return !a.tipo; }).length });
  check("o gabarito individual de cada aluno do .doc veio completo",
    parsed.alunos.every(function (a) { return (a.gabarito || []).length === 10; }),
    parsed.alunos.slice(0, 2).map(function (a) { return a.nome + "=" + a.gabarito.join(""); }));
  check("os dez tipos de prova do documento aparecem na prova importada",
    parsed.tipos.length === 10 && prova.tipos.length === 10, { tipos: parsed.tipos.length });

  console.log("\n== arquivo que o app nao deve tentar ler ==");
  var naoDoc = GabaDoc.parseDoc(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]));
  check("um .docx disfarcado de .doc e barrado",
    naoDoc.texto === "" && /não parece um \.doc/.test(naoDoc.avisos.join(" ")), naoDoc.avisos);

  var pdf = GabaDoc.parseDoc(bytesDe("PROVA_2SERIE_45_ALUNOS_INDIVIDUALIZADAS-v2.pdf").subarray(0, 4096));
  check("um PDF entregue na porta do .doc nao engana o leitor",
    /não parece um \.doc/.test(pdf.avisos.join(" ")), pdf.avisos);

  if (falhas) {
    console.log("\n" + falhas + " check(s) falharam");
    process.exit(1);
  }
  console.log("\nimportacao de .doc: tudo certo");
})();
