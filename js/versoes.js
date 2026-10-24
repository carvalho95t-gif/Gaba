/* Gaba — motor determinístico de versões embaralhadas (prova base -> caderno por turma/aluno) */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaVersoes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LETTERS = ["A", "B", "C", "D", "E"];

  function range(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    return a;
  }

  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= (s << 13); s >>>= 0;
      s ^= s >>> 17;
      s ^= (s << 5); s >>>= 0;
      return s / 0x100000000;
    };
  }

  function shuffle(list, rng) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  function base36(n) {
    var s = "";
    var alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    var v = n >>> 0;
    for (var i = 0; i < 4; i++) {
      s = alphabet[v % 32] + s;
      v = Math.floor(v / 32);
    }
    return s;
  }

  function seedParts(cfg) {
    var modo = cfg.modo || "fixa";
    var alvo = modo === "aluno" ? "A:" + (cfg.aluno_id || cfg.alvo_id || "")
      : modo === "turma" ? "T:" + (cfg.turma_id || cfg.alvo_id || "") + "#" + cfg.tipo
      : "F";
    return [cfg.prova_id || "prova", modo, alvo, cfg.salt || 1].join("|");
  }

  function letrasDe(question, prova, bancoIdx) {
    var alt = (question && question.alternativas) || [];
    var n = alt.length || 5;
    var origem = (question && question.gabarito) ||
      (prova && prova.gabarito ? prova.gabarito[bancoIdx] : "");
    return { n: Math.max(2, Math.min(5, n)), letra: String(origem || "").toUpperCase().charAt(0) };
  }

  function indiceLetra(letra) {
    return LETTERS.indexOf(String(letra || "").toUpperCase().charAt(0));
  }

  function build(prova, cfg) {
    cfg = cfg || {};
    var questoes = (prova && prova.questoes) || [];
    var total = questoes.length;
    var modo = cfg.modo || (prova && prova.modo) || "fixa";
    var tipo = Math.max(1, parseInt(cfg.tipo || cfg.versao || 1, 10) || 1);
    var embaralhaQ = modo !== "fixa" && cfg.embaralharQuestoes !== false &&
      !!(prova ? prova.embaralhar_questoes !== false : false);
    var embaralhaA = modo !== "fixa" && (cfg.embaralharAlternativas === true ||
      (prova && prova.embaralhar_alternativas === true));
    var seed = seedParts({
      prova_id: (prova && prova.id) || cfg.prova_id,
      modo: modo,
      aluno_id: cfg.aluno_id,
      turma_id: cfg.turma_id,
      tipo: tipo,
      salt: cfg.salt
    });
    var rngQ = makeRng(fnv1a(seed + "|Q"));
    var ordem = embaralhaQ ? shuffle(range(total), rngQ) : range(total);
    var inverte = [];
    for (var i = 0; i < ordem.length; i++) inverte[ordem[i]] = i;

    var altMap = [];
    var gabarito = [];
    for (var q = 0; q < total; q++) {
      var banco = ordem[q];
      var info = letrasDe(questoes[banco], prova, banco);
      var rngA = makeRng(fnv1a(seed + "|A" + banco));
      var perm = embaralhaA ? shuffle(range(info.n), rngA) : range(info.n);
      var letra = info.letra;
      var k = letra ? perm.indexOf(indiceLetra(letra)) : -1;
      altMap.push(perm);
      gabarito.push(k >= 0 ? LETTERS[k] : "");
    }

    return {
      versao: tipo,
      rotulo: modo === "fixa" ? "UNICA" : "TIPO " + tipo,
      codigo: modo === "fixa" ? "V1" : base36(fnv1a(seed)),
      seed: seed,
      modo: modo,
      total: total,
      embaralhouQuestoes: embaralhaQ,
      embaralhouAlternativas: embaralhaA,
      ordem: ordem,
      inverte: inverte,
      altMap: altMap,
      gabarito: gabarito
    };
  }

  function questoesDaVersao(prova, v) {
    var base = (prova && prova.questoes) || [];
    return base.map(function (_, q) {
      var banco = v.ordem[q];
      var origem = base[banco] || {};
      var map = v.altMap[q] || [];
      var altOrigem = origem.alternativas || [];
      return {
        numero: q + 1,
        numero_original: banco + 1,
        enunciado: origem.enunciado || "",
        comando: origem.comando || "",
        peso: typeof origem.peso === "number" ? origem.peso : 1,
        parte: origem.parte || "",
        descritor: origem.descritor || "",
        habilidade_bncc: origem.habilidade_bncc || "",
        alternativas: map.map(function (idx, k) {
          var a = altOrigem[idx] || {};
          return { letra: LETTERS[k], texto: a.texto || "", index_original: idx };
        }),
        gabarito: v.gabarito[q] || ""
      };
    });
  }

  /* respostas na ordem exibida do caderno -> respostas na ordem do banco */
  function paraBanco(v, respostas) {
    var out = [];
    for (var q = 0; q < v.total; q++) {
      var letra = (respostas || [])[q];
      var k = letra ? indiceLetra(letra) : -1;
      var idx = k >= 0 && k < (v.altMap[q] || []).length ? v.altMap[q][k] : -1;
      out[v.ordem[q]] = idx >= 0 ? LETTERS[idx] : "";
    }
    return out;
  }

  /* respostas na ordem do banco -> respostas na ordem exibida do caderno */
  function paraVersao(v, respostasBanco) {
    var out = [];
    for (var banco = 0; banco < v.total; banco++) {
      var letra = (respostasBanco || [])[banco];
      var q = v.inverte[banco];
      var k = letra ? (v.altMap[q] || []).indexOf(indiceLetra(letra)) : -1;
      out[q] = k >= 0 ? LETTERS[k] : "";
    }
    return out;
  }

  /* a nota geral continua ponderada pelo total de questoes da prova; porParte da o recorte
     de cada disciplina com a mesma regra, para a nota relativa sair comparavel */
  function corrigir(prova, v, respostas) {
    var base = (prova && prova.questoes) || [];
    var porQuestao = [];
    var acertos = 0, ponderado = 0, maximo = 0, branco = 0;
    var partes = {}, ordemPartes = [];
    for (var q = 0; q < v.total; q++) {
      var banco = v.ordem[q];
      var peso = typeof base[banco].peso === "number" && base[banco].peso > 0 ? base[banco].peso : 1;
      var resposta = String((respostas || [])[q] || "").toUpperCase();
      var certa = v.gabarito[q] || "";
      var ok = Boolean(certa) && resposta === certa;
      var rotulo = String(base[banco].parte || "").trim() || "Geral";
      var balde = partes[rotulo];
      if (!balde) {
        balde = partes[rotulo] = { parte: rotulo, questoes: 0, acertos: 0, branco: 0, ponderado: 0, maximo: 0 };
        ordemPartes.push(rotulo);
      }
      maximo += peso;
      balde.questoes += 1;
      balde.maximo += peso;
      if (ok) { acertos += 1; ponderado += peso; balde.acertos += 1; balde.ponderado += peso; }
      if (!resposta) { branco += 1; balde.branco += 1; }
      porQuestao.push({
        numero: q + 1,
        numero_original: banco + 1,
        resposta: resposta,
        gabarito: certa,
        correto: ok,
        peso: peso,
        parte: rotulo,
        descritor: base[banco].descritor || "",
        habilidade_bncc: base[banco].habilidade_bncc || ""
      });
    }
    var porParte = ordemPartes.map(function (nome) {
      var p = partes[nome];
      return {
        parte: p.parte, questoes: p.questoes, acertos: p.acertos, branco: p.branco,
        ponderado: p.ponderado, maximo: p.maximo,
        proporcao: p.maximo ? Math.round((p.ponderado / p.maximo) * 1000) / 1000 : 0,
        nota: p.maximo ? Math.round((p.ponderado / p.maximo) * 1000) / 100 : 0
      };
    });
    return {
      acertos: acertos,
      branco: branco,
      total: v.total,
      ponderado: ponderado,
      maximo: maximo,
      nota: maximo ? Math.round((ponderado / maximo) * 1000) / 100 : 0,
      porParte: porParte,
      respostas_banco: paraBanco(v, respostas),
      porQuestao: porQuestao
    };
  }

  /* atribui tipo: respeita o tipo lido do .docx quando existir, senão round-robin pelo número */
  function tipoDoAluno(aluno, idx, numTipos) {
    var n = Math.max(1, numTipos || 1);
    if (aluno && aluno.tipo) return ((aluno.tipo - 1) % n) + 1;
    return (idx % n) + 1;
  }

  function batch(prova, alunos, cfg) {
    cfg = cfg || {};
    var modo = cfg.modo || (prova && prova.modo) || "fixa";
    var numTipos = modo === "aluno" ? Math.max(1, (alunos || []).length) : Math.max(1, cfg.numTipos || 1);
    var mapa = {};
    var versoes = {};
    var lista = (alunos || []).map(function (aluno, idx) {
      var tipo = modo === "fixa" ? 1 : tipoDoAluno(aluno, idx, numTipos);
      var v = build(prova, {
        modo: modo,
        tipo: tipo,
        aluno_id: aluno.id || aluno.numero,
        turma_id: cfg.turma_id,
        prova_id: cfg.prova_id,
        salt: cfg.salt,
        embaralharQuestoes: cfg.embaralharQuestoes,
        embaralharAlternativas: cfg.embaralharAlternativas
      });
      if (aluno.id) mapa[aluno.id] = v;
      versoes[v.versao] = versoes[v.versao] || v;
      return { aluno: aluno, versao: v };
    });
    return { modo: modo, numTipos: numTipos, itens: lista, porAlunoId: mapa, porTipo: versoes };
  }

  function validar(prova, v) {
    var total = ((prova && prova.questoes) || []).length;
    var ordenada = v.ordem.slice().sort(function (a, b) { return a - b; });
    var okOrdem = ordenada.length === total && ordenada.every(function (n, i) { return n === i; });
    var okAlt = v.altMap.every(function (perm, q) {
      var n = ((prova.questoes[v.ordem[q]] || {}).alternativas || []).length;
      var sorted = perm.slice().sort(function (a, b) { return a - b; });
      return perm.length === n && sorted.every(function (k, i) { return k === i; });
    });
    var roundTrip = JSON.stringify(paraBanco(v, v.gabarito)) ===
      JSON.stringify(range(total).map(function (b) {
        var letra = (prova.gabarito || [])[b] || ((prova.questoes[b] || {}).gabarito || "");
        return String(letra).toUpperCase().charAt(0);
      }));
    return { okOrdem: okOrdem, okAlternativas: okAlt, roundTripGabarito: roundTrip };
  }

  return {
    LETTERS: LETTERS,
    fnv1a: fnv1a,
    makeRng: makeRng,
    shuffle: shuffle,
    build: build,
    batch: batch,
    questoesDaVersao: questoesDaVersao,
    paraBanco: paraBanco,
    paraVersao: paraVersao,
    corrigir: corrigir,
    validar: validar,
    tipoDoAluno: tipoDoAluno
  };
});
