/* Gaba — agregação básica das correções para painéis de turma, aluno e descritor.
   Trabalha sobre os mesmos dados que analise.js, sem criar tabela nova. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaBasica = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function rd(v, d) { var f = Math.pow(10, d || 1); return Math.round(v * f) / f; }

  function respostas(r) {
    var b = r.respostas_banco;
    if (Array.isArray(b) && b.length) return b;
    return Array.isArray(r.respostas) ? r.respostas : [];
  }

  function filtrar(prova, correcoes, turmaId) {
    var id = String((prova && prova.id) || "");
    return (correcoes || []).filter(function (r) {
      if (!r) return false;
      if (id && r.prova_id != null && String(r.prova_id) !== id) return false;
      if (turmaId && String(r.turma_id || "") !== String(turmaId)) return false;
      return respostas(r).length > 0;
    });
  }

  function mediana(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function desvio(arr, media) {
    if (arr.length < 2) return 0;
    var soma = arr.reduce(function (s, v) { return s + (v - media) * (v - media); }, 0);
    return Math.sqrt(soma / arr.length);
  }

  function resumoTurma(prova, correcoes, turmaId) {
    var folhas = filtrar(prova, correcoes, turmaId);
    var notas = folhas.map(function (r) { return num(r.nota); });
    var media = notas.length ? rd(notas.reduce(function (a, b) { return a + b; }, 0) / notas.length, 1) : 0;
    var med = rd(mediana(notas), 1);
    var dp = rd(desvio(notas, media), 1);
    var max = notas.length ? rd(Math.max.apply(null, notas), 1) : 0;
    var min = notas.length ? rd(Math.min.apply(null, notas), 1) : 0;
    var aprovados = notas.filter(function (n) { return n >= 6; }).length;
    var faixas = [0, 0, 0, 0, 0];
    notas.forEach(function (n) {
      var i = n >= 10 ? 4 : Math.floor(n / 2);
      if (i < 0) i = 0;
      faixas[i]++;
    });
    return {
      alunos: folhas.length, media: media, mediana: med, desvio: dp,
      max: max, min: min, aprovados: aprovados,
      taxaAprovacao: folhas.length ? rd(aprovados / folhas.length * 100, 1) : 0,
      faixas: faixas, faixaRotulos: ["0-2", "2-4", "4-6", "6-8", "8-10"]
    };
  }

  function ranking(prova, correcoes, turmaId, alunos) {
    var folhas = filtrar(prova, correcoes, turmaId);
    var porAluno = {};
    folhas.forEach(function (r) {
      var chave = String(r.aluno_id || r.aluno_numero || r.aluno_nome || "?");
      if (!porAluno[chave] || String(r.created_at || "") > String(porAluno[chave].created_at || "")) {
        porAluno[chave] = r;
      }
    });
    var lista = Object.keys(porAluno).map(function (k) {
      var r = porAluno[k];
      var al = (alunos || []).filter(function (a) { return String(a.id) === String(r.aluno_id); })[0];
      var total = r.total_questoes || respostas(r).length || 0;
      return {
        aluno_id: r.aluno_id || "", nome: r.aluno_nome || (al ? al.nome : ""),
        numero: r.aluno_numero || (al ? al.numero : 0),
        nota: num(r.nota), acertos: num(r.acertos), total: total,
        branco: num(r.branco), respostas: respostas(r)
      };
    }).sort(function (a, b) { return b.nota - a.nota || (a.nome || "").localeCompare(b.nome || ""); });
    lista.forEach(function (a, i) { a.posicao = i + 1; });
    return lista;
  }

  function perfilAluno(prova, rankItem) {
    var questoes = (prova && prova.questoes) || [];
    var gabarito = (prova && prova.gabarito) || [];
    var resp = rankItem.respostas || [];
    var porDescritor = {};
    questoes.forEach(function (q, i) {
      var d = q.descritor || "";
      if (!d) return;
      if (!porDescritor[d]) porDescritor[d] = { descritor: d, acertos: 0, total: 0 };
      porDescritor[d].total++;
      var correto = String(q.gabarito || gabarito[i] || "").toUpperCase().charAt(0);
      var marcou = String(resp[i] || "").toUpperCase().charAt(0);
      if (correto && marcou === correto) porDescritor[d].acertos++;
    });
    return Object.keys(porDescritor).map(function (d) {
      var o = porDescritor[d];
      o.taxa = o.total ? rd(o.acertos / o.total * 100, 0) : 0;
      o.status = o.taxa >= 70 ? "dominado" : o.taxa >= 40 ? "parcial" : "fragil";
      return o;
    }).sort(function (a, b) { return b.taxa - a.taxa; });
  }

  function taxaPorDescritor(prova, correcoes, turmaId, catalogo) {
    var folhas = filtrar(prova, correcoes, turmaId);
    var questoes = (prova && prova.questoes) || [];
    var gabarito = (prova && prova.gabarito) || [];
    var acc = {};
    folhas.forEach(function (r) {
      var resp = respostas(r);
      questoes.forEach(function (q, i) {
        var d = q.descritor || "";
        if (!d) return;
        if (!acc[d]) acc[d] = { descritor: d, acertos: 0, total: 0 };
        acc[d].total++;
        var correto = String(q.gabarito || gabarito[i] || "").toUpperCase().charAt(0);
        var marcou = String(resp[i] || "").toUpperCase().charAt(0);
        if (correto && marcou === correto) acc[d].acertos++;
      });
    });
    var cat = catalogo || [];
    return Object.keys(acc).map(function (d) {
      var o = acc[d];
      o.taxa = o.total ? rd(o.acertos / o.total * 100, 0) : 0;
      o.status = o.taxa >= 70 ? "dominado" : o.taxa >= 40 ? "parcial" : "fragil";
      var info = cat.filter(function (c) { return c.codigo === d; })[0];
      o.descricao = info ? info.descricao || "" : "";
      return o;
    }).sort(function (a, b) { return b.taxa - a.taxa; });
  }

  return {
    filtrar: filtrar,
    resumoTurma: resumoTurma,
    ranking: ranking,
    perfilAluno: perfilAluno,
    taxaPorDescritor: taxaPorDescritor
  };
});
