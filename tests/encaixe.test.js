/* Teste do gate de encaixe (GabaFolha.conferirEncaixe / compactarCaixas / fontesProntas).
   Roda sozinha, sem navegador: aqui quem faz o papel do DOM e um boneco que devolve as
   medidas que a pagina teria. Vale porque o gate e a ultima coisa entre o lote e a impressora:
   se ele denuncia corte que nao existe, o professor nao imprime; se fica quieto diante de um
   corte verdadeiro, o papel sai com o nome do aluno faltando.
   Uso: node tests/encaixe.test.js */
"use strict";

var path = require("path");
var J = function (n) { return require(path.join(__dirname, "..", "js", n)); };

J("omrLayout.js");
J("qrPayload.js");
J("versoes.js");
J("docxParser.js");
J("folha.js");

var F = global.GabaFolha;

var falhas = 0;
function check(nome, cond, extra) {
  console.log((cond ? "ok   " + nome : "FALHA " + nome) + (extra !== undefined ? " — " + JSON.stringify(extra) : ""));
  if (!cond) falhas++;
}

var MM_PX = 96 / 25.4;
function px(mm) { return mm * MM_PX; }

/* ===== o DOM de brinquedo ===== */

/* um mini reconhecedor de seletores: basta o que o gate usa — lista por virgula, descendente
   com espaco, .classe, tag e :not(.classe). sem isso o teste dependeria de um DOM de verdade. */
function combina(node, seletor) {
  var partes = seletor.trim().split(/\s+/);
  var ultimo = partes[partes.length - 1];
  if (!casaUltimo(node, ultimo)) return false;
  var alvo = node.parent;
  for (var i = partes.length - 2; i >= 0; i--) {
    while (alvo && !casaUltimo(alvo, partes[i])) alvo = alvo.parent;
    if (!alvo) return false;
    alvo = alvo.parent;
  }
  return true;
}
function casaUltimo(node, token) {
  var m = /^([a-z0-9]*)((?:\.[a-z0-9_-]+|:not\([a-z0-9_.-]+\))*)$/i.exec(token);
  if (!m) return false;
  if (m[1] && node.tag !== m[1]) return false;
  var rest = m[2] || "";
  var pedacos = rest.match(/\.[a-z0-9_-]+|:not\([a-z0-9_.-]+\)/g) || [];
  for (var i = 0; i < pedacos.length; i++) {
    var p = pedacos[i];
    if (p.indexOf(":not(") === 0) {
      var dentro = p.slice(5, -1);
      if (dentro.charAt(0) === "." && node.classes.indexOf(dentro.slice(1)) >= 0) return false;
      if (dentro.charAt(0) !== "." && node.tag === dentro) return false;
    } else if (node.classes.indexOf(p.slice(1)) < 0) return false;
  }
  return true;
}

function no(o) {
  o = o || {};
  var el = {
    tag: o.tag || "div",
    textContent: o.text || "",
    attrs: o.attrs || {},
    parent: null,
    kids: o.kids || [],
    rect: { top: px(o.top || 0), bottom: px((o.top || 0) + (o.height || 0)), left: px(o.left || 0), right: px((o.left || 0) + (o.width || 0)), height: px(o.height || 0), width: px(o.width || 0) },
    scrollHeight: px(o.scrollMm === undefined ? (o.height || 0) : o.scrollMm),
    clientHeight: px(o.height || 0),
    scrollWidth: px(o.scrollLargMm === undefined ? (o.width || 0) : o.scrollLargMm),
    clientWidth: px(o.width || 0),
    getBoundingClientRect: function () { return el.rect; },
    getAttribute: function (k) { return el.attrs[k] === undefined ? null : String(el.attrs[k]); },
    querySelectorAll: function (sel) {
      var alvos = sel.split(",").map(function (s) { return s.trim(); });
      var out = [];
      (function andar(nome) {
        nome.kids.forEach(function (filho) {
          if (alvos.some(function (a) { return combina(filho, a); })) out.push(filho);
          andar(filho);
        });
      })(el);
      return out;
    },
    closest: function (sel) {
      var n = el;
      while (n) { if (casaUltimo(n, sel.trim())) return n; n = n.parent; }
      return null;
    }
  };
  el.classes = (o.className || "").split(/\s+/).filter(Boolean);
  el.classList = {
    contains: function (c) { return el.classes.indexOf(c) >= 0; },
    add: function (c) { if (el.classes.indexOf(c) < 0) el.classes.push(c); },
    remove: function (c) {
      var i = el.classes.indexOf(c);
      if (i >= 0) el.classes.splice(i, 1);
    }
  };
  el.kids.forEach(function (filho) { filho.parent = el; });
  return el;
}

/* uma folha A4 de mentira com uma area de colunas e N linhas de questao dentro dela */
function folhaComLinhas(op) {
  op = op || {};
  var areaTop = op.areaTop === undefined ? 30 : op.areaTop;
  var areaAltura = op.areaAltura === undefined ? 200 : op.areaAltura;
  var linhas = (op.linhas || []).map(function (l) {
    return no({
      tag: "p", className: l.classe || "folha-enunciado", text: l.text || "texto",
      top: areaTop + (l.top || 0), height: l.height === undefined ? 5 : l.height,
      left: l.left || 0, width: l.width === undefined ? 80 : l.width,
      scrollLargMm: l.scrollLargMm, attrs: { "data-num": l.num || "1" }
    });
  });
  var questao = no({ tag: "div", className: "folha-questao", kids: linhas, attrs: { "data-num": op.num || "1" } });
  var area = no({
    tag: "div", className: "folha-area" + (op.areaClasse ? " " + op.areaClasse : ""),
    top: areaTop, height: areaAltura, left: 0, width: op.areaLargura || 88,
    scrollMm: op.areaSobra === undefined ? areaAltura : areaAltura + op.areaSobra, kids: [questao]
  });
  var extras = (op.caixas || []).map(function (c) {
    return no({
      tag: "header", className: c.classe, top: c.top || 4, height: c.altura, left: 0, width: 130,
      scrollMm: (c.altura || 0) + (c.sobra || 0),
      kids: (c.perdidas || []).map(function (t, pi) {
        /* a linha perdida fica abaixo do fundo da caixa: e la que o overflow hidden corta */
        return no({ tag: "p", text: t, top: (c.top || 0) + (c.altura || 0) + 1 + pi * 5, height: 4, left: 0, width: 130 });
      })
    });
  });
  var folha = no({
    tag: "article", className: "folha-a4 " + (op.tipo || "folha-questoes"),
    attrs: { "data-versao": op.versao || "", "data-pagina": op.pagina || "" },
    top: 0, height: 297, left: 0, width: 210, kids: extras.concat([area])
  });
  return { folha: folha, area: area, linhas: linhas, root: no({ tag: "div", kids: [folha] }) };
}

/* ===== o gate ===== */

(function nadaCortado() {
  console.log("\n== o que nao deve gritar ==");
  var f = folhaComLinhas({ linhas: [{ top: 2, height: 6 }, { top: 10, height: 6 }] });
  check("folha medida e linhas dentro da coluna: silencio total", F.conferirEncaixe(f.root).length === 0,
    F.conferirEncaixe(f.root));

  /* 0,4 mm de resto de linha e arredondamento do navegador, nao corte: denuncia aqui faria o
     app bloquear a impressao de um lote que sai perfeito no papel */
  var raso = folhaComLinhas({ linhas: [{ top: 0, height: 200.4 }] });
  check("linha que passa menos que a tolerancia nao e denunciada",
    F.conferirEncaixe(raso.root).length === 0, F.conferirEncaixe(raso.root));

  var encostada = folhaComLinhas({ linhas: [{ top: 0, height: 210 }] });
  check("linha que passa 10 mm do fundo da coluna e denunciada",
    F.conferirEncaixe(encostada.root).length === 1, F.conferirEncaixe(encostada.root));
})();

(function denunciaDizOnde() {
  console.log("\n== a denuncia precisa apontar a folha e a questao ==");
  var f = folhaComLinhas({ versao: "V3", pagina: "4", num: "17", linhas: [{ top: 0, height: 210, num: "17" }] });
  var d = F.conferirEncaixe(f.root);
  check("diz o tipo e a pagina da folha", /tipo V3 pag 4/.test(d[0] || ""), d);
  check("diz o numero da questao e quantos mm estouram", /questao 17 passa 10\.0 mm/.test(d[0] || ""), d);

  var semRotulo = folhaComLinhas({ linhas: [{ top: 0, height: 210 }] });
  check("sem data-versao nem data-pagina ela identifica a folha pela ordem",
    /^folha 1:/.test((F.conferirEncaixe(semRotulo.root)[0] || "")), F.conferirEncaixe(semRotulo.root));
})();

(function vazamentoLateral() {
  console.log("\n== a palavra que nao cabe na largura ==");
  /* um <p> de bloco NUNCA alarga o proprio retangulo: quem denuncia e o scrollWidth. este teste
     existe porque a versao antiga olhava so o rect e deixava a palavra sair da pagina. */
  var f = folhaComLinhas({ linhas: [{ top: 2, height: 5, width: 80, scrollLargMm: 92, text: "codigo ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" }] });
  var d = F.conferirEncaixe(f.root);
  check("linha que vaza 14 mm pela direita e denunciada mesmo com o rect dentro",
    d.length === 1 && /borda direita/.test(d[0]), d);
  check("a denuncia avisa que a culpa e da palavra longa sem espaco",
    /palavra longa sem espaco/.test(d[0] || ""), d);

  var normal = folhaComLinhas({ linhas: [{ top: 2, height: 5, width: 80, scrollLargMm: 80, text: "texto normal" }] });
  check("texto que cabe na largura nao gera denuncia lateral",
    F.conferirEncaixe(normal.root).length === 0, F.conferirEncaixe(normal.root));
})();

(function areaEstourada() {
  console.log("\n== a area como um todo ==");
  var f = folhaComLinhas({ areaSobra: 12, linhas: [] });
  var d = F.conferirEncaixe(f.root);
  check("area com 12 mm de texto alem do limite e denunciada",
    d.length === 1 && /sobra 12\.0 mm de texto cortado pelo limite da area/.test(d[0]), d);
})();

(function caixasFixas() {
  console.log("\n== as caixas de tamanho fixo do papel ==");
  /* o cabecalho da folha de respostas tem max-height + overflow hidden: o texto que passa dele
     nao empurra nenhuma coluna e nao muda nenhum rect — ele simplesmente nao sai no papel. */
  var f = folhaComLinhas({
    tipo: "folha-resposta", versao: "V1", pagina: "1", linhas: [],
    caixas: [{ classe: "folha-cabecalho", altura: 58, sobra: 26, perdidas: ["Aluno(a): ANA BEATRIZ DOS SANTOS SILVA"] }]
  });
  var d = F.conferirEncaixe(f.root);
  check("cabecalho que corta o proprio texto e denunciado",
    d.length === 1 && /cabecalho de identificacao corta 26\.0 mm/.test(d[0]), d);
  check("a denuncia cita a linha que se perde no papel",
    /perde-se "Aluno\(a\): ANA BEATRIZ/.test(d[0] || ""), d);
  check("e diz o que o professor pode fazer", /Encurte/.test(d[0] || ""), d);

  var ok = folhaComLinhas({
    tipo: "folha-resposta", linhas: [],
    caixas: [{ classe: "folha-cabecalho", altura: 58, sobra: 0.4 }]
  });
  check("dentro da tolerancia a caixa nao grita", F.conferirEncaixe(ok.root).length === 0,
    F.conferirEncaixe(ok.root));

  /* o cabecalho fino das paginas de corpo nao tem altura fixa: ele cresce e quem sente e a
     coluna — conferir as duas coisas geraria denuncia duplicada por uma causa so */
  var fino = folhaComLinhas({ linhas: [], caixas: [{ classe: "folha-cabecalho folha-cabecalho-fino", altura: 6, sobra: 40 }] });
  check("o cabecalho fino esta fora da conferencia das caixas fixas",
    F.conferirEncaixe(fino.root).length === 0, F.conferirEncaixe(fino.root));

  var instrucao = folhaComLinhas({ tipo: "folha-resposta", linhas: [], caixas: [{ classe: "folha-instrucoes folha-instrucoes-capa", altura: 20, sobra: 9 }] });
  check("bloco de instrucoes tambem e conferido",
    /bloco de instrucoes corta 9\.0 mm/.test(F.conferirEncaixe(instrucao.root)[0] || ""),
    F.conferirEncaixe(instrucao.root));
})();

/* ===== o compactador ===== */

/* no boneco, o corpo menor libera altura do mesmo jeito que o navegador: o texto que sobra cai
   na proporcao do --cab. sem essa conta o teste nao diria nada sobre o degrau escolhido. */
function caixaQuePrecisa(mmNatural, buraco) {
  var caixa = no({ tag: "header", className: "folha-cabecalho", altura: buraco, scrollMm: mmNatural });
  Object.defineProperty(caixa, "scrollHeight", {
    configurable: true,
    get: function () {
      var cab = 1;
      caixa.classes.forEach(function (c) {
        var m = /^folha-compacta-(\d)$/.exec(c);
        if (m) cab = [1, 0.86, 0.76, 0.66][Number(m[1])];
      });
      return px(mmNatural * cab) + caixa.rect.height - px(buraco);
    }
  });
  return caixa;
}

(function compactar() {
  console.log("\n== antes de gritar, o app tenta caber ==");
  if (!F.compactarCaixas) { check("GabaFolha.compactarCaixas existe", false); return; }

  var folga = 58;
  var apertada = caixaQuePrecisa(62, folga);
  var root = no({ tag: "div", kids: [no({ tag: "article", className: "folha-a4 folha-resposta", kids: [apertada] })] });
  check("cabecalho que precisa de 62 mm num buraco de 58 mm e compactado no primeiro degrau",
    F.compactarCaixas(root) === 1 && apertada.classes.indexOf("folha-compacta-1") >= 0,
    apertada.classes);
  check("depois de compactar o gate fica quieto", F.conferirEncaixe(root).length === 0,
    F.conferirEncaixe(root));

  /* 72 mm num buraco de 58: o degrau 1 ainda nao chega (61,9 mm), o 2 chega (54,7 mm) */
  var enorme = caixaQuePrecisa(72, folga);
  var root2 = no({ tag: "div", kids: [no({ tag: "article", className: "folha-a4 folha-resposta", kids: [enorme] })] });
  F.compactarCaixas(root2);
  check("texto que precisa de 72 mm no mesmo buraco desce ate o degrau 2",
    enorme.classes.indexOf("folha-compacta-2") >= 0, enorme.classes);

  var impossivel = caixaQuePrecisa(200, folga);
  var root3 = no({ tag: "div", kids: [no({ tag: "article", className: "folha-a4 folha-resposta", kids: [impossivel] })] });
  F.compactarCaixas(root3);
  check("o que nao cabe em degrau algum para no menor deles",
    impossivel.classes.indexOf("folha-compacta-3") >= 0 && impossivel.classes.indexOf("folha-compacta-2") < 0,
    impossivel.classes);
  check("e o gate denuncia o resto em vez de deixar imprimir",
    F.conferirEncaixe(root3).length === 1, F.conferirEncaixe(root3));

  var folgada = caixaQuePrecisa(30, folga);
  var root4 = no({ tag: "div", kids: [no({ tag: "article", className: "folha-a4 folha-resposta", kids: [folgada] })] });
  check("caixa que ja cabe nao ganha classe nenhuma",
    F.compactarCaixas(root4) === 0 && folgada.classes.length === 1, folgada.classes);
})();

/* ===== fontes ===== */

(function fontes() {
  console.log("\n== medir com a fonte errada ==");
  if (!F.fontesProntas) { check("GabaFolha.fontesProntas existe", false); return; }
  var documentAntes = global.document;

  delete global.document;
  F.fontesProntas(50).then(function (semPagina) {
    check("fora do navegador a espera diz que nao mediu fonte nenhuma e nao trava", semPagina === false);

    global.document = { fonts: { ready: Promise.resolve() } };
    return F.fontesProntas(500);
  }).then(function (prontas) {
    check("com as fontes carregadas a medição esta liberada", prontas === true);

    global.document = { fonts: { ready: new Promise(function () {}) } };
    var inicio = Date.now();
    return F.fontesProntas(40).then(function (deuVelha) {
      check("fonte travada nao segura a previa: o teto devolve false", deuVelha === false,
        (Date.now() - inicio) + " ms");
      if (documentAntes === undefined) delete global.document; else global.document = documentAntes;
    });
  }).then(function () {
    console.log("");
    if (falhas) { console.log("FALHA: " + falhas + " check(s)"); process.exit(1); }
    console.log("gate de encaixe: tudo certo");
  }).catch(function (err) {
    console.error("erro: " + (err && err.stack ? err.stack : err));
    process.exit(1);
  });
})();
