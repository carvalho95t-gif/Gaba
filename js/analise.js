/* Gaba — análise de item e distratores a partir das correções já lidas.
   As respostas de cada folha chegam na ordem da prova base (respostas_banco), então
   dá para somar por questão sem desfazer o embaralhamento de cada versão. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaAnalise = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LETTERS = ["A", "B", "C", "D", "E"];
  var MIN_PARA_DISCRIMINAR = 6;
  var SEM_PARTE = "Geral";

  function numeroDe(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function arredonda(v) {
    return Math.round(v * 1000) / 1000;
  }

  function parteDaQuestao(q) {
    return String((q && q.parte) || "").trim() || SEM_PARTE;
  }

  /* as partes distintas na ordem em que aparecem no banco */
  function partesDaProva(prova) {
    var out = [];
    ((prova && prova.questoes) || []).forEach(function (q) {
      var p = parteDaQuestao(q);
      if (out.indexOf(p) < 0) out.push(p);
    });
    return out;
  }

  function pesoDa(q) {
    return numeroDe(q && q.peso) > 0 ? numeroDe(q.peso) : 1;
  }

  /* nota que a folha tirou só dentro de uma parte, na mesma escala 0-10 da nota da
     correção: é esta nota, e não a geral, que decide quem entra no grupo de cima e no
     de baixo daquela disciplina. */
  function notaNaParte(prova, folha, parte) {
    var questoes = (prova && prova.questoes) || [];
    var respostas = (folha && folha.respostas) || [];
    var ponderado = 0, maximo = 0;
    for (var i = 0; i < questoes.length; i++) {
      if (parteDaQuestao(questoes[i]) !== parte) continue;
      var peso = pesoDa(questoes[i]);
      var certa = String(questoes[i].gabarito || "").toUpperCase().charAt(0);
      maximo += peso;
      if (certa && String(respostas[i] || "").toUpperCase().charAt(0) === certa) ponderado += peso;
    }
    return maximo ? Math.round((ponderado / maximo) * 1000) / 100 : 0;
  }

  /* as folhas do banco já chegam na ordem da base; as que só estão no aparelho
     trazem "respostas" na ordem do caderno impresso e respostas_banco na da base. */
  function respostasDaFolha(r) {
    var banco = r.respostas_banco;
    if (Array.isArray(banco) && banco.length) return banco;
    return Array.isArray(r.respostas) ? r.respostas : [];
  }

  /* só entra na conta a folha que é desta prova e que tem resposta para aquela questão */
  function folhasDaProva(prova, correcoes) {
    var id = String((prova && prova.id) || "");
    var total = ((prova && prova.questoes) || []).length;
    return (correcoes || []).filter(function (r) {
      if (!r) return false;
      if (id && r.prova_id != null && String(r.prova_id) !== id) return false;
      return respostasDaFolha(r).length > 0;
    }).filter(function (r) {
      return Number(r.total_questoes || respostasDaFolha(r).length) <= Math.max(total, 1);
    }).map(function (r) {
      return Object.assign({}, r, { respostas: respostasDaFolha(r) });
    });
  }

  function textoDaAlternativa(q, letra) {
    var achada = ((q && q.alternativas) || []).filter(function (a) {
      return String(a.letra || "").toUpperCase() === letra;
    })[0];
    return achada ? String(achada.texto || "") : "";
  }

  function gruposPorNota(folhas, chaveDaNota) {
    var chave = typeof chaveDaNota === "function" ? chaveDaNota : function (r) { return numeroDe(r.nota); };
    var ordenadas = folhas.slice().sort(function (a, b) {
      return chave(b) - chave(a);
    });
    var n = Math.max(1, Math.floor(ordenadas.length * 0.25));
    return { altos: ordenadas.slice(0, n), baixos: ordenadas.slice(ordenadas.length - n) };
  }

  function itemDaQuestao(prova, i, folhas, grupos) {
    var q = prova.questoes[i] || {};
    var gabarito = String(q.gabarito || "").toUpperCase().charAt(0);
    var contagem = {};
    LETTERS.forEach(function (l) { contagem[l] = 0; });
    var branco = 0, acertos = 0;
    folhas.forEach(function (r) {
      var letra = String((r.respostas || [])[i] || "").toUpperCase().charAt(0);
      if (!letra) { branco += 1; return; }
      if (contagem[letra] !== undefined) contagem[letra] += 1;
      if (gabarito && letra === gabarito) acertos += 1;
    });
    var participantes = folhas.length;
    var proporcao = participantes ? arredonda(acertos / participantes) : 0;

    var discriminacao = null;
    if (participantes >= MIN_PARA_DISCRIMINAR) {
      var taxa = function (grupo) {
        if (!grupo.length) return 0;
        var c = grupo.filter(function (r) {
          return String((r.respostas || [])[i] || "").toUpperCase().charAt(0) === gabarito && gabarito;
        }).length;
        return c / grupo.length;
      };
      discriminacao = arredonda(taxa(grupos.altos) - taxa(grupos.baixos));
    }

    /* só as letras que a questão realmente oferece viram distrator na tela */
    var oferecidas = ((q.alternativas || []).map(function (a) {
      return String(a.letra || "").toUpperCase().charAt(0);
    }).filter(Boolean));
    var opcoes = oferecidas.length ? LETTERS.filter(function (l) { return oferecidas.indexOf(l) >= 0; }) : LETTERS;
    var distratores = opcoes.filter(function (l) { return l !== gabarito; }).map(function (l) {
      return { letra: l, texto: textoDaAlternativa(q, l), quantidade: contagem[l] || 0,
        proporcao: participantes ? arredonda((contagem[l] || 0) / participantes) : 0 };
    });
    var maisForte = distratores.reduce(function (m, d) {
      return d.quantidade > m.quantidade ? d : m;
    }, distratores[0] || { letra: "", quantidade: 0 });

    var bandeiras = [];
    if (!gabarito) bandeiras.push("sem-gabarito");
    else if (!participantes) bandeiras.push("sem-resposta");
    else if (proporcao >= 0.9) bandeiras.push("muito-facil");
    else if (proporcao <= 0.2) bandeiras.push("muito-dificil");
    if (maisForte && gabarito && maisForte.quantidade > acertos) bandeiras.push("distrator-mais-forte");
    if (discriminacao !== null) {
      if (discriminacao < 0) bandeiras.push("discriminacao-negativa");
      else if (discriminacao < 0.2) bandeiras.push("discriminacao-baixa");
    } else if (participantes && participantes < MIN_PARA_DISCRIMINAR) bandeiras.push("poucos-alunos");

    return {
      numero: i + 1,
      gabarito: gabarito,
      peso: numeroDe(q.peso) > 0 ? numeroDe(q.peso) : 1,
      parte: parteDaQuestao(q),
      descritor: q.descritor || "",
      habilidade_bncc: q.habilidade_bncc || "",
      participantes: participantes,
      branco: branco,
      acertos: acertos,
      proporcao: proporcao,
      discriminacao: discriminacao,
      distratores: distratores,
      distratorMaisForte: maisForte ? maisForte.letra : "",
      contagem: contagem,
      bandeiras: bandeiras
    };
  }

  var ROTULOS = {
    "sem-gabarito": "sem gabarito definido",
    "sem-resposta": "ninguém respondeu",
    "muito-facil": "muito fácil: quase todos acertaram",
    "muito-dificil": "muito difícil: quase ninguém acertou",
    "distrator-mais-forte": "uma alternativa errada foi mais marcada que o gabarito",
    "discriminacao-negativa": "os melhores da turma erraram mais: item a revisar",
    "discriminacao-baixa": "discriminação baixa (abaixo de 0,20)",
    "poucos-alunos": "poucos alunos para medir a discriminação"
  };

  /* grupos de referência por parte. Com mais de uma disciplina na mesma prova, o
     topo e a base são medidos pela nota daquela parte: senão o aluno bom só em
     Matemática conta como "fraco" nas questões de Português e a discriminação sai errada. */
  function gruposPorParte(prova, folhas, partes) {
    var out = {};
    if (folhas.length < MIN_PARA_DISCRIMINAR) return out;
    var usaGlobal = partes.length < 2;
    partes.forEach(function (parte) {
      out[parte] = usaGlobal
        ? gruposPorNota(folhas, null)
        : gruposPorNota(folhas, function (r) { return notaNaParte(prova, r, parte); });
    });
    return out;
  }

  var SEM_GRUPO = { altos: [], baixos: [] };

  function itens(prova, correcoes) {
    var questoes = (prova && prova.questoes) || [];
    var total = questoes.length;
    var folhas = folhasDaProva(prova, correcoes);
    var grupos = gruposPorParte(prova, folhas, partesDaProva(prova));
    var out = [];
    for (var i = 0; i < total; i++) {
      out.push(itemDaQuestao(prova, i, folhas, grupos[parteDaQuestao(questoes[i])] || SEM_GRUPO));
    }
    return out;
  }

  function soma(a, b) { return a + b; }

  function agregadoPorParte(prova, folhas, partes, lista) {
    return partes.map(function (parte) {
      var daParte = lista.filter(function (it) { return it.parte === parte; });
      var disc = daParte.filter(function (it) { return it.discriminacao !== null; });
      var notas = folhas.map(function (r) { return notaNaParte(prova, r, parte); });
      return {
        parte: parte,
        itens: daParte.length,
        numeros: daParte.map(function (it) { return it.numero; }),
        media: notas.length ? arredonda(notas.reduce(soma, 0) / notas.length) : 0,
        mediaDiscriminacao: disc.length
          ? arredonda(disc.reduce(function (s, it) { return s + it.discriminacao; }, 0) / disc.length)
          : null,
        revisar: daParte.filter(function (it) { return it.bandeiras.length > 0; })
          .map(function (it) { return it.numero; })
      };
    });
  }

  function resumo(prova, correcoes) {
    var lista = itens(prova, correcoes);
    var folhas = folhasDaProva(prova, correcoes);
    var notas = folhas.map(function (r) { return numeroDe(r.nota); });
    var media = notas.length ? arredonda(notas.reduce(soma, 0) / notas.length) : 0;
    function comBandeira(nome) {
      return lista.filter(function (it) { return it.bandeiras.indexOf(nome) >= 0; }).map(function (it) { return it.numero; });
    }
    var comDiscriminacao = lista.filter(function (it) { return it.discriminacao !== null; });
    return {
      alunos: folhas.length,
      media: media,
      itens: lista.length,
      porParte: agregadoPorParte(prova, folhas, partesDaProva(prova), lista),
      revisar: lista.filter(function (it) { return it.bandeiras.length > 0; }).map(function (it) { return it.numero; }),
      semGabarito: comBandeira("sem-gabarito"),
      faceis: comBandeira("muito-facil"),
      dificeis: comBandeira("muito-dificil"),
      distratores: comBandeira("distrator-mais-forte"),
      discriminacaoBaixa: comBandeira("discriminacao-negativa").concat(comBandeira("discriminacao-baixa")),
      mediaDiscriminacao: comDiscriminacao.length
        ? arredonda(comDiscriminacao.reduce(function (s, it) { return s + it.discriminacao; }, 0) / comDiscriminacao.length)
        : null
    };
  }

  function rotuloBandeira(nome) {
    return ROTULOS[nome] || nome;
  }

  return {
    LETTERS: LETTERS,
    SEM_PARTE: SEM_PARTE,
    folhasDaProva: folhasDaProva,
    parteDaQuestao: parteDaQuestao,
    partesDaProva: partesDaProva,
    notaNaParte: notaNaParte,
    itens: itens,
    resumo: resumo,
    rotuloBandeira: rotuloBandeira
  };
});
