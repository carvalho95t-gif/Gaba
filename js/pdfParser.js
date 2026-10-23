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

  /* nem o /Length nem a quebra antes de endstream sao confiaveis: o Word declara um byte a
     menos e o Chrome, quando o deflate fecha com um \n, ve esse dado como sobra da quebra.
     em vez de adivinhar o corte, prova os candidatos e fica com o que descompacta. */
  function cortesDoStream(obj) {
    var corpo = obj.corpo;
    var saida = [];
    if (!corpo || !corpo.length) return saida;
    if (obj.comprimento > 0 && obj.comprimento < corpo.length) saida.push(corpo.subarray(0, obj.comprimento));
    for (var k = 1; k <= 2; k++) {
      var cod = corpo[corpo.length - k];
      if (cod === 10 || cod === 13) saida.push(corpo.subarray(0, corpo.length - k));
      else break;
    }
    saida.push(corpo);
    return saida;
  }

  async function inflarDoStream(obj, avisos, onde) {
    var cortes = cortesDoStream(obj);
    if (!cortes.length) return obj.corpo || new Uint8Array(0);
    for (var i = 0; i < cortes.length; i++) {
      var saida = await inflar(cortes[i]);
      if (saida) return saida;
    }
    if (avisos) avisos.push((onde || "um stream do PDF") + " nao descompactou, entao o texto dele nao foi lido.");
    return null;
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

  /* ---------- posição no papel ---------- */

  var IDENTIDADE = [1, 0, 0, 1, 0, 0];

  /* o PDF multiplica o vetor-linha pelo lado direito: ponto * m */
  function ponto(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  /* aplicar m e depois n */
  function mul(m, n) {
    return [
      m[0] * n[0] + m[1] * n[2],
      m[0] * n[1] + m[1] * n[3],
      m[2] * n[0] + m[3] * n[2],
      m[2] * n[1] + m[3] * n[3],
      m[4] * n[0] + m[5] * n[2] + n[4],
      m[4] * n[1] + m[5] * n[3] + n[5]
    ];
  }

  function escala(m) {
    return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  }

  /* conteudo do [ ... ] que vem depois de chave, com os aninhados ja desfeitos */
  function brutoDoArray(texto, chave) {
    var m = new RegExp(chave + "\\s*\\[").exec(texto);
    if (!m) return null;
    var abri = m.index + m[0].length - 1;
    var nivel = 0;
    for (var i = abri; i < texto.length; i++) {
      var c = texto.charAt(i);
      if (c === "[") nivel++;
      else if (c === "]") {
        nivel--;
        if (!nivel) return texto.slice(abri + 1, i);
      }
    }
    return null;
  }

  /* /W do CIDFont aceita as duas formas: cid [w1 w2 ...] e cidInicial cidFinal w */
  function parseW(bruto) {
    var w = { pontos: {}, faixas: [], padrao: 1000 };
    var re = /(-?\d+(?:\.\d+)?)|\[([^\]]*)\]/g;
    var fichas = [];
    var m;
    while ((m = re.exec(bruto))) {
      if (m[0].charAt(0) === "[") fichas.push({ arr: m[2] });
      else fichas.push({ num: Number(m[1]) });
    }
    for (var i = 0; i < fichas.length;) {
      var atual = fichas[i];
      var prox = fichas[i + 1];
      if (atual.num == null || !prox) { i++; continue; }
      if (prox.arr != null) {
        var lista = prox.arr.match(/-?\d+(?:\.\d+)?/g) || [];
        for (var k = 0; k < lista.length; k++) w.pontos[atual.num + k] = Number(lista[k]);
        i += 2;
        continue;
      }
      var fim = fichas[i + 2];
      if (prox.num != null && fim && fim.num != null) {
        if (prox.num - atual.num > 512) w.faixas.push([atual.num, prox.num, fim.num]);
        else for (var c = atual.num; c <= prox.num; c++) w.pontos[c] = fim.num;
        i += 3;
        continue;
      }
      i++;
    }
    return w;
  }

  /* avanco de cada glifo em 1/1000 do corpo: sem isso nao da para saber se o buraco entre
     duas pedacas e espaco ou só o kerning de dentro da palavra */
  function largurasDa(objFonte, objs) {
    var descendente = refsDe(objFonte.dict, "/DescendantFonts")[0];
    var cid = descendente != null ? objs[descendente] : null;
    if (cid) {
      var bruto = brutoDoArray(cid.dict, "/W");
      if (bruto != null) {
        var w = parseW(bruto);
        var dw = numeroDe(cid.dict, "/DW");
        if (dw != null) w.padrao = dw;
        return w;
      }
    }
    var simples = brutoDoArray(objFonte.dict, "/Widths");
    if (simples == null) return null;
    var ini = numeroDe(objFonte.dict, "/FirstChar") || 0;
    var lista = simples.match(/-?\d+(?:\.\d+)?/g) || [];
    var saida = { pontos: {}, faixas: [], padrao: 500 };
    for (var k = 0; k < lista.length; k++) saida.pontos[ini + k] = Number(lista[k]);
    return saida;
  }

  function larguraDe(fonte, code) {
    var w = fonte.w;
    if (!w) return 500;
    var valor = w.pontos[code];
    if (valor != null) return valor;
    for (var k = 0; k < w.faixas.length; k++) {
      var f = w.faixas[k];
      if (code >= f[0] && code <= f[1]) return f[2];
    }
    return w.padrao;
  }

  /* ao contrario do decodificar, devolve tambem o quanto a caneta andou */
  function itensDe(bytes, fonte) {
    var texto = "";
    var avanco = 0;
    var mapa = fonte.mapa;
    var largura = fonte.largura || 1;
    if (!mapa || !Object.keys(mapa).length) {
      for (var k = 0; k < bytes.length; k++) {
        texto += String.fromCharCode(bytes[k]);
        avanco += larguraDe(fonte, bytes[k]);
      }
      return { texto: texto, avanco: avanco };
    }
    for (var i = 0; i + largura <= bytes.length;) {
      var code = 0;
      for (var j = 0; j < largura; j++) code = code * 256 + bytes[i + j];
      var achado = mapa[code];
      if (achado != null) texto += achado;
      avanco += larguraDe(fonte, code);
      i += largura;
    }
    return { texto: texto, avanco: avanco };
  }

  /* varre o stream de conteudo e devolve o texto na ordem em que foi desenhado.
     com `cam` (runs + matriz de quem desenha) marca também onde cada pedaço caiu no papel. */
  /* varre o stream de conteudo e devolve o texto na ordem em que foi desenhado */
  function textoDoConteudo(conteudo, fontes, cam) {
    var texto = "";
    var mole = false;
    var dura = false;
    var fonteAtual = { mapa: null, largura: 1 };
    var pendente = [];
    var i = 0;
    var n = conteudo.length;
    /* estado grafico so interessa no modo por posicao: no legado nada disso muda uma letra */
    var ctm = (cam && cam.matriz) || IDENTIDADE;
    var pilhaCtm = [];
    var tm = IDENTIDADE;
    var tlm = IDENTIDADE;
    var tl = 0;
    var tamanho = 0;
    var numeros = [];
    var ultimoNome = "";

    function empurrar(mx) {
      tm = mul([1, 0, 0, 1, mx, 0], tm);
    }

    function registrar(bytes) {
      if (!cam) return;
      var m = mul(tm, ctm);
      var ini = ponto(m, 0, 0);
      var itens = itensDe(bytes, fonteAtual);
      var passo = itens.avanco * tamanho / 1000;
      if (itens.texto) {
        cam.runs.push({
          x: ini[0], y: ini[1], fim: ponto(m, passo, 0)[0],
          tamanho: tamanho * escala(m), texto: itens.texto
        });
      }
      empurrar(passo);
    }

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

    /* estado grafico e de texto: so interessa ao modo por posicao — o legado nao olha para aqui */
    function estado(op) {
      if (op === "q") { pilhaCtm.push(ctm); return; }
      if (op === "Q") { if (pilhaCtm.length) ctm = pilhaCtm.pop(); return; }
      if (op === "cm") { if (numeros.length === 6) ctm = mul(numeros.slice(), ctm); numeros = []; return; }
      if (op === "BT") { tm = IDENTIDADE.slice(); tlm = tm.slice(); return; }
      if (op === "Tm") {
        if (numeros.length === 6) tm = numeros.slice();
        tlm = tm.slice();
        numeros = [];
        return;
      }
      if (op === "Td" || op === "TD") {
        var ty = numeros.length ? numeros[numeros.length - 1] : 0;
        var tx = numeros.length > 1 ? numeros[numeros.length - 2] : 0;
        if (op === "TD") tl = -ty;
        tlm = mul([1, 0, 0, 1, tx, ty], tlm);
        tm = tlm.slice();
        numeros = [];
        return;
      }
      if (op === "T*") { tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm.slice(); return; }
      if (op === "TL") { if (numeros.length) tl = numeros[numeros.length - 1]; numeros = []; return; }
      /* o form XObject herda a matriz do lugar onde foi desenhado: sem isso o texto dele sai
         com a coordenada do espaco do form, nao a da folha */
      if (op === "Do" && cam.dos) { cam.dos.push({ nome: ultimoNome, matriz: ctm }); return; }
      numeros = [];
    }

    while (i < n) {
      var c = conteudo.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) { i++; continue; }
      if (c === 37) { while (i < n && conteudo.charCodeAt(i) !== 10) i++; continue; }
      if (c === 40) {
        var literal = stringLiteral();
        registrar(literal);
        pendente.push(decodificar(literal, fonteAtual.mapa, fonteAtual.largura));
        continue;
      }
      if (c === 60 && /^[0-9A-Fa-f\s]{2}/.test(conteudo.substr(i + 1, 2))) {
        var hex = hexLiteral();
        registrar(hex);
        pendente.push(decodificar(hex, fonteAtual.mapa, fonteAtual.largura));
        continue;
      }
      if (c === 91 || c === 93) { i++; continue; }
      var ch = conteudo.charAt(i);
      if (ch === "/") {
        var ini = ++i;
        while (i < n && /[^\s/<>()\[\]]/.test(conteudo.charAt(i))) i++;
        var nome = conteudo.slice(ini, i);
        ultimoNome = nome;
        /* o Chrome escreve o tamanho com 7 decimais ("10.3999996 Tf"): janela curta nao alcanca
           o Tf e a pagina inteira sai decodificada como se a fonte fosse de 1 byte */
        var mTf = /^\s+([\d.]+)\s+Tf\b/.exec(conteudo.substr(i, 40));
        if (mTf) {
          fonteAtual = fontes[nome] || { mapa: null, largura: 1 };
          tamanho = Number(mTf[1]) || 0;
          if (cam) numeros = [];
          i += mTf[0].length;
        }
        continue;
      }
      if (/[-+\d.]/.test(ch)) {
        var iniNum = i;
        i++;
        while (i < n && /[-+\d.eE]/.test(conteudo.charAt(i))) i++;
        if (cam) {
          var valor = Number(conteudo.slice(iniNum, i));
          if (isFinite(valor)) {
            /* num array TJ o numero logo antes de uma string e kerning: anda a caneta e nao
               deixa de ser operando do proximo operador */
            if (/^\s*[(<]/.test(conteudo.substr(i, 4))) empurrar(-valor * tamanho / 1000);
            else {
              numeros.push(valor);
              if (numeros.length > 8) numeros.shift();
            }
          }
        }
        /* num array TJ estes numeros so ajustam o espaco miudo entre as pedacas: nao viram texto */
        var apos = /^\s*(TJ|Tj|'|"|\*)/.exec(conteudo.substr(i, 8));
        if (apos && (apos[1] === "'" || apos[1] === '"')) {
          if (cam) {
            tlm = mul([1, 0, 0, 1, 0, -tl], tlm);
            tm = tlm.slice();
          }
          pularLinha();
          i += apos[0].length;
        }
        continue;
      }
      var ini3 = i;
      while (i < n && /[A-Za-z*'"_]/.test(conteudo.charAt(i))) i++;
      if (i === ini3) { i++; continue; }
      var op = conteudo.slice(ini3, i);
      if (cam) estado(op);
      if (op === "Tj" || op === "TJ") { soltar(); }
      else if (op === "Td" || op === "TD" || op === "T*" || op === "Tm") { pularLinha(); }
      else if (op === "BT" || op === "ET") { fecharBloco(); }
    }
    soltar();
    return texto;
  }

  /* quem desenha letra por letra (camada de texto de digitalizado, export de Indesign) põe cada
     glifo no seu próprio BT..ET: aqui as peças voltam a virar linha pela coordenada em que
     caíram no papel, e não pela ordem em que o gravador as escreveu.
     não sabe ler coluna: célula que quebra sozinha ainda se embaralha com a vizinha */
  function linhasDasRuns(runs) {
    var grupos = [];
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      var tam = r.tamanho || 1;
      var achada = null;
      /* duas pedacas estao na mesma linha se a base delas bate: a folga e miuda porque o
         espacamento entre linhas do mesmo paragrafo mal passa do dobro disso */
      for (var k = grupos.length - 1; k >= 0 && k >= grupos.length - 16; k--) {
        if (Math.abs(grupos[k].y - r.y) <= Math.max(1, 0.12 * tam)) { achada = grupos[k]; break; }
      }
      if (!achada) {
        achada = { y: r.y, runs: [], tam: 0 };
        grupos.push(achada);
      }
      achada.runs.push(r);
      if (tam > achada.tam) achada.tam = tam;
    }
    var saida = [];
    for (var t = 0; t < grupos.length; t++) {
      var linha = grupos[t];
      var corpo = linha.tam || 1;
      linha.runs.sort(function (a, b) { return a.x - b.x; });
      var texto = "";
      var fim = -Infinity;
      for (var j = 0; j < linha.runs.length; j++) {
        var pedaco = linha.runs[j];
        /* buraco maior que um espaço miudo de kerning e space mesmo; o resto emenda colado */
        if (texto && pedaco.x - fim > Math.max(0.8, 0.16 * corpo)) texto += " ";
        texto += pedaco.texto;
        if (pedaco.fim > fim) fim = pedaco.fim;
      }
      if (!texto) continue;
      saida.push({
        x: linha.runs[0].x, y: linha.y, tamanho: corpo, texto: texto,
        /* as pedacas na ordem do papel: quem monta matriz de referencia separa assim a coluna
           do codigo da coluna da descricao, coisa que o texto corrido nao consegue */
        partes: linha.runs.map(function (p) { return { x: p.x, fim: p.fim, texto: p.texto }; })
      });
    }
    return saida;
  }

  function textoDasLinhas(linhas) {
    var saida = "";
    var anterior = null;
    for (var t = 0; t < linhas.length; t++) {
      var linha = linhas[t];
      /* um salto de linha maior que a altura de uma linha e paragrafo novo, nao a linha de baixo */
      if (saida) {
        saida += anterior && Math.abs(anterior.y - linha.y) > Math.max(2, 1.7 * linha.tamanho) ? "\n\n" : "\n";
      }
      saida += linha.texto;
      anterior = linha;
    }
    return saida;
  }

  function textoDasRuns(runs) {
    return textoDasLinhas(linhasDasRuns(runs));
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
      var marcador = m.index;
      var depois = m.index + m[0].length;
      var fim = texto.indexOf("endobj", depois);
      var ateStream = texto.indexOf("stream", depois);
      var temStream = ateStream >= 0 && (fim < 0 || ateStream < fim);
      var dicionario = temStream ? texto.slice(depois, ateStream) : texto.slice(depois, fim < 0 ? texto.length : fim);
      var corpo = null;
      var comprimento = -1;
      if (temStream) {
        var inicio = ateStream + 6;
        if (texto.charAt(inicio) === "\r") inicio++;
        if (texto.charAt(inicio) === "\n") inicio++;
        var termino = texto.indexOf("endstream", inicio);
        if (termino < 0) termino = inicio;
        /* o corpo vai inteiro ate o endstream, sem aparar nada: quem decide o corte e o
           descompactador, porque /Length e a quebra do fim mentem nos dois sentidos */
        var direto = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dicionario);
        if (direto) comprimento = Number(direto[1]);
        corpo = bytes.subarray(inicio, termino);
        re.lastIndex = termino;
      } else if (fim >= 0) {
        re.lastIndex = fim;
      }
      objs[numero] = { dict: dicionario, corpo: corpo, texto: null, comprimento: comprimento,
        inicio: marcador };
    }
    /* /Length indireto — o Word escreve assim em quase todo stream — so da para resolver
       depois que todos os objetos foram lidos */
    var reIndireto = /\/Length\s+(\d+)\s+\d+\s+R/;
    Object.keys(objs).forEach(function (k) {
      var o = objs[k];
      if (!o.corpo || o.comprimento >= 0) return;
      var m2 = reIndireto.exec(o.dict);
      var alvo = m2 ? objs[Number(m2[1])] : null;
      if (alvo && /^\s*\d+\s*$/.test(alvo.dict)) o.comprimento = Number(/(\d+)/.exec(alvo.dict)[1]);
    });
    return objs;
  }

  async function corpoDe(obj, avisos) {
    if (!obj) return null;
    if (obj.texto != null) return obj.texto;
    if (!obj.corpo) { obj.texto = ""; return ""; }
    var bruto = obj.corpo;
    if (filtrDoStream(obj.dict)) {
      var inflado = await inflarDoStream(obj, avisos);
      if (!inflado) { obj.texto = ""; return ""; }
      bruto = inflado;
    }
    obj.texto = latin1(bruto);
    return obj.texto;
  }

  async function bytesDo(obj, avisos, onde) {
    if (!obj || !obj.corpo) return new Uint8Array(0);
    if (!filtrDoStream(obj.dict)) return obj.corpo;
    var inflado = await inflarDoStream(obj, avisos, onde);

    return inflado || new Uint8Array(0);
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
      /* a cache e pelo OBJETO da fonte, nao pelo nome: pagina e form XObject usam /F1 para
         fontes diferentes e o nome dividiria o mapa errado entre elas */
      if (!cache[m[2]]) {
        var mapa = await mapaDaFonte(objFonte, objs, avisos);
        if (!mapa) {
          var descendentes = refsDe(objFonte.dict, "/DescendantFonts")[0];
          if (descendentes != null) mapa = await mapaDaFonte(objs[descendentes], objs, avisos);
        }
        var cid = /\/Type0|Identity/.test(objFonte.dict);
        var entrada = mapa ? { mapa: mapa.mapa, largura: mapa.largura } :
          { mapa: null, largura: cid ? 2 : 1 };
        /* as larguras ficam na propria fonte: e por elas que se sabe onde a caneta parou */
        entrada.w = largurasDa(objFonte, objs);
        cache[m[2]] = entrada;
        if (!mapa && /AAAAAA|BBAAAA|[A-E]{6}\+|\/FirstChar\s+0\b/.test(objFonte.dict)) {
          avisos.push("a fonte " + nome + " nao traz o mapa Unicode: o texto dela pode sair embaralhado.");
        }
      }
      fontes[nome] = cache[m[2]];
    }
    return fontes;
  }

  /* pares /Nome numero 0 R do dict /XObject de um /Resources, inline ou indireto */
  function xobjectsDe(resources, objs) {
    if (!resources || !resources.dict) return {};
    var dict = resources.dict;
    var indireto = refsDe(dict, "/XObject")[0];
    var bruto = indireto != null && objs[indireto] ? objs[indireto].dict :
      ((/\/XObject\s*<<([\s\S]*?)>>/.exec(dict) || [])[1] || "");
    var saida = {};
    var re = /(\/[A-Za-z0-9._]+)\s+(\d+)\s+\d+\s+R/g;
    var m;
    while ((m = re.exec(bruto))) saida[m[1].slice(1)] = Number(m[2]);
    return saida;
  }

  /* a folha pode so desenhar um form XObject e o texto inteiro morar la dentro — assim vem
     PDF digitalizado com camada de texto pesquisavel. desce nos forms, cada um com as fontes
     do proprio /Resources (ou as herdadas da pagina), e costura na ordem do Do. */
  async function textoEmCamadas(corpo, fontes, resources, objs, avisos, onde, cache, vistos, profundidade, cam) {
    var partes = [];
    /* cada camada tem a sua lista de Do: o form desenhado aqui dentro herda a matriz do ponto
       em que foi chamado, e nao a matriz do form que o chamou de novo mais adiante */
    var camada = cam ? { runs: cam.runs, matriz: cam.matriz, dos: [] } : null;
    if (profundidade > 3) return textoDoConteudo(corpo, fontes, camada);
    var filhos = xobjectsDe(resources, objs);
    var reDo = /(\/[A-Za-z0-9._]+)\s+Do\b/g;
    var m;
    var ultimo = 0;
    var chamados = 0;
    while ((m = reDo.exec(corpo))) {
      partes.push(textoDoConteudo(corpo.slice(ultimo, reDo.lastIndex), fontes, camada));
      ultimo = reDo.lastIndex;
      chamados++;
      var numero = filhos[m[1].slice(1)];
      var form = numero != null ? objs[numero] : null;
      if (!form || !/\/Subtype\s*\/Form/.test(form.dict) || vistos[numero]) continue;
      vistos[numero] = true;
      var bruto = await bytesDo(form, avisos, onde + " (form " + m[1] + ")");
      if (!bruto.length) continue;
      var refRes = refsDe(form.dict, "/Resources")[0];
      var res = refRes != null ? objs[refRes] : (form.dict.indexOf("/Resources") >= 0 ? form : resources);
      var fontesDoForm = await fontesDaPagina(res, objs, avisos, cache);
      var dentro = null;
      if (camada) {
        var site = camada.dos[chamados - 1];
        var mae = site && site.nome === m[1].slice(1) ? site.matriz : IDENTIDADE;
        /* o form herda a matriz do ponto onde foi desenhado: sem isso a coordenada do texto
           fica no espaco do form e nao na folha */
        dentro = {
          runs: camada.runs, dos: [],
          matriz: mul(mul(camada.matriz, mae), matrizDoForm(form.dict))
        };
      }
      partes.push(await textoEmCamadas(latin1(bruto), fontesDoForm, res, objs, avisos, onde,
        cache, vistos, profundidade + 1, dentro));
    }
    partes.push(textoDoConteudo(corpo.slice(ultimo), fontes, camada));
    return partes.filter(function (p) { return p; }).join("\n");
  }

  function matrizDoForm(dict) {
    var bruto = brutoDoArray(dict, "/Matrix");
    if (bruto == null) return IDENTIDADE;
    var numeros = (bruto.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) || []).map(Number);
    return numeros.length === 6 ? numeros : IDENTIDADE;
  }

  async function parsePdf(bytes, opcoes) {
    var querGeometria = !!(opcoes && opcoes.geometria);
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
    var estruturas = [];
    var semMapa = 0;
    /* a mesma folha pode ser lida mais de uma vez; os nomes de fonte sao por pagina */
    var promessas = [];
    var vistos = {};
    var ordens = [];
    var rePagina = /(\d+)\s+\d+\s+obj\b/g;
    var mp;
    while ((mp = rePagina.exec(texto))) {
      var candidato = Number(mp[1]);
      /* "12 0 obj" tb aparece dentro de um stream binario: aceitar o eco faria a pagina sair
         fora de ordem e as questoes importadas viriam embaralhadas. so vale o marcador real. */
      if (!objs[candidato] || objs[candidato].inicio !== mp.index) continue;
      if (/\/Type\s*\/Page(?![A-Za-z])/.test(objs[candidato].dict)) ordens.push(candidato);
    }
    var vistoEm = 0;

    ordens.forEach(function (numero) {
      if (vistos[numero]) return;
      vistos[numero] = true;
      var obj = objs[numero];
      var resourcesRef = refsDe(obj.dict, "/Resources")[0];
      var resources = resourcesRef != null ? objs[resourcesRef] : { dict: obj.dict };
      var onde = "o stream da pagina " + (++vistoEm);
      promessas.push((async function () {
        var fontes = await fontesDaPagina(resources, objs, avisos, cacheMapa);
        var refs = refsDe(obj.dict, "/Contents");
        var partes = [];
        for (var k = 0; k < refs.length; k++) partes.push(await bytesDo(objs[refs[k]], avisos, onde));
        var total = partes.reduce(function (s, p) { return s + p.length; }, 0);

        var conteudo = new Uint8Array(total);
        var pos = 0;
        partes.forEach(function (p) { conteudo.set(p, pos); pos += p.length; });
        if (!conteudo.length) return { texto: "", linhas: null };
        var corpo = latin1(conteudo);
        var t = await textoEmCamadas(corpo, fontes, resources, objs, avisos, onde, cacheMapa, {}, 0);
        var linhas = null;
        if (textoPicado(t) || querGeometria) {
          /* o legado entregou chuva de letra sozinha: refaz a pagina pela coordenada do papel.
             com geometria pedida, a corrida roda mesmo quando o legado ja estava bom: quem
             monta matriz precisa do x e do y para separar as colunas da tabela */
          var corrida = { runs: [], matriz: IDENTIDADE, dos: null };
          await textoEmCamadas(corpo, fontes, resources, objs, avisos, onde, cacheMapa, {}, 0, corrida);
          linhas = linhasDasRuns(corrida.runs);
          var porPosicao = textoDasLinhas(linhas);
          if (maisEmendaQue(t, porPosicao)) t = porPosicao;
          else if (!querGeometria) linhas = null;
        }
        if (!Object.keys(fontes).length && /Tf/.test(corpo)) semMapa++;
        return { texto: t, linhas: linhas };
      })());
    });
    var textos = await Promise.all(promessas);
    textos.forEach(function (p) {
      if (!p.texto) return;
      paginas.push(p.texto);
      estruturas.push(p.linhas);
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
    return {
      texto: limpo, paginas: paginas.length, avisos: avisos.filter(unico),
      /* porPagina preserva as folhas sem texto: quem confere encaixe no papel precisa saber
         que a pagina existe e esta vazia, e nao que ela sumiu do array */
      porPagina: textos.map(function (t) { return (t && t.texto) || ""; }),
      /* linhas: cada pagina que saiu do modo por posicao vem com as linhas e a coordenada que
         elas ocupam no papel; quem for mont matriz de referencia precisa disso para saber de
         que ano e cada descritor. pagina pelo caminho legado vem com null */
      linhas: estruturas
    };
  }

  function unico(v, i, arr) { return arr.indexOf(v) === i; }

  function semEspaco(texto) { return String(texto || "").replace(/\s+/g, "").length; }

  function picagem(texto) {
    var linhas = String(texto || "").split(/\n+/);
    var total = 0;
    var curtas = 0;
    for (var k = 0; k < linhas.length; k++) {
      var linha = linhas[k].trim();
      if (!linha) continue;
      total++;
      if (linha.length <= 3) curtas++;
    }
    return { total: total, curtas: curtas };
  }

  /* PDF com camada de texto desenhada pedaca por pedaca: quase toda linha do legado sai com uma
     ou duas letras, coisa que nenhum papel de verdade faz. So ai tentamos o modo por posicao —
     um papel do Word, com linhas de verdade, nem chega perto. */
  function textoPicado(texto) {
    var p = picagem(texto);
    var r = p.total ? p.curtas / p.total : 0;
    return (p.total >= 30 && r >= 0.75) || (p.total >= 5 && r >= 0.85);
  }

  /* o modo por posicao so substitui o legado quando ele de fato emenda: mesma quantidade de
     letra e bem menos linha picada. se a folha ja era linha de verdade, fica como estava. */
  function maisEmendaQue(legado, posicao) {
    if (!posicao) return false;
    if (semEspaco(posicao).length < semEspaco(legado).length * 0.98) return false;
    var a = picagem(legado);
    var b = picagem(posicao);
    return a.total >= 5 && b.total >= 1 && b.curtas / b.total <= a.curtas / a.total * 0.5;
  }

  global.GabaPdf = {
    parsePdf: parsePdf,
    parseCMap: parseCMap,
    parseW: parseW,
    textoDoConteudo: textoDoConteudo,
    textoDasRuns: textoDasRuns,
    textoPicado: textoPicado,
    refluir: refluir,
    ehPdf: function (bytes) {
      var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
