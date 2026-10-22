/* Gaba — extrator de texto de PDF no navegador: sem OCR, sem servidor, sem dependencia.
   Lê dicionários PDF, infla os streams e decodifica o texto dos operadores Tj/TJ com o
   ToUnicode de cada fonte (é o mapa que o Word/LibreOffice gravam junto da fonte subsetada). */
(function (global) {
  "use strict";

  function latin1(bytes) {
    var s = "";
    var bloco = 0x8000;
    for (var i = 0; i < bytes.length; i += bloco) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + bloco));
    }
    return s;
  }

  function paraBytes(texto) {
    var out = new Uint8Array(texto.length);
    for (var i = 0; i < texto.length; i++) out[i] = texto.charCodeAt(i) & 0xff;
    return out;
  }

  async function descomprimir(bytes, formato) {
    var ds = new DecompressionStream(formato);
    var streama = new Blob([bytes]).stream().pipeThrough(ds);
    var buf = await new Response(streama).arrayBuffer();
    return new Uint8Array(buf);
  }

  /* os streams PDF vêm com zlib; alguns gravadores soltam o deflate sem o cabecalho */
  async function inflar(bytes) {
    try { return await descomprimir(bytes, "deflate"); }
    catch (e) {
      try { return await descomprimir(bytes, "deflate-raw"); }
      catch (e2) { return null; }
    }
  }

  function filtrDoStream(texto) {
    return /\/Filter\s*\[?\s*\/?(FlateDecode|Fl)/.test(texto);
  }

  /* ---------- dicionarios ---------- */

  function refsDe(texto, chave) {
    var re = new RegExp(chave + "\\s*(\\[[^\\]]*\\]|\\d+\\s+\\d+\\s+R)", "g");
    var m;
    var saida = [];
    while ((m = re.exec(texto))) {
      var bruto = m[1];
      if (bruto.charAt(0) === "[") {
        var re2 = /(\d+)\s+\d+\s+R/g;
        var m2;
        while ((m2 = re2.exec(bruto))) saida.push(Number(m2[1]));
      } else {
        saida.push(Number(/(\d+)/.exec(bruto)[1]));
      }
    }
    return saida;
  }

  function numeroDe(texto, chave) {
    var m = new RegExp(chave + "\\s+(\\d+)").exec(texto);
    return m ? Number(m[1]) : null;
  }

  /* ---------- mapa ToUnicode ---------- */

  function parseCMap(texto) {
    var mapa = {};
    var largura = 1;
    var espaco = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(texto);
    if (espaco) {
      var maior = /<([0-9A-Fa-f\s]+)>/.exec(espaco[1]);
      if (maior) largura = Math.max(1, Math.round(maior[1].replace(/\s+/g, "").length / 2));
    }
    var pares = /beginbfchar([\s\S]*?)endbfchar/g;
    var m;
    while ((m = pares.exec(texto))) {
      var re = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g;
      var p;
      while ((p = re.exec(m[1]))) mapa[parseInt(p[1].replace(/\s+/g, ""), 16)] = deHex(p[2]);
    }
    var faixas = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = faixas.exec(texto))) {
      var re2 = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*(<([0-9A-Fa-f\s]+)>|\[([^\]]*)\])/g;
      var f;
      while ((f = re2.exec(m[1]))) {
        var lo = parseInt(f[1].replace(/\s+/g, ""), 16);
        var hi = parseInt(f[2].replace(/\s+/g, ""), 16);
        for (var c = lo; c <= hi && c - lo < 65536; c++) {
          if (f[4] != null) {
            var alvo = parseInt(f[4].replace(/\s+/g, ""), 16);
            mapa[c] = String.fromCodePoint(alvo + (c - lo) <= 0x10ffff ? alvo + (c - lo) : 0);
          } else {
            var lista = (f[5] || "").match(/<([0-9A-Fa-f\s]+)>/g) || [];
            var item = lista[c - lo];
            mapa[c] = item ? deHex(item.slice(1, -1)) : "";
          }
        }
      }
    }
    return { mapa: mapa, largura: largura };
  }

  function deHex(hex) {
    var limpo = hex.replace(/\s+/g, "");
    var out = "";
    for (var i = 0; i + 4 <= limpo.length; i += 4) {
      out += String.fromCharCode(parseInt(limpo.substr(i, 4), 16));
    }
    return out;
  }

  /* ---------- operadores de texto ---------- */

  var ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };

  function decodificar(bytes, mapa, largura) {
    var out = "";
    if (!mapa || !Object.keys(mapa).length) {
      for (var k = 0; k < bytes.length; k++) out += String.fromCharCode(bytes[k]);
      return out;
    }
    for (var i = 0; i + largura <= bytes.length;) {
      var code = 0;
      for (var j = 0; j < largura; j++) code = code * 256 + bytes[i + j];
      var achado = mapa[code];
      out += achado == null ? "" : achado;
      i += largura;
    }
    return out;
  }

  /* varre o stream de conteudo e devolve o texto na ordem em que foi desenhado */
  function textoDoConteudo(conteudo, fontes) {
    var texto = "";
    var mole = false;
    var dura = false;
    var fonteAtual = { mapa: null, largura: 1 };
    var pendente = [];
    var i = 0;
    var n = conteudo.length;

    function stringLiteral() {
      var bytes = [];
      i++;
      var profundidade = 1;
      while (i < n) {
        var ch = conteudo.charCodeAt(i);
        if (ch === 92) {
          var esc = String.fromCharCode(conteudo.charCodeAt(i + 1));
          if (esc >= "0" && esc <= "7") {
            var oct = "";
            for (var k = 0; k < 3 && conteudo.charCodeAt(i + 1) >= 48 && conteudo.charCodeAt(i + 1) <= 55; k++) {
              oct += conteudo.charAt(++i);
            }
            bytes.push(parseInt(oct, 8));
            i++;
            continue;
          }
          var resolvido = ESCAPES[esc];
          bytes.push(resolvido == null ? conteudo.charCodeAt(i + 1) : resolvido.charCodeAt(0));
          i += 2;
          continue;
        }
        if (ch === 40) { profundidade++; i++; bytes.push(40); continue; }
        if (ch === 41) {
          profundidade--;
          if (!profundidade) { i++; break; }
          bytes.push(41); i++;
          continue;
        }
        bytes.push(ch);
        i++;
      }
      return new Uint8Array(bytes);
    }

    function hexLiteral() {
      var ini = ++i;
      while (i < n && conteudo.charCodeAt(i) !== 62) i++;
      var limpo = conteudo.slice(ini, i).replace(/[^0-9A-Fa-f]/g, "");
      if (limpo.length % 2) limpo += "0";
      i++;
      var bytes = new Uint8Array(limpo.length / 2);
      for (var k = 0; k < bytes.length; k++) bytes[k] = parseInt(limpo.substr(k * 2, 2), 16);
      return bytes;
    }

    function soltar() {
      if (!pendente.length) return;
      if (texto) texto += dura ? "\n\n" : mole ? "\n" : "";
      mole = dura = false;
      for (var k = 0; k < pendente.length; k++) texto += pendente[k];
      pendente = [];
    }
    function pularLinha() {
      soltar();
      mole = true;
    }
    /* cada BT..ET do Word/LibreOffice e um paragrafo: a quebra aqui e de bloco, nao de linha */
    function fecharBloco() {
      soltar();
      dura = true;
    }

    while (i < n) {
      var c = conteudo.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) { i++; continue; }
      if (c === 37) { while (i < n && conteudo.charCodeAt(i) !== 10) i++; continue; }
      if (c === 40) { pendente.push(decodificar(stringLiteral(), fonteAtual.mapa, fonteAtual.largura)); continue; }
      if (c === 60 && /^[0-9A-Fa-f\s]{2}/.test(conteudo.substr(i + 1, 2))) { pendente.push(decodificar(hexLiteral(), fonteAtual.mapa, fonteAtual.largura)); continue; }
      if (c === 91 || c === 93) { i++; continue; }
      var ch = conteudo.charAt(i);
      if (ch === "/") {
        var ini = ++i;
        while (i < n && /[^\s/<>()\[\]]/.test(conteudo.charAt(i))) i++;
        var nome = conteudo.slice(ini, i);
        var mTf = /^\s+[\d.]+\s+Tf\b/.exec(conteudo.substr(i, 12));
        if (mTf) {
          fonteAtual = fontes[nome] || { mapa: null, largura: 1 };
          i += mTf[0].length;
        }
        continue;
      }
      if (/[-+\d.]/.test(ch)) {
        i++;
        while (i < n && /[-+\d.eE]/.test(conteudo.charAt(i))) i++;
        /* num array TJ estes numeros so ajustam o espaco miudo entre as pedacas: nao viram texto */
        var apos = /^\s*(TJ|Tj|'|"|\*)/.exec(conteudo.substr(i, 8));
        if (apos && (apos[1] === "'" || apos[1] === '"')) {
          pularLinha();
          i += apos[0].length;
        }
        continue;
      }
      var ini3 = i;
      while (i < n && /[A-Za-z*'"_]/.test(conteudo.charAt(i))) i++;
      if (i === ini3) { i++; continue; }
      var op = conteudo.slice(ini3, i);
      if (op === "Tj" || op === "TJ") { soltar(); }
      else if (op === "Td" || op === "TD" || op === "T*" || op === "Tm") { pularLinha(); }
      else if (op === "BT" || op === "ET") { fecharBloco(); }
    }
    soltar();
    return texto;
  }

  /* cada linha do PDF vem num bloco de texto proprio: emendamos na anterior tudo que nao comeca
     marcador e nao fecha frase, igual ao paragrafo que o Word escreveu no arquivo original */
  var RE_INICIO = /^(QUEST[ÃA]O|Ques[ti]to|Q\d|[0-9]{1,3}\s*[).:\-]|\([A-Ea-e]\))/;
  var RE_FIM_DE_FRASE = /[.!?:;…)»"]$/;

  /* cada caderno nominal recomeca com a faixa de identificacao no meio do corpo: nunca é continuação */
  function ehFaixaDeCabecalho(linha) {
    var D = global.GabaDocx;
    return !!(D && D.ehCabecalhoDeCaderno && D.ehCabecalhoDeCaderno(linha));
  }

  /* "A)" e "QUESTÃO 01 —" podem cair sozinhos na linha: o texto deles é o bloco seguinte */
  var RE_MARCADOR_SOLTO = /^(([A-Ea-e][).:\-]|\([A-Ea-e]\))|((QUEST[ÃA]O|Ques[ti]to|QST)\s*[0-9]{1,3}\s*[—–\-:.]*))$/i;

  function refluir(paginas) {
    var lista = Array.isArray(paginas) ? paginas : [String(paginas || "")];
    var blocos = [];
    lista.forEach(function (pagina, indice) {
      String(pagina || "").split(/\n+/).map(function (l) { return l.replace(/\s+/g, " ").trim(); })
        .filter(Boolean).forEach(function (linha, k) {
          var anterior = blocos.length ? blocos[blocos.length - 1] : "";
          if (!anterior || (indice > 0 && k === 0) || ehFaixaDeCabecalho(linha)) { blocos.push(linha); return; }
          /* a faixa do caderno nao engole o texto da prova que vem depois dela */
          if (ehFaixaDeCabecalho(anterior)) { blocos.push(linha); return; }
          /* o marcador sozinho na linha espera o texto dele, mesmo que a linha dele pareca fim de frase */
          if (RE_MARCADOR_SOLTO.test(anterior) && !RE_MARCADOR_SOLTO.test(linha)) {
            blocos[blocos.length - 1] += " " + linha;
            return;
          }
          if (RE_INICIO.test(linha) || RE_FIM_DE_FRASE.test(anterior)) blocos.push(linha);
          else blocos[blocos.length - 1] += " " + linha;
        });
    });
    return blocos.join("\n");
  }

  /* ---------- documento ---------- */

  async function lerObjetos(bytes, texto) {
    var objs = {};
    var re = /(\d+)\s+\d+\s+obj\b/g;
    var m;
    while ((m = re.exec(texto))) {
      var numero = Number(m[1]);
      var depois = m.index + m[0].length;
      var fim = texto.indexOf("endobj", depois);
      var ateStream = texto.indexOf("stream", depois);
      var temStream = ateStream >= 0 && (fim < 0 || ateStream < fim);
      var dicionario = temStream ? texto.slice(depois, ateStream) : texto.slice(depois, fim < 0 ? texto.length : fim);
      var corpo = null;
      if (temStream) {
        var inicio = ateStream + 6;
        if (texto.charAt(inicio) === "\r") inicio++;
        if (texto.charAt(inicio) === "\n") inicio++;
        var termino = texto.indexOf("endstream", inicio);
        if (termino < 0) termino = inicio;
        /* a quebra de linha antes de endstream nao faz parte dos dados, mas o Decodificador
           teimoso do navegador reclama de qualquer sobra no fim do deflate */
        while (termino > inicio && (texto.charCodeAt(termino - 1) === 10 || texto.charCodeAt(termino - 1) === 13)) termino--;
        corpo = bytes.subarray(inicio, termino);
        re.lastIndex = termino;
      } else if (fim >= 0) {
        re.lastIndex = fim;
      }
      objs[numero] = { dict: dicionario, corpo: corpo, texto: null };
    }
    return objs;
  }

  async function corpoDe(obj, avisos) {
    if (!obj) return null;
    if (obj.texto != null) return obj.texto;
    if (!obj.corpo) { obj.texto = ""; return ""; }
    var bruto = obj.corpo;
    if (filtrDoStream(obj.dict)) {
      var inflado = await inflar(bruto);
      if (!inflado) {
        avisos.push("um stream do PDF nao descompactou; o texto dele pode faltar.");
        obj.texto = "";
        return "";
      }
      bruto = inflado;
    }
    obj.texto = latin1(bruto);
    return obj.texto;
  }

  async function bytesDo(obj) {
    if (!obj || !obj.corpo) return new Uint8Array(0);
    return filtrDoStream(obj.dict) ? (await inflar(obj.corpo)) || new Uint8Array(0) : obj.corpo;
  }

  async function mapaDaFonte(obj, objs, avisos) {
    var refs = refsDe(obj.dict, "/ToUnicode");
    if (!refs.length) return null;
    var texto = await corpoDe(objs[refs[0]], avisos);
    if (!texto || !/begin(cmap|bfchar|bfrange)/.test(texto)) return null;
    return parseCMap(texto);
  }

  /* nomes de fonte (/F1, /F2...) usados no stream, cada um com seu mapa Unicode */
  async function fontesDaPagina(resources, objs, avisos, cache) {
    var fontes = {};
    if (!resources) return fontes;
    var dict = resources.dict;
    var refMapa = refsDe(dict, "/Font")[0];
    var textoFontes = refMapa != null && objs[refMapa] ? objs[refMapa].dict :
      ((/\/Font\s*<<([\s\S]*?)>>/.exec(dict) || [])[1] || "");
    var re = /(\/[A-Za-z0-9._]+)\s+(\d+)\s+\d+\s+R/g;
    var m;
    while ((m = re.exec(textoFontes))) {
      var nome = m[1].slice(1);
      var objFonte = objs[Number(m[2])];
      if (!objFonte) continue;
      if (!cache[nome]) {
        var mapa = await mapaDaFonte(objFonte, objs, avisos);
        if (!mapa) {
          var descendentes = refsDe(objFonte.dict, "/DescendantFonts")[0];
          if (descendentes != null) mapa = await mapaDaFonte(objs[descendentes], objs, avisos);
        }
        var cid = /\/Type0|Identity/.test(objFonte.dict);
        cache[nome] = mapa || { mapa: null, largura: cid ? 2 : 1 };
        if (!mapa && /AAAAAA|BBAAAA|[A-E]{6}\+|\/FirstChar\s+0\b/.test(objFonte.dict)) {
          avisos.push("a fonte " + nome + " nao traz o mapa Unicode: o texto dela pode sair embaralhado.");
        }
      }
      fontes[nome] = cache[nome];
    }
    return fontes;
  }

  async function parsePdf(bytes) {
    var avisos = [];
    var buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
    var texto = latin1(buf);
    if (texto.slice(0, 1024).indexOf("%PDF-") < 0) {
      return { texto: "", paginas: 0, avisos: ["isto nao parece um PDF (falta o cabecalho %PDF-)."] };
    }
    if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(texto.slice(-4096))) {
      return { texto: "", paginas: 0, avisos: ["este PDF esta protegido com senha: abra no leitor, remova a protecao e importe de novo."] };
    }
    var objs = await lerObjetos(buf, texto);
    var cacheMapa = {};
    var paginas = [];
    var semMapa = 0;
    /* a mesma folha pode ser lida mais de uma vez; os nomes de fonte sao por pagina */
    var promessas = [];
    var vistos = {};
    var ordens = [];
    var rePagina = /(\d+)\s+\d+\s+obj\b/g;
    var mp;
    while ((mp = rePagina.exec(texto))) {
      var candidato = Number(mp[1]);
      var dicionario = objs[candidato] && objs[candidato].dict;
      if (dicionario && /\/Type\s*\/Page(?![A-Za-z])/.test(dicionario)) ordens.push(candidato);
    }
    ordens.forEach(function (numero) {
      if (vistos[numero]) return;
      vistos[numero] = true;
      var obj = objs[numero];
      var resourcesRef = refsDe(obj.dict, "/Resources")[0];
      var resources = resourcesRef != null ? objs[resourcesRef] : { dict: obj.dict };
      promessas.push((async function () {
        var fontes = await fontesDaPagina(resources, objs, avisos, cacheMapa);
        var refs = refsDe(obj.dict, "/Contents");
        var partes = [];
        for (var k = 0; k < refs.length; k++) partes.push(await bytesDo(objs[refs[k]]));
        var total = partes.reduce(function (s, p) { return s + p.length; }, 0);
        var conteudo = new Uint8Array(total);
        var pos = 0;
        partes.forEach(function (p) { conteudo.set(p, pos); pos += p.length; });
        if (!conteudo.length) return "";
        var corpo = latin1(conteudo);
        var t = textoDoConteudo(corpo, fontes);
        if (!Object.keys(fontes).length && /Tf/.test(corpo)) semMapa++;
        return t;
      })());
    });
    var textos = await Promise.all(promessas);
    textos.forEach(function (t) {
      if (!t) return;
      paginas.push(t);
    });
    if (!paginas.length) {
      return {
        texto: "", paginas: 0, avisos: avisos.concat([ordens.length
          ? "as " + ordens.length + " paginas deste PDF sao imagem: nao ha texto para ler. " +
            "Tire o OCR no leitor de PDF ou transcreva a prova no Word antes de importar."
          : "nao achei nenhuma pagina neste PDF."])
      };
    }
    var limpo = refluir(paginas);
    if (semMapa) avisos.push(semMapa + " pagina(s) usam fontes sem mapa Unicode: o texto pode sair com letras trocadas.");
    if (limpo.length < 80) {
      avisos.push("quase nao havia texto neste PDF (" + limpo.length + " caracteres). Se for uma prova digitalizada em imagem, " +
        "e preciso transcrever no Word ou colar o texto na aba Provas.");
    }
    return { texto: limpo, paginas: paginas.length, avisos: avisos.filter(unico) };
  }

  function unico(v, i, arr) { return arr.indexOf(v) === i; }

  global.GabaPdf = {
    parsePdf: parsePdf,
    parseCMap: parseCMap,
    textoDoConteudo: textoDoConteudo,
    refluir: refluir,
    ehPdf: function (bytes) {
      var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
