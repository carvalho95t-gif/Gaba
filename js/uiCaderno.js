/* Gaba — painel de impressao nominal em lote (usa GabaFolha, GabaVersoes e GabaDB) */
/* global GabaFolha, GabaVersoes, GabaDocx, GabaDB, QRCode, Blob, URL, FileReader */
(function (global) {
  "use strict";

  var NL = String.fromCharCode(10);
  var CFG_KEY = "gaba_caderno_cfg";
  var LOTE_KEY = "gaba_lote_impresso";

  var estado = {
    provasSupabase: [],
    provasLocais: [],
    turmas: [],
    alunos: [],
    batch: null,
    ultimoHtml: "",
    cortes: [],
    compactou: 0,
    sujo: false
  };

  /* a escola que pomos na caixa por causa da turma, para nao pisar o que o professor digitou */
  var escolaAuto = "";

  function $(id) { return document.getElementById(id); }

  function status(msg, erro) {
    var el = $("cad-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "cad-status" + (erro ? " erro" : "");
  }

  function lerCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === "object" ? o : {};
    } catch (err) {
      return {};
    }
  }

  function salvarCfg(patch) {
    var cfg = Object.assign(lerCfg(), patch);
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    return cfg;
  }

  function campo(id, padrao) {
    return ((($(id) || {}).value) || padrao || "").trim();
  }

  function opcoes() {
    var saved = lerCfg();
    /* "por pagina" virou teto: quem fecha o corpo e o empacotador, medindo o papel de verdade */
    var porPagina = Math.max(1, Math.min(30, parseInt(($("cad-por-pagina") || {}).value, 10) ||
      parseInt(saved.questoesPorPagina, 10) || 30));
    var modo = ($("cad-modo") || {}).value || "fixa";
    var numTipos = Math.max(1, Math.min(26, parseInt(($("cad-tipos") || {}).value, 10) || 4));
    var colunas = ($("cad-colunas") || {}).value === "2" ? 2 : 1;
    var cabecalho = {
      modelo: campo("cad-modelo", saved.modelo) || "escola",
      rede: campo("cad-rede", saved.rede),
      escola: campo("cad-escola", saved.escola),
      titulo: campo("cad-titulo", saved.titulo),
      disciplina: campo("cad-disciplina", saved.disciplina),
      professor: campo("cad-professor", saved.professor),
      turma: saved.turmaLabel || "",
      ano: campo("cad-ano", saved.ano),
      bimestre: campo("cad-bimestre", saved.bimestre),
      data: campo("cad-data", saved.data),
      instrucoes: campo("cad-instrucoes", saved.instrucoes)
    };
    return {
      modo: modo,
      numTipos: modo === "turma" ? numTipos : 1,
      embaralharAlternativas: !!($("cad-alt") || {}).checked,
      salt: campo("cad-salt") || undefined,
      config: {
        escola: cabecalho.escola,
        turma: cabecalho.turma,
        data: cabecalho.data,
        instrucoes: cabecalho.instrucoes,
        cabecalho: cabecalho,
        modelo: cabecalho.modelo,
        colunas: colunas,
        questoesPorPagina: porPagina,
        comQuestoes: saved.comQuestoes !== false,
        comDescritores: !!($("cad-descritores") || {}).checked,
        ultimaEmBranco: ($("cad-branco") || {}).checked !== false,
        comCartao: true
      }
    };
  }

  function todasAsProvas() {
    return estado.provasLocais.concat(estado.provasSupabase);
  }

  function provaSelecionada() {
    var sel = $("cad-prova");
    if (!sel || !sel.value) return null;
    var id = sel.value;
    var lista = todasAsProvas();
    for (var i = 0; i < lista.length; i++) {
      if (String(lista[i].id) === id) return lista[i];
    }
    return null;
  }

  function preencher(sel, itens, valor, texto, vazio) {
    if (!sel) return;
    var anterior = sel.value;
    var partes = [];
    if (vazio) partes.push('<option value="">' + vazio + "</option>");
    itens.forEach(function (it, i) {
      partes.push('<option value="' + String(valor(it, i)).replace(/"/g, "&quot;") + '">' +
        String(texto(it, i)).replace(/</g, "&lt;") + "</option>");
    });
    sel.innerHTML = partes.join(NL);
    if (anterior) {
      for (var j = 0; j < sel.options.length; j++) {
        if (sel.options[j].value === anterior) { sel.value = anterior; return; }
      }
    }
  }

  function turmaAtual() {
    var sel = $("cad-turma");
    if (!sel || !sel.value) return null;
    for (var i = 0; i < estado.turmas.length; i++) {
      if (String(estado.turmas[i].id) === sel.value) return estado.turmas[i];
    }
    return null;
  }

  /* a turma diz a escola do caderno; o que foi digitado na caixa continua valendo */
  function herdarEscolaDaTurma() {
    var campo = $("cad-escola");
    var t = turmaAtual();
    if (!campo || !t || !global.GabaEscolas) return;
    var escola = GabaEscolas.normalizar(t.escola);
    var digitado = campo.value.trim();
    if (!escola) {
      if (digitado && digitado === escolaAuto) {
        campo.value = "";
        escolaAuto = "";
        gravarCfg();
      }
      return;
    }
    if (digitado && digitado !== escolaAuto) return;
    if (escola === digitado) { escolaAuto = escola; return; }
    campo.value = escola;
    escolaAuto = escola;
    gravarCfg();
  }

  async function carregarAlunos(prova) {
    var turma = turmaAtual();
    if (prova && prova.__local && (prova.alunos || []).length) {
      estado.alunos = prova.alunos;
    } else if (global.GabaDB && GabaDB.isConfigured() && turma) {
      estado.alunos = await GabaDB.listAlunos(turma.id);
    } else {
      estado.alunos = [];
    }
    var lista = $("cad-alunos");
    if (lista) {
      lista.hidden = false;
      lista.innerHTML = estado.alunos.length
        ? estado.alunos.map(function (a) {
            return "<div>" + String(a.numero || "-") + " — " + String(a.nome || "").replace(/</g, "&lt;") +
              (a.tipo ? " (tipo " + a.tipo + ")" : "") + "</div>";
          }).join(NL)
        : "<div>Nenhum aluno carregado.</div>";
    }
    return estado.alunos;
  }

  /* ------------------------------------------- revisao: gabarito, pesos, descritores */

  function letrasDaQuestao(q, prova) {
    var n = (q && q.alternativas && q.alternativas.length) || (prova && prova.alternativas) || 5;
    return "ABCDE".slice(0, Math.max(2, Math.min(5, n))).split("");
  }

  /* o parser pode entregar questao sem gabarito ou com a letra fora das alternativas */
  function problemasDaProva(prova) {
    var qs = (prova && prova.questoes) || [];
    var semGabarito = [], semAlternativas = [], gabaritoFora = [];
    /* a prova digitada no formulario so tem gabarito: ai a falta de texto nao e problema */
    var comTexto = qs.some(function (q) { return (q.alternativas || []).length > 0; });
    qs.forEach(function (q, i) {
      var gab = String(q.gabarito || "").toUpperCase().charAt(0);
      if (!gab) semGabarito.push(i + 1);
      else if (letrasDaQuestao(q, prova).indexOf(gab) < 0) gabaritoFora.push(i + 1);
      if (comTexto && (q.alternativas || []).length < 2) semAlternativas.push(i + 1);
    });
    return { total: qs.length, semGabarito: semGabarito, semAlternativas: semAlternativas, gabaritoFora: gabaritoFora };
  }

  function pontosTotais(prova) {
    return ((prova && prova.questoes) || []).reduce(function (s, q) {
      return s + (Number(q.peso) > 0 ? Number(q.peso) : 1);
    }, 0);
  }

  function desenharAvisos(prova) {
    var box = $("cad-avisos");
    if (!box) return;
    var p = problemasDaProva(prova);
    var itens = [];
    if (p.total) {
      if (p.semGabarito.length) {
        itens.push(p.semGabarito.length + " questão(ões) sem gabarito: " + listaCurta(p.semGabarito) +
          ". Sem gabarito a questão conta como não respondida.");
      }
      if (p.gabaritoFora.length) {
        itens.push("Gabarito fora das alternativas nas questões " + listaCurta(p.gabaritoFora) + ".");
      }
      if (p.semAlternativas.length) {
        itens.push("Questões " + listaCurta(p.semAlternativas) + " têm menos de 2 alternativas no documento.");
      }
    }
    var doWord = (prova && prova.avisos) || [];
    doWord.forEach(function (a) { itens.push(String(a)); });
    /* o encaixe medido no papel desenhado: sem isto o corte so aparece na impressora */
    (estado.cortes || []).forEach(function (t) { itens.push(t); });
    if (!itens.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = "<h3>Revisar antes de imprimir (" + itens.length + ")</h3><ul>" +
      itens.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join(NL) + "</ul>";
  }

  function listaCurta(numeros) {
    if (numeros.length <= 12) return numeros.join(", ");
    return numeros.slice(0, 12).join(", ") + " e mais " + (numeros.length - 12);
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function linhaDaQuestao(q, i, prova) {
    var texto = String(q.enunciado || q.comando || "").replace(/\s+/g, " ").trim();
    var gab = String(q.gabarito || "").toUpperCase().charAt(0);
    var letras = letrasDaQuestao(q, prova);
    var peso = Number(q.peso) > 0 ? Number(q.peso) : 1;
    return '<div class="q-rev" data-q="' + (i + 1) + '">' +
      '<span class="q-num">' + (i + 1) + "</span>" +
      '<span class="q-txt" title="' + esc(texto) + '">' +
        esc(texto.slice(0, 80) + (texto.length > 80 ? "…" : "") || "sem texto") + "</span>" +
      '<select class="q-gab" data-campo="gabarito">' +
      ['<option value="">—</option>'].concat(letras.map(function (l) {
        return '<option' + (l === gab ? " selected" : "") + ">" + l + "</option>";
      })).join("") + "</select>" +
      '<input class="q-peso" data-campo="peso" type="number" min="0.5" max="99" step="0.5" value="' + peso + '" title="peso">' +
      '<input class="q-desc" data-campo="descritor" type="text" value="' + esc(q.descritor || "") + '" placeholder="descritor">' +
      '<input class="q-bncc" data-campo="habilidade_bncc" type="text" value="' + esc(q.habilidade_bncc || "") +
      '" placeholder="habilidade BNCC">' +
      "</div>";
  }

  function desenharQuestoes(prova) {
    var box = $("cad-questoes");
    var nota = $("cad-nota-prova");
    if (!box) return;
    var qs = (prova && prova.questoes) || [];
    if (!qs.length) {
      box.hidden = true;
      box.innerHTML = "";
      if (nota) nota.textContent = "";
      return;
    }
    var p = problemasDaProva(prova);
    box.hidden = false;
    box.innerHTML = '<div class="q-rev q-cab"><span></span><span>questão</span><span>gabarito</span>' +
      "<span>peso</span><span>descritor</span><span>habilidade BNCC</span></div>" +
      qs.map(function (q, i) { return linhaDaQuestao(q, i, prova); }).join(NL);
    marcarProblemas(p);
    if (nota) {
      nota.textContent = qs.length + " questão(ões) · " + pontosTotais(prova).toFixed(1).replace(".", ",") +
        " pontos na nota · " + (p.total - p.semGabarito.length) + " com gabarito";
    }
  }

  function marcarProblemas(p) {
    var ruins = {};
    [p.semGabarito, p.gabaritoFora, p.semAlternativas].forEach(function (l) {
      l.forEach(function (n) { ruins[n] = true; });
    });
    [].slice.call(document.querySelectorAll("#cad-questoes .q-rev[data-q]")).forEach(function (el) {
      el.classList.toggle("ruim", !!ruins[Number(el.dataset.q)]);
    });
  }

  /* sem re-desenhar a lista: o campo em edição perderia o foco a cada tecla */
  function atualizarCabecalho() {
    var prova = provaSelecionada();
    if (!prova) return;
    desenharAvisos(prova);
    var nota = $("cad-nota-prova");
    var p = problemasDaProva(prova);
    if (nota) {
      nota.textContent = (prova.questoes || []).length + " questão(ões) · " +
        pontosTotais(prova).toFixed(1).replace(".", ",") + " pontos na nota · " +
        (p.total - p.semGabarito.length) + " com gabarito";
    }
  }

  function aplicarEdicao(el) {
    var prova = provaSelecionada();
    if (!prova || !prova.questoes) return null;
    var linha = el.closest("[data-q]");
    if (!linha) return null;
    var i = Number(linha.dataset.q) - 1;
    var q = prova.questoes[i];
    if (!q) return null;
    var campo = el.dataset.campo;
    if (campo === "peso") {
      var v = Number(String(el.value).replace(",", "."));
      q.peso = v > 0 ? Math.min(99, v) : 1;
      el.value = String(q.peso);
    } else if (campo === "gabarito") {
      q.gabarito = String(el.value || "").toUpperCase().charAt(0);
      if (Array.isArray(prova.gabarito)) prova.gabarito[i] = q.gabarito;
    } else {
      q[campo] = String(el.value || "").trim();
    }
    var semLetra = !q.gabarito || letrasDaQuestao(q, prova).indexOf(q.gabarito) < 0;
    linha.classList.toggle("ruim", semLetra);
    estado.sujo = true;
    guardarEdicao(prova);
    atualizarCabecalho();
    return { questao: i + 1, campo: campo, valor: q[campo] };
  }

  var guardaProva = null;
  function guardarEdicao(prova) {
    if (global.GabaSync && GabaSync.guardarProva && prova.__local) {
      clearTimeout(guardaProva);
      guardaProva = setTimeout(function () {
        GabaSync.guardarProva(prova).then(function () {
          estado.sujo = false;
          mostraBotaoSalvar(prova);
        }).catch(function () { /* fica só na memória e o botão continua aceso */ });
      }, 400);
    }
    mostraBotaoSalvar(prova);
  }

  function mostraBotaoSalvar(prova) {
    var b = $("cad-salvar-prova");
    if (!b) return;
    var noBanco = Boolean(global.GabaDB && GabaDB.isConfigured() && prova && GabaDB.eUuid(prova.id));
    b.hidden = !noBanco || !estado.sujo;
  }

  /* o .docx importado morava só na memória: ao reabrir o app ele sumia */
  async function carregarProvasLocais() {
    if (!global.GabaSync || !GabaSync.listarProvas) return estado.provasLocais;
    var doDisco;
    try {
      doDisco = await GabaSync.listarProvas();
    } catch (err) {
      return estado.provasLocais;
    }
    var vistos = {};
    estado.provasLocais.forEach(function (p) { vistos[String(p.id)] = true; });
    doDisco.forEach(function (p) {
      if (!p || !p.id || vistos[String(p.id)]) return;
      p.__local = true;
      estado.provasLocais.push(p);
    });
    estado.provasLocais.sort(function (a, b) {
      return String(b.atualizado_em || "").localeCompare(String(a.atualizado_em || ""));
    });
    return estado.provasLocais;
  }

  function desenharProva(prova) {
    desenharQuestoes(prova);
    desenharAvisos(prova);
    mostraBotaoSalvar(prova);
  }

  async function carregarListas() {
    var dbOk = global.GabaDB && GabaDB.isConfigured();
    await carregarProvasLocais();
    if (dbOk) {
      try {
        var todas = await GabaDB.listTurmas();
        estado.turmas = global.GabaEscolas ? GabaEscolas.visiveis(todas) : todas;
        estado.provasSupabase = await GabaDB.listProvas();
      } catch (err) {
        status("Falha ao ler o Supabase: " + (err && err.message ? err.message : err), true);
      }
    }
    preencher($("cad-turma"), estado.turmas, function (t) { return t.id; }, function (t) { return t.nome; }, "Todas as turmas");
    herdarEscolaDaTurma();
    var provas = todasAsProvas();
    preencher($("cad-prova"), provas, function (p) { return p.id; }, function (p) {
      var qtd = (p.questoes || []).length || p.quantidade_questoes || 0;
      return (p.titulo || "Prova") + " — " + qtd + " questoes" + (p.__local ? " (documento)" : "");
    });
    var prova = provaSelecionada();
    await carregarAlunos(prova);
    desenharProva(prova);
    var aviso = !dbOk ? "Sem credenciais: use Importar .docx para imprimir agora." : "";
    status([aviso, provas.length + " prova(s), " + estado.alunos.length + " aluno(s) prontos para o lote."]
      .filter(Boolean).join(" "));
  }

  /* guarda o lote que foi para a impressora para o leitor reproduzir as mesmas versoes */
  function resumoDasQuestoes(prova) {
    return (prova.questoes || []).map(function (q) {
      var n = Math.max(2, Math.min(5, (q.alternativas || []).length || 5));
      var alt = [];
      for (var i = 0; i < n; i++) alt.push({});
      return {
        gabarito: String(q.gabarito || "").toUpperCase().charAt(0),
        peso: typeof q.peso === "number" ? q.peso : 1,
        descritor: q.descritor || "",
        habilidade_bncc: q.habilidade_bncc || "",
        alternativas: alt
      };
    });
  }

  function salvarLoteImpresso(prova, batch, turma, op) {
    var questoes = resumoDasQuestoes(prova);
    var registro = {
      prova_id: String(prova.id),
      titulo: prova.titulo || "Prova",
      em: new Date().toISOString(),
      lote_id: "L" + Date.now().toString(36),
      modo: batch.modo,
      numTipos: batch.numTipos,
      salt: op && op.salt ? op.salt : null,
      embaralharAlternativas: !!(op && op.embaralharAlternativas),
      turma_id: turma ? turma.id : (prova.turma_id || null),
      turma_nome: turma ? String(turma.nome || "") : "",
      totalQuestoes: questoes.length,
      alternativas: ((prova.questoes || [])[0] || {}).alternativas
        ? (prova.questoes[0].alternativas || []).length : 5,
      questoes: questoes,
      itens: batch.itens.map(function (it) {
        var a = it.aluno || {};
        return {
          aluno: {
            id: a.id || null, nome: a.nome || "", numero: a.numero || null,
            matricula: a.matricula || null, turma_id: a.turma_id || null, tipo: a.tipo || null
          },
          versao: it.versao
        };
      })
    };
    try {
      localStorage.setItem(LOTE_KEY, JSON.stringify(registro));
    } catch (err) {
      status("Lote impresso nao coube no armazenamento do aparelho; o leitor tera que reconstruir as versoes.", true);
      return null;
    }
    return registro;
  }

  /* as versoes impressas vao para o banco para outro aparelho ler a mesma folha */
  function sincronizarLote(prova, registro, msgBase) {
    if (!registro || !global.GabaDB || !GabaDB.isConfigured()) return;
    if (!GabaDB.eUuid(prova.id)) {
      status(msgBase + " Este lote so existe neste aparelho: a prova ainda nao foi salva no banco.", true);
      return;
    }
    GabaDB.upsertProvaVersoes(prova.id, registro.itens, {
      turma_id: registro.turma_id, em: registro.em, lote_id: registro.lote_id
    }).then(function (n) {
      status(msgBase + " " + n + " versao(oes) no banco.");
    }).catch(function (err) {
      status(msgBase + " Versoes ficaram só neste aparelho: " + (err && err.message ? err.message : err), true);
    });
  }

  function loteImpresso(provaId) {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(LOTE_KEY) || "null"); } catch (err) { o = null; }
    if (!o || !o.itens || !o.itens.length) return null;
    if (provaId && String(o.prova_id) !== String(provaId)) return null;
    return o;
  }

  /* prova minima montada a partir do lote impresso: serve para ler sem reabrir o documento */
  function provaDoLote() {
    var o = loteImpresso();
    if (!o) return null;
    return {
      id: o.prova_id,
      titulo: o.titulo,
      questoes: o.questoes || [],
      alternativas: o.alternativas || 5,
      modo: o.modo || "fixa",
      turma_id: o.turma_id || null,
      __impresso: true
    };
  }

  /* o corpo em colunas nao paginaria sozinho: quem fecha a pagina e o empacotador do GabaFolha,
     com as alturas medidas na largura real da coluna. sem medida, o caminho antigo ainda vale. */
  /* a coluna do corpo e medida com o cabecalho fino de um aluno só. medindo pelo nome mais
     comprido do lote, todos cabem: sem isso um estudante de nome extenso perde a ultima linha da
     coluna porque o primeiro da lista tinha nome curto. */
  function itemDePiorCaso(batch) {
    var itens = (batch && batch.itens) || [];
    var pior = itens[0], maior = -1;
    itens.forEach(function (it) {
      var v = it.versao || {};
      var txt = [((it.aluno || {}).nome || ""), (v.codigo || ""), (v.rotulo || "")].join(" ");
      if (txt.length > maior) { maior = txt.length; pior = it; }
    });
    return pior;
  }

  async function medirCorpo(prova, op, item) {
    if (!global.GabaFolha || !GabaFolha.medirCorpo) return null;
    try {
      return await GabaFolha.medirCorpo(prova, prova.questoes || [], {
        config: op.config,
        aluno: item ? item.aluno : null,
        versao: item ? item.versao : null,
        turmaNome: op.config.turma
      });
    } catch (err) {
      status("Não deu para medir o corpo no papel: " + (err && err.message ? err.message : err), true);
      return null;
    }
  }

  async function gerarLote() {
    var prova = provaSelecionada();
    if (!prova) throw new Error("Selecione uma prova.");
    if (!(prova.questoes || []).length) {
      throw new Error("Essa prova nao tem questoes no navegador. Importe o .docx ou salve as questoes pela aba Provas.");
    }
    var alunos = estado.alunos;
    if (!alunos.length) throw new Error("Nenhum aluno para imprimir. Selecione a turma ou importe a lista.");
    var op = opcoes();
    var turma = turmaAtual();
    op.config.turma = (turma && turma.nome) || op.config.turma || "";
    op.config.cabecalho.turma = op.config.turma;
    var V = global.GabaVersoes;
    var batch = V.batch(prova, alunos, {
      modo: op.modo,
      numTipos: op.numTipos,
      turma_id: turma ? turma.id : prova.turma_id,
      prova_id: prova.id,
      salt: op.salt,
      embaralharAlternativas: op.embaralharAlternativas
    });
    var root = $("print-root");
    if (!root) throw new Error("Faltou a area de impressao (#print-root).");
    estado.batch = batch;
    var pedido = op.config.questoesPorPagina;
    var medidas = await medirCorpo(prova, op, itemDePiorCaso(batch));
    var cadernos = [];
    for (var k = 0; k < batch.itens.length; k++) {
      var item = batch.itens[k];
      cadernos.push(await GabaFolha.cadernoHtml(prova, item.aluno, {
        versao: item.versao,
        medidas: medidas,
        turma_id: turma ? turma.id : undefined,
        turmaNome: op.config.turma,
        config: op.config
      }));
    }
    var corpo = cadernos[0] && cadernos[0].corpo;
    var porPagina = corpo ? Math.max(1, Math.max.apply(null, corpo.map(function (p) { return p.questoes; }))) : pedido;
    if (corpo) {
      op.config.questoesPorPagina = porPagina;
      var campoPor = $("cad-por-pagina");
      if (campoPor) campoPor.value = String(porPagina);
      gravarCfg();
    }
    estado.ultimoHtml = cadernos.map(function (c) { return c.html; }).join(NL);
    root.innerHTML = estado.ultimoHtml;
    root.classList.add("previa");
    await GabaFolha.fontesProntas();
    /* primeiro tenta caber reduzindo o corpo das caixas fixas; o que sobrar ai sim e corte */
    estado.compactou = GabaFolha.compactarCaixas(root);
    estado.cortes = GabaFolha.conferirEncaixe(root);
    desenharAvisos(prova);
    var btnImp = $("cad-imprimir");
    if (btnImp) btnImp.disabled = estado.cortes.length > 0;
    var folhas = (estado.ultimoHtml.match(/<article class="folha-a4/g) || []).length;
    var brancas = (estado.ultimoHtml.match(/folha-a4 folha-branco/g) || []).length;
    var porAluno = cadernos[0] ? cadernos[0].paginas : 0;
    var impresso = salvarLoteImpresso(prova, batch, turma, op);
    var p = problemasDaProva(prova);
    var encaixe = !corpo ? "" :
      " Corpo fechado por medida: " + corpo.length + " pagina(s) de questoes, ate " + porPagina +
      " por pagina" + (pedido <= porPagina ? " (o seu limite de " + pedido + " e que mandou)." : ".");
    var giantes = (cadernos[0] && cadernos[0].estouradas || []).length ?
      " Atencao: a(s) questao(es) " + cadernos[0].estouradas.join(", ") + " e maior que uma coluna inteira." : "";
    var msg = batch.itens.length + " caderno(s) de " + porAluno + " folhas (" + op.config.colunas +
      " coluna(s), " + brancas + " em branco no fim), " + folhas + " folhas A4 ao todo, " +
      batch.numTipos + " tipo(s) de versao." + encaixe + giantes + " " +
      (impresso ? "O leitor ja conhece estas versoes. " : "") +
      (p.semGabarito.length ? p.semGabarito.length + " questao(oes) sem gabarito: elas nao dao ponto para ninguem. " : "") +
      "Revise a previa e clique em Imprimir lote. " +
      "No dialogo do navegador: papel A4, margens \"Nenhuma\", escala 100% e \"Cabecalhos e margens\" desligado.";
    var aperto = estado.compactou ? " Reduzi o corpo de " + estado.compactou +
      " caixa(s) do cabecalho para que o texto coubesse no papel." : "";
    var corte = estado.cortes.length ? " ATENCAO: " + estado.cortes.length +
      " linha(s) nao caberiam no papel e sairiam cortadas (lista abaixo)." : "";
    status(msg + aperto + corte, estado.cortes.length > 0);
    sincronizarLote(prova, impresso, msg);
    return { folhas: folhas, batch: batch, impresso: impresso, medidas: medidas, porPagina: porPagina };
  }

  async function aoImprimir() {
    var op = opcoes();
    gravarCfg();
    var root = $("print-root");
    try {
      var r = await gerarLote();
      if (estado.cortes.length) {
        status("Nao enviei a impressao: " + estado.cortes[0] +
          (estado.cortes.length > 1 ? " (mais " + (estado.cortes.length - 1) + " na lista abaixo)." : "."), true);
        return;
      }
      var prova = provaSelecionada();
      GabaFolha.imprimirNaJanela();
      localStorage.setItem("gaba_ultimo_lote", JSON.stringify({
        prova_id: prova ? prova.id : null,
        modo: op.modo,
        alunos: r.batch.itens.map(function (it) { return it.aluno.id || it.aluno.numero; }),
        em: new Date().toISOString()
      }));
      status("Impressao enviada (" + r.folhas + " folhas). Se a janela nao abriu, use Ctrl+P.");
    } catch (err) {
      if (root) root.classList.remove("previa");
      status(String(err && err.message ? err.message : err), true);
    }
  }

  async function baixarHtml() {
    try {
      if (!estado.ultimoHtml) await gerarLote();
      var css = "";
      try { css = await (await fetch("style.css")).text(); } catch (err) { css = ""; }
      var doc = "<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>Cadernos Gaba</title>" +
        "<style>" + css + NL + "#print-root{display:block}</style></head><body>" +
        "<div id=\"print-root\">" + estado.ultimoHtml + "</div></body></html>";
      var blob = new Blob([doc], { type: "text/html;charset=utf-8" });
      var a = document.createElement("a");
      var prova = provaSelecionada();
      a.href = URL.createObjectURL(blob);
      a.download = "cadernos-" + String((prova && (prova.id || prova.titulo)) || "prova").replace(/[^a-z0-9_-]+/gi, "-") + ".html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      status("Arquivo HTML gerado (abre no navegador e manda imprimir).");
    } catch (err) {
      status(String(err && err.message ? err.message : err), true);
    }
  }

  /* .docx, .doc e PDF entram pela mesma porta: quem decide o leitor sao os primeiros bytes do arquivo */
  async function lerDocumento(buf) {
    var bytes = new Uint8Array(buf);
    var texto = null, avisos = [];
    if (global.GabaPdf && GabaPdf.ehPdf(bytes)) {
      var lido = await GabaPdf.parsePdf(bytes);
      texto = lido.texto; avisos = lido.avisos || [];
    } else if (global.GabaDoc && GabaDoc.ehDoc(bytes)) {
      var doc = GabaDoc.parseDoc(bytes);
      texto = doc.texto; avisos = doc.avisos || [];
    } else {
      return await GabaDocx.parseDocx(buf);
    }
    var parsed = GabaDocx.parsePlain(texto);
    parsed.avisos = (parsed.avisos || []).concat(avisos);
    return parsed;
  }

  async function importarDocx(file) {
    if (!file) return;
    if (!global.GabaDocx) { status("Modulo do parser nao carregou.", true); return; }
    status("Lendo " + file.name + "...");
    try {
      var buf = await file.arrayBuffer();
      var parsed = await lerDocumento(buf);
      var prova = GabaDocx.toProva(parsed, (parsed && parsed.titulo) || file.name.replace(/\.[a-z]+$/i, ""));
      prova.id = "docx-" + String(file.name || "arquivo").replace(/[^a-z0-9]+/gi, "") + "-" + (file.size || 0);
      prova.__local = true;
      prova.avisos = (parsed && parsed.avisos) || [];
      var repetida = -1;
      estado.provasLocais.forEach(function (p, i) { if (String(p.id) === String(prova.id)) repetida = i; });
      if (repetida >= 0) estado.provasLocais[repetida] = prova;
      else estado.provasLocais.unshift(prova);
      var sel = $("cad-prova");
      preencher(sel, todasAsProvas(), function (p) { return p.id; }, function (p) {
        var qtd = (p.questoes || []).length || p.quantidade_questoes || 0;
        return (p.titulo || "Prova") + " — " + qtd + " questoes" + (p.__local ? " (documento)" : "");
      });
      if (sel) sel.value = String(prova.id);
      await carregarAlunos(prova);
      desenharProva(prova);
      if ((prova.tipos || []).length > 1 && ($("cad-modo") || {}).value === "fixa") {
        $("cad-modo").value = "turma";
        $("cad-tipos").value = String(prova.tipos.length);
      }
      var guardada = false;
      if (global.GabaSync && GabaSync.guardarProva) {
        try {
          await GabaSync.guardarProva(prova);
          guardada = true;
        } catch (err) { /* segue só em memória e a próxima frase avisa */ }
      }
      var p = problemasDaProva(prova);
      status("Documento importado: " + (prova.questoes || []).length + " questoes, " +
        (prova.alunos || []).length + " alunos, " + (prova.tipos || []).length + " tipo(s). " +
        (p.semGabarito.length ? p.semGabarito.length + " sem gabarito. " : "") +
        (guardada ? "Guardada neste aparelho: revise gabarito, peso e descritor abaixo."
          : "Atencao: ela nao coube no armazenamento do aparelho e se perde ao fechar a pagina."));
    } catch (err) {
      status("Falha ao importar: " + (err && err.message ? err.message : err), true);
    }
  }

  /* a prova subiu para o banco: a cópia deste aparelho é lixo e voltaria como duplicada */
  async function esquecerProvaLocal(id) {
    var chave = String(id);
    estado.provasLocais = estado.provasLocais.filter(function (p) { return String(p.id) !== chave; });
    if (global.GabaSync && GabaSync.esquecerProva) {
      try { await GabaSync.esquecerProva(chave); } catch (err) { /* já não estava no aparelho */ }
    }
  }

  async function salvarProvaNoBanco() {
    var prova = provaSelecionada();
    if (!prova) throw new Error("Selecione a prova primeiro.");
    if (!global.GabaDB || !GabaDB.isConfigured()) throw new Error("Sem credenciais do Supabase.");
    var idLocal = String(prova.id);
    var salvo = await GabaDB.salvarProva(prova);
    estado.sujo = false;
    if (!GabaDB.eUuid(prova.id)) {
      prova.id = salvo.id;
      prova.__local = false;
      await esquecerProvaLocal(idLocal);
    }
    await carregarListas();
    if (global.GabaApp && GabaApp.carregarTudo) await GabaApp.carregarTudo();
    return salvo;
  }

  var CAMPOS_CFG = {
    "cad-modelo": "modelo", "cad-rede": "rede", "cad-escola": "escola", "cad-titulo": "titulo",
    "cad-disciplina": "disciplina", "cad-professor": "professor", "cad-ano": "ano",
    "cad-bimestre": "bimestre", "cad-data": "data", "cad-instrucoes": "instrucoes", "cad-colunas": "colunas"
  };

  function gravarCfg() {
    var op = opcoes();
    var c = op.config.cabecalho;
    salvarCfg({
      modelo: c.modelo, colunas: String(op.config.colunas), rede: c.rede, escola: c.escola,
      escolaAuto: escolaAuto,
      titulo: c.titulo, disciplina: c.disciplina, professor: c.professor, ano: c.ano,
      bimestre: c.bimestre, data: c.data, instrucoes: c.instrucoes,
      questoesPorPagina: op.config.questoesPorPagina,
      comDescritores: op.config.comDescritores, ultimaEmBranco: op.config.ultimaEmBranco
    });
  }

  function restaurarCfg() {
    var cfg = lerCfg();
    escolaAuto = String(cfg.escolaAuto || "");
    Object.keys(CAMPOS_CFG).forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("change", gravarCfg);
      var valor = cfg[CAMPOS_CFG[id]];
      if (valor == null || valor === "") return;
      if (el.tagName === "SELECT") {
        for (var i = 0; i < el.options.length; i++) {
          if (el.options[i].value === String(valor)) { el.value = String(valor); break; }
        }
      } else if (!el.value) el.value = valor;
    });
    ["cad-branco", "cad-descritores"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var chave = id === "cad-branco" ? "ultimaEmBranco" : "comDescritores";
      if (cfg[chave] != null) el.checked = cfg[chave] === true;
      el.addEventListener("change", gravarCfg);
    });
    var porPagina = $("cad-por-pagina");
    if (porPagina) {
      if (cfg.questoesPorPagina) porPagina.value = cfg.questoesPorPagina;
      porPagina.addEventListener("change", gravarCfg);
    }
    ["cad-modo", "cad-tipos", "cad-salt"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", gravarCfg);
    });
  }

  function init() {
    restaurarCfg();
    var btnPrev = $("cad-previa");
    var btnImp = $("cad-imprimir");
    var btnBaixar = $("cad-baixar");
    var btnDocx = $("cad-docx");
    var input = $("cad-arquivo");
    if (btnPrev) btnPrev.addEventListener("click", function () {
      if (!global.QRCode) { status("A biblioteca de QR Code nao carregou (offline sem cache?).", true); return; }
      gerarLote().catch(function (err) { status(String(err && err.message ? err.message : err), true); });
    });
    if (btnImp) btnImp.addEventListener("click", aoImprimir);
    if (btnBaixar) btnBaixar.addEventListener("click", baixarHtml);
    if (btnDocx && input) btnDocx.addEventListener("click", function () { input.click(); });
    if (input) input.addEventListener("change", function () { importarDocx(input.files && input.files[0]); });
    var selTurma = $("cad-turma");
    if (selTurma) selTurma.addEventListener("change", function () {
      herdarEscolaDaTurma();
      carregarAlunos(provaSelecionada()).catch(function (err) { status(String(err.message || err), true); });
    });
    var selProva = $("cad-prova");
    if (selProva) selProva.addEventListener("change", function () {
      var prova = provaSelecionada();
      desenharProva(prova);
      carregarAlunos(prova).catch(function (err) { status(String(err.message || err), true); });
    });
    var painel = $("cad-questoes");
    if (painel) painel.addEventListener("change", function (ev) {
      var el = ev.target;
      if (!el || !el.dataset || !el.dataset.campo) return;
      aplicarEdicao(el);
    });
    var btnSalvarProva = $("cad-salvar-prova");
    if (btnSalvarProva) btnSalvarProva.addEventListener("click", function () {
      salvarProvaNoBanco().then(function (salvo) {
        status("Prova \"" + salvo.titulo + "\" salva no banco com os pesos e descritores revisados.");
      }).catch(function (err) {
        status("Não deu para salvar no banco: " + (err && err.message ? err.message : err), true);
      });
    });
    carregarListas().catch(function () { /* ja avisou */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.GabaCaderno = {
    estado: estado,
    opcoes: opcoes,
    carregarListas: carregarListas,
    carregarProvasLocais: carregarProvasLocais,
    gerarLote: gerarLote,
    baixarHtml: baixarHtml,
    importarDocx: importarDocx,
    loteImpresso: loteImpresso,
    provaDoLote: provaDoLote,
    problemasDaProva: problemasDaProva,
    desenharQuestoes: desenharQuestoes,
    aplicarEdicao: aplicarEdicao,
    esquecerProvaLocal: esquecerProvaLocal,
    salvarProvaNoBanco: salvarProvaNoBanco,
    aoAbrir: function () { carregarListas().catch(function () { /* avisado */ }); }
  };
})(typeof window !== "undefined" ? window : globalThis);
