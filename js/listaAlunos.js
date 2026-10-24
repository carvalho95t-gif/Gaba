/* Transforma a matriz vinda do Excel (ou do texto colado) em alunos aproveitaveis.
   O professor nao precisa arrumar a planilha: a coluna e descoberta pelo cabecalho e,
   quando nao ha cabecalho, pelo formato do conteudo. */
(function (global) {
  "use strict";

  /* Os rotulos sao comparados sem acento e com os simbolos virando espaco, assim
     "Nº", "Nº de ordem" e "NUM" caem todos no mesmo papel. */
  var PAPEL = [
    { papel: "email", re: /email|e mail|correo/i },
    { papel: "telefone", re: /telefone|celular|whats|fone|\btel\b/i },
    { papel: "responsavel", re: /responsavel|respons|pai\b|\bmae|adulto|encarregado/i },
    { papel: "matricula", re: /matricula|matric|\bid do aluno\b|inep/i },
    { papel: "tipo", re: /tipo|caderno|versao|modelo/i },
    { papel: "numero", re: /^(n|no|num|nro|numero|ordem|item|seq|sequencia|chamada)( |$)/i },
    { papel: "nome", re: /nome|estudante|discente|aluno/i }
  ];

  function semAcento(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function limpo(s) {
    return semAcento(s).replace(/[^a-z0-9]+/gi, "").toLowerCase();
  }

  function rotuloDe(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function chaveDe(v) {
    return semAcento(rotuloDe(v)).replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
  }

  function papelDaColuna(nome) {
    var t = chaveDe(nome);
    if (!t) return null;
    for (var i = 0; i < PAPEL.length; i++) {
      if (PAPEL[i].re.test(t)) return PAPEL[i].papel;
    }
    return null;
  }

  var ROTULOS_DE_DESCARTE = {};
  ["nome", "nomedoaluno", "nomecompleto", "nomedoestudante", "estudante", "aluno", "numero", "n", "matricula",
    "alunos", "alunas", "estudantes", "nomes", "discentes", "nomedosalunos", "nomedosestudantes",
    "tipodeprova", "tipo", "componente", "turma", "media", "total", "resultadofinal", "aprovacao",
    "cartuldadematria", "responsavel", "email", "telefone"].forEach(function (k) {
    ROTULOS_DE_DESCARTE[k] = true;
  });

  /* linhas de resumo que as planilhas colocam embaixo da chamada */
  var RODAPE = /^(total|somatorio|media|desvio|variancia|quantidade|numerodealunos?|ndealuno|aprovad|reprovad|assinatura|legenda|instru|observa|disciplina|componente|turma)/i;

  /* a chamada oficial mantem quem saiu da turma, com a situacao numa coluna ao lado.
     "deixou de frequentar" e o abandono que o SEGES registra: tampoco serve para
     montar prova, entao sai junto com transferido e remanejado.
     a celula do SEGES as vezes traz o marcador no fim, depois de um "/" com outro
     texto na frente ("Vice Líder/Transferido"), entao vale o comeco e o fim. */
  var SAIDA = "transferid|remanejad|deixou de frequent|nao frequent";
  var SAIU = new RegExp("^(" + SAIDA + ")");
  var SAIU_NO_FIM = new RegExp("(" + SAIDA + ")[a-z]*$");
  var SAIU_NO_NOME = new RegExp("\\b(" + SAIDA + ")");

  function ehSaida(texto, coluna, idxNome) {
    var t = chaveDe(texto);
    return coluna === idxNome ? SAIU_NO_NOME.test(t) : SAIU.test(t) || SAIU_NO_FIM.test(t);
  }

  function saiuDaTurma(linha, idxNome) {
    return linha.some(function (c, i) { return ehSaida(c, i, idxNome); });
  }

  /* a celula que denunciou a saida, preferindo a de situacao ao nome do aluno */
  function motivoDaSaida(linha, idxNome) {
    var doNome = "";
    for (var i = 0; i < linha.length; i++) {
      if (!ehSaida(linha[i], i, idxNome)) continue;
      if (i !== idxNome) return rotuloDe(linha[i]);
      doNome = rotuloDe(linha[i]);
    }
    return doNome;
  }

  function avisoDeSaidas(n) {
    return n === 1 ? "1 aluno marcado como transferido, remanejado ou sem frequência ficou de fora."
      : n + " alunos marcados como transferidos, remanejados ou sem frequência ficaram de fora.";
  }

  var AVISO_SEM_CABECALHO = "A lista não tem linha de cabeçalho: usei a primeira coluna com números como Nº e a coluna de texto mais longo como nome.";

  function ehRodape(texto) {
    var t = chaveDe(texto);
    return RODAPE.test(t) || RODAPE.test(t.replace(/ /g, ""));
  }

  function pareceContato(texto) {
    return /@/.test(texto) || /^(https?|www)[^ ]*\./i.test(texto);
  }

  function papeisDaLinha(linha) {
    var achados = {};
    (linha || []).forEach(function (c) {
      var p = papelDaColuna(c);
      if (p) achados[p] = true;
    });
    return achados;
  }

  function ehCabecalho(linha) {
    var p = papeisDaLinha(linha);
    /* o nome sozinho nao basta: as faixas de titulo ("DADOS DO ESTUDANTE") tambem tem */
    return !!p.nome && (!!p.numero || !!p.matricula);
  }

  function mapaDeColunas(linha) {
    var mapa = {};
    linha.forEach(function (c, i) {
      var p = papelDaColuna(c);
      if (p && mapa[p] === undefined) mapa[p] = i;
    });
    return mapa;
  }

  function numeroDe(v) {
    var t = rotuloDe(v).replace(/[º°]|\.\s*|\s/g, "");
    if (/^n(um|r[oó])?$/i.test(t)) return null;
    if (/^n/i.test(t)) t = t.replace(/^n/i, "");
    var n = parseInt(t, 10);
    return Number.isNaN(n) ? null : n;
  }

  function tipoDe(v) {
    var m = /(\d+)/.exec(rotuloDe(v));
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return n >= 1 && n <= 26 ? n : null;
  }

  function nomeCelula(linha, idx) {
    return idx === undefined || idx < 0 ? "" : rotuloDe(linha[idx] || "");
  }

  function emailValido(v) {
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v || "").trim());
  }

  function telefoneLimpo(v) {
    return rotuloDe(v).replace(/[^\d+() -]/g, "").slice(0, 40);
  }

  /* coluna escolhida pelo conteudo quando a planilha nao tem cabecalho */
  function adivinharColunas(matriz) {
    var melhor = { numero: -1, nome: -1 };
    var largura = matriz.reduce(function (n, l) { return Math.max(n, l.length); }, 0);
    var pontuacoes = [];
    for (var c = 0; c < largura; c++) {
      var valores = matriz.map(function (l) { return rotuloDe(l[c] || ""); }).filter(Boolean);
      var numericas = valores.filter(function (v) { return /^[\dºo.\s-]+$/.test(v); }).length;
      var textoPuro = valores.filter(function (v) {
        return /[a-zà-ú]/i.test(v) && !pareceContato(v) && !/^[\d.\s-]+$/.test(v);
      });
      var letras = textoPuro.length;
      var tamanho = textoPuro.reduce(function (n, v) { return n + v.length; }, 0);
      pontuacoes.push({ c: c, numericas: numericas, letras: letras, tamanho: tamanho, total: valores.length });
    }
    var comNumeros = pontuacoes.filter(function (p) { return p.numericas >= Math.max(2, p.total * 0.6); })
      .sort(function (a, b) { return b.numericas - a.numericas; })[0];
    var comTextos = pontuacoes.filter(function (p) { return p.letras >= 2; })
      .sort(function (a, b) { return b.tamanho / b.letras - a.tamanho / a.letras; })[0];
    if (comNumeros) melhor.numero = comNumeros.c;
    if (comTextos) melhor.nome = comTextos.c;
    return melhor;
  }

  function montar(matriz, opcoes) {
    var linhas = (matriz || []).filter(function (l) { return Array.isArray(l) && l.some(function (c) { return /\S/.test(String(c)); }); });
    var problemas = [];
    var idx = { numero: -1, nome: -1, matricula: -1, tipo: -1, responsavel: -1, email: -1, telefone: -1 };
    var cabecalho = null;
    var linhaCabecalho = -1;
    var melhorPontos = 0;
    var desde = 0;
    /* entre as linhas que parecem cabecalho fica a que reconhece mais papeis, senao
       a faixa de titulo das planilhas oficiais engole a linha de baixo */
    for (var i = 0; i < Math.min(linhas.length, 25); i++) {
      if (!ehCabecalho(linhas[i])) continue;
      var quantos = Object.keys(papeisDaLinha(linhas[i])).length;
      if (cabecalho === null || quantos > melhorPontos) {
        cabecalho = linhas[i];
        linhaCabecalho = i;
        melhorPontos = quantos;
      }
    }
    if (cabecalho) {
      var mapa = mapaDeColunas(cabecalho);
      Object.keys(idx).forEach(function (papel) { idx[papel] = mapa[papel] === undefined ? -1 : mapa[papel]; });
      desde = linhaCabecalho + 1;
    } else {
      idx = adivinharColunas(linhas);
      problemas.push(AVISO_SEM_CABECALHO);
    }
    if (idx.nome < 0) {
      problemas.push("Não encontrei a coluna de nomes. Reordene as colunas ou cole só Nº e Nome.");
      return { alunos: [], problemas: problemas, cabecalho: cabecalho, linhaCabecalho: linhaCabecalho };
    }

    var vistos = {};
    var nomesVistos = {};
    var alunos = [];
    var fora = [];
    var maior = 0;
    var puladas = 0;
    var saidas = 0;
    for (var n = desde; n < linhas.length; n++) {
      var linha = linhas[n];
      var nome = nomeCelula(linha, idx.nome);
      if (!nome || nome.length < 3) { puladas++; continue; }
      var chaveNome = limpo(nome);
      if (ROTULOS_DE_DESCARTE[chaveNome] || ehRodape(nome) || pareceContato(nome)) { puladas++; continue; }
      if (saiuDaTurma(linha, idx.nome)) {
        saidas++;
        fora.push({
          numero: idx.numero >= 0 ? numeroDe(rotuloDe(linha[idx.numero] || "")) : null,
          nome: nome, situacao: motivoDaSaida(linha, idx.nome), linha: n + 1
        });
        continue;
      }

      var brutoNumero = idx.numero >= 0 ? rotuloDe(linha[idx.numero] || "") : "";
      var num = numeroDe(brutoNumero);
      var matricula = idx.matricula >= 0 ? rotuloDe(linha[idx.matricula] || "") : "";
      if (num === null && brutoNumero && !matricula && !ehRodape(brutoNumero) && /\d/.test(brutoNumero)) {
        num = numeroDe(brutoNumero.replace(/[^0-9]/g, ""));
      }
      /* um id longo demais para ser chamada (INEP, matricula) e guardado no proprio campo */
      if (num !== null && String(brutoNumero).replace(/[^0-9]/g, "").length >= 7) {
        if (!matricula) matricula = brutoNumero;
        num = null;
      }
      if (num === null && !matricula && ehRodape(brutoNumero)) { puladas++; continue; }
      var responsavel = nomeCelula(linha, idx.responsavel);
      var emailBruto = nomeCelula(linha, idx.email);
      var email = "";
      if (emailBruto) {
        if (emailValido(emailBruto)) email = emailBruto.trim().toLowerCase();
        else problemas.push('E-mail "' + emailBruto + '" da linha ' + (n + 1) + ' parece inválido e não foi salvo.');
      }
      var aluno = {
        numero: num,
        nome: nome.replace(/\s+/g, " "),
        matricula: matricula.slice(0, 40),
        tipo: idx.tipo >= 0 ? tipoDe(linha[idx.tipo]) : null,
        responsavel: responsavel.slice(0, 200),
        email_responsavel: email,
        telefone_responsavel: idx.telefone >= 0 ? telefoneLimpo(linha[idx.telefone]) : "",
        linha: n + 1
      };
      if (num !== null && num > maior) maior = num;
      if (num !== null && num > 0 && vistos[num]) {
        problemas.push("Nº " + num + " se repete na linha " + (n + 1) + " (" + aluno.nome + "): só o primeiro ficou na lista.");
        continue;
      }
      /* mesmo nome com numeros de chamada diferentes sao dois alunos de verdade: a escola
         tem homonimos na mesma turma e o numero e a chave. Sem numero, o nome e a unica
         identidade que existe, ai a repeticao continua virando um aluno so. */
      var quem = aluno.nome.toUpperCase().replace(/\s+/g, " ") + "|" + (aluno.matricula || "");
      if (nomesVistos[quem] && !(num > 0)) { puladas++; continue; }
      if (num !== null) vistos[num] = true;
      nomesVistos[quem] = true;
      alunos.push(aluno);
    }

    var semNumero = 0;
    alunos.forEach(function (a) {
      if (a.numero === null || !(a.numero > 0)) {
        maior += 1;
        a.numero = maior;
        a.numeroAutomatico = true;
        semNumero++;
      }
    });
    if (semNumero) {
      problemas.push(semNumero + " linha(s) sem número de chamada: recebam os números seguintes automaticamente.");
    }
    if (saidas) problemas.push(avisoDeSaidas(saidas));
    if (!alunos.length) problemas.push("Nenhum aluno reconhecido nesta lista.");
    alunos.sort(function (a, b) { return a.numero - b.numero; });

    return {
      alunos: alunos,
      fora: fora,
      problemas: problemas,
      cabecalho: cabecalho,
      linhaCabecalho: linhaCabecalho,
      colunas: idx,
      puladas: puladas,
      saidas: saidas,
      total: alunos.length
    };
  }

  /* entre as abas de uma pasta de trabalho, a que mais parece uma lista de chamada */
  function melhorDasListas(itens) {
    var lista = (itens || []).filter(function (i) { return i && i.lista && i.lista.alunos; });
    if (!lista.length) return null;
    var comCabecalho = lista.filter(function (i) { return i.lista.linhaCabecalho >= 0; });
    var pool = comCabecalho.length ? comCabecalho : lista;
    var melhor = pool[0];
    pool.forEach(function (i) {
      if (i.lista.alunos.length > melhor.lista.alunos.length) melhor = i;
    });
    return melhor;
  }

  /* ------------------------------------------- varias turmas de uma escola num arquivo so */

  var COLUNA_TURMA = /^(turma|turmas|classe|sala|serie turma|turma serie|ano turma|turma ano)$/;
  var PARECE_TURMA = /\d|^turma\s+\S/i;
  var ABA_GENERICA = /^(planilha|plan|sheet|folha|pagina|página)\s*\d*$/i;

  function linhasCheias(linhas) {
    return (linhas || []).filter(function (l) {
      return Array.isArray(l) && l.some(function (c) { return /\S/.test(String(c == null ? "" : c)); });
    });
  }

  function semExtensao(nome) {
    return rotuloDe(nome).replace(/\.[a-z0-9]{2,4}$/i, "");
  }

  /* a linha de cabecalho que tem uma coluna "Turma"; diz se ela vem com a coluna de nomes */
  function colunaDeTurma(linhas) {
    var soTurmas = null;
    var cabecalhoDeAlunos = false;
    for (var i = 0; i < Math.min(linhas.length, 25); i++) {
      var linha = linhas[i];
      if (ehCabecalho(linha)) cabecalhoDeAlunos = true;
      for (var c = 0; c < linha.length; c++) {
        if (!COLUNA_TURMA.test(chaveDe(linha[c]))) continue;
        var comNome = linha.some(function (v, j) { return j !== c && papelDaColuna(v) === "nome"; });
        if (comNome) return { linha: i, coluna: c, comNome: true };
        var temValor = linha.some(function (v, j) { return j !== c && PARECE_TURMA.test(rotuloDe(v)); });
        if (!soTurmas && !temValor) soTurmas = { linha: i, coluna: c, comNome: false };
      }
    }
    return cabecalhoDeAlunos ? null : soTurmas;
  }

  /* a secretaria exporta a escola inteira numa aba, com a turma de cada aluno ao lado */
  function separarPorTurma(linhas, onde) {
    var cab = linhas[onde.linha].slice();
    cab[onde.coluna] = "";
    var grupos = [];
    var porChave = Object.create(null);
    var atual = "";
    for (var i = onde.linha + 1; i < linhas.length; i++) {
      var l = linhas[i].slice();
      var v = rotuloDe(l[onde.coluna] || "");
      /* celula mesclada: so a primeira linha da turma traz o nome */
      if (v) atual = v;
      l[onde.coluna] = "";
      if (!atual) continue;
      var k = limpo(atual);
      if (!porChave[k]) {
        porChave[k] = { nome: atual, linhas: [] };
        grupos.push(porChave[k]);
      }
      porChave[k].linhas.push(l);
    }
    return grupos.map(function (g) { return { nome: g.nome, lista: montar([cab].concat(g.linhas)) }; });
  }

  /* so os nomes das turmas, sem alunos: uma coluna "Turma" ou uma coluna solta de "6º A", "7º B" */
  function nomesDeTurmas(linhas, onde) {
    if (onde) {
      return linhas.slice(onde.linha + 1).map(function (l) { return rotuloDe(l[onde.coluna] || ""); })
        .filter(Boolean);
    }
    var valores = [];
    linhas.forEach(function (l) {
      var cheias = l.map(rotuloDe).filter(Boolean);
      if (cheias.length === 1) valores.push(cheias[0]);
    });
    if (!linhas.length || valores.length < linhas.length * 0.8) return null;
    if (valores.length && COLUNA_TURMA.test(chaveDe(valores[0]))) valores.shift();
    var turmas = valores.filter(function (v) { return v.length <= 30 && PARECE_TURMA.test(v); });
    if (!turmas.length || turmas.length < valores.length * 0.8) return null;
    return turmas;
  }

  function avisoProprio(p) {
    return p !== AVISO_SEM_CABECALHO && p !== "Nenhum aluno reconhecido nesta lista." &&
      !/(ficou|ficaram) de fora\.$/.test(p);
  }

  /* cada aba (ou arquivo) vira uma ou mais turmas; o nome da escola nao precisa estar no arquivo */
  function turmasDaPasta(itens) {
    var turmas = [];
    var ignoradas = [];
    var repetidas = [];
    var porNome = Object.create(null);
    var saidas = 0;
    var abasPorArquivo = Object.create(null);
    (itens || []).forEach(function (it) {
      if (!linhasCheias(it.linhas).length) return;
      var arq = it.arquivo || "";
      abasPorArquivo[arq] = (abasPorArquivo[arq] || 0) + 1;
    });

    function guardar(nome, alunos, problemas, fonte, saiu, fora) {
      nome = rotuloDe(nome).slice(0, 120);
      var k = limpo(nome);
      if (!k) return;
      if (porNome[k]) {
        repetidas.push(nome);
        return;
      }
      saidas += saiu || 0;
      porNome[k] = true;
      turmas.push({ nome: nome, alunos: alunos, problemas: problemas.filter(avisoProprio),
        saidas: saiu || 0, fora: fora || [], fonte: fonte });
    }

    (itens || []).forEach(function (it) {
      var linhas = linhasCheias(it.linhas);
      if (!linhas.length) return;
      var rotulo = rotuloDe(it.rotulo);
      var onde = colunaDeTurma(linhas);
      if (onde && onde.comNome) {
        separarPorTurma(linhas, onde).forEach(function (g) {
          if (g.lista.alunos.length || g.lista.saidas) {
            guardar(g.nome, g.lista.alunos, g.lista.problemas, rotulo, g.lista.saidas, g.lista.fora);
          }
        });
        return;
      }
      var nomes = nomesDeTurmas(linhas, onde);
      if (nomes) {
        nomes.forEach(function (n) { guardar(n, [], [], rotulo, 0, []); });
        return;
      }
      var lista = montar(linhas);
      if (!lista.alunos.length && !lista.saidas) {
        ignoradas.push(rotulo);
        return;
      }
      var nome = rotulo;
      if (!it.arquivo || rotulo === it.arquivo) nome = semExtensao(rotulo);
      else if (ABA_GENERICA.test(rotulo) && abasPorArquivo[it.arquivo] === 1) nome = semExtensao(it.arquivo);
      guardar(nome, lista.alunos, lista.problemas, rotulo, lista.saidas, lista.fora);
    });

    return { turmas: turmas, ignoradas: ignoradas, repetidas: repetidas, saidas: saidas };
  }

  global.GabaLista = {
    montar: montar,
    melhorDasListas: melhorDasListas,
    turmasDaPasta: turmasDaPasta,
    papelDaColuna: papelDaColuna,
    ehCabecalho: ehCabecalho,
    numeroDe: numeroDe,
    tipoDe: tipoDe,
    emailValido: emailValido,
    avisoDeSaidas: avisoDeSaidas,
    limpo: limpo
  };
})(typeof window !== "undefined" ? window : globalThis);
