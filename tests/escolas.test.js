/* A escola da turma: agrupar sem duplicar a grafia, filtrar as turmas que aparecem na
   tela e lembrar a escola ativa neste aparelho. Roda so no node:
   node tests/escolas.test.js */
"use strict";

var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};

require("../js/escolas.js");
var G = globalThis.GabaEscolas;

var TURMAS = [
  { id: "1", nome: "9o A", escola: "EEFM DA SERRA" },
  { id: "2", nome: "9o B", escola: " eefm   da serra " },
  { id: "3", nome: "1a serie", escola: "EM Anhanguera" },
  { id: "4", nome: "Turma velha", escola: null },
  { id: "5", nome: "Sem escola 2", escola: "   " }
];

var falhas = 0;
function check(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (detalhe !== undefined && !cond ? "  ->  " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas += 1;
}

(async function principal() {
  check("modulo expoe a API que o app usa",
    ["SEM_ESCOLA", "normalizar", "chave", "filtro", "setFiltro", "escolas", "visiveis", "daTurma"]
      .every(function (k) { return G && Object.prototype.hasOwnProperty.call(G, k); }),
    G && Object.keys(G));

  console.log("\n== a grafia digitada ==");
  check("normalizar junta os espacos e sobrevive a nulo",
    G.normalizar("  EEFM   da  SERRA ") === "EEFM da SERRA" &&
    G.normalizar(null) === "" && G.normalizar(undefined) === "" && G.normalizar(12) === "12",
    [G.normalizar("  EEFM   da  SERRA "), G.normalizar(null)]);
  check("mesma escola em caixas diferentes tem a mesma chave",
    G.chave("EEFM DA SERRA") === G.chave(" eefm   da serra ") && G.chave("EM Anhanguera") !== G.chave("EEFM DA SERRA"),
    [G.chave("EEFM DA SERRA"), G.chave(" eefm   da serra ")]);

  console.log("\n== as escolas que existem nas turmas ==");
  var escolas = G.escolas(TURMAS);
  check("uma entrada por escola, com as turmas contadas",
    escolas.length === 2 && escolas[0].nome === "EEFM DA SERRA" && escolas[0].turmas === 2 &&
    escolas[1].nome === "EM Anhanguera" && escolas[1].turmas === 1,
    escolas);
  check("turma sem escola nao inventa uma escola",
    G.escolas([{ nome: "A" }, { escola: "  " }, null]).length === 0, G.escolas([{ nome: "A" }, { escola: " " }, null]));
  check("a lista vem em ordem para o select do topo",
    G.escolas([{ escola: "EM Zebra" }, { escola: "EM Ana" }, { escola: "EM Boa Vista" }])
      .map(function (e) { return e.nome; }).join(",") === "EM Ana,EM Boa Vista,EM Zebra",
    G.escolas([{ escola: "EM Zebra" }, { escola: "EM Ana" }]).map(function (e) { return e.nome; }));
  check("a primeira grafia que apareceu e a que o professor ve",
    G.escolas([{ escola: "eefm da serra" }, { escola: "EEFM DA SERRA" }])[0].nome === "eefm da serra",
    G.escolas([{ escola: "eefm da serra" }, { escola: "EEFM DA SERRA" }]));

  console.log("\n== o filtro da tela ==");
  check("sem filtro todas as turmas ficam visiveis",
    G.visiveis(TURMAS, "").length === 5 && G.visiveis(TURMAS, "   ").length === 5, G.visiveis(TURMAS, ""));
  check("o filtro nao depende da caixa alta que vem do banco",
    G.visiveis(TURMAS, "eefm da serra").map(function (t) { return t.id; }).join(",") === "1,2",
    G.visiveis(TURMAS, "eefm da serra"));
  check("escola que nao existe esvazia a tela em vez de mostrar tudo",
    G.visiveis(TURMAS, "EM Que Nao Existe").length === 0, G.visiveis(TURMAS, "EM Que Nao Existe"));
  check("(sem escola) mostra as turmas ainda sem unidade",
    G.visiveis(TURMAS, G.SEM_ESCOLA).map(function (t) { return t.id; }).sort().join(",") === "4,5",
    G.visiveis(TURMAS, G.SEM_ESCOLA));
  check("filtrar nao embaralha a ordem original das turmas",
    G.visiveis(TURMAS, "EEFM DA SERRA")[0].nome === "9o A", G.visiveis(TURMAS, "EEFM DA SERRA"));
  check("null e lista vazia nao derrubam a tela",
    G.visiveis(null, "").length === 0 && G.visiveis([], G.SEM_ESCOLA).length === 0 &&
    G.escolas(null).length === 0, "ok");

  console.log("\n== a escolha fica neste aparelho ==");
  store = {};
  global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
  check("filtro vazio quando o professor nunca escolheu",
    G.filtro() === "" && G.visiveis(TURMAS).length === 5, [G.filtro()]);
  check("setFiltro grava a escola aparada e readensa sem passar o nome",
    G.setFiltro("  EM   Anhanguera ") === "EM Anhanguera" &&
    G.filtro() === "EM Anhanguera" &&
    G.visiveis(TURMAS).map(function (t) { return t.id; }).join(",") === "3",
    [G.filtro(), G.visiveis(TURMAS)]);
  check("a escolha sobrevive a uma nova leitura do storage",
    G.setFiltro(G.SEM_ESCOLA) === G.SEM_ESCOLA &&
    G.visiveis(TURMAS).map(function (t) { return t.id; }).sort().join(",") === "4,5",
    [G.filtro(), G.visiveis(TURMAS)]);
  check("limpar o filtro apaga a chave do aparelho",
    G.setFiltro("") === "" && Object.keys(store).length === 0 && G.visiveis(TURMAS).length === 5,
    [store, G.visiveis(TURMAS)]);

  var semStorage = global.localStorage;
  delete global.localStorage;
  var lancou = false;
  try { G.setFiltro("EM Anhanguera"); } catch (err) { lancou = true; }
  check("aparelho sem localStorage nao trava o app e fica sem filtro",
    lancou === false && G.filtro() === "" && G.visiveis(TURMAS).length === 5, String(lancou));
  global.localStorage = semStorage;

  console.log("\n== o caderno herdado da turma ==");
  check("daTurma devolve a escola da turma escolhida",
    G.daTurma(TURMAS, "3") === "EM Anhanguera" && G.daTurma(TURMAS, 1) === "EEFM DA SERRA",
    [G.daTurma(TURMAS, "3"), G.daTurma(TURMAS, 1)]);
  check("turma sem escola ou sem id nao escreve nada no cabecalho",
    G.daTurma(TURMAS, "4") === "" && G.daTurma(TURMAS, "999") === "" &&
    G.daTurma(null, "3") === "" && G.daTurma(TURMAS, null) === "",
    [G.daTurma(TURMAS, "4"), G.daTurma(TURMAS, "999")]);

  console.log("\n" + (falhas ? falhas + " FALHA(S)" : "tudo certo"));
  process.exit(falhas ? 1 : 0);
})();
