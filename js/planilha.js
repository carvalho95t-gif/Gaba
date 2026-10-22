/* Lê planilha sem depender de biblioteca externa: o mesmo descompactador de .docx serve para
   .xlsx, e CSV/TSV colado do Excel e tratado aqui. Tudo no aparelho do professor. */
(function (global) {
  "use strict";

  function decodeEntities(s) {
    return String(s)
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&amp;/g, "&");
  }
  function semBom(t) {
    return t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t;
  }


  /* ------------------------------------------------------------- texto: csv/tsv */

  function detectarSeparador(linha) {
    var candidatos = ["\t", ";", ","];
    var melhor = ",";
    var maior = 0;
    candidatos.forEach(function (c) {
      var n = linha.split(c).length - 1;
      if (n > maior) { maior = n; melhor = c; }
    });
    return melhor;
  }

  function linhaParaCampos(linha, sep) {
    var campos = [];
    var atual = "";
    var dentro = false;
    for (var i = 0; i < linha.length; i++) {
      var c = linha.charAt(i);
      if (dentro) {
        if (c === '"') {
          if (linha.charAt(i + 1) === '"') { atual += '"'; i++; }
          else dentro = false;
        } else atual += c;
        continue;
      }
      if (c === '"') { dentro = true; continue; }
      if (c === sep) { campos.push(atual); atual = ""; continue; }
      atual += c;
    }
    campos.push(atual);
    return campos.map(function (t) { return t.replace(/^\s+|\s+$/g, ""); });
  }

  function separar(texto) {
    var bruto = semBom(String(texto || ""));
    if (!bruto.trim()) return [];
    var linhas = bruto.split(/\r\n|\r|\n/);
    var primeira = "";
    for (var i = 0; i < linhas.length && !primeira; i++) {
      if (linhas[i].trim()) primeira = linhas[i];
    }
    var sep = detectarSeparador(primeira);
    var out = [];
    for (var n = 0; n < linhas.length; n++) {
      var linha = linhas[n];
      if (!linha.trim()) continue;
      var campos = linhaParaCampos(linha, sep);
      while (campos.length && campos[campos.length - 1] === "") campos.pop();
      out.push(campos);
    }
    return out;
  }

  /* ------------------------------------------------------------------ xlsx */

  function colIdx(ref) {
    var letras = String(ref || "").replace(/\d+/g, "");
    var n = -1;
    if (!letras) return n;
    n = 0;
    for (var i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n - 1;
  }

  function textoDe(it) {
    var partes = [];
    var re = /<t[^>]*>([\s\S]*?)<\/t>/g;
    var m;
    while ((m = re.exec(it))) partes.push(decodeEntities(m[1]));
    return partes.join("");
  }

  function sharedStrings(xml) {
    var out = [];
    var re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
    var m;
    while ((m = re.exec(xml))) out.push(m[1] ? textoDe(m[1]) : "");
    return out;
  }

  function linhasDaPlanilha(xml, ss) {
    var rows = [];
    var rre = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    var r;
    while ((r = rre.exec(xml))) {
      var linha = [];
      var cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      var c;
      while ((c = cre.exec(r[1]))) {
        var attrs = c[1];
        var interior = c[2] || "";
        var ref = /r="([A-Z]+[0-9]+)"/.exec(attrs);
        var idx = ref ? colIdx(ref[1]) : linha.length;
        if (idx < 0) idx = linha.length;
        var tipo = (/t="([^"]+)"/.exec(attrs) || [])[1] || "n";
        var v = /<v[^>]*>([\s\S]*?)<\/v>/.exec(interior);
        var valor = "";
        if (tipo === "inlineStr") valor = textoDe(interior);
        else if (v && tipo === "s") valor = ss[Number(v[1])] || "";
        else if (v) valor = decodeEntities(v[1]);
        while (linha.length < idx) linha.push("");
        linha[idx] = valor;
      }
      while (linha.length && linha[linha.length - 1] === "") linha.pop();
      rows.push(linha);
    }
    return rows;
  }

  function mapaAlvos(relsXml) {
    var mapa = {};
    [].slice.call(String(relsXml).match(/<Relationship\b[^>]*>/g) || []).forEach(function (tag) {
      var idM = /\bId="([^"]+)"/.exec(tag);
      var tM = /\bTarget="([^"]+)"/.exec(tag);
      if (idM && tM) mapa[idM[1]] = tM[1];
    });
    return mapa;
  }

  async function leXlsx(arrayBuffer) {
    if (!global.GabaDocx || !GabaDocx.unzip) throw new Error("O leitor de .docx não carregou: recarregue a página.");
    var files = await GabaDocx.unzip(arrayBuffer);
    var dec = new TextDecoder();
    function texto(nome) {
      var b = files[nome];
      return b ? dec.decode(b) : "";
    }
    if (!files["xl/workbook.xml"]) {
      throw new Error("Isto não é um .xlsx do Excel (falta xl/workbook.xml). Salve como CSV e tente de novo.");
    }
    var wb = texto("xl/workbook.xml");
    var alvos = mapaAlvos(texto("xl/_rels/workbook.xml.rels"));
    var ss = sharedStrings(texto("xl/sharedStrings.xml"));
    var abas = [];
    var sre = /<sheet\b[^>]*>/g;
    var m;
    while ((m = sre.exec(wb))) {
      var tag = m[0];
      var nomeM = /name="([^"]*)"/.exec(tag);
      var ridM = /r:id="([^"]*)"/.exec(tag) || /id="([^"]*)"/i.exec(tag);
      var alvo = alvos[ridM ? ridM[1] : ""] || "";
      if (!alvo) continue;
      var caminho = alvo.replace(/^\//, "");
      if (caminho.indexOf("xl/") !== 0) caminho = "xl/" + caminho.replace(/^\.\//, "");
      if (!files[caminho]) continue;
      abas.push({ nome: nomeM ? decodeEntities(nomeM[1]) : "Aba " + (abas.length + 1),
        linhas: linhasDaPlanilha(texto(caminho), ss) });
    }
    if (!abas.length) throw new Error("O .xlsx não tem nenhuma aba legível.");
    return { abas: abas, shared: ss.length };
  }

  /* o Excel velho salva CSV em windows-1252: se nao for utf-8 valido, decodifica assim */
  function decodar(arrayBuffer) {
    var bruto = new Uint8Array(arrayBuffer);
    var t;
    try {
      t = new TextDecoder("utf-8", { fatal: true }).decode(bruto);
    } catch (err) {
      t = new TextDecoder("windows-1252").decode(bruto);
    }
    return semBom(t);
  }

  global.GabaPlanilha = {
    separar: separar,
    linhaParaCampos: linhaParaCampos,
    detectarSeparador: detectarSeparador,
    decodar: decodar,
    leXlsx: leXlsx,
    sharedStrings: sharedStrings,
    linhasDaPlanilha: linhasDaPlanilha,
    colIdx: colIdx
  };
})(typeof window !== "undefined" ? window : globalThis);
