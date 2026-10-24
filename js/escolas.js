/* Gaba — a escola é uma coisa que o professor cria, antes de existir qualquer turma com o
   nome dela. O cadastro mora neste aparelho (e no banco, quando houver) e é daqui que saem
   o seletor do topo e a lista da aba Turmas; as turmas continuam trazendo a escola como
   texto, então nada de antes deste cadastro precisa ser migrado. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaEscolas = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var FILTRO_KEY = "gaba_escola_filtro";
  var REGISTRO_KEY = "gaba_escolas_registro";

  function chaveLocal(base) {
    return root.GabaSync ? root.GabaSync.chaveLocal(base) : base + ":sem-conta";
  }
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
    return guardar(function () { return normalizar(localStorage.getItem(chaveLocal(FILTRO_KEY))); }, "");
  }

  function setFiltro(nome) {
    var n = normalizar(nome);
    guardar(function () {
      if (n) localStorage.setItem(chaveLocal(FILTRO_KEY), n);
      else localStorage.removeItem(chaveLocal(FILTRO_KEY));
    }, undefined);
    return n;
  }

  /* ------------------------------------------------------------------ cadastro
     Uma linha por escola no armazenamento do aparelho. Linha e nao JSON: o professor
     pode abrir o cadastro e ler, e uma linha quebrada nao derruba a lista inteira. */

  function listaCrua() {
    return String(guardar(function () { return localStorage.getItem(chaveLocal(REGISTRO_KEY)); }, "") || "");
  }

  function gravarLista(nomes) {
    guardar(function () {
      if (nomes.length) localStorage.setItem(chaveLocal(REGISTRO_KEY), nomes.join("\n"));
      else localStorage.removeItem(chaveLocal(REGISTRO_KEY));
    }, undefined);
  }

  function listar() {
    var vistos = {};
    var out = [];
    listaCrua().split("\n").forEach(function (linha) {
      var nome = cortar(normalizar(linha));
      if (!nome) return;
      var k = chave(nome);
      if (vistos[k]) return;
      vistos[k] = true;
      out.push(nome);
    });
    return ordena(out);
  }

  /* o mesmo teto que js/supabaseClient.js impoe na coluna escola das turmas */
  function cortar(v) {
    return String(v || "").slice(0, 120);
  }

  function ordena(nomes) {
    return nomes.slice().sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }

  function tem(nome) {
    var k = chave(nome);
    return Boolean(k) && listar().some(function (n) { return chave(n) === k; });
  }

  /* a escola nasce aqui: criar devolve o que ficou, novo diz se foi este clique que criou */
  function adicionar(nome) {
    var n = cortar(normalizar(nome));
    if (!n) return { nome: "", vazio: true, novo: false };
    if (tem(n)) return { nome: n, vazio: false, novo: false };
    gravarLista(listar().concat([n]));
    return { nome: n, vazio: false, novo: true };
  }

  /* desfazer o cadastro nao apaga a escola das turmas que ainda escrevem aquele nome */
  function remover(nome) {
    var k = chave(nome);
    var antes = listar();
    var sobra = antes.filter(function (n) { return chave(n) !== k; });
    if (sobra.length === antes.length) return false;
    gravarLista(sobra);
    return true;
  }

  /* o que o banco devolve vira cadastro daqui: um aparelho novo herda as escolas do projeto */
  function sincronizar(nomes) {
    var atuais = listar();
    var vistas = {};
    atuais.forEach(function (n) { vistas[chave(n)] = true; });
    var adicionados = [];
    (nomes || []).forEach(function (bruto) {
      /* linha do banco (objeto com nome) ou o nome solto que o painel ja tem em mao */
      var n = cortar(normalizar(bruto && typeof bruto === "object" ? bruto.nome : bruto));
      if (!n || vistas[chave(n)]) return;
      vistas[chave(n)] = true;
      atuais.push(n);
      adicionados.push(n);
    });
    if (adicionados.length) gravarLista(atuais);
    return adicionados;
  }

  /* cadastro + o que as turmas ja trazem: a escola criada hoje aparece mesmo sem turma */
  function noFiltro(turmas) {
    var porChave = {};
    var out = [];
    function slot(bruto) {
      var nome = cortar(normalizar(bruto));
      var k = chave(nome);
      if (!k) return null;
      if (porChave[k]) return porChave[k];
      var e = { nome: nome, chave: k, turmas: 0, cadastrada: false };
      porChave[k] = e;
      out.push(e);
      return e;
    }
    listar().forEach(function (n) {
      var e = slot(n);
      if (e) e.cadastrada = true;
    });
    (turmas || []).forEach(function (t) {
      var e = slot(t && t.escola);
      if (e) e.turmas += 1;
    });
    return out.sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
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
    listar: listar,
    tem: tem,
    adicionar: adicionar,
    remover: remover,
    sincronizar: sincronizar,
    noFiltro: noFiltro,
    escolas: escolas,
    visiveis: visiveis,
    daTurma: daTurma
  };
});
