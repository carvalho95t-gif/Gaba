/* Gaba — caderno nominal A4: cabecalho, questoes da versao e cartao OMR com geometria do GabaLayout */
/* global GabaLayout, GabaVersoes, GabaQR, QRCode */
(function (global) {
  "use strict";

  var NL = String.fromCharCode(10);
  var LB = new RegExp("[" + String.fromCharCode(13) + String.fromCharCode(10) + "]+", "g");
  var WS = new RegExp("[" + String.fromCharCode(9) + " ]+", "g");
  var NBSP_RE = new RegExp(String.fromCharCode(160), "g");

  /* o aviso miudo da folha de respostas: cabe no cabecalho, as instrucoes longas nao */
  var HINT_PADRAO = "Preencha a bolha inteira com caneta preta ou azul e não rasure. " +
    "Não cubra as marcas dos cantos nem o QR code.";

  /* modelos vistos em provas grandes: mudam o rotulo da questao, o numero de colunas e o texto de instrucoes */
  var MODELOS = {
    escola: {
      nome: "Cabeçalho da escola",
      colunas: 1,
      estiloNumero: "numero",
      rotuloInstrucoes: "Instruções",
      instrucoes: "Leia cada questão com atenção e marque uma única alternativa na folha de respostas. " +
        "Preencha a bolha inteira com caneta preta ou azul; rasura ou marcação dupla anula a resposta."
    },
    enem: {
      nome: "ENEM (duas colunas, Questão 01)",
      colunas: 2,
      estiloNumero: "questao",
      rotuloInstrucoes: "LEIA ATENTAMENTE AS INSTRUÇÕES SEGUINTES:",
      instrucoes: "Você recebe neste caderno a folha de respostas e as questões da prova.\n" +
        "O tempo de resposta inclui o tempo de marcação da folha de respostas.\n" +
        "Marque uma única alternativa em cada questão; marcações duplas, rasuradas ou em branco serão anuladas.\n" +
        "O caderno de prova só pode ser levado no último dia do exame, após o término da prova."
    },
    paebes: {
      nome: "PAEBES / SAEB (cartão na capa, descritores)",
      colunas: 1,
      estiloNumero: "questao",
      rotuloInstrucoes: "INSTRUÇÕES:",
      hint: "Não destaque esta folha de respostas. " + HINT_PADRAO,
      instrucoes: "Não destaque a folha de respostas deste caderno de teste.\n" +
        "Leia a questão com atenção e marque uma única alternativa: A, B, C ou D.\n" +
        "Use caneta preta ou azul e não rasure. As marcas dos cantos e o QR code não podem ser cobertos."
    },
    ama: {
      nome: "AMA / SEDU-ES (folha de respostas na capa)",
      colunas: 1,
      estiloNumero: "questao",
      rotuloInstrucoes: "INSTRUÇÕES:",
      hint: "A folha de respostas é esta primeira página. Não a destaque. " + HINT_PADRAO,
      instrucoes: "A sua folha de respostas está na primeira página deste caderno. Não a destaque.\n" +
        "Para cada questão, preencha completamente a bolha da alternativa escolhida com caneta preta ou azul.\n" +
        "Questões com mais de uma marcação, com marcação incorrigível ou sem marcação não recebem ponto."
    }
  };

  function mod(name) {
    var m = global[name];
    if (!m) throw new Error("Modulo " + name + " nao carregou (verifique a ordem dos scripts).");
    return m;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function strip(s) {
    return String(s == null ? "" : s).replace(NBSP_RE, " ").replace(LB, " ").replace(WS, " ").trim();
  }

  function totalDa(prova) {
    return prova.quantidade_questoes || (prova.questoes || []).length || (prova.gabarito || []).length || 10;
  }

  function nAlternativas(prova) {
    var p = (prova.questoes || [])[0];
    if (p && p.alternativas && p.alternativas.length) return p.alternativas.length;
    return prova.alternativas || 5;
  }

  function layoutDa(prova, opts) {
    opts = opts || {};
    var L = mod("GabaLayout");
    var layout = L.compute(opts.total || totalDa(prova), opts.alternativas || nAlternativas(prova));
    var problemas = layout.problemas();
    if (problemas.length) throw new Error("Layout A4 invalido: " + problemas.join("; "));
    return layout;
  }

  function fiduciaisHtml(layout) {
    var s = layout.fiducialMm;
    return layout.fiducialCenters().map(function (c) {
      return '<div class="fiducial fid-' + c.name + '" style="left:' + (c.x - s / 2) + "mm;top:" + (c.y - s / 2) +
        "mm;width:" + s + "mm;height:" + s + 'mm"><i></i></div>';
    }).join("");
  }

  function cartaoHtml(layout) {
    var g = layout.grid;
    var largura = (g.cols - 1) * g.colGapMm + g.colContentMm;
    var altura = (g.questionsPerCol - 1) * g.rowGapMm + g.bubbleMm;
    var linhas = "";
    for (var q = 0; q < layout.total; q++) {
      var cr = layout.colRow(q);
      linhas += '<div class="folha-q" style="left:' + (g.xMm + cr.col * g.colGapMm) + "mm;top:" +
        (g.yMm + cr.row * g.rowGapMm) + "mm;height:" + g.rowGapMm + 'mm">';
      linhas += '<span class="folha-q-n" style="width:' + g.numberWidthMm + 'mm">' + (q + 1) + "</span>";
      for (var o = 0; o < layout.options; o++) {
        var left = g.numberWidthMm + o * g.optionGapMm;
        linhas += '<span class="folha-bubble" style="left:' + left + "mm;width:" + g.bubbleMm + "mm;height:" + g.bubbleMm + 'mm"></span>';
        linhas += '<span class="folha-bubble-letra" style="left:' + left + "mm;top:" + g.bubbleMm +
          "mm;width:" + g.bubbleMm + 'mm">' + layout.optionLetters[o] + "</span>";
      }
      linhas += "</div>";
    }
    var tituloTopo = Math.max(layout.qr.yMm + layout.qr.hMm + 1, g.yMm - 7);
    return '<section class="folha-cartao" style="width:' + largura + "mm;height:" + (altura + g.rowGapMm * 2) + 'mm">' +
      '<p class="folha-cartao-titulo" style="left:' + g.xMm + "mm;top:" + tituloTopo + 'mm">Cart&#227;o de respostas</p>' +
      '<div class="folha-cartao-area">' + linhas + "</div></section>";
  }

  function estiloDe(cfg) {
    var c = cfg.cabecalho || {};
    return c.estiloNumero || cfg.estiloNumero || modeloDe(cfg).estiloNumero || "numero";
  }

  function colunasDe(cfg) {
    return Number(cfg.colunas) === 2 ? 2 : 1;
  }

  function modeloDe(cfg) {
    var c = cfg.cabecalho || {};
    return MODELOS[c.modelo || cfg.modelo] || MODELOS.escola;
  }

  function textoDe(v) {
    return String(v == null ? "" : v).trim();
  }

  /* o que o professor digitou ganha do que veio na prova, que ganha do modelo escolhido */
  function cabecalhoCfg(cfg, prova) {
    var c = cfg.cabecalho || {};
    var m = modeloDe(cfg);
    function escolha(valor, padrao) {
      var preenchido = textoDe(valor);
      return preenchido || textoDe(padrao);
    }
    return {
      modelo: m,
      rede: escolha(c.rede, cfg.rede),
      escola: escolha(c.escola, cfg.escola),
      mantida: escolha(c.mantida, cfg.mantida),
      titulo: escolha(c.titulo, escolha(cfg.titulo, prova && prova.titulo)) || "Prova",
      disciplina: escolha(c.disciplina, escolha(cfg.disciplina, prova && prova.disciplina)),
      professor: escolha(c.professor, cfg.professor),
      turma: escolha(c.turma, cfg.turma),
      turno: escolha(c.turno, cfg.turno),
      ano: escolha(c.ano, cfg.ano),
      bimestre: escolha(c.bimestre, cfg.bimestre),
      data: escolha(c.data, cfg.data),
      instrucoes: escolha(c.instrucoes, escolha(cfg.instrucoes, m.instrucoes)),
      rotuloInstrucoes: escolha(c.rotuloInstrucoes, escolha(cfg.rotuloInstrucoes, m.rotuloInstrucoes)),
      hint: escolha(c.hint, escolha(cfg.hint, m.hint)) || HINT_PADRAO
    };
  }

  /* os tomos que nao podem ser partidos: cabeca, comando e cada alternativa sozinha.
     e aqui que a questao gigante se divide quando nao cabe em uma coluna. */
  function pedacosDe(q, comDescritores, estilo) {
    var p = [];
    var cabeca = "";
    if (comDescritores && (q.descritor || q.habilidade_bncc)) {
      cabeca += '<p class="folha-desc">' + esc(strip([q.habilidade_bncc, q.descritor].filter(Boolean).join(" | "))) + "</p>";
    }
    if (estilo === "questao") {
      cabeca += '<p class="folha-rotulo"><span class="folha-qnum">Quest&#227;o ' + dois(q.numero) + "</span></p>";
      if (q.enunciado) cabeca += '<div class="folha-texto-base"><p class="folha-enunciado">' + esc(strip(q.enunciado)) + "</p></div>";
    } else {
      cabeca += '<p class="folha-enunciado"><span class="folha-qnum">' + q.numero + ".</span> " + esc(strip(q.enunciado)) + "</p>";
    }
    p.push(cabeca);
    if (q.comando) p.push('<p class="folha-comando">' + esc(strip(q.comando)) + "</p>");
    (q.alternativas || []).forEach(function (a) {
      p.push('<ol class="folha-alt"><li><span class="folha-letra">' + esc(a.letra) + ")</span> " +
        esc(strip(a.texto)) + "</li></ol>");
    });
    return p;
  }

  function rotuloContinua(q, estilo) {
    return estilo === "questao"
      ? '<p class="folha-rotulo folha-continua">Quest&#227;o ' + dois(q.numero) + " (continua)</p>"
      : '<p class="folha-rotulo folha-continua">' + q.numero + ". (continua)</p>";
  }

  /* o fragmento vai do pedaco `de` ate antes de `ate`; do meio pra frente ele diz de onde veio */
  function fragmentoHtml(q, de, ate, comDescritores, estilo) {
    var ped = pedacosDe(q, comDescritores, estilo);
    return '<div class="folha-questao" data-num="' + esc(q.numero) + '">' +
      (de > 0 ? rotuloContinua(q, estilo) : "") +
      ped.slice(de, ate).join(NL) + "</div>";
  }

  function questoesHtml(questoes, de, ate, comDescritores, estilo) {
    var h = "";
    for (var i = de; i < ate && i < questoes.length; i++) {
      var q = questoes[i];
      h += '<div class="folha-questao" data-num="' + esc(q.numero) + '">' +
        pedacosDe(q, comDescritores, estilo).join(NL) + "</div>";
    }
    return h;
  }

  function dois(n) {
    var v = Math.abs(Number(n) || 0);
    return (v < 10 ? "0" : "") + v;
  }

  function instrucoesHtml(c, attrs) {
    var linhas = String(c.instrucoes || "").split(LB).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!linhas.length) return "";
    return "<section " + (attrs || 'class="folha-instrucoes"') + "><h2>" + esc(c.rotuloInstrucoes) + "</h2>" +
      linhas.map(function (s) { return "<p>" + esc(s) + "</p>"; }).join(NL) + "</section>";
  }

  /* o cartao so usa a faixa das proprias linhas: o que sobra entre ele e as marcas de canto e espaco livre */
  function espacoLivreAbaixoDoCartaoMm(layout) {
    var g = layout.grid;
    var fundo = g.yMm + g.questionsPerCol * g.rowGapMm;
    var limite = layout.pageHmm - layout.fiducialInsetMm - layout.fiducialMm - 6;
    return Math.round((limite - fundo) * 10) / 10;
  }

  /* nas provas curtas as instrucoes vao na capa, como no PAEBES e no AMA; nas longas elas ficam no corpo */
  function instrucoesDaCapa(c, layout) {
    var livre = espacoLivreAbaixoDoCartaoMm(layout);
    if (livre < 32) return "";
    var g = layout.grid;
    /* deixa a faixa do resultado do professor livre no pe da folha */
    var altura = Math.max(20, livre - 34);
    return instrucoesHtml(c, 'class="folha-instrucoes folha-instrucoes-capa" style="top:' +
      (g.yMm + g.questionsPerCol * g.rowGapMm + 4) + "mm;max-height:" + altura + 'mm"');
  }

  /* capa: quem aplicou, para quem, caderno de qual tipo e o aviso de marcacao */
  function cabecalhoHtml(cfg, prova, aluno, turmaNome, versao) {
    var c = cabecalhoCfg(cfg, prova);
    var l = [];
    if (c.rede) l.push('<p class="folha-rede">' + esc(c.rede) + "</p>");
    if (c.escola) l.push("<h1>" + esc(c.escola) + "</h1>");
    if (c.mantida) l.push('<p class="folha-rede">' + esc(c.mantida) + "</p>");
    l.push('<p class="folha-titulo"><strong>' + esc([c.titulo, c.disciplina].filter(Boolean).join(" — ")) + "</strong></p>");
    l.push('<p class="folha-meta">' + [
      c.ano ? "Ano/Série: " + esc(c.ano) : "",
      (c.turma || turmaNome) ? "Turma: " + esc(c.turma || turmaNome) : "",
      "Turno: " + (c.turno ? esc(c.turno) : "________"),
      c.bimestre ? esc(c.bimestre) : "",
      c.data ? "Data: " + esc(c.data) : "",
      c.professor ? "Professor(a): " + esc(c.professor) : ""
    ].filter(Boolean).join("  ·  ") + "</p>");
    l.push('<p class="folha-aluno">Aluno(a): <strong>' + esc(aluno.nome || "") + "</strong>" +
      (aluno.numero != null && aluno.numero !== "" ? "  ·  nº " + esc(aluno.numero) : "") +
      (aluno.matricula ? "  ·  matrícula " + esc(aluno.matricula) : "") + "</p>");
    l.push('<p class="folha-assina">Assinatura do(a) estudante: <span class="folha-linha"></span>' +
      '  Nota: <span class="folha-linha folha-linha-nota"></span></p>');
    l.push('<p class="folha-tipo">Caderno <strong>' + esc(versao.rotulo || "UNICO") + "</strong>" +
      "  ·  código " + esc(versao.codigo || "") + "  ·  " +
      (versao.embaralhouQuestoes ? "questões embaralhadas" : "ordem original") +
      (versao.embaralhouAlternativas ? " e alternativas" : "") +
      "  ·  " + (versao.gabarito || []).length + " questões</p>");
    l.push('<p class="folha-hint">' + esc(c.hint) + "</p>");
    return '<header class="folha-cabecalho">' + l.join(NL) + "</header>";
  }

  /* cabecalho fino das paginas de questoes: nao repete a escola, so amarra a folha ao aluno */
  function cabecalhoFinoHtml(cfg, prova, aluno, versao, ctx) {
    var c = cabecalhoCfg(cfg, prova);
    return '<header class="folha-cabecalho folha-cabecalho-fino"><p>' +
      [esc(c.titulo), esc(aluno.nome || ""), "Caderno " + esc(versao.rotulo || "UNICO") +
        " (" + esc(versao.codigo || "") + ")", "p. " + ctx.pagina + "/" + ctx.totalPaginas]
        .filter(Boolean).join("  ·  ") + "</p></header>";
  }

  function rodapeHtml(aluno, versao, ctx) {
    return '<footer class="folha-rodape">' + esc(aluno.nome || "") + " — caderno " + esc(versao.rotulo || "UNICO") +
      " — p." + ctx.pagina + (ctx.totalPaginas ? "/" + ctx.totalPaginas : "") + "</footer>";
  }

  function variaveis(cfg, layout) {
    return "--fid:" + layout.fiducialMm + "mm;--qr-x:" + layout.qr.xMm + "mm;--qr-y:" + layout.qr.yMm +
      "mm;--qr-w:" + layout.qr.wMm + "mm;--qr-h:" + layout.qr.hMm + "mm;--bubble:" + layout.grid.bubbleMm +
      "mm;--colunas:" + colunasDe(cfg) + ";";
  }

  function abrirFolha(tipo, aluno, versao, ctx, cfg, layout) {
    var QR = mod("GabaQR");
    return '<article class="folha-a4 folha-' + tipo + '" data-aluno="' + esc(QR.idAluno(aluno) || aluno.id || "") +
      '" data-versao="' + esc(versao.codigo || "") + '" data-pagina="' + ctx.pagina + '"' +
      ' data-total="' + ctx.totalPaginas + '" data-tipo="' + tipo + '" style="' + variaveis(cfg, layout) + '">';
  }

  /* ---------------- corpo fechado por medida ----------------
     .folha-area tem altura fixa e corta o que passa dela. entregue ao CSS em colunas, o
     texto a mais do ultimo pedaco morre no papel sem aviso: entao medimos cada pedaco na
     largura real da coluna e fecho as colunas na mao. */
  var MARGEM_QUESTAO_MM = 3.5;
  var ALTURA_COLUNA_MM = 248;
  var LARGURA_CORPO_MM = 186;
  var GUTTER_MM = 7;
  var FOLGA_IMPRESSAO = 2;

  /* itens: [{ i, pedacos:[mm] }] — alturas: [mm da coluna na 1a pagina, mm nas demais]
     buraco: fracao da coluna que ainda pode ficar em branco antes de valer o corte da questao.
     minimo: pedacos minimos de cada lado do corte — controle de viuva, para nao largar so uma linha. */
  function empacotar(itens, op) {
    op = op || {};
    var colunas = Math.max(1, Number(op.colunas) || 1);
    var alturas = (op.alturas && op.alturas.length ? op.alturas : [Number(op.altura) || ALTURA_COLUNA_MM])
      .map(function (v) { return Number(v) > 0 ? Number(v) : ALTURA_COLUNA_MM; });
    var margem = op.margem == null ? MARGEM_QUESTAO_MM : Number(op.margem);
    var rotulo = Number(op.rotuloContinua) || 0;
    var max = Math.max(0, Number(op.maxPorPagina) || 0);
    var minimo = Math.max(1, Number(op.minimoPedacos) || 2);
    var buraco = op.buraco == null ? 0.18 : Number(op.buraco);
    var maiorAltura = Math.max.apply(null, alturas);
    function alturaDa(pagina) { return alturas[Math.min(pagina, alturas.length - 1)]; }
    var paginas = [];
    var atual;
    var c, y;
    function abrir() { atual = { colunas: [[]], questoes: 0 }; c = 0; y = 0; }
    function fechar() { paginas.push(atual); abrir(); }
    function avanca() {
      if (c + 1 < colunas) { c++; y = 0; atual.colunas.push([]); } else fechar();
    }
    function aloca(f) { atual.colunas[c].push(f); if (f.de === 0) atual.questoes++; }
    function inteira(it, ped) {
      aloca({ i: it.i, de: 0, ate: ped.length });
      y += ped.reduce(soma, 0) + margem;
    }
    function quantosCabem(ped, em) {
      var s = margem, n = 0;
      for (var k = 0; k < ped.length; k++) {
        if (s + ped[k] > em) break;
        s += ped[k]; n++;
      }
      return n;
    }
    function alturaProxima() {
      var pi = paginas.length + (c + 1 < colunas ? 0 : 1);
      return alturas[Math.min(pi, alturas.length - 1)];
    }
    var estouradas = [];
    /* o corte que aproveita o resto da coluna: e o que nao deixa abrir um buraco branco no meio do caderno.
       teto = ate onde a cabeca pode ir; o que passa de la e para a coluna seguinte com o rotulo de continua.
       fragmento de uma linha so no pe da coluna e viuva: ele inteiro desce para a coluna seguinte. */
    function cortar(it, ped, teto) {
      function avisaSeGigante(h) {
        if (h > alturaDa(paginas.length) && estouradas.indexOf(it.i + 1) < 0) estouradas.push(it.i + 1);
      }
      var k = 0;
      while (k < ped.length) {
        var de = k;
        var yInicio = y;
        var precisa = ped[de] + margem + (de === 0 ? 0 : rotulo);
        /* coluna vazia so muda de pagina quando a proxima oferece mais altura: senao seria laco sem fim */
        if (y + precisa > alturaDa(paginas.length) && (y > 0 || alturaProxima() > alturaDa(paginas.length))) avanca();
        var aberta = { i: it.i, de: de, ate: de + 1 };
        aloca(aberta);
        y += precisa;
        avisaSeGigante(ped[de]);
        k++;
        while (k < ped.length) {
          /* o teto so segura a cabeca: o resto da questao ja esta na rua e pode fluir */
          if (teto != null && de === 0 && k >= teto) break;
          if (y + ped[k] > alturaDa(paginas.length)) break;
          aberta.ate = k + 1;
          y += ped[k];
          avisaSeGigante(ped[k]);
          k++;
        }
        if (k < ped.length && aberta.ate - aberta.de < minimo && yInicio > 0) {
          atual.colunas[c].pop();
          if (de === 0) atual.questoes--;
          y = yInicio;
          avanca();
          k = de;
        }
      }
    }
    abrir();
    (itens || []).forEach(function (it) {
      var ped = (it.pedacos || []).map(function (v) { return Number(v) || 0; });
      if (!ped.length) return;
      var total = ped.reduce(soma, 0) + margem;
      if (total > maiorAltura) return cortar(it, ped);
      if (max && atual.questoes >= max) fechar();
      var altura = alturaDa(paginas.length);
      if (y + total <= altura) return inteira(it, ped);
      /* nao cabe no resto desta coluna: parte para fechar o buraco, sem deixar viuva de nenhum lado */
      var n = Math.min(quantosCabem(ped, altura - y), ped.length - minimo);
      if (y > 0 && (altura - y) / altura > buraco && n >= minimo) return cortar(it, ped, n);
      /* pagina mais curta (a 1a, com a caixa de instrucoes) nao segura a questao: ela inteira muda de
         pagina. melhor uma folha so com cabecalho do que alternativa cortada no papel. */
      if (total > altura) fechar(); else avanca();
      if (y + total <= alturaDa(paginas.length)) inteira(it, ped);
      else cortar(it, ped);
    });
    if (atual.colunas.some(function (col) { return col.length; }) || !paginas.length) fechar();
    return { paginas: paginas, estouradas: estouradas };
  }
  function soma(a, b) { return a + b; }

  function colunasDoCorpoHtml(ctx) {
    var estilo = estiloDe(ctx.cfg);
    var comDesc = ctx.cfg.comDescritores === true;
    return '<div class="folha-area folha-area--colunas">' + ctx.corpo.colunas.map(function (col) {
      return '<section class="folha-fluxo folha-coluna">' + col.map(function (f) {
        return fragmentoHtml(ctx.questoes[f.i], f.de, f.ate, comDesc, estilo);
      }).join(NL) + "</section>";
    }).join(NL) + "</div>";
  }

  /* a faixa de resultado mora no pe da folha; no cartao de 90 questoes ela cobriria as ultimas
     bolhas, entao so entra quando a grade termina acima dela */
  function resultadoCabe(layout) {
    var g = layout && layout.grid;
    return Boolean(g) && Number(g.yMm) + Number(g.questionsPerCol) * Number(g.rowGapMm) <= 248;
  }

  /* faixa de uso do professor no pe da folha de respostas, no lugar do vazio que sobrava */
  function resultadoCapaHtml(versao) {
    var total = (versao.gabarito || []).length;
    return '<section class="folha-resultado">' +
      "<h2>Resultado &#8212; uso do professor</h2>" +
      '<p>Acertos: <span class="folha-linha folha-linha-acertos"></span> de ' + total +
      '  &#183;  Nota: <span class="folha-linha folha-linha-nota"></span></p>' +
      '<p>Assinatura do(a) professor(a): <span class="folha-linha"></span>' +
      '  &#183;  Data: <span class="folha-linha folha-linha-data"></span></p>' +
      "</section>";
  }

  /* pagina 1: marcas de canto + QR + cabecalho completo + cartao OMR. So ela e legivel pelo scanner. */
  function paginaRespostaHtml(prova, aluno, ctx) {
    return abrirFolha("resposta", aluno, ctx.versao, ctx, ctx.cfg, ctx.layout) +
      fiduciaisHtml(ctx.layout) +
      '<img class="folha-qr" src="' + ctx.qr + '" alt="QR ' + esc(ctx.payload) + '">' +
      cabecalhoHtml(ctx.cfg, prova, aluno, ctx.turmaNome, ctx.versao) +
      cartaoHtml(ctx.layout) +
      (ctx.instrucoesDaCapa || "") +
      (resultadoCabe(ctx.layout) ? resultadoCapaHtml(ctx.versao) : "") +
      rodapeHtml(aluno, ctx.versao, ctx) +
      "</article>";
  }

  /* pagina de corpo: sem marca de canto e sem QR, para o leitor nunca confundir com a folha de respostas */
  function paginaQuestoesHtml(prova, aluno, ctx) {
    var c = cabecalhoCfg(ctx.cfg, prova);
    var area = ctx.corpo ? colunasDoCorpoHtml(ctx) : '<div class="folha-area"><section class="folha-fluxo">' +
      questoesHtml(ctx.questoes, ctx.de, ctx.ate, ctx.cfg.comDescritores === true, estiloDe(ctx.cfg)) +
      "</section></div>";
    return abrirFolha("questoes", aluno, ctx.versao, ctx, ctx.cfg, ctx.layout) +
      (ctx.semResposta ? cabecalhoHtml(ctx.cfg, prova, aluno, ctx.turmaNome, ctx.versao) :
        cabecalhoFinoHtml(ctx.cfg, prova, aluno, ctx.versao, ctx)) +
      (ctx.primeiraDeQuestoes && !ctx.instrucoesDaCapa ? instrucoesHtml(c) : "") +
      area +
      rodapeHtml(aluno, ctx.versao, ctx) +
      "</article>";
  }

  function paginaBrancoHtml(aluno, ctx) {
    return abrirFolha("branco", aluno, ctx.versao, ctx, ctx.cfg, ctx.layout) + "</article>";
  }

  /* ordem do caderno: folha de resposta, corpo a partir dai, e o bloco fechado em pares para frente e verso */
  function planoDoCaderno(cfg, total, paginasDeCorpo) {
    var porPagina = Math.max(1, cfg.questoesPorPagina || 10);
    var corpo;
    if (cfg.comQuestoes === false || !total) corpo = 0;
    else corpo = paginasDeCorpo == null ? Math.ceil(total / porPagina) : paginasDeCorpo;
    var plano = [];
    if (cfg.comCartao !== false) plano.push("resposta");
    for (var i = 0; i < corpo; i++) plano.push("questoes");
    if (cfg.ultimaEmBranco !== false) {
      /* uma unica folha em branco no fim: serve de protecao no verso da ultima pagina de questoes */
      plano.push("branco");
    }
    if (!plano.length) plano.push("resposta");
    return plano;
  }

  function cfgDe(opts) {
    return Object.assign({
      escola: "", turma: "", data: "", comQuestoes: true, comCartao: true,
      questoesPorPagina: 10, ultimaEmBranco: true, colunas: 1, modelo: "escola"
    }, opts.config || {});
  }

  function assinaturaDa(cfg) {
    var c = cfg.cabecalho || {};
    return [colunasDe(cfg), estiloDe(cfg), cfg.comDescritores === true ? "desc" : "-",
      c.modelo || cfg.modelo || "escola", semRespostaDa(cfg) ? "semcartao" : "cartao"].join("|");
  }

  function semRespostaDa(cfg) { return cfg.comCartao === false; }

  /* as alturas medidas valem para a prova base: a versao troca a ordem das questoes e tambem a
     ordem das alternativas. sem reordenar as alternativas pela origem, o empacotador acha que
     uma alternativa curta tem a altura de outra e a coluna estoura no papel. */
  function itensMedidos(questoes, medidas) {
    var out = [];
    for (var i = 0; i < questoes.length; i++) {
      var base = Math.max(0, (Number(questoes[i].numero_original) || i + 1) - 1);
      var ped = medidas.pedacos && medidas.pedacos[base];
      if (!ped || !ped.length) return null;
      var alts = questoes[i].alternativas || [];
      var prefixo = ped.length - alts.length;
      /* medida antiga ou de teste pode nao cobrir todas as alternativas: nao da para reordenar */
      if (prefixo < 0) { out.push({ i: i, pedacos: ped }); continue; }
      var ordem = ped.slice(0, prefixo);
      for (var k = 0; k < alts.length; k++) {
        var idx = Number(alts[k].index_original);
        var de = idx >= 0 && idx < alts.length && prefixo + idx < ped.length ? prefixo + idx : prefixo + k;
        ordem.push(ped[de] || 0);
      }
      out.push({ i: i, pedacos: ordem });
    }
    return out;
  }

  /* caderno do aluno: folha de resposta na pagina 1, questoes a partir da 2, ultima pagina em branco */
  async function cadernoHtml(prova, aluno, opts) {
    opts = opts || {};
    var cfg = cfgDe(opts);
    var versao = versaoDo(prova, aluno, opts);
    var questoes = mod("GabaVersoes").questoesDaVersao(prova, versao);
    var medidas = opts.medidas && opts.medidas.assinatura === assinaturaDa(cfg) ? opts.medidas : null;
    var empacotado = medidas ? empacotar(itensMedidos(questoes, medidas), {
      colunas: colunasDe(cfg), alturas: medidas.alturas, rotuloContinua: medidas.rotuloContinua,
      maxPorPagina: cfg.questoesPorPagina
    }) : null;
    var corpo = empacotado ? empacotado.paginas : null;
    var plano = planoDoCaderno(cfg, questoes.length, corpo ? corpo.length : null);
    var payload = opts.payload || mod("GabaQR").encode(prova, aluno, versao);
    var qr = opts.qrDataUrl || (await qrDataUrl(payload));
    var layout = layoutDa(prova, opts);
    var semResposta = semRespostaDa(cfg);
    var base = {
      cfg: cfg, versao: versao, layout: layout, payload: payload, qr: qr,
      turmaNome: opts.turmaNome || "", questoes: questoes, totalPaginas: plano.length,
      semResposta: semResposta,
      semQuestoes: plano.indexOf("questoes") < 0,
      instrucoesDaCapa: semResposta ? "" : instrucoesDaCapa(cabecalhoCfg(cfg, prova), layout)
    };
    var partes = [];
    var de = 0;
    var nCorpo = 0;
    var porPagina = Math.max(1, cfg.questoesPorPagina || 10);
    for (var p = 0; p < plano.length; p++) {
      var ctx = Object.assign({}, base, { pagina: p + 1 });
      var tipo = plano[p];
      if (tipo === "resposta") partes.push(paginaRespostaHtml(prova, aluno, ctx));
      else if (tipo === "questoes") {
        var paginaCorpo = { primeiraDeQuestoes: nCorpo === 0 };
        if (corpo) paginaCorpo.corpo = corpo[nCorpo];
        else { paginaCorpo.de = de; paginaCorpo.ate = de + porPagina; de += porPagina; }
        nCorpo++;
        partes.push(paginaQuestoesHtml(prova, aluno, Object.assign(ctx, paginaCorpo)));
      } else partes.push(paginaBrancoHtml(aluno, ctx));
    }
    return {
      html: partes.join(NL), versao: versao, paginas: partes.length, plano: plano, payload: payload,
      corpo: corpo, estouradas: empacotado ? empacotado.estouradas : []
    };
  }

  function mmDePx(px) { return (Number(px) || 0) * 25.4 / 96; }

  /* medir com a fonte de fallback e imprimir com a fonte certa da o corte que ninguem ve: a
     metrica muda por linha. o teto e para a fonte travada nao segurar a previa indefinidamente. */
  function fontesProntas(tetoMs) {
    var f = typeof document !== "undefined" && document.fonts && document.fonts.ready;
    if (!f) return Promise.resolve(false);
    return Promise.race([
      f.then(function () { return true; }),
      new Promise(function (r) { setTimeout(function () { r(false); }, tetoMs || 4000); })
    ]);
  }

  /* o empacotador fecha a coluna pela medida; isto confere se o papel desenhado bateu com a
     medida. sobra de coluna nao e problema — corte de linha alternativa, sim. */
  var TOLERANCIA_MM = 0.6;

  /* estas caixas tem altura propria e overflow hidden: o texto que passa delas nao empurra nada,
     ele simplesmente nao sai no papel. por isso a area de colunas nunca fica menor por causa
     delas e o gate das colunas sozinho deixaria o nome do aluno fora do PDF sem um aviso. */
  var CAIXAS_FIXAS = ".folha-cabecalho:not(.folha-cabecalho-fino), .folha-instrucoes, " +
    ".folha-rodape, .folha-resultado";
  var NOMES_CAIXA = {
    "folha-cabecalho": "cabecalho de identificacao",
    "folha-instrucoes": "bloco de instrucoes",
    "folha-rodape": "rodape da folha",
    "folha-resultado": "faixa do professor"
  };
  function nomeDaCaixa(el) {
    var chaves = Object.keys(NOMES_CAIXA);
    for (var i = 0; i < chaves.length; i++) {
      if (el.classList && el.classList.contains(chaves[i])) return NOMES_CAIXA[chaves[i]];
    }
    return "caixa de texto do papel";
  }
  function sobraDaCaixa(caixa) {
    return mmDePx(caixa.scrollHeight - caixa.clientHeight);
  }

  /* degraus de compactacao: a --cab reduz corpo e espaco das caixas fixas (ver style.css). o
     primeiro degrau que fecha a caixa ganha; se nenhum fecha, fica o menor e o gate denuncia. */
  var DEGRAUS_COMPACTAR = [1, 0.86, 0.76, 0.66];
  function compactarCaixas(root) {
    var ajustadas = 0;
    [].slice.call((root || document).querySelectorAll(CAIXAS_FIXAS)).forEach(function (caixa) {
      if (sobraDaCaixa(caixa) <= TOLERANCIA_MM) return;
      for (var d = 1; d < DEGRAUS_COMPACTAR.length; d++) {
        caixa.classList.remove("folha-compacta-" + (d - 1));
        caixa.classList.add("folha-compacta-" + d);
        if (sobraDaCaixa(caixa) <= TOLERANCIA_MM) { ajustadas++; return; }
      }
    });
    return ajustadas;
  }

  function ondeDaFolha(folha, ai) {
    var rotulos = [];
    if (folha) {
      var versao = folha.getAttribute("data-versao");
      var pagina = folha.getAttribute("data-pagina");
      if (versao) rotulos.push("tipo " + versao);
      if (pagina) rotulos.push("pag " + pagina);
    }
    return rotulos.length ? rotulos.join(" ") : "folha " + (ai + 1);
  }

  function conferirEncaixe(root) {
    var raiz = root || document;
    var problemas = [];
    var areas = [].slice.call(raiz.querySelectorAll(".folha-a4 .folha-area"));
    areas.forEach(function (area, ai) {
      var folha = area.closest(".folha-a4");
      var caixa = area.getBoundingClientRect();
      var onde = ondeDaFolha(folha, ai);
      var num = function (el) {
        var q = el.closest(".folha-questao");
        return q ? (q.getAttribute("data-num") || "?") : "?";
      };
      [].slice.call(area.querySelectorAll(".folha-enunciado, .folha-comando, .folha-alt li, .folha-rotulo, .folha-desc")).forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (!r.height) return;
        var folga = TOLERANCIA_MM * 96 / 25.4;
        if (r.bottom > caixa.bottom + folga) {
          problemas.push(onde + ": linha da questao " + num(el) + " passa " +
            mmDePx(r.bottom - caixa.bottom).toFixed(1) + " mm do fundo da coluna");
        }
        /* um <p> de bloco nunca alarga o proprio retangulo: a palavra que nao quebra vaza para
           fora sem mexer no right. o que denuncia o vazamento e o scrollWidth, nao o rect. */
        var vaza = Math.max(r.right - caixa.right, el.scrollWidth - el.clientWidth);
        if (vaza > folga) {
          problemas.push(onde + ": texto da questao " + num(el) + " passa " + mmDePx(vaza).toFixed(1) +
            " mm da borda direita da coluna" + (/(https?:|https:|www\.|[A-Za-z0-9+/=]{24,})/.test(el.textContent || "") ?
              " (palavra longa sem espaco: quebre com espaco ou barra)" : ""));
        }
      });
      if (area.scrollHeight * 25.4 / 96 > mmDePx(area.clientHeight) + TOLERANCIA_MM) {
        problemas.push(onde + ": sobra " + mmDePx(area.scrollHeight - area.clientHeight).toFixed(1) +
          " mm de texto cortado pelo limite da area");
      }
    });

    /* as caixas fixas: depois de compactar, o que ainda passa do buraco da caixa esta perdido */
    [].slice.call(raiz.querySelectorAll(".folha-a4")).forEach(function (folha, fi) {
      var onde = ondeDaFolha(folha, fi);
      [].slice.call(folha.querySelectorAll(CAIXAS_FIXAS)).forEach(function (caixa) {
        var sobra = sobraDaCaixa(caixa);
        if (sobra <= TOLERANCIA_MM) return;
        var fundo = caixa.getBoundingClientRect().bottom;
        var perdida = "";
        [].slice.call(caixa.querySelectorAll("p, h1, h2, li")).some(function (linha) {
          var r = linha.getBoundingClientRect();
          if (r.height && r.bottom > fundo + TOLERANCIA_MM * 96 / 25.4) {
            perdida = (linha.textContent || "").replace(/\s+/g, " ").trim().substring(0, 48);
            return true;
          }
          return false;
        });
        problemas.push(onde + ": " + nomeDaCaixa(caixa) + " corta " + sobra.toFixed(1) +
          " mm do proprio texto" + (perdida ? ' — perde-se "' + perdida + '"' : "") +
          ". Encurte o que foi digitado nos campos do cabecalho.");
      });
    });
    return problemas;
  }

  /* mede no navegador quanto cada tomo pede na largura real da coluna e quanto de coluna cada
     pagina tem. sem isso o corpo ia para o CSS em colunas e o fim da ultima alternativa sumia. */
  async function medirCorpo(prova, questoes, opts) {
    opts = opts || {};
    var host = opts.medidor || (typeof document !== "undefined" ? document.getElementById("print-medidor") : null);
    if (!host || !(questoes || []).length) return null;
    await fontesProntas();
    var cfg = cfgDe(opts);
    var layout = layoutDa(prova, opts);
    var versao = opts.versao || versaoDo(prova, opts.aluno || {}, opts);
    var aluno = opts.aluno || { nome: "" };
    var c = cabecalhoCfg(cfg, prova);
    var colunas = colunasDe(cfg);
    var estilo = estiloDe(cfg);
    var comDesc = cfg.comDescritores === true;
    var capa = semRespostaDa(cfg) ? "" : instrucoesDaCapa(c, layout);
    function sonda(pagina, comInstrucoes, corpo) {
      var vazio = "";
      for (var i = 0; i < colunas; i++) vazio += '<section class="folha-fluxo folha-coluna"></section>';
      var ctx = { pagina: pagina, totalPaginas: 2, versao: versao, cfg: cfg, layout: layout };
      return abrirFolha("questoes", aluno, versao, ctx, cfg, layout) +
        (semRespostaDa(cfg) && pagina === 1 ? cabecalhoHtml(cfg, prova, aluno, opts.turmaNome || "", versao) :
          cabecalhoFinoHtml(cfg, prova, aluno, versao, ctx)) +
        (comInstrucoes && !capa ? instrucoesHtml(c) : "") +
        '<div class="folha-area folha-area--colunas">' + (corpo || vazio) + "</div>" +
        rodapeHtml(aluno, versao, ctx) + "</article>";
    }
    host.innerHTML = sonda(1, true) + sonda(2, false);
    var areas = host.querySelectorAll(".folha-area");
    if (areas.length < 2) return null;
    var primeira = mmDePx(areas[0].clientHeight);
    var demais = mmDePx(areas[1].clientHeight);
    var coluna = areas[0].querySelector(".folha-coluna");
    var largura = coluna ? mmDePx(coluna.getBoundingClientRect().width) : LARGURA_CORPO_MM;
    var pilha = questoes.map(function (q) {
      return '<div class="folha-questao">' + pedacosDe(q, comDesc, estilo).map(function (p) {
        return '<div class="folha-sonda">' + p + "</div>";
      }).join(NL) + "</div>";
    }).join(NL) + '<div class="folha-questao"><div class="folha-sonda">' +
      rotuloContinua({ numero: 1 }, estilo) + "</div></div>";
    host.innerHTML = sonda(1, true, '<section class="folha-fluxo folha-coluna" style="flex:0 0 ' +
      largura + "mm;width:" + largura + 'mm">' + pilha + "</section>");
    var blocos = host.querySelectorAll(".folha-questao");
    var pedacos = [];
    var rotuloMm = 0;
    [].slice.call(blocos).forEach(function (el, i) {
      var sd = [].slice.call(el.querySelectorAll(".folha-sonda"));
      var tops = sd.map(function (s) { return s.getBoundingClientRect().top; });
      var alt = sd.map(function (s, k) {
        return mmDePx(k + 1 < tops.length ? tops[k + 1] - tops[k] : s.getBoundingClientRect().bottom - tops[k]);
      });
      if (i === blocos.length - 1) rotuloMm = alt[0] || 0;
      else pedacos.push(alt);
    });
    host.innerHTML = "";
    if (!pedacos.length || primeira <= FOLGA_IMPRESSAO || demais <= FOLGA_IMPRESSAO) return null;
    return {
      /* a coluna medida na tela nao e exatamente a coluna do papel: sobra uma folga para a
         impressora nao amputar a ultima linha que na tela coube por um fio */
      alturas: [primeira - FOLGA_IMPRESSAO, demais - FOLGA_IMPRESSAO],
      larguraColunaMm: largura, pedacos: pedacos,
      rotuloContinua: rotuloMm, assinatura: assinaturaDa(cfg)
    };
  }

  /* quatro modulos de folga em volta: sem zona de silencio o leitor emenda o codigo no que
     estiver ao lado, e a largura exata do modulo evita a linha escura que o redesenho puxa */
  var ZONA_SILENCIO = 4;

  function qrDataUrl(text) {
    var Q = global.QRCode;
    if (!Q || typeof Q.toDataURL !== "function") {
      return Promise.reject(new Error("Biblioteca QRCode nao carregou."));
    }
    var opt = { margin: ZONA_SILENCIO, errorCorrectionLevel: "M" };
    var modulos = 0;
    if (typeof Q.create === "function") {
      try { modulos = Q.create(text, opt).modules.size + ZONA_SILENCIO * 2; } catch (err) { modulos = 0; }
    }
    opt.width = modulos ? modulos * 16 : 512;
    return Q.toDataURL(text, opt);
  }

  function versaoDo(prova, aluno, opts) {
    if (opts.versao) return opts.versao;
    var V = mod("GabaVersoes");
    return V.build(prova, {
      modo: opts.modo || prova.modo || "fixa",
      tipo: opts.tipo || aluno.tipo || 1,
      aluno_id: opts.aluno_id || aluno.id || aluno.numero,
      turma_id: opts.turma_id,
      prova_id: opts.prova_id || prova.id,
      salt: opts.salt,
      embaralharAlternativas: opts.embaralharAlternativas
    });
  }

  async function loteHtml(prova, batch, cfg) {
    var partes = [];
    for (var i = 0; i < batch.itens.length; i++) {
      var r = await cadernoHtml(prova, batch.itens[i].aluno, {
        versao: batch.itens[i].versao,
        config: cfg,
        turma_id: batch.turma_id,
        turmaNome: cfg && cfg.turma
      });
      partes.push(r.html);
    }
    return partes.join(NL);
  }

  function imprimirNaJanela() {
    window.print();
  }

  function cartaoPrevia(prova, opts) {
    return cartaoHtml(layoutDa(prova, opts));
  }

  global.GabaFolha = {
    MODELOS: MODELOS,
    HINT_PADRAO: HINT_PADRAO,
    esc: esc,
    strip: strip,
    totalDa: totalDa,
    nAlternativas: nAlternativas,
    layoutDa: layoutDa,
    fiduciaisHtml: fiduciaisHtml,
    cartaoHtml: cartaoHtml,
    cartaoPrevia: cartaoPrevia,
    questoesHtml: questoesHtml,
    pedacosDe: pedacosDe,
    fragmentoHtml: fragmentoHtml,
    rotuloContinua: rotuloContinua,
    empacotar: empacotar,
    medirCorpo: medirCorpo,
    conferirEncaixe: conferirEncaixe,
    compactarCaixas: compactarCaixas,
    fontesProntas: fontesProntas,
    assinaturaDa: assinaturaDa,
    MARGEM_QUESTAO_MM: MARGEM_QUESTAO_MM,
    cabecalhoCfg: cabecalhoCfg,
    cabecalhoHtml: cabecalhoHtml,
    instrucoesHtml: instrucoesHtml,
    espacoLivreAbaixoDoCartaoMm: espacoLivreAbaixoDoCartaoMm,
    versaoDo: versaoDo,
    planoDoCaderno: planoDoCaderno,
    cadernoHtml: cadernoHtml,
    loteHtml: loteHtml,
    imprimirNaJanela: imprimirNaJanela
  };
})(typeof window !== "undefined" ? window : globalThis);
