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
    "tipodeprova", "tipo", "componente", "turma", "media", "total", "resultadofinal", "aprovacao",
    "cartuldadematria", "responsavel", "email", "telefone"].forEach(function (k) {
    ROTULOS_DE_DESCARTE[k] = true;
  });

  /* linhas de resumo que as planilhas colocam embaixo da chamada */
  var RODAPE = /^(total|somatorio|media|desvio|variancia|quantidade|numerodealunos?|ndealuno|aprovad|reprovad|assinatura|legenda|instru|observa|disciplina|componente|turma)/i;

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
      problemas.push("A lista não tem linha de cabeçalho: usei a primeira coluna com números como Nº e a coluna de texto mais longo como nome.");
    }
    if (idx.nome < 0) {
      problemas.push("Não encontrei a coluna de nomes. Reordene as colunas ou cole só Nº e Nome.");
      return { alunos: [], problemas: problemas, cabecalho: cabecalho, linhaCabecalho: linhaCabecalho };
    }

    var vistos = {};
    var nomesVistos = {};
    var alunos = [];
    var maior = 0;
    var puladas = 0;
    for (var n = desde; n < linhas.length; n++) {
      var linha = linhas[n];
      var nome = nomeCelula(linha, idx.nome);
      if (!nome || nome.length < 3) { puladas++; continue; }
      var chaveNome = limpo(nome);
      if (ROTULOS_DE_DESCARTE[chaveNome] || ehRodape(nome) || pareceContato(nome)) { puladas++; continue; }

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
      var quem = aluno.nome.toUpperCase().replace(/\s+/g, " ") + "|" + (aluno.matricula || "");
      if (nomesVistos[quem]) { puladas++; continue; }
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
    if (!alunos.length) problemas.push("Nenhum aluno reconhecido nesta lista.");
    alunos.sort(function (a, b) { return a.numero - b.numero; });

    return {
      alunos: alunos,
      problemas: problemas,
      cabecalho: cabecalho,
      linhaCabecalho: linhaCabecalho,
      colunas: idx,
      puladas: puladas,
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

  global.GabaLista = {
    montar: montar,
    melhorDasListas: melhorDasListas,
    papelDaColuna: papelDaColuna,
    ehCabecalho: ehCabecalho,
    numeroDe: numeroDe,
    tipoDe: tipoDe,
    emailValido: emailValido,
    limpo: limpo
  };
})(typeof window !== "undefined" ? window : globalThis);
