/* Gaba — a escola da turma: agrupar, filtrar e lembrar a escola ativa neste aparelho.
   O app inteiro pergunta aqui quais turmas estão na tela, então o Painel, a importação
   de chamada, os cadernos e a análise nunca misturam unidades diferentes. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaEscolas = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FILTRO_KEY = "gaba_escola_filtro";
  /* as turmas ainda sem escola formam um grupo proprio no filtro, senao sumiriam da tela */
  var SEM_ESCOLA = "(sem escola)";

  function normalizar(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  /* "EEFM da Serra" e " eefm   DA SERRA " são a mesma escola: o professor digita, não escolhe */
  function chave(v) {
    return normalizar(v).toLocaleUpperCase("pt-BR");
  }

  function guardar(fazer, naoDisponivel) {
    try {
      return fazer();
    } catch (err) {
      return naoDisponivel;
    }
  }

  function filtro() {
    return guardar(function () { return normalizar(localStorage.getItem(FILTRO_KEY)); }, "");
  }

  function setFiltro(nome) {
    var n = normalizar(nome);
    guardar(function () {
      if (n) localStorage.setItem(FILTRO_KEY, n);
      else localStorage.removeItem(FILTRO_KEY);
    }, undefined);
    return n;
  }

  /* as escolas que existem nas turmas, com a grafia da primeira vez que apareceram */
  function escolas(turmas) {
    var porChave = {};
    (turmas || []).forEach(function (t) {
      var nome = normalizar(t && t.escola);
      if (!nome) return;
      var k = chave(nome);
      if (porChave[k]) { porChave[k].turmas += 1; return; }
      porChave[k] = { nome: nome, turmas: 1 };
    });
    return Object.keys(porChave).map(function (k) { return porChave[k]; })
      .sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
  }

  function visiveis(turmas, nome) {
    var f = normalizar(arguments.length > 1 ? nome : filtro());
    var lista = (turmas || []).slice();
    if (!f) return lista;
    var k = chave(f);
    if (k === chave(SEM_ESCOLA)) {
      return lista.filter(function (t) { return !normalizar(t && t.escola); });
    }
    return lista.filter(function (t) { return chave(t && t.escola) === k; });
  }

  function daTurma(turmas, id) {
    var achada = (turmas || []).filter(function (t) { return String(t.id) === String(id); })[0];
    return achada ? normalizar(achada.escola) : "";
  }

  return {
    SEM_ESCOLA: SEM_ESCOLA,
    normalizar: normalizar,
    chave: chave,
    filtro: filtro,
    setFiltro: setFiltro,
    escolas: escolas,
    visiveis: visiveis,
    daTurma: daTurma
  };
});
