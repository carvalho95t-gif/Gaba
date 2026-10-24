/* Gaba — painel de impressao nominal em lote (usa GabaFolha, GabaVersoes e GabaDB) */
/* global GabaFolha, GabaVersoes, GabaDocx, GabaDB, QRCode, Blob, URL, FileReader */
(function (global) {
  "use strict";

  var NL = String.fromCharCode(10);
  var CFG_KEY = "gaba_caderno_cfg";
  var LOTE_KEY = "gaba_lote_impresso";
  var geracaoConta = 0;

  function snapshotConta() {
    return { conta: global.GabaSync.contaAtual(), geracao: geracaoConta };
  }

  function contaValida(s) {
    return s.conta === global.GabaSync.contaAtual() && s.geracao === geracaoConta;
  }

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
    escrever("cad-status", msg, erro);
  }

  function escrever(id, msg, erro) {
    var el = $(id);
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.className = "cad-status" + (erro ? " erro" : "");
  }

  /* importar e revisar acontecem na aba Provas: a mensagem fica perto de quem clicou */
  function statusProva(msg, erro) { escrever("prova-status", msg, erro); }
  function statusRevisao(msg, erro) { escrever("revisao-status", msg, erro); }

  function plural(n, um, varios) {
    return n + " " + (n === 1 ? um : varios);
  }

  function lerCfg() {
    try {
      var raw = localStorage.getItem(global.GabaSync.chaveLocal(CFG_KEY));
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === "object" ? o : {};
    } catch (err) {
      return {};
    }
  }

  function salvarCfg(patch) {
    var cfg = Object.assign(lerCfg(), patch);
    localStorage.setItem(global.GabaSync.chaveLocal(CFG_KEY), JSON.stringify(cfg));
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
      trimestre: campo("cad-trimestre", saved.trimestre),
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
    var conta = snapshotConta();
    var turma = turmaAtual();
    var alunos;
    try {
      if (prova && prova.__local && (prova.alunos || []).length) {
        alunos = prova.alunos;
      } else if (global.GabaDB && GabaDB.isConfigured() && turma) {
        alunos = await GabaDB.listAlunos(turma.id);
      } else {
        alunos = [];
      }
    } catch (err) {
      if (!contaValida(conta)) return [];
      throw err;
    }
    if (!contaValida(conta)) return [];
    estado.alunos = alunos;
    var lista = $("cad-alunos");
    if (lista) {
      lista.hidden = false;
      lista.classList.toggle("vazia", !estado.alunos.length);
      lista.innerHTML = estado.alunos.length
        ? estado.alunos.map(function (a) {
            return "<div>" + String(a.numero || "-") + " — " + String(a.nome || "").replace(/</g, "&lt;") +
              (a.tipo ? " (tipo " + a.tipo + ")" : "") + "</div>";
          }).join(NL)
        : '<p class="cad-status">Nenhum aluno carregado: escolha a turma acima ou cadastre os alunos em Turmas &rsaquo; Alunos.</p>';
    }
    atualizarCaderno();
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
        itens.push(plural(p.semGabarito.length, "questão", "questões") + " sem gabarito: " + listaCurta(p.semGabarito) +
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
    desenharCortes();
    if (!itens.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = "<h3>Revisar antes de imprimir (" + itens.length + ")</h3><ul>" +
      itens.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join(NL) + "</ul>";
  }

  /* o encaixe medido no papel desenhado: sem isto o corte so aparece na impressora */
  function desenharCortes() {
    var box = $("cad-cortes");
    if (!box) return;
    var cortes = estado.cortes || [];
    box.hidden = !cortes.length;
    box.innerHTML = !cortes.length ? "" : "<h3>Não cabe no papel (" + cortes.length + ")</h3><ul>" +
      cortes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join(NL) + "</ul>";
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
      global.GabaApp.indicadorQuestao(i + 1, true) +
      '<span class="q-txt" title="' + esc(texto) + '">' +
        esc(texto.slice(0, 80) + (texto.length > 80 ? "…" : "") || "sem texto") + "</span>" +
      '<select class="q-gab" data-campo="gabarito">' +
      ['<option value="">—</option>'].concat(letras.map(function (l) {
        return '<option' + (l === gab ? " selected" : "") + ">" + l + "</option>";
      })).join("") + "</select>" +
      '<input class="q-peso" data-campo="peso" type="number" min="0.5" max="99" step="0.5" value="' + peso + '" title="peso">' +
      '<input class="q-parte" data-campo="parte" type="text" value="' + esc(q.parte || "") +
      '" placeholder="parte" title="disciplina ou parte desta questão">' +
      '<input class="q-desc" data-campo="descritor" type="text" autocomplete="off" role="combobox" aria-expanded="false" ' +
      'value="' + esc(q.descritor || "") + '" placeholder="descritor" ' +
      'title="código do descritor: comece a digitar e escolha da lista oficial">' +
      '<input class="q-bncc" data-campo="habilidade_bncc" type="text" value="' + esc(q.habilidade_bncc || "") +
      '" placeholder="habilidade BNCC">' +
      "</div>";
  }

  /* ---- o seletor de descritor ----
     A caixa continua aceitando texto livre — o professor de Educação Física que invente o dele se
     precisar — mas o catalogo oficial (js/descritoresMatriz.js, gerado dos PDFs da SEDU-ES por
     tests/gerar-descritores.js) aparece embaixo, já filtrado pela disciplina e pelo ano do caderno.
     Escolher uma linha preenche o código e a habilidade, que são os dois campos que a folha imprime
     e a análise de descritor usa. */
  var PICK_MAX = 60;
  var pick = null;

  function eraDescritor(el) {
    return !!(el && el.classList && el.classList.contains("q-desc"));
  }

  function contextoDaProva(prova) {
    var saved = lerCfg();
    var turma = turmaAtual() || {};
    var disc = campo("cad-disciplina", saved.disciplina) || (prova && prova.disciplina) || "";
    var ano = campo("cad-ano", saved.ano) || turma.ano || (prova && prova.ano) || "";
    /* o trimestre vem so do seletor da ficha, nunca de texto livre: "1 trimestre" nao casa com
       "1º trimestre" no mesmoRotulo do catalogo e a lista viraria vazia na mao do professor */
    var banda = campo("cad-trimestre", saved.trimestre) || "";
    /* "Geral" é o que a criação da prova escreve quando ninguém disse a disciplina: não filtra nada */
    return { disciplina: disc === "Geral" ? "" : disc, ano: ano, banda: banda };
  }

  function itensDoDescritor(texto, contexto) {
    if (!global.GabaDescritores) return [];
    var alvo = String(texto || "").trim();
    /* reabrir a lista com o código já na caixa mostraria uma linha só: código não é busca */
    var ehCodigo = /^[Dd]\d{1,3}(?:_[A-Za-z])?$/.test(alvo) && GabaDescritores.porCodigo(alvo).length;
    return GabaDescritores.filtrar({
      disciplina: contexto.disciplina, ano: contexto.ano, banda: contexto.banda,
      busca: ehCodigo ? "" : alvo
    });
  }

  function painelDoPick() {
    var el = document.getElementById("q-pick");
    if (el) return el;
    el = document.createElement("div");
    el.id = "q-pick";
    el.className = "q-pick";
    el.hidden = true;
    el.setAttribute("role", "listbox");
    el.addEventListener("mousedown", function (ev) {
      var item = ev.target.closest ? ev.target.closest(".q-pick-item") : null;
      if (!item) return;
      /* mousedown, nao click: sem isto o blur da caixa fecha a lista antes da escolha chegar */
      ev.preventDefault();
      escolherPick(Number(item.dataset.i));
    });
    document.body.appendChild(el);
    return el;
  }

  function rotuloDaLinha(r) {
    var partes = [r.disciplina, r.componente, r.ano, r.banda, r.matriz].filter(function (t) { return t; });
    /* 1 = a linha do papel nao e firme: serie, trimestre ou texto deduzidos de outro lugar */
    if (r.duvidoso) partes.push("revisar");
    return partes.join(" · ");
  }

  function posicionarPick() {
    var caixa = pick.el;
    var r = pick.input.getBoundingClientRect();
    var largura = Math.min(Math.max(r.width, 280), window.innerWidth - 12);
    caixa.style.width = largura + "px";
    caixa.style.left = Math.max(6, Math.min(r.left, window.innerWidth - largura - 6)) + "px";
    var abaixo = window.innerHeight - r.bottom;
    if (abaixo < 200 && r.top > abaixo) {
      caixa.style.bottom = Math.max(6, window.innerHeight - r.top + 2) + "px";
      caixa.style.top = "auto";
    } else {
      caixa.style.top = (r.bottom + 2) + "px";
      caixa.style.bottom = "auto";
    }
    caixa.style.maxHeight = Math.max(140, Math.min(320, (caixa.style.bottom === "auto" ? abaixo : r.top) - 10)) + "px";
  }

  function desenharPick() {
    var itens = pick.itens;
    var visibles = Math.min(itens.length, PICK_MAX);
    var partes = itens.slice(0, visibles).map(function (r, i) {
      return '<div class="q-pick-item' + (i === pick.ativo ? " ativo" : "") + '" role="option"' +
        ' aria-selected="' + (i === pick.ativo) + '" data-i="' + i + '"' +
        ' title="' + esc(r.matriz + " · página " + r.pagina + " do PDF oficial") + '">' +
        "<b>" + esc(r.codigo) + "</b><span>" + esc(rotuloDaLinha(r)) + "</span><p>" + esc(r.descricao) + "</p></div>";
    });
    if (itens.length > visibles) {
      partes.push('<div class="q-pick-mais">+' + (itens.length - visibles) +
        " descritores fora da tela: digite uma palavra da habilidade</div>");
    }
    if (!itens.length) {
      partes.push('<div class="q-pick-mais">' + (global.GabaDescritores ?
        "nenhum descritor bate com o que está na caixa — o texto livre continua valendo" :
        "este aparelho ainda não tem o catálogo das matrizes") + "</div>");
    }
    var where = [pick.contexto.disciplina, pick.contexto.ano, pick.contexto.banda].filter(function (t) { return t; });
    partes.push('<div class="q-pick-foot">' + (where.join(" · ") || "todas as disciplinas e anos") +
      " — " + itens.length + " de " + (global.GabaDescritores ? GabaDescritores.total : itens.length) +
      " descritores das matrizes oficiais</div>");
    pick.el.innerHTML = partes.join(NL);
    pick.input.setAttribute("aria-expanded", "true");
    posicionarPick();
  }

  function abrirPick(input) {
    var linha = input.closest("[data-q]");
    if (!linha) return;
    fecharPick();
    var contexto = contextoDaProva(provaSelecionada());
    var itens = itensDoDescritor(input.value, contexto);
    pick = {
      el: painelDoPick(), input: input, linha: linha, contexto: contexto,
      itens: itens, ativo: itens.length ? 0 : -1
    };
    pick.el.hidden = false;
    desenharPick();
  }

  function atualizarPick() {
    if (!pick) return;
    pick.itens = itensDoDescritor(pick.input.value, pick.contexto);
    var teto = Math.min(pick.itens.length, PICK_MAX) - 1;
    pick.ativo = teto < 0 ? -1 : Math.max(0, Math.min(pick.ativo, teto));
    desenharPick();
  }

  function fecharPick() {
    if (!pick) return;
    var input = pick.input;
    pick.el.hidden = true;
    pick.el.innerHTML = "";
    pick = null;
    if (input && input.setAttribute) input.setAttribute("aria-expanded", "false");
  }

  function moverPick(passo) {
    if (!pick || !pick.itens.length) return;
    var teto = Math.min(pick.itens.length, PICK_MAX) - 1;
    pick.ativo = Math.max(0, Math.min(teto, pick.ativo + passo));
    [].slice.call(pick.el.querySelectorAll(".q-pick-item")).forEach(function (el) {
      var ligado = Number(el.dataset.i) === pick.ativo;
      el.classList.toggle("ativo", ligado);
      el.setAttribute("aria-selected", String(ligado));
    });
    var alvo = pick.el.children[pick.ativo];
    if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ block: "nearest" });
  }

  function escolherPick(i) {
    if (!pick) return;
    var r = pick.itens[i];
    var input = pick.input;
    var linha = pick.linha;
    if (!r) { fecharPick(); return; }
    var numero = Number(linha.dataset.q);
    var bncc = linha.querySelector(".q-bncc");
    input.value = r.codigo;
    if (bncc) bncc.value = r.descricao;
    fecharPick();
    aplicarEdicao(input);
    if (bncc) aplicarEdicao(bncc);
    input.focus();
    statusRevisao("Questão " + numero + ": descritor " + r.codigo + " (" + rotuloDaLinha(r) + ").");
  }

  function desenharQuestoes(prova) {
    var box = $("cad-questoes");
    var nota = $("cad-nota-prova");
    if (!box) return;
    /* a lista re-desenhada jogaria fora o input que a busca do descritor está acompanhando */
    fecharPick();
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
      nota.textContent = plural(qs.length, "questão", "questões") + " · " + pontosTotais(prova).toFixed(1).replace(".", ",") +
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
      nota.textContent = plural((prova.questoes || []).length, "questão", "questões") + " · " +
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
    var conta = snapshotConta();
    if (global.GabaSync && GabaSync.guardarProva && prova.__local) {
      clearTimeout(guardaProva);
      guardaProva = setTimeout(function () {
        if (!contaValida(conta)) return;
        guardaProva = null;
        GabaSync.guardarProva(prova).then(function () {
          if (!contaValida(conta)) return;
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
    var conta = snapshotConta();
    if (!global.GabaSync || !GabaSync.listarProvas) return estado.provasLocais;
    var doDisco;
    try {
      doDisco = await GabaSync.listarProvas();
    } catch (err) {
      return contaValida(conta) ? estado.provasLocais : [];
    }
    if (!contaValida(conta)) return [];
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

  var provaDesenhada = "";

  function desenharProva(prova) {
    var id = prova ? String(prova.id) : "";
    if (id !== provaDesenhada) {
      provaDesenhada = id;
      var rev = $("revisao-status");
      if (rev) { rev.hidden = true; rev.textContent = ""; }
    }
    desenharQuestoes(prova);
    desenharAvisos(prova);
    mostraBotaoSalvar(prova);
    atualizarCaderno();
  }

  /* ---- os quatro passos do caderno: só aparece o que ainda dá para escolher ---- */
  var MODELOS = {
    escola: "Cabeçalho da escola", enem: "Modelo ENEM", paebes: "Modelo PAEBES / SAEB", ama: "Modelo AMA / SEDU-ES"
  };

  function fato(id, html, aviso) {
    var el = $(id);
    if (!el) return;
    el.hidden = !html;
    el.innerHTML = html || "";
    el.classList.toggle("fato-aviso", Boolean(html && aviso));
  }

  function tiposDoDocumento(prova) {
    var n = ((prova && prova.tipos) || []).length;
    return n > 1 ? n : 0;
  }

  function alunosDoDocumento(prova) {
    return prova && prova.__local ? (prova.alunos || []).length : 0;
  }

  function atualizarCaderno() {
    var prova = provaSelecionada();
    var modo = ($("cad-modo") || {}).value || "fixa";
    [].forEach.call(document.querySelectorAll("input[name=cad-modo-r]"), function (r) {
      r.checked = r.value === modo;
    });
    [].forEach.call(document.querySelectorAll("[data-modo-mostra]"), function (el) {
      el.hidden = el.getAttribute("data-modo-mostra").split(" ").indexOf(modo) < 0;
    });

    var tiposDoc = tiposDoDocumento(prova);
    var alunosDoc = alunosDoDocumento(prova);
    var campoTipos = $("cad-tipos");
    /* com tipos no documento, o tipo de cada aluno ja vem escrito: o numero de tipos nao e escolha */
    if (tiposDoc && campoTipos) campoTipos.value = String(tiposDoc);
    var caixaTipos = $("cad-tipos-campo");
    if (caixaTipos) caixaTipos.hidden = Boolean(tiposDoc);
    fato("cad-tipos-doc", !tiposDoc ? "" : "O documento já define <b>" + tiposDoc + " tipos</b>" +
      (alunosDoc ? " e o tipo de cada um dos " + alunosDoc + " alunos" : "") + ". Nada para escolher aqui.");
    var avisoAluno = $("cad-aviso-aluno-doc");
    if (avisoAluno) avisoAluno.hidden = !(tiposDoc && modo === "aluno");

    var qtd = prova ? ((prova.questoes || []).length || prova.quantidade_questoes || 0) : 0;
    var p = problemasDaProva(prova);
    var comTexto = prova && (prova.questoes || []).some(function (q) { return (q.alternativas || []).length > 0; });
    var html = "";
    if (prova) {
      var doDoc = [tiposDoc ? plural(tiposDoc, "tipo", "tipos") : "", alunosDoc ? plural(alunosDoc, "aluno", "alunos") : ""]
        .filter(Boolean);
      html = "<b>" + plural(qtd, "questão", "questões") + "</b> · " +
        (doDoc.length ? doDoc.join(" e ") + (doDoc.length === 1 && (tiposDoc || alunosDoc) === 1 ? " veio" : " vieram") +
          " do documento." : comTexto ? "questões e alternativas vêm do documento." : "só o gabarito, sem enunciado impresso.");
      if (p.semGabarito.length) {
        html += "<br>" + plural(p.semGabarito.length, "questão", "questões") + " sem gabarito (" +
          esc(listaCurta(p.semGabarito)) + '). <button type="button" class="link" data-ir="provas" data-revisar="' +
          esc(prova.id) + '">Revisar na aba Provas</button>';
      }
    }
    fato("cad-fato-prova", html, p.semGabarito.length > 0);

    var rotulo = $("cad-turma-rotulo");
    if (rotulo) rotulo.textContent = alunosDoc ? "Turma (vai no cabeçalho e nas notas)" : "Para qual turma";
    var n = estado.alunos.length;
    fato("cad-fato-turma", alunosDoc
      ? "Os " + alunosDoc + " alunos vêm do documento" + (tiposDoc ? ", cada um com o seu tipo." : ".")
      : n ? plural(n, "aluno", "alunos") + ": um caderno com o nome de cada um." : "");

    var colunas = ($("cad-colunas") || {}).value === "2" ? "2" : "1";
    [].forEach.call(document.querySelectorAll(".segmento-campo [data-col]"), function (b) {
      b.setAttribute("aria-checked", String(b.dataset.col === colunas));
    });
    var resumoFolha = $("cad-resumo-folha-txt");
    if (resumoFolha) {
      resumoFolha.textContent = [
        MODELOS[($("cad-modelo") || {}).value] || MODELOS.escola,
        colunas === "2" ? "duas colunas" : "uma coluna",
        ($("cad-branco") || {}).checked !== false ? "último verso em branco" : "sem verso em branco",
        ($("cad-descritores") || {}).checked ? "com descritor" : "sem descritor"
      ].join(" · ");
    }

    var tipos = tiposDoc || Math.max(1, Math.min(26, parseInt((campoTipos || {}).value, 10) || 4));
    var cadernos = plural(n, "caderno", "cadernos");
    var fecho = $("cad-fecho-resumo");
    if (fecho) {
      fecho.textContent = !prova ? "Escolha a prova para ver quantos cadernos saem."
        : !n ? "Escolha a turma para ver quantos cadernos saem."
          : modo === "turma" ? cadernos + " em " + plural(tipos, "tipo", "tipos") + (tiposDoc ? " (do documento)." : ".")
            : modo === "aluno" ? cadernos + ", cada um com uma ordem só do aluno."
              : cadernos + (n === 1 ? " com" : " iguais, cada um com") + " o nome do aluno.";
    }
  }

  /* trocar de prova: com tipos no documento, "todos iguais" vira "por tipo", como na importação */
  function trocouProva(prova) {
    var sel = $("cad-modo");
    if (sel && tiposDoDocumento(prova) && sel.value === "fixa") sel.value = "turma";
    desenharProva(prova);
  }

  async function carregarListas() {
    var conta = snapshotConta();
    var configurado = global.GabaDB && GabaDB.isConfigured();
    var dbOk;
    try {
      dbOk = configurado && Boolean(await GabaDB.usuario());
    } catch (err) {
      if (!contaValida(conta)) return;
      throw err;
    }
    if (!contaValida(conta)) return;
    await carregarProvasLocais();
    if (!contaValida(conta)) return;
    if (dbOk) {
      try {
        var todas = await GabaDB.listTurmas();
        if (!contaValida(conta)) return;
        var provasBanco = await GabaDB.listProvas();
        if (!contaValida(conta)) return;
        estado.turmas = global.GabaEscolas ? GabaEscolas.visiveis(todas) : todas;
        estado.provasSupabase = provasBanco;
      } catch (err) {
        if (!contaValida(conta)) return;
        status("Falha ao ler o Supabase: " + (err && err.message ? err.message : err), true);
      }
    } else {
      estado.turmas = [];
      estado.provasSupabase = [];
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
    if (!contaValida(conta)) return;
    desenharProva(prova);
    var aviso = !configurado ? "Sem banco conectado: importe o documento na aba Provas para imprimir agora." :
      (!dbOk ? "Entre com e-mail e senha para carregar as turmas do banco. Importar o documento, na aba Provas, continua valendo." : "");
    status([aviso, prontas()].filter(Boolean).join(" "));
  }

  function prontas() {
    return plural(todasAsProvas().length, "prova", "provas") + " e " +
      plural(estado.alunos.length, "aluno", "alunos") + " prontos para imprimir.";
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
      localStorage.setItem(global.GabaSync.chaveLocal(LOTE_KEY), JSON.stringify(registro));
    } catch (err) {
      status("Lote impresso nao coube no armazenamento do aparelho; o leitor tera que reconstruir as versoes.", true);
      return null;
    }
    return registro;
  }

  /* as versoes impressas vao para o banco para outro aparelho ler a mesma folha */
  function sincronizarLote(prova, registro, msgBase) {
    var conta = snapshotConta();
    if (!registro || !global.GabaDB || !GabaDB.isConfigured()) return;
    if (!GabaDB.eUuid(prova.id)) {
      status(msgBase + " Este lote so existe neste aparelho: a prova ainda nao foi salva no banco.", true);
      return;
    }
    GabaDB.upsertProvaVersoes(prova.id, registro.itens, {
      turma_id: registro.turma_id, em: registro.em, lote_id: registro.lote_id
    }).then(function (n) {
      if (!contaValida(conta)) return;
      status(msgBase + " " + plural(n, "versão", "versões") + " no banco.");
    }).catch(function (err) {
      if (!contaValida(conta)) return;
      status(msgBase + " Versoes ficaram só neste aparelho: " + (err && err.message ? err.message : err), true);
    });
  }

  function loteImpresso(provaId) {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(global.GabaSync.chaveLocal(LOTE_KEY)) || "null"); } catch (err) { o = null; }
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
    var conta = snapshotConta();
    if (!global.GabaFolha || !GabaFolha.medirCorpo) return null;
    try {
      return await GabaFolha.medirCorpo(prova, prova.questoes || [], {
        config: op.config,
        aluno: item ? item.aluno : null,
        versao: item ? item.versao : null,
        turmaNome: op.config.turma
      });
    } catch (err) {
      if (!contaValida(conta)) return null;
      status("Não deu para medir o corpo no papel: " + (err && err.message ? err.message : err), true);
      return null;
    }
  }

  async function gerarLote() {
    var conta = snapshotConta();
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
    if (!contaValida(conta)) return null;
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
      if (!contaValida(conta)) return null;
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
    if (!contaValida(conta)) return null;
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
      " Corpo fechado por medida: " + plural(corpo.length, "página", "páginas") + " de questões, até " + porPagina +
      " por página" + (pedido <= porPagina ? " (o seu limite de " + pedido + " é que mandou)." : ".");
    var estouradas = cadernos[0] && cadernos[0].estouradas || [];
    var giantes = estouradas.length ? " Atenção: " + (estouradas.length === 1 ? "a questão " : "as questões ") +
      estouradas.join(", ") + (estouradas.length === 1 ? " é maior" : " são maiores") + " que uma coluna inteira." : "";
    var msg = plural(batch.itens.length, "caderno", "cadernos") + " de " + porAluno + " folhas (" +
      plural(Number(op.config.colunas), "coluna", "colunas") + ", " + brancas + " em branco no fim), " + folhas + " folhas A4 ao todo, " +
      plural(batch.numTipos, "tipo", "tipos") + " de versão." + encaixe + giantes + " " +
      (impresso ? "O leitor já conhece estas versões. " : "") +
      (p.semGabarito.length ? plural(p.semGabarito.length, "questão", "questões") + " sem gabarito: não dão ponto para ninguém. " : "") +
      "Revise a prévia e clique em Imprimir. " +
      "No diálogo do navegador: papel A4, margens \"Nenhuma\", escala 100% e \"Cabeçalhos e rodapés\" desligado.";
    var aperto = estado.compactou ? " Reduzi o corpo de " + plural(estado.compactou, "caixa", "caixas") +
      " do cabeçalho para que o texto coubesse no papel." : "";
    var corte = estado.cortes.length ? " ATENÇÃO: " + plural(estado.cortes.length, "linha", "linhas") +
      " não caberiam no papel e sairiam cortadas (lista abaixo)." : "";
    status(msg + aperto + corte, estado.cortes.length > 0);
    sincronizarLote(prova, impresso, msg);
    return { folhas: folhas, batch: batch, impresso: impresso, medidas: medidas, porPagina: porPagina };
  }

  async function aoImprimir() {
    var conta = snapshotConta();
    var op = opcoes();
    gravarCfg();
    var root = $("print-root");
    try {
      var r = await gerarLote();
      if (!contaValida(conta) || !r) return;
      if (estado.cortes.length) {
        status("Nao enviei a impressao: " + estado.cortes[0] +
          (estado.cortes.length > 1 ? " (mais " + (estado.cortes.length - 1) + " na lista abaixo)." : "."), true);
        return;
      }
      var prova = provaSelecionada();
      GabaFolha.imprimirNaJanela();
      localStorage.setItem(global.GabaSync.chaveLocal("gaba_ultimo_lote"), JSON.stringify({
        prova_id: prova ? prova.id : null,
        modo: op.modo,
        alunos: r.batch.itens.map(function (it) { return it.aluno.id || it.aluno.numero; }),
        em: new Date().toISOString()
      }));
      status("Impressao enviada (" + r.folhas + " folhas). Se a janela nao abriu, use Ctrl+P.");
    } catch (err) {
      if (!contaValida(conta)) return;
      if (root) root.classList.remove("previa");
      status(String(err && err.message ? err.message : err), true);
    }
  }

  async function baixarHtml() {
    var conta = snapshotConta();
    try {
      if (!estado.ultimoHtml) await gerarLote();
      if (!contaValida(conta)) return;
      var css = "";
      try { css = await (await fetch("style.css")).text(); } catch (err) { css = ""; }
      if (!contaValida(conta)) return;
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
      if (!contaValida(conta)) return;
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
    var conta = snapshotConta();
    if (!file) return;
    if (!global.GabaDocx) { statusProva("O leitor de documentos não carregou.", true); return; }
    statusProva("Lendo " + file.name + "…");
    try {
      var buf = await file.arrayBuffer();
      if (!contaValida(conta)) return;
      var parsed = await lerDocumento(buf);
      if (!contaValida(conta)) return;
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
      if ((prova.tipos || []).length > 1 && ($("cad-modo") || {}).value === "fixa") {
        $("cad-modo").value = "turma";
        $("cad-tipos").value = String(prova.tipos.length);
      }
      await carregarAlunos(prova);
      if (!contaValida(conta)) return;
      desenharProva(prova);
      var guardada = false;
      if (global.GabaSync && GabaSync.guardarProva) {
        try {
          await GabaSync.guardarProva(prova);
          guardada = true;
        } catch (err) { /* segue só em memória e a próxima frase avisa */ }
      }
      if (!contaValida(conta)) return;
      var p = problemasDaProva(prova);
      var tipos = (prova.tipos || []).length;
      var alunos = (prova.alunos || []).length;
      statusProva("Documento importado: " + [plural((prova.questoes || []).length, "questão", "questões"),
        alunos ? plural(alunos, "aluno", "alunos") : "", tipos > 1 ? plural(tipos, "tipo", "tipos") : ""]
        .filter(Boolean).join(", ") + ". " +
        (p.semGabarito.length ? plural(p.semGabarito.length, "questão", "questões") + " sem gabarito. " : "") +
        (guardada ? "Guardada neste aparelho: revise gabarito, peso e descritor na prova aberta abaixo."
          : "Atenção: ela não coube no armazenamento do aparelho e se perde ao fechar a página."), !guardada);
      status(prontas());
      if (global.GabaApp && GabaApp.provaImportada) await GabaApp.provaImportada(prova.id);
    } catch (err) {
      if (!contaValida(conta)) return;
      statusProva("Falha ao importar: " + (err && err.message ? err.message : err), true);
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
    var conta = snapshotConta();
    var prova = provaSelecionada();
    if (!prova) throw new Error("Selecione a prova primeiro.");
    if (!global.GabaDB || !GabaDB.isConfigured()) throw new Error("Sem credenciais do Supabase.");
    var idLocal = String(prova.id);
    try {
      var salvo = await GabaDB.salvarProva(prova);
      if (!contaValida(conta)) return null;
      estado.sujo = false;
      if (!GabaDB.eUuid(prova.id)) {
        await esquecerProvaLocal(idLocal);
        if (!contaValida(conta)) return null;
        prova.id = salvo.id;
        prova.__local = false;
      }
      await carregarListas();
      if (!contaValida(conta)) return null;
      if (global.GabaApp && GabaApp.carregarTudo) await GabaApp.carregarTudo();
      return contaValida(conta) ? salvo : null;
    } catch (err) {
      if (!contaValida(conta)) return null;
      throw err;
    }
  }

  var CAMPOS_CFG = {
    "cad-modelo": "modelo", "cad-rede": "rede", "cad-escola": "escola", "cad-titulo": "titulo",
    "cad-disciplina": "disciplina", "cad-professor": "professor", "cad-ano": "ano",
    "cad-bimestre": "bimestre", "cad-trimestre": "trimestre",
    "cad-data": "data", "cad-instrucoes": "instrucoes", "cad-colunas": "colunas"
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
      comDescritores: op.config.comDescritores, ultimaEmBranco: op.config.ultimaEmBranco,
      modo: op.modo, numTipos: ($("cad-tipos") || {}).value,
      salt: campo("cad-salt"), embaralharAlternativas: op.embaralharAlternativas
    });
  }

  var defaultsCfg = {};
  var listenersCfg = {};

  function restaurarCfg() {
    var cfg = lerCfg();
    var campos = Object.assign({}, CAMPOS_CFG, {
      "cad-por-pagina": "questoesPorPagina", "cad-branco": "ultimaEmBranco",
      "cad-descritores": "comDescritores", "cad-modo": "modo", "cad-tipos": "numTipos",
      "cad-salt": "salt", "cad-alt": "embaralharAlternativas"
    });
    escolaAuto = String(cfg.escolaAuto || "");
    Object.keys(campos).forEach(function (id) {
      var el = $(id);
      if (!el) return;
      if (!defaultsCfg[id]) {
        var valorDefault = el.defaultValue;
        if (el.tagName === "SELECT") {
          valorDefault = el.options.length ? el.options[0].value : "";
          for (var i = 0; i < el.options.length; i++) {
            if (el.options[i].defaultSelected) valorDefault = el.options[i].value;
          }
        }
        defaultsCfg[id] = { valor: valorDefault == null ? "" : valorDefault, checked: el.defaultChecked };
      }
      el.value = defaultsCfg[id].valor;
      if (el.type === "checkbox") el.checked = defaultsCfg[id].checked;
      var valor = cfg[campos[id]];
      if (valor != null) {
        if (el.type === "checkbox") el.checked = valor === true;
        else if (el.tagName === "SELECT") {
          for (var j = 0; j < el.options.length; j++) {
            if (el.options[j].value === String(valor)) { el.value = String(valor); break; }
          }
        } else el.value = String(valor);
      }
      if (!listenersCfg[id]) {
        el.addEventListener("change", gravarCfg);
        listenersCfg[id] = true;
      }
    });
  }

  function reiniciarConta() {
    geracaoConta += 1;
    clearTimeout(guardaProva);
    guardaProva = null;
    fecharPick();
    provaDesenhada = "";
    escolaAuto = "";
    estado.provasLocais = [];
    estado.provasSupabase = [];
    estado.turmas = [];
    estado.alunos = [];
    estado.batch = null;
    estado.ultimoHtml = "";
    estado.cortes = [];
    estado.compactou = 0;
    estado.sujo = false;
    ["cad-prova", "cad-turma"].forEach(function (id) {
      var el = $(id);
      if (el) { el.innerHTML = '<option value=""></option>'; el.value = ""; }
    });
    ["cad-alunos", "cad-questoes", "cad-avisos", "cad-cortes", "cad-nota-prova",
      "cad-status", "prova-status", "revisao-status"].forEach(function (id) {
      var el = $(id);
      if (el) { el.innerHTML = ""; el.hidden = true; }
    });
    var input = $("cad-arquivo");
    if (input) input.value = "";
    var root = $("print-root");
    if (root) { root.innerHTML = ""; root.classList.remove("previa"); }
    var imprimir = $("cad-imprimir");
    if (imprimir) imprimir.disabled = true;
    mostraBotaoSalvar(null);
    restaurarCfg();
    atualizarCaderno();
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
      var conta = snapshotConta();
      gerarLote().catch(function (err) {
        if (contaValida(conta)) status(String(err && err.message ? err.message : err), true);
      });
    });
    if (btnImp) btnImp.addEventListener("click", aoImprimir);
    if (btnBaixar) btnBaixar.addEventListener("click", baixarHtml);
    if (btnDocx && input) btnDocx.addEventListener("click", function () { input.click(); });
    if (input) input.addEventListener("change", function () { importarDocx(input.files && input.files[0]); });
    var selTurma = $("cad-turma");
    if (selTurma) selTurma.addEventListener("change", function () {
      herdarEscolaDaTurma();
      var conta = snapshotConta();
      carregarAlunos(provaSelecionada()).catch(function (err) {
        if (contaValida(conta)) status(String(err.message || err), true);
      });
    });
    var selProva = $("cad-prova");
    if (selProva) selProva.addEventListener("change", function () {
      var prova = provaSelecionada();
      trocouProva(prova);
      var conta = snapshotConta();
      carregarAlunos(prova).catch(function (err) {
        if (contaValida(conta)) status(String(err.message || err), true);
      });
    });
    ligarPassos();
    var painel = $("cad-questoes");
    if (painel) {
      painel.addEventListener("change", function (ev) {
        var el = ev.target;
        if (!el || !el.dataset || !el.dataset.campo) return;
        aplicarEdicao(el);
      });
      /* o seletor de descritor: abre no foco, acompanha o teclado e fecha fora dele */
      painel.addEventListener("focusin", function (ev) {
        if (eraDescritor(ev.target)) abrirPick(ev.target);
      });
      painel.addEventListener("click", function (ev) {
        if (!eraDescritor(ev.target)) return;
        if (pick && pick.input === ev.target) atualizarPick();
        else abrirPick(ev.target);
      });
      painel.addEventListener("input", function (ev) {
        if (!eraDescritor(ev.target)) return;
        if (pick && pick.input === ev.target) atualizarPick();
        else abrirPick(ev.target);
      });
      painel.addEventListener("keydown", function (ev) {
        var el = ev.target;
        if (!eraDescritor(el) || !pick || pick.input !== el) return;
        if (ev.key === "ArrowDown") { ev.preventDefault(); moverPick(1); }
        else if (ev.key === "ArrowUp") { ev.preventDefault(); moverPick(-1); }
        else if (ev.key === "Escape") { fecharPick(); }
        else if (ev.key === "Enter" && pick.ativo >= 0) { ev.preventDefault(); escolherPick(pick.ativo); }
      });
    }
    document.addEventListener("mousedown", function (ev) {
      if (!pick) return;
      var el = ev.target;
      if (el === pick.input || (pick.el.contains && pick.el.contains(el))) return;
      fecharPick();
    });
    /* a caixa flutua sobre a página: rolar sem fechar tem que levar ela junto */
    window.addEventListener("scroll", function () { if (pick) posicionarPick(); }, true);
    window.addEventListener("resize", function () { if (pick) posicionarPick(); });
    var btnSalvarProva = $("cad-salvar-prova");
    if (btnSalvarProva) btnSalvarProva.addEventListener("click", function () {
      var conta = snapshotConta();
      salvarProvaNoBanco().then(function (salvo) {
        if (!contaValida(conta) || !salvo) return;
        statusRevisao("Prova \"" + salvo.titulo + "\" salva no banco com os pesos e descritores revisados.");
      }).catch(function (err) {
        if (!contaValida(conta)) return;
        statusRevisao("Não deu para salvar no banco: " + (err && err.message ? err.message : err), true);
      });
    });
    carregarListas().catch(function () { /* ja avisou */ });
  }

  /* os controles visíveis espelham os selects escondidos, que continuam sendo a fonte da verdade */
  function ligarPassos() {
    function mudar(id, valor) {
      var el = $(id);
      if (!el) return;
      el.value = String(valor);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    [].forEach.call(document.querySelectorAll("input[name=cad-modo-r]"), function (r) {
      r.addEventListener("change", function () { if (r.checked) mudar("cad-modo", r.value); });
    });
    [].forEach.call(document.querySelectorAll(".segmento-campo [data-col]"), function (b) {
      b.addEventListener("click", function () { mudar("cad-colunas", b.dataset.col); });
    });
    [].forEach.call(document.querySelectorAll("[data-tipos]"), function (b) {
      b.addEventListener("click", function () {
        var atual = parseInt(($("cad-tipos") || {}).value, 10) || 4;
        mudar("cad-tipos", Math.max(1, Math.min(26, atual + Number(b.dataset.tipos))));
      });
    });
    ["cad-modo", "cad-tipos", "cad-colunas", "cad-modelo", "cad-branco", "cad-descritores"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", atualizarCaderno);
    });
    var mudarFolha = $("cad-folha-mudar");
    var opcoesFolha = $("cad-folha-opcoes");
    if (mudarFolha && opcoesFolha) mudarFolha.addEventListener("click", function () {
      var abrir = opcoesFolha.hidden;
      opcoesFolha.hidden = !abrir;
      mudarFolha.textContent = abrir ? "Fechar" : "Mudar";
      mudarFolha.setAttribute("aria-expanded", String(abrir));
    });
    var fatoProva = $("cad-fato-prova");
    if (fatoProva) fatoProva.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-revisar]");
      if (b && global.GabaApp && GabaApp.revisarProva) GabaApp.revisarProva(b.dataset.revisar);
    });
    atualizarCaderno();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.GabaCaderno = {
    estado: estado,
    reiniciarConta: reiniciarConta,
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
    atualizarCaderno: atualizarCaderno,
    aplicarEdicao: aplicarEdicao,
    esquecerProvaLocal: esquecerProvaLocal,
    salvarProvaNoBanco: salvarProvaNoBanco,
    /* o seletor de descritor, para o teste bater na campainha sem depender de foco de browser */
    seletorDeDescritor: {
      abrir: abrirPick,
      digitar: function (el, texto) {
        el.value = texto;
        if (pick && pick.input === el) atualizarPick();
        else abrirPick(el);
      },
      mover: moverPick,
      escolher: escolherPick,
      fechar: fecharPick,
      aberto: function () { return !!pick; },
      itens: function () { return pick ? pick.itens.slice() : []; },
      ativo: function () { return pick ? pick.ativo : -1; },
      contexto: contextoDaProva,
      listaDe: function (texto, contexto) { return itensDoDescritor(texto, contexto); }
    },
    aoAbrir: function () { carregarListas().catch(function () { /* avisado */ }); }
  };
})(typeof window !== "undefined" ? window : globalThis);
