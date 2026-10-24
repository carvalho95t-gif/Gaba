/* Gaba — escala de proficiência em níveis (Insuficiente / Básico / Intermediário / Avançado).
   A nota da correção vai de 0 a 10, então cada corte é uma nota de partida: quem tira
   exatamente o corte entra no nível dele. Os cortes são editáveis e ficam no aparelho. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaProficiencia = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CHAVE = "gaba_cortes";
  var PADRAO = [
    { nivel: "Insuficiente", min: 0 },
    { nivel: "Básico", min: 4 },
    { nivel: "Intermediário", min: 6 },
    { nivel: "Avançado", min: 8 }
  ];

  function numeroDe(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function arredonda(v) {
    return Math.round(v * 1000) / 1000;
  }

  /* sempre ordenado do menor corte para o maior, com o primeiro começando em 0:
     assim qualquer nota tem nível, mesmo se a tabela editada pular o começo. */
  function normalizar(cortes) {
    var lista = (cortes || []).map(function (c) {
      var min = numeroDe(c && c.min);
      return { nivel: String((c && c.nivel) || "").trim(), min: min === null ? 0 : min };
    }).filter(function (c) { return c.nivel; });
    if (!lista.length) lista = PADRAO.map(function (c) { return { nivel: c.nivel, min: c.min }; });
    lista.sort(function (a, b) { return a.min - b.min; });
    lista[0].min = 0;
    return lista.map(function (c, i) {
      var proxi = lista[i + 1];
      return {
        nivel: c.nivel, min: c.min, max: proxi ? proxi.min : 10,
        primeiro: i === 0, ultimo: !proxi
      };
    });
  }

  function armazen() {
    try {
      return (typeof localStorage !== "undefined" && localStorage) || null;
    } catch (e) {
      return null;
    }
  }

  var naMemoria = null;

  function cortes() {
    if (naMemoria) return naMemoria;
    var store = armazen();
    if (!store) return normalizar(PADRAO);
    var bruto = store.getItem(CHAVE);
    if (!bruto) return normalizar(PADRAO);
    try {
      var lido = JSON.parse(bruto);
      return normalizar(Array.isArray(lido) ? lido : (lido && lido.itens));
    } catch (e) {
      return normalizar(PADRAO);
    }
  }

  function salvar(lista) {
    naMemoria = normalizar(lista);
    var store = armazen();
    if (store) store.setItem(CHAVE, JSON.stringify(naMemoria));
    return naMemoria;
  }

  function limpar() {
    naMemoria = null;
    var store = armazen();
    if (store) store.removeItem(CHAVE);
  }

  /* o nível de uma nota; devolve null quando não há nota nenhuma (folha sem leitura) */
  function nivelNa(nota, tabela) {
    var v = numeroDe(nota);
    if (v === null) return null;
    var achado = tabela[0];
    for (var i = 0; i < tabela.length; i++) {
      if (v >= tabela[i].min) achado = tabela[i];
    }
    return achado;
  }

  function tabelaDe(lista) {
    return normalizar(lista && lista.length ? lista : cortes());
  }

  function nivel(nota, lista) {
    return nivelNa(nota, tabelaDe(lista));
  }

  function rotulo(nota, lista) {
    var n = nivel(nota, lista);
    return n ? n.nivel : "";
  }

  /* quantos alunos caem em cada nível — a distribuição é o que vira barra na tela */
  function distribuicao(notas, lista) {
    var tabela = tabelaDe(lista);
    var posicoes = {};
    var out = tabela.map(function (c, i) {
      posicoes[c.nivel] = i;
      return { nivel: c.nivel, min: c.min, max: c.max, quantidade: 0, proporcao: 0 };
    });
    var total = 0;
    (notas || []).forEach(function (v) {
      var n = nivelNa(v, tabela);
      if (!n || posicoes[n.nivel] === undefined) return;
      out[posicoes[n.nivel]].quantidade += 1;
      total += 1;
    });
    out.forEach(function (d) { d.proporcao = total ? arredonda(d.quantidade / total) : 0; });
    return out;
  }

  /* "6,0 a 7,9" para legendar a tabela na tela; vale também nas linhas da distribuição */
  function faixa(c) {
    var dec = function (v) { return String(Number(v.toFixed(1))).replace(".", ","); };
    if (c.max >= 10) return dec(c.min) + " ou mais";
    if (!(c.min > 0)) return "até " + dec(c.max - 0.1);
    return dec(c.min) + " a " + dec(c.max - 0.1);
  }

  return {
    CHAVE: CHAVE,
    PADRAO: PADRAO,
    normalizar: normalizar,
    cortes: cortes,
    salvar: salvar,
    limpar: limpar,
    nivel: nivel,
    rotulo: rotulo,
    distribuicao: distribuicao,
    faixa: faixa
  };
});
