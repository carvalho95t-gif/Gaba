/* Amostra .docx montada na hora, sem dependência externa e sem dado de aluno.
   As entradas vão no zip como "stored" (método 0), que o leitor do Gaba aceita,
   então o arquivo é válido no Word mas não precisa de deflate nem de JSZip.
   Uso: var docx = require("./docxAmostra.js"); docx.montarDocx(["PARTE I", "1. oi"]). */
"use strict";

var TABELA_CRC = (function () {
  var t = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* zip com entradas armazenadas sem compressão */
function zipStored(itens) {
  var enc = new TextEncoder();
  var peca = [], central = [], deslocamento = 0, totalCentral = 0;

  itens.forEach(function (it) {
    var nome = enc.encode(it.name);
    var dados = enc.encode(it.text);
    var crc = crc32(dados);

    var local = new Uint8Array(30 + nome.length);
    var lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint16(14, 0x21, true);
    lv.setUint32(16, crc, true);
    lv.setUint32(20, dados.length, true);
    lv.setUint32(24, dados.length, true);
    lv.setUint16(28, nome.length, true);
    lv.setUint16(30, 0, true);
    local.set(nome, 30);
    peca.push(local, dados);
    deslocamento += local.length + dados.length;

    var cen = new Uint8Array(46 + nome.length);
    var cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dados.length, true);
    cv.setUint32(24, dados.length, true);
    cv.setUint16(28, nome.length, true);
    cv.setUint32(42, deslocamento - local.length - dados.length, true);
    cen.set(nome, 46);
    central.push(cen);
    totalCentral += cen.length;
  });

  var fim = new Uint8Array(22);
  var fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, itens.length, true);
  fv.setUint16(10, itens.length, true);
  fv.setUint32(12, totalCentral, true);
  fv.setUint32(16, deslocamento, true);

  var todos = peca.concat(central, [fim]);
  var saida = new Uint8Array(todos.reduce(function (s, a) { return s + a.length; }, 0));
  var p = 0;
  todos.forEach(function (a) { saida.set(a, p); p += a.length; });
  return saida;
}

function escXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* um parágrafo vira uma string; um array vira vários runs, e \t dentro de um run vira <w:tab/> */
function paragrafoXml(p) {
  var runs = typeof p === "string" ? [p] : p;
  return "<w:p>" + runs.map(function (r) {
    return String(r).split("\t").map(function (pedaco) {
      return "<w:t xml:space=\"preserve\">" + escXml(pedaco) + "</w:t>";
    }).join("<w:tab/>");
  }).join("") + "</w:p>";
}

var CT = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
  "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
  "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
  "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
  "<Override PartName=\"/word/document.xml\" " +
  "ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>";

var RELS = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
  "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
  "<Relationship Id=\"rId1\" " +
  "Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" " +
  "Target=\"word/document.xml\"/></Relationships>";

/* devolve Uint8Array com o .docx pronto para virar File ou ArrayBuffer */
function montarDocx(paragrafos) {
  var doc = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
    "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>" +
    paragrafos.map(paragrafoXml).join("") + "</w:body></w:document>";
  return zipStored([
    { name: "[Content_Types].xml", text: CT },
    { name: "_rels/.rels", text: RELS },
    { name: "word/document.xml", text: doc }
  ]);
}

/* a prova de duas partes e uma área, com o cabeçalho dividido em runs e com tab,
   do jeito que um professor salva no Word antes de subir para o Gaba */
function amostraDuasPartes() {
  return montarDocx([
    "COLÉGIO ESTADUAL EXEMPLO",
    "AVALIAÇÃO BIMESTRAL",
    "",
    ["PARTE ", "I – LÍNGUA PORTUGUESA"],
    "Questão 1. Leia o texto para responder.",
    "A) primeira", "B) segunda", "C) terceira", "D) quarta",
    "Questão 2. Qual é a ideia central?",
    "A) uma", "B) duas", "C) três", "D) quatro",
    "",
    "PARTE II – MATEMÁTICA",
    "Questão 3. Quanto é 2 + 2?",
    "A) 3", "B) 4", "C) 5", "D) 6",
    "",
    "ÁREA:\tCIÊNCIAS DA NATUREZA",
    "Questão 4. O que a planta faz com a luz?",
    "A) nada", "B) respira", "C) fotossintetiza", "D) dorme",
    "",
    "GABARITO OFICIAL",
    "1 - B   2 - C   3 - B   4 - C"
  ]);
}

module.exports = {
  crc32: crc32,
  zipStored: zipStored,
  montarDocx: montarDocx,
  amostraDuasPartes: amostraDuasPartes
};
