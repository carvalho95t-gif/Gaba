/* Gaba — leitor de .doc (Word 97-2003) no navegador: o arquivo e um contêiner OLE (CFB)
   que guarda a corrente WordDocument; o FIB diz onde está a tabela de peças (PlcPcd) e a
   tabela de peças mapeia cada pedaço do texto. Nada de biblioteca, nada de servidor. */
(function (global) {
  "use strict";

  var MAGIC = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  var NULO = 0xFFFFFFFF;
  var FIM_DA_CADEIA = 0xFFFFFFFE;
  var ACIMA_DOS_SETORES = 0xFFFFFFFA;   // 0xFFFFFFFA..0xFFFFFFFF não são números de setor
  var TAM_ENTRADA = 128;

  /* 0x80..0x9F do CP1252: é onde o Word em 8 bits guarda as aspas, o tração e o euro */
  var CP1252_ALTO = {
    0x80: "\u20AC", 0x82: "\u201A", 0x83: "\u0192", 0x84: "\u201E", 0x85: "\u2026",
    0x86: "\u2020", 0x87: "\u2021", 0x88: "\u02C6", 0x89: "\u2030", 0x8A: "\u0160",
    0x8B: "\u2039", 0x8C: "\u0152", 0x8E: "\u017D", 0x91: "\u2018", 0x92: "\u2019",
    0x93: "\u201C", 0x94: "\u201D", 0x95: "\u2022", 0x96: "\u2013", 0x97: "\u2014",
    0x98: "\u02DC", 0x99: "\u2122", 0x9A: "\u0161", 0x9B: "\u203A", 0x9C: "\u0153",
    0x9E: "\u017E", 0x9F: "\u0178"
  };

  function paraBytes(entrada) {
    if (entrada instanceof Uint8Array) return entrada;
    if (entrada && entrada.buffer) {
      return new Uint8Array(entrada.buffer, entrada.byteOffset || 0, entrada.byteLength || 0);
    }
    return new Uint8Array(entrada || []);
  }

  function ehDoc(bytes) {
    var b = paraBytes(bytes);
    for (var i = 0; i < MAGIC.length; i++) if (b[i] !== MAGIC[i]) return false;
    return true;
  }

  /* ------------------------------ contêiner OLE (CFB) ------------------------------ */

  function concatenar(partes, limite) {
    var total = partes.reduce(function (t, p) { return t + p.length; }, 0);
    var saida = new Uint8Array(Math.min(total, limite));
    var pos = 0;
    for (var i = 0; i < partes.length && pos < saida.length; i++) {
      var pedaco = partes[i].subarray(0, Math.min(partes[i].length, saida.length - pos));
      saida.set(pedaco, pos);
      pos += pedaco.length;
    }
    return saida;
  }

  function lerCfb(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var tamSetor = 1 << dv.getUint16(0x1E, true);
    var tamMini = 1 << dv.getUint16(0x20, true);
    var qtdFat = dv.getUint32(0x2C, true);
    var iniDir = dv.getUint32(0x30, true);
    var corteMini = dv.getUint32(0x38, true) || 4096;
    var iniMiniFat = dv.getUint32(0x3C, true);
    var iniDifat = dv.getUint32(0x44, true);
    var qtdDifat = dv.getUint32(0x48, true);
    if (tamSetor !== 512 && tamSetor !== 4096) {
      throw new Error("os setores deste .doc não têm 512 nem 4096 bytes: arquivo fora do padrão.");
    }
    var porSetor = tamSetor / 4;

    function lerTabela(iniSetor, qtdPrevista) {
      var setores = [];
      for (var s = iniSetor, vistos = {}; s < ACIMA_DOS_SETORES && !vistos[s]; s = fatDaCadeia(s)) {
        vistos[s] = true;
        setores.push(s);
        if (setores.length > qtdPrevista + 1) break;
      }
      var tabela = new Uint32Array(Math.max(setores.length * porSetor, porSetor));
      tabela.fill(NULO);
      setores.forEach(function (setor, idx) {
        var base = (setor + 1) * tamSetor;
        for (var k = 0; k < porSetor; k++) {
          if (base + k * 4 + 4 <= bytes.byteLength) tabela[idx * porSetor + k] = dv.getUint32(base + k * 4, true);
        }
      });
      return tabela;
    }

    var difat = [];
    for (var i = 0; i < 109; i++) {
      var v = dv.getUint32(0x4C + i * 4, true);
      if (v >= ACIMA_DOS_SETORES) break;
      difat.push(v);
    }
    var s = iniDifat;
    var cadeiaDifat = {};
    for (var d = 0; d < qtdDifat && s < ACIMA_DOS_SETORES && !cadeiaDifat[s]; d++) {
      cadeiaDifat[s] = true;
      var base = (s + 1) * tamSetor;
      for (var k = 0; k < porSetor - 1; k++) {
        var e = dv.getUint32(base + k * 4, true);
        if (e < ACIMA_DOS_SETORES) difat.push(e);
      }
      s = dv.getUint32(base + (porSetor - 1) * 4, true);
    }
    var fat = new Uint32Array(Math.max(difat.length, 1) * porSetor);
    fat.fill(NULO);
    difat.forEach(function (setorFat, idx) {
      var base = (setorFat + 1) * tamSetor;
      for (var k = 0; k < porSetor; k++) {
        var n = idx * porSetor + k;
        if (n < fat.length && base + k * 4 + 4 <= bytes.byteLength) fat[n] = dv.getUint32(base + k * 4, true);
      }
    });

    function fatDaCadeia(setor) {
      return setor < fat.length ? fat[setor] : NULO;
    }

    function cadeia(ini, proximo) {
      var out = [], vistos = {}, atual = ini;
      while (atual < ACIMA_DOS_SETORES && !vistos[atual]) {
        vistos[atual] = true;
        out.push(atual);
        atual = proximo(atual);
        if (out.length > 1e6) break;
      }
      return out;
    }

    function corpoDeSetores(ini, tamanho) {
      var partes = cadeia(ini, fatDaCadeia).map(function (setor) {
        var base = (setor + 1) * tamSetor;
        return bytes.subarray(base, Math.min(base + tamSetor, bytes.byteLength));
      });
      return concatenar(partes, tamanho);
    }

    var entradas = [];
    cadeia(iniDir, fatDaCadeia).forEach(function (setor) {
      var base = (setor + 1) * tamSetor;
      for (var e = 0; e < tamSetor / TAM_ENTRADA; e++) {
        var p = base + e * TAM_ENTRADA;
        if (p + TAM_ENTRADA > bytes.byteLength) break;
        var tipo = bytes[p + 0x42];
        if (tipo !== 2 && tipo !== 5) continue;
        var nchars = dv.getUint16(p + 0x40, true) / 2;
        var nome = "";
        for (var c = 0; c < nchars && c < 32; c++) {
          var c16 = dv.getUint16(p + c * 2, true);
          if (!c16) break;
          nome += String.fromCharCode(c16);
        }
        var tam = dv.getUint32(p + 0x78, true);
        if (!nome || tam > bytes.byteLength) continue;
        entradas.push({ nome: nome, tipo: tipo, ini: dv.getUint32(p + 0x74, true), size: tam });
      }
    });

    var raiz = entradas.filter(function (e) { return e.tipo === 5; })[0];
    var ministream = new Uint8Array(0);
    if (raiz) {
      var partesRaiz = cadeia(raiz.ini, fatDaCadeia).map(function (setor) {
        var base = (setor + 1) * tamSetor;
        return bytes.subarray(base, Math.min(base + tamSetor, bytes.byteLength));
      });
      /* o tamanho da raiz costuma vir zero: o que existe são os setores da cadeia */
      ministream = concatenar(partesRaiz, raiz.size || partesRaiz.length * tamSetor);
    }
    var miniFat = lerTabela(iniMiniFat, qtdFat);

    function corpo(entrada) {
      if (!entrada || !entrada.size) return new Uint8Array(0);
      if (entrada.size >= corteMini) return corpoDeSetores(entrada.ini, entrada.size);
      var partes = cadeia(entrada.ini, function (n) {
        return n * tamMini < ministream.length ? miniFatDaCadeia(n) : NULO;
      }).map(function (n) {
        return ministream.subarray(n * tamMini, Math.min((n + 1) * tamMini, ministream.length));
      });
      return concatenar(partes, entrada.size);
    }

    function miniFatDaCadeia(indice) {
      return indice < miniFat.length ? miniFat[indice] : NULO;
    }

    return { entradas: entradas, corpo: corpo, corteMini: corteMini };
  }

  /* -------------------------------- FIB e as peças -------------------------------- */

  function charDeByte(b) {
    if (b < 0x80) return String.fromCharCode(b);
    if (b < 0xA0) return CP1252_ALTO[b] || " ";
    return String.fromCharCode(b);
  }

  /* a tabela (CLX) mora na 0Table/1Table e diz onde cada peça de texto está; o texto em si
     está na corrente WordDocument: 8 bits CP1252 em fc/2 quando comprimida, 16 bits UTF-16 em fc */
  function textoDasPecas(tabulacao, corpoDoc, fcClx, lcbClx) {
    var dv = new DataView(tabulacao.buffer, tabulacao.byteOffset, tabulacao.byteLength);
    var p = fcClx;
    var fim = fcClx + lcbClx;
    var inicio = -1, lcb = 0;
    while (p < fim) {
      var tipo = tabulacao[p];
      if (tipo === 1) {
        var cb = dv.getUint16(p + 1, true);
        if (!cb) break;
        p += 3 + cb;
      } else if (tipo === 2) {
        lcb = dv.getUint32(p + 1, true);
        inicio = p + 5;
        break;
      } else break;
    }
    if (inicio < 0 || !lcb) throw new Error("este .doc não traz a tabela de peças do texto.");
    var qtd = Math.floor((lcb - 4) / 12);
    var cpFinais = inicio + (qtd + 1) * 4;
    var dvDoc = new DataView(corpoDoc.buffer, corpoDoc.byteOffset, corpoDoc.byteLength);
    var saida = "";
    for (var i = 0; i < qtd; i++) {
      var cpIni = dv.getUint32(inicio + i * 4, true);
      var cpFim = dv.getUint32(inicio + (i + 1) * 4, true);
      var fc = dv.getUint32(cpFinais + i * 8 + 2, true);
      var comprimida = (fc & 0x40000000) !== 0;
      var endereco = comprimida ? ((fc & 0x3FFFFFFF) >> 1) : (fc & 0x3FFFFFFF);
      var comprimento = Math.max(0, cpFim - cpIni);
      if (comprimida) {
        var limite = Math.min(comprimento, corpoDoc.length - endereco);
        for (var c = 0; c < limite; c++) saida += charDeByte(corpoDoc[endereco + c]);
      } else {
        var limite16 = Math.min(comprimento, Math.floor((corpoDoc.length - endereco) / 2));
        for (var u = 0; u < limite16; u++) saida += String.fromCharCode(dvDoc.getUint16(endereco + u * 2, true));
      }
    }
    return saida;
  }

  /* fim de parágrafo é \r; \x07 é fim de célula de tabela; os códigos de campo não são texto */
  function limparTexto(texto) {
    var saida = "";
    var instrucao = false;
    for (var i = 0; i < texto.length; i++) {
      var cc = texto.charCodeAt(i);
      if (cc === 0x13) { instrucao = true; continue; }
      if (cc === 0x14 || cc === 0x15) { instrucao = false; continue; }
      if (instrucao) continue;
      if (cc === 0x07 || cc === 0x0B || cc === 0x0C) { saida += "\n"; continue; }
      if (cc === 0x0D) { saida += "\n"; continue; }
      if (cc === 0x09) { saida += " "; continue; }
      if (cc === 0xA0) { saida += " "; continue; }
      if (cc < 0x20) continue;
      saida += texto.charAt(i);
    }
    return saida.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  /* o nome da corrente pode vir com o prefixo reservado \u0001 ou limpo, conforme o gravador */
  function buscaEntrada(cfb, nome) {
    var alvo = nome.replace(/^\u0001/, "");
    return cfb.entradas.filter(function (e) { return e.nome.replace(/^\u0001/, "") === alvo; })[0] || null;
  }

  function parseDoc(arrayBuffer) {
    var avisos = [];
    var bytes = paraBytes(arrayBuffer);
    if (!ehDoc(bytes)) return { texto: "", avisos: ["isto não parece um .doc de Word 97."] };
    var cfb = lerCfb(bytes);
    var doc = buscaEntrada(cfb, "WordDocument");
    if (!doc) {
      return { texto: "", avisos: ["este arquivo OLE não tem a corrente WordDocument: não é um documento do Word."] };
    }
    var corpo = cfb.corpo(doc);
    if (corpo.length < 0x200) return { texto: "", avisos: ["a corrente WordDocument deste .doc está truncada."] };
    var dv = new DataView(corpo.buffer, corpo.byteOffset, corpo.byteLength);
    var sinalizadores = dv.getUint16(0x0A, true);
    if (dv.getUint16(0x00, true) !== 0xA5EC) {
      return { texto: "", avisos: ["este .doc não tem o cabeçalho de documento do Word."] };
    }
    if (sinalizadores & 0x0100) {
      return { texto: "", avisos: ["este .doc está protegido com senha: abra no Word, tire a proteção e importe de novo."] };
    }
    if (dv.getUint16(0x02, true) < 0x00C1) {
      return { texto: "", avisos: ["este .doc veio de um Word anterior ao 97: salve como .docx antes de importar."] };
    }
    var nomeTabela = (sinalizadores & 0x0200) ? "1Table" : "0Table";
    var entradaTabela = buscaEntrada(cfb, nomeTabela) ||
      buscaEntrada(cfb, "1Table") || buscaEntrada(cfb, "0Table");
    if (!entradaTabela) {
      return { texto: "", avisos: ["faltou a corrente de tabela (0Table/1Table) neste .doc: o texto não está mapeado."] };
    }
    var tabulacao = cfb.corpo(entradaTabela);
    var fcClx = dv.getUint32(0x1A2, true);
    var lcbClx = dv.getUint32(0x1A6, true);
    if (!lcbClx || fcClx + lcbClx > tabulacao.length) {
      return { texto: "", avisos: ["a tabela de peças deste .doc aponta para fora do arquivo."] };
    }
    var ccpText = dv.getUint32(0x4C, true) || 0;
    var bruto = textoDasPecas(tabulacao, corpo, fcClx, lcbClx);
    var texto = limparTexto(ccpText ? bruto.slice(0, ccpText) : bruto);
    if (ccpText && bruto.length < ccpText) {
      avisos.push("o texto do .doc veio curto (" + bruto.length + " de " + ccpText +
        " caracteres): o arquivo pode estar pela metade.");
    }
    if (texto.length < 80) {
      avisos.push("quase não havia texto neste .doc; confira se ele não é só imagem escaneada.");
    }
    return { texto: texto, avisos: avisos };
  }

  global.GabaDoc = {
    parseDoc: parseDoc,
    ehDoc: ehDoc,
    lerCfb: lerCfb,
    textoDasPecas: textoDasPecas,
    limparTexto: limparTexto
  };
})(typeof window !== "undefined" ? window : globalThis);
