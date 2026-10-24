/* Abas, cadastros e relatório de notas.
   O trabalho pesado (OMR, caderno, QR, versões) está nos módulos de js/; daqui só
   se monta a tela e se lê/escreve o banco que o professor configurou neste aparelho. */
(function () {
  "use strict";

  var app = {
    turmas: [],
    alunos: [],
    provas: [],
    locais: [],
    correcoes: [],
    leituras: [],
    escolas: [],
    professor: null,
    momento: 0
  };

  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function aviso(msg, tipo) {
    var el = $("app-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "app-status" + (msg ? " mostra" : "") + (msg && tipo ? " " + tipo : "");
  }

  function mensagemErro(err) {
    var m = String(err && err.message ? err.message : err || "");
    if (/duplicate key/i.test(m)) return "Já existe um registro com esse número (ou e-mail) no banco.";
    if (/does not exist|PGRST202|schema cache|Could not find/i.test(m)) {
      return "O banco ainda não tem as tabelas e colunas novas: rode supabase/schema.sql no SQL Editor do Supabase.";
    }
    if (/invalid input syntax for type uuid/i.test(m)) return "Há um id que ainda só existe neste aparelho.";
    if (/Failed to fetch|NetworkError|fetch/i.test(m)) return "Sem rede: o registro ficou guardado neste aparelho.";
    if (/Invalid login credentials/i.test(m)) return "E-mail ou senha não batem. Ainda não tem conta? Use \"Criar conta de professor\".";
    if (/row-level security|permission denied for table|42501|401 unauthorized/i.test(m)) {
      return "O banco só atende quem entrou. Faça o login na aba Ajustes; o que você fizer até lá fica neste aparelho.";
    }
    if (/Email not confirmed|confirm(?:ation)? (?:link|e-?mail)|verify.*e-?mail/i.test(m)) {
      return "Falta confirmar o e-mail: abra a mensagem que o Supabase enviou, ou desligue \"Confirm email\" no projeto.";
    }
    if (/User already registered|already exists/i.test(m)) return "Já existe uma conta com esse e-mail: entre em vez de criar.";
    return m || "Erro desconhecido.";
  }

  function temConexao() {
    return Boolean(window.GabaDB && GabaDB.isConfigured());
  }

  /* o banco agora so atende quem entrou: a anon key esta no pacote publico, entao a
     trava e a sessao do professor. sem ela o app segue trabalhando no aparelho. */
  function dbOk() {
    return temConexao() && Boolean(app.professor);
  }

  function faltaParaOBanco() {
    return temConexao()
      ? "Entre com o seu e-mail e a sua senha na aba Ajustes: sem login o banco não atende."
      : "Sem conexão com o banco. Configure em Ajustes > Banco de dados.";
  }

  /* no selo cabe so o primeiro nome: "Profa. Ana Lima (teste)" vira "Ana" */
  function primeiroNome(nome) {
    return String(nome || "").replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(function (p) {
      return p && !/^(prof|profa|profª|professora?|dr|dra|sr|sra)\.?$/i.test(p);
    })[0] || "";
  }

  function rotuloSelo(el, texto, completo) {
    var s = document.createElement("span");
    s.className = "selo-texto";
    s.textContent = texto;
    el.textContent = "";
    el.appendChild(s);
    el.removeAttribute("title");
    el.setAttribute("aria-label", completo || texto);
  }

  function badge() {
    var el = $("status-conexao");
    if (!el) return;
    if (dbOk()) {
      var cfg = GabaDB.readConfig ? GabaDB.readConfig() : {};
      var nome = app.professor.nome || cfg.professorNome || "";
      rotuloSelo(el, primeiroNome(nome) || "Conectado", "Conectado como " + (nome || app.professor.email || "professor"));
      el.className = "badge badge-on";
    } else if (temConexao()) {
      rotuloSelo(el, "Entrar", "Entrar com e-mail e senha");
      el.className = "badge badge-off";
    } else {
      rotuloSelo(el, "Só neste aparelho", "Só neste aparelho: configure o banco em Ajustes");
      el.className = "badge badge-off";
    }
  }

  /* ------------------------------------------------------------------ dados */

  var cargaDados = 0;
  var versaoConta = 0;
  var clienteObservado = null;
  var assinaturaConta = null;

  function validarConta(versao) {
    if (versao !== versaoConta) throw new Error("A conta mudou durante a operação. Tente novamente.");
  }

  function mudarConta(usuario) {
    app.professor = usuario ? {
      id: usuario.id, email: usuario.email || "",
      nome: usuario.nome || (usuario.user_metadata || {}).nome || ""
    } : null;
    if (!GabaSync.definirConta(app.professor)) return false;
    versaoConta++;
    app.turmas = []; app.alunos = []; app.provas = []; app.locais = [];
    app.correcoes = []; app.leituras = []; app.escolas = []; app.momento = 0;
    document.querySelectorAll("form:not(#form-config)").forEach(function (form) { form.reset(); });
    limparLista();
    Object.assign(impt, { alvo: "", escola: "", arquivo: "", lendo: false, salvando: false, erro: "",
      turmas: [], ignoradas: [], repetidas: [], saidas: 0, marcadas: {}, nomes: {}, ids: Object.create(null),
      ano: "", comAlunos: true, feito: null });
    desenharImportacaoTurmas();
    ana.itens = []; ana.provaId = "";
    ab.modelo = null; ab.dados = null; ab.questao = null; ab.descritor = null; ab.retornoFicha = null;
    provaRevisada = "";
    if (painel.resolver) fecharPainel(null);
    var ficha = $("ab-ficha");
    if (ficha && ficha.open) ficha.close();
    ["ab-ficha-titulo", "ab-ficha-subtitulo", "ab-ficha-conteudo", "prova-status", "revisao-status"].forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = "";
    });
    if (window.GabaCaderno) GabaCaderno.reiniciarConta();
    if (window.GabaScanner) GabaScanner.reiniciarConta();
    if (window.GabaAjuda) GabaAjuda.reiniciarConta();
    desenharTudo();
    badge();
    desenharAjustes();
    atualizarBannerBackup();
    atualizarStatusBackup();
    return true;
  }

  function observarConta() {
    var client = temConexao() ? GabaDB.getClient() : null;
    if (client === clienteObservado) return;
    if (assinaturaConta) assinaturaConta.unsubscribe();
    clienteObservado = client;
    assinaturaConta = null;
    if (!client || !client.auth || !client.auth.onAuthStateChange) return;
    assinaturaConta = client.auth.onAuthStateChange(function (evento, sessao) {
      if (mudarConta(sessao && sessao.user)) {
        setTimeout(function () { carregarTudo(); }, 0);
      }
    }).data.subscription;
  }

  async function carregarTudo() {
    var pedido = ++cargaDados;
    await carregarProfessor();
    var versao = versaoConta;
    function vigente() { return pedido === cargaDados && versao === versaoConta; }
    if (!vigente()) return;
    badge();
    if (window.GabaCaderno && GabaCaderno.carregarProvasLocais) {
      try {
        await GabaCaderno.carregarProvasLocais();
      } catch (err) {
        /* fica com o que já está em memória */
      }
    }
    if (!vigente()) return;
    app.locais = (window.GabaCaderno && GabaCaderno.estado && GabaCaderno.estado.provasLocais) || [];
    try {
      var leituras = window.GabaSync ? await GabaSync.listResults() : [];
      if (!vigente()) return;
      app.leituras = leituras;
    } catch (err) {
      if (!vigente()) return;
      app.leituras = [];
    }
    if (dbOk()) {
      try {
        var tudo = await Promise.all([
          GabaDB.listTurmas(), GabaDB.listAlunos(), GabaDB.listProvas(), GabaDB.fetchCorrecoes()
        ]);
        if (!vigente()) return;
        app.turmas = tudo[0] || [];
        app.alunos = tudo[1] || [];
        app.provas = tudo[2] || [];
        app.correcoes = tudo[3] || [];
      } catch (err) {
        if (!vigente()) return;
        aviso(mensagemErro(err), "erro");
      }
    } else {
      app.turmas = [];
      app.alunos = [];
      app.provas = [];
      app.correcoes = [];
    }
    await carregarEscolas();
    if (!vigente()) return;
    app.momento = Date.now();
    desenharTudo();
    desenharAjustes();
    atualizarBannerBackup();
    atualizarStatusBackup();
  }

  async function carregarEscolas() {
    var versao = versaoConta;
    app.escolas = [];
    if (!dbOk() || !GabaDB.listEscolas) return;
    try {
      var escolas = await GabaDB.listEscolas();
      if (versao !== versaoConta) return;
      app.escolas = escolas;
      if (window.GabaEscolas) GabaEscolas.sincronizar(app.escolas);
    } catch (err) {
      if (versao === versaoConta) app.escolas = [];
    }
  }

  async function carregarProfessor() {
    observarConta();
    var versao = versaoConta;
    var usuario = null;
    if (temConexao() && GabaDB.usuario) {
      try { usuario = await GabaDB.usuario(); } catch (err) { usuario = null; }
    }
    if (versao === versaoConta) mudarConta(usuario);
  }

  async function descerFila() {
    if (!window.GabaSync || !GabaSync.flush) return null;
    try {
      var r = await GabaSync.flush();
      return { synced: (r && r.synced) || 0, restantes: await GabaSync.countPending() };
    } catch (err) {
      return null;
    }
  }

  function atualizarAba() {
    if (!app.momento || Date.now() - app.momento > 15000) return carregarTudo();
    desenharTudo();
    return Promise.resolve();
  }

  /* ------------------------------------------------------------------ painel do Gaba
     no lugar do confirm/prompt do navegador: mesmo texto, mesmos botões do resto do app */

  var painel = { resolver: null, op: null, voltar: null };

  function escolhaHtml(nome, valor, titulo, texto, marcado) {
    return '<label class="escolha"><input type="radio" name="' + nome + '" value="' + esc(valor) + '"' +
      (marcado ? " checked" : "") + '><span class="escolha-titulo">' + esc(titulo) + "</span>" +
      (texto ? '<span class="escolha-texto">' + esc(texto) + "</span>" : "") + "</label>";
  }

  function fecharPainel(valor) {
    if (!painel.resolver) return;
    var resolver = painel.resolver;
    var voltar = painel.voltar;
    painel.resolver = null;
    painel.op = null;
    painel.voltar = null;
    $("dlg").hidden = true;
    $("dlg-fundo").hidden = true;
    if (voltar && voltar.focus && document.body.contains(voltar)) voltar.focus();
    resolver(valor);
  }

  /* undefined = ainda falta escolher ou escrever: o painel fica aberto */
  function valorDoPainel() {
    var op = painel.op || {};
    if (op.campo) return $("dlg-campo").value.trim() || undefined;
    if (op.opcoes) {
      var marcado = $("dlg-opcoes").querySelector("input[type=radio]:checked");
      if (!marcado) return undefined;
      if (marcado.value !== "__outra") return marcado.value;
      return $("dlg-outra-in").value.trim() || undefined;
    }
    return true;
  }

  function confirmarPainel() {
    var v = valorDoPainel();
    if (v !== undefined) {
      fecharPainel(v);
      return;
    }
    var falta = painel.op && painel.op.campo ? $("dlg-campo")
      : $("dlg-outra") && !$("dlg-outra").hidden ? $("dlg-outra-in")
        : $("dlg-opcoes").querySelector("input[type=radio]");
    if (falta) falta.focus();
  }

  function pedir(op) {
    fecharPainel(null);
    var d = $("dlg");
    if (!d) return Promise.resolve(null);
    painel.op = op;
    painel.voltar = document.activeElement;
    $("dlg-titulo").textContent = op.titulo || "";
    var texto = $("dlg-texto");
    texto.textContent = op.texto || "";
    texto.hidden = !op.texto;
    $("dlg-campo-box").hidden = !op.campo;
    if (op.campo) {
      $("dlg-campo-rotulo").textContent = op.campo.rotulo || "";
      $("dlg-campo").value = op.campo.valor || "";
      $("dlg-campo").placeholder = op.campo.placeholder || "";
    }
    var opcoes = $("dlg-opcoes");
    opcoes.hidden = !op.opcoes;
    opcoes.innerHTML = !op.opcoes ? "" : op.opcoes.map(function (o) {
      return escolhaHtml("dlg-escolha", o.valor, o.titulo, o.texto, o.marcado);
    }).join("") + (!op.outra ? "" : escolhaHtml("dlg-escolha", "__outra", op.outra.titulo, "", false) +
      '<div class="field" id="dlg-outra" hidden><label for="dlg-outra-in">' + esc(op.outra.rotulo) +
      '</label><input type="text" id="dlg-outra-in" autocomplete="off" placeholder="' +
      esc(op.outra.placeholder || "") + '"></div>');
    var ok = $("dlg-ok");
    ok.textContent = op.ok || "Salvar";
    ok.className = op.perigo ? "btn-perigo-cheio" : "btn-primary";
    ok.hidden = Boolean(op.imediato);
    $("dlg-cancelar").textContent = op.cancelar || "Cancelar";
    $("dlg-fundo").hidden = false;
    d.hidden = false;
    var promessa = new Promise(function (resolver) { painel.resolver = resolver; });
    var foco = op.campo ? $("dlg-campo")
      : opcoes.querySelector("input:checked") || opcoes.querySelector("input") || $("dlg-cancelar");
    foco.focus();
    if (op.campo) foco.select();
    return promessa;
  }

  function ligarPainel() {
    var d = $("dlg");
    if (!d) return;
    $("dlg-fundo").addEventListener("click", function () { fecharPainel(null); });
    $("dlg-cancelar").addEventListener("click", function () { fecharPainel(null); });
    $("dlg-ok").addEventListener("click", confirmarPainel);
    /* escolha imediata só no clique: com o teclado, a seta anda e o Enter confirma */
    var pelaMao = false;
    $("dlg-opcoes").addEventListener("pointerdown", function () { pelaMao = true; });
    $("dlg-opcoes").addEventListener("click", function (ev) {
      if (!pelaMao || !painel.op || !painel.op.imediato) return;
      if (ev.target.name !== "dlg-escolha") return;
      pelaMao = false;
      confirmarPainel();
    });
    $("dlg-opcoes").addEventListener("change", function (ev) {
      if (ev.target.name !== "dlg-escolha" || !painel.op || painel.op.imediato) return;
      var outra = $("dlg-outra");
      if (!outra) return;
      outra.hidden = ev.target.value !== "__outra";
      if (!outra.hidden) $("dlg-outra-in").focus();
    });
    document.addEventListener("keydown", function (ev) {
      if (!painel.resolver) return;
      pelaMao = false;
      if (ev.key === "Escape") {
        ev.preventDefault();
        fecharPainel(null);
      } else if (ev.key === "Enter" && ev.target.matches && ev.target.matches("#dlg input")) {
        ev.preventDefault();
        confirmarPainel();
      } else if (ev.key === "Tab") {
        var focaveis = [].slice.call(d.querySelectorAll("input, button")).filter(function (el) {
          return el.offsetParent !== null && !el.disabled;
        });
        if (!focaveis.length) return;
        var primeiro = focaveis[0];
        var ultimo = focaveis[focaveis.length - 1];
        if (ev.shiftKey && (document.activeElement === primeiro || !d.contains(document.activeElement))) {
          ev.preventDefault();
          ultimo.focus();
        } else if (!ev.shiftKey && (document.activeElement === ultimo || !d.contains(document.activeElement))) {
          ev.preventDefault();
          primeiro.focus();
        }
      }
    });
  }

  function plural(n, um, varios) {
    return n + " " + (n === 1 ? um : varios);
  }

  /* o seletor de escola do topo, no painel do Gaba */
  async function escolherEscolaTopo() {
    var E = window.GabaEscolas;
    var sel = $("filtro-escola");
    if (!E || !sel) return;
    var atual = E.chave(E.filtro());
    var lista = E.noFiltro(app.turmas);
    var sem = app.turmas.filter(function (t) { return !E.normalizar(t.escola); }).length;
    var opcoes = [{ valor: "", titulo: "Todas as escolas", texto: plural(app.turmas.length, "turma", "turmas"), marcado: !atual }]
      .concat(lista.map(function (e) {
        return { valor: e.nome, titulo: e.nome, texto: e.turmas ? plural(e.turmas, "turma", "turmas") : "ainda sem turma",
          marcado: atual === e.chave };
      }));
    if (sem) {
      opcoes.push({ valor: E.SEM_ESCOLA, titulo: "Sem escola", texto: plural(sem, "turma", "turmas"),
        marcado: atual === E.chave(E.SEM_ESCOLA) });
    }
    var escolhida = await pedir({
      titulo: "Trabalhar em qual escola?",
      texto: "As listas de turmas, provas e notas mostram só a escola escolhida.",
      opcoes: opcoes,
      imediato: true,
      cancelar: "Fechar"
    });
    if (escolhida === null || E.chave(escolhida) === atual) return;
    sel.value = escolhida;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function executar(nome, id, extra) {
    var versao = versaoConta;
    var alvo;
    try {
      if (nome === "turma-aqui") {
        aplicarEscola(id);
        return;
      } else if (nome === "importar-turmas") {
        /* o seletor de arquivo so abre dentro do mesmo toque, antes de qualquer await */
        abrirImportacaoTurmas(id);
        return;
      } else if (nome === "escola-filtrar") {
        var E = window.GabaEscolas;
        if (!E) return;
        E.setFiltro(E.chave(E.filtro()) === E.chave(id) ? "" : id);
        desenharTudo();
        return;
      } else if (nome === "apagar-escola") {
        var quantas = window.GabaEscolas ? app.turmas.filter(function (t) {
          return GabaEscolas.chave(t.escola) === GabaEscolas.chave(id);
        }).length : 0;
        var tirar = await pedir({
          titulo: "Tirar a escola " + id + " do cadastro?",
          texto: (quantas === 1 ? "A turma com esse nome continua com o nome dela. "
            : quantas > 1 ? "As " + quantas + " turmas com esse nome continuam com o nome delas. " : "") +
            "Dá para criar a escola de novo depois.",
          ok: "Tirar do cadastro",
          perigo: true
        });
        if (!tirar || versao !== versaoConta) return;
        await tirarEscola(id);
        validarConta(versao);
        aviso("Escola fora do cadastro.", "ok");
      } else if (nome === "escola-turma") {
        var outra = app.turmas.filter(function (x) { return String(x.id) === id; })[0];
        if (!outra) return;
        var Esc = window.GabaEscolas;
        var daTurma = Esc ? Esc.chave(outra.escola) : "";
        var escola = await pedir({
          titulo: "Escola da turma " + outra.nome,
          opcoes: (Esc ? Esc.noFiltro(app.turmas) : []).map(function (e) {
            return { valor: e.nome, titulo: e.nome, marcado: daTurma === e.chave };
          }).concat([{ valor: "", titulo: "Sem escola", texto: "A turma fica no grupo “sem escola”.", marcado: !daTurma }]),
          outra: { titulo: "Outra escola…", rotulo: "Nome da outra escola", placeholder: "Ex.: EEFM da Serra" }
        });
        if (escola === null || versao !== versaoConta) return;
        await GabaDB.salvarTurma({ id: id, nome: outra.nome, ano: outra.ano, escola: escola });
        validarConta(versao);
        aviso("Escola da turma atualizada.", "ok");
      } else if (nome === "renomear-turma") {
        var t = app.turmas.filter(function (x) { return String(x.id) === id; })[0];
        var nomeNovo = t ? await pedir({ titulo: "Renomear turma", campo: { rotulo: "Nome da turma", valor: t.nome } }) : null;
        if (nomeNovo === null || versao !== versaoConta) return;
        await GabaDB.salvarTurma({ id: id, nome: nomeNovo, ano: t ? t.ano : "", escola: t ? t.escola : "" });
        validarConta(versao);
        aviso("Turma atualizada.", "ok");
      } else if (nome === "apagar-turma") {
        alvo = app.turmas.filter(function (x) { return String(x.id) === id; })[0];
        var qtd = app.alunos.filter(function (a) { return String(a.turma_id) === id; }).length;
        var apagarTurma = await pedir({
          titulo: "Apagar a turma " + (alvo ? alvo.nome : id) + "?",
          texto: (qtd === 0 ? "A turma não tem alunos. " : qtd === 1 ? "O aluno dela sai junto. "
            : "Os " + qtd + " alunos dela saem junto. ") + "As notas já corrigidas continuam no banco.",
          ok: "Apagar turma",
          perigo: true
        });
        if (!apagarTurma || versao !== versaoConta) return;
        await GabaDB.excluirTurma(id);
        validarConta(versao);
        aviso("Turma apagada.", "ok");
      } else if (nome === "apagar-aluno") {
        alvo = app.alunos.filter(function (x) { return String(x.id) === id; })[0];
        var apagarAluno = await pedir({
          titulo: "Apagar " + (alvo ? alvo.nome + " (nº " + alvo.numero + ")" : "este aluno") + "?",
          texto: "As folhas impressas dele continuam podendo ser lidas.",
          ok: "Apagar",
          perigo: true
        });
        if (!apagarAluno || versao !== versaoConta) return;
        await GabaDB.excluirAluno(id);
        validarConta(versao);
        aviso("Aluno apagado.", "ok");
      } else if (nome === "salvar-prova-no-banco") {
        await salvarProvaLocal(id);
        return;
      } else if (nome === "apagar-prova") {
        alvo = app.provas.filter(function (x) { return String(x.id) === id; })[0];
        var apagarProva = await pedir({
          titulo: "Apagar a prova " + (alvo ? alvo.titulo : id) + "?",
          texto: "As notas já corrigidas continuam no banco.",
          ok: "Apagar prova",
          perigo: true
        });
        if (!apagarProva || versao !== versaoConta) return;
        await GabaDB.excluirProva(id);
        validarConta(versao);
        aviso("Prova apagada.", "ok");
      } else if (nome === "revisar-prova") {
        await revisarProva(provaRevisada === id ? "" : id);
        return;
      } else if (nome === "prova-no-caderno") {
        abrirNoCaderno(id);
        return;
      } else if (nome === "prova-no-leitor") {
        abrirNoLeitor(id);
        return;
      } else if (nome === "sincronizar-fila") {
        if (!window.GabaSync) return;
        var r = await GabaSync.flush();
        validarConta(versao);
        var restantes = await GabaSync.countPending();
        validarConta(versao);
        if (r && r.reason === "unauthenticated") {
          aviso("Sem login o banco não atende: " + plural(restantes, "leitura presa", "leituras presas") + " neste aparelho. Entre na aba Ajustes.", "erro");
        } else {
          aviso((r.synced ? plural(r.synced, "leitura subiu", "leituras subiram") + " ao banco. " : "") +
            (restantes ? plural(restantes, "leitura", "leituras") + " ainda só neste aparelho." : "Nada parado no aparelho."), restantes ? "erro" : "ok");
        }
      } else {
        return;
      }
    } catch (err) {
      if (versao !== versaoConta) return;
      aviso(mensagemErro(err), "erro");
    }
    if (versao !== versaoConta) return;
    await carregarTudo();
  }

  /* uma prova importada de .docx tem id "docx-...": ao salvar no banco o id muda, entao
     as folhas impressas antes deixam de bater com as versoes novas. */
  async function salvarProvaLocal(id) {
    var versao = versaoConta;
    var prova = (app.locais || []).filter(function (p) { return String(p.id) === id; })[0];
    if (!prova) {
      aviso("Essa prova não está mais neste aparelho.", "erro");
      return;
    }
    var salvo = await GabaDB.salvarProva(prova);
    validarConta(versao);
    var lote = window.GabaCaderno && GabaCaderno.loteImpresso ? GabaCaderno.loteImpresso(id) : null;
    var revisando = provaRevisada === id;
    prova.__local = false;
    if (window.GabaCaderno && GabaCaderno.esquecerProvaLocal) await GabaCaderno.esquecerProvaLocal(id);
    validarConta(versao);
    prova.id = salvo.id;
    await carregarTudo();
    validarConta(versao);
    if (revisando) await revisarProva(salvo.id);
    validarConta(versao);
    if (lote) {
      aviso("Prova salva no banco como \"" + salvo.titulo + "\". ATENÇÃO: você já tinha impresso " +
        plural(lote.itens.length, "caderno", "cadernos") + " com o id antigo: imprima de novo antes de ler, senão o leitor " +
        "não reconhece as folhas.", "erro");
    } else {
      aviso("Prova salva no banco como \"" + salvo.titulo + "\". Já dá para imprimir os cadernos.", "ok");
    }
  }

  /* ------------------------------------------------ importar a lista de chamada inteira */

  var imp = { alunos: [], problemas: [], fonte: "", colunas: null, puladas: 0, salvo: 0 };

  /* o que o professor abriu na aba Ajustes: nada disso sobrevive a uma troca de aba */
  var ajustes = { contaAberta: false, credencialAberta: false };

  var PAPEIS_PT = { numero: "Nº", nome: "Nome", matricula: "Matrícula", tipo: "Tipo de caderno",
    responsavel: "Responsável", email: "E-mail", telefone: "Telefone" };

  function impStatus(msg, tipo) {
    var el = $("imp-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "app-status" + (msg ? " mostra" : "") + (msg && tipo ? " " + tipo : "");
  }

  function colunasLidas() {
    if (!imp.colunas) return "";
    return Object.keys(imp.colunas).filter(function (papel) {
      return imp.colunas[papel] >= 0;
    }).map(function (papel) {
      return PAPEIS_PT[papel] + " (coluna " + (imp.colunas[papel] + 1) + ")";
    }).join(", ");
  }

  function desenharPrevia(aviso) {
    var box = $("imp-previa");
    var salvar = $("imp-salvar");
    if (!box) return;
    if (!imp.alunos.length) {
      box.innerHTML = "";
      if (salvar) salvar.disabled = true;
      impStatus(aviso || "Nada para importar ainda.", "erro");
      return;
    }
    var problemas = imp.problemas.slice();
    if (aviso) problemas.push(aviso);
    var mostrados = imp.alunos.slice(0, 60);
    box.innerHTML =
      '<div class="imp-resumo"><strong>' + plural(imp.alunos.length, "aluno lido", "alunos lidos") + "</strong>" +
      (imp.fonte ? ' da aba "<em>' + esc(imp.fonte) + "</em>\"" : "") +
      " &middot; " + plural(imp.puladas, "linha ignorada", "linhas ignoradas") +
      (colunasLidas() ? " &middot; " + esc(colunasLidas()) : "") + "</div>" +
      (problemas.length ? '<ul class="imp-problemas">' + problemas.map(function (p) {
        return "<li>" + esc(p) + "</li>";
      }).join("") + "</ul>" : "") +
      '<div class="imp-tabela"><table><thead><tr><th>Nº</th><th>Nome</th><th>Matrícula</th><th>Tipo</th>' +
      "<th>Responsável</th><th>E-mail</th><th>Telefone</th></tr></thead><tbody>" +
      mostrados.map(function (a) {
        return "<tr><td>" + esc(a.numero) + (a.numeroAutomatico ? "*" : "") + "</td><td>" + esc(a.nome) +
          "</td><td>" + esc(a.matricula || "") + "</td><td>" + esc(a.tipo || "") + "</td>" +
          "<td>" + esc(a.responsavel || "") + "</td><td>" + esc(a.email_responsavel || "") +
          "</td><td>" + esc(a.telefone_responsavel || "") + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      (imp.alunos.length > mostrados.length
        ? '<p class="text-muted">+ ' + plural(imp.alunos.length - mostrados.length, "aluno", "alunos") + " na mesma lista.</p>" : "") +
      (imp.alunos.some(function (a) { return a.numeroAutomatico; })
        ? '<p class="text-muted">* linha sem número de chamada: o Nº foi dado na ordem.</p>' : "");
    if (salvar) salvar.disabled = false;
    if (!aviso) impStatus("Pronto para salvar " + plural(imp.alunos.length, "aluno", "alunos") + ". Leia os avisos antes.", "ok");
  }

  /* cada aba vira uma lista possivel; a que mais parece chamada e a escolhida */
  function analisar(itens) {
    var L = window.GabaLista;
    var P = window.GabaPlanilha;
    if (!L || !P) {
      impStatus("Os leitores de planilha não carregaram: recarregue a página.", "erro");
      return;
    }
    var avaliados = (itens || []).map(function (it) {
      return { fonte: it.rotulo, lista: L.montar(it.linhas) };
    }).filter(function (a) { return a.lista && a.lista.alunos.length; });
    var escolha = avaliados.length ? L.melhorDasListas(avaliados) : null;
    if (!escolha) {
      imp.alunos = [];
      imp.problemas = [];
      imp.fonte = "";
      imp.colunas = null;
      imp.puladas = 0;
      desenharPrevia((itens || []).length > 1
        ? "Nenhuma aba tem coluna de Nº (ou número) e de Nome juntas: procure a aba da chamada e salve-a como CSV."
        : "Nenhum aluno reconhecido: a lista precisa de um número de chamada (ou pelo menos os nomes) e o nome.");
      return;
    }
    imp.alunos = escolha.lista.alunos;
    imp.problemas = escolha.lista.problemas.slice();
    imp.fonte = escolha.fonte || "";
    imp.colunas = escolha.lista.colunas || null;
    imp.puladas = escolha.lista.puladas || 0;
    imp.salvo = 0;
    if (avaliados.length > 1) {
      imp.problemas.push("A pasta de trabalho tem " + avaliados.length +
        " abas com alunos; usei \"" + imp.fonte + "\" com " + imp.alunos.length +
        ". Se a certa é outra, salve aquela aba como CSV e importe de novo.");
    }
    desenharPrevia("");
  }

  async function arquivosParaItens(files) {
    var P = window.GabaPlanilha;
    var itens = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var buf = await f.arrayBuffer();
      if (/\.xlsx$/i.test(f.name || "") || /spreadsheetml/.test(f.type || "")) {
        var doc = await P.leXlsx(buf);
        doc.abas.forEach(function (a) { itens.push({ rotulo: a.nome, arquivo: f.name || "", linhas: a.linhas }); });
      } else {
        itens.push({ rotulo: f.name || "arquivo", arquivo: f.name || "", linhas: P.separar(P.decodar(buf)) });
      }
    }
    return itens;
  }

  async function lerArquivos(files) {
    var versao = versaoConta;
    var lista = [].slice.call(files || []);
    if (!lista.length) return;
    impStatus("Lendo " + lista.map(function (f) { return f.name; }).join(", ") + " neste aparelho...", "");
    try {
      var itens = await arquivosParaItens(lista);
      if (versao !== versaoConta) return;
      analisar(itens);
    } catch (err) {
      if (versao !== versaoConta) return;
      imp.alunos = [];
      imp.problemas = [];
      imp.fonte = "";
      desenharPrevia(mensagemErro(err));
    }
  }

  function lerTexto() {
    var campo = $("imp-texto");
    var bruto = campo ? campo.value : "";
    if (!bruto.trim()) {
      impStatus("Cole as células aqui (Ctrl+C no Excel, Ctrl+V aqui) ou escolha um arquivo, e clique em Ver.", "erro");
      return;
    }
    analisar([{ rotulo: "texto colado", linhas: window.GabaPlanilha.separar(bruto) }]);
  }

  async function salvarLista() {
    var versao = versaoConta;
    if (!imp.alunos.length) {
      impStatus("Primeiro leia a lista: clique em Ver.", "erro");
      return;
    }
    var turmaId = $("imp-turma") ? $("imp-turma").value : "";
    if (!dbOk()) {
      impStatus(faltaParaOBanco() + " A lista de alunos só pode ser guardada no banco do professor.", "erro");
      return;
    }
    if (!turmaId) {
      impStatus("Escolha a turma que vai receber a lista.", "erro");
      return;
    }
    var botao = $("imp-salvar");
    if (botao) botao.disabled = true;
    try {
      var r = await GabaDB.salvarAlunosEmLote(turmaId, imp.alunos);
      if (versao !== versaoConta) return;
      imp.salvo = r.gravados;
      await carregarTudo();
      if (versao !== versaoConta) return;
      var sobra = imp.alunos.length - r.gravados;
      (r.problemas || []).forEach(function (p) { imp.problemas.push(p); });
      desenharPrevia(r.gravados ? "" : "Nada foi salvo.");
      impStatus(plural(r.gravados, "aluno salvo", "alunos salvos") + " em \"" + nomeTurma(turmaId) + "\"" +
        (sobra ? ", " + sobra + (sobra === 1 ? " ficou" : " ficaram") + " de fora" : "") +
        ". Reimportar a mesma lista corrige os dados em vez de duplicar a turma.", r.gravados ? "ok" : "erro");
      aviso("Lista importada: " + plural(r.gravados, "aluno", "alunos") + ".", r.gravados ? "ok" : "erro");
      if (r.gravados) {
        var campo = $("imp-texto");
        if (campo) campo.value = "";
        var arquivo = $("imp-arquivo");
        if (arquivo) arquivo.value = "";
      }
    } catch (err) {
      if (versao !== versaoConta) return;
      impStatus(mensagemErro(err), "erro");
      if (botao) botao.disabled = false;
    }
  }

  function limparLista() {
    imp.alunos = [];
    imp.problemas = [];
    imp.fonte = "";
    imp.colunas = null;
    imp.puladas = 0;
    imp.salvo = 0;
    var campo = $("imp-texto");
    if (campo) campo.value = "";
    var arquivo = $("imp-arquivo");
    if (arquivo) arquivo.value = "";
    desenharPrevia("Limpo.");
  }

  /* ------------------------------------- as turmas de uma escola, todas de um arquivo so */

  var impt = { alvo: "", escola: "", arquivo: "", lendo: false, salvando: false, erro: "",
    turmas: [], ignoradas: [], repetidas: [], saidas: 0, marcadas: {}, nomes: {}, ids: Object.create(null),
    ano: "", comAlunos: true, feito: null };

  function imptStatus(msg, tipo) {
    var el = $("impt-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "app-status" + (msg ? " mostra" : "") + (msg && tipo ? " " + tipo : "");
  }

  function nomeImpt(i) {
    return impt.nomes[i] !== undefined ? impt.nomes[i] : impt.turmas[i].nome;
  }

  function turmaJaNaEscola(escola, nome) {
    var E = window.GabaEscolas;
    var k = GabaLista.limpo(nome);
    if (!k) return null;
    return app.turmas.filter(function (t) {
      return E.chave(t.escola) === E.chave(escola) && GabaLista.limpo(t.nome) === k;
    })[0] || null;
  }

  function seloImpt(i) {
    return turmaJaNaEscola(impt.escola, nomeImpt(i))
      ? '<span class="badge badge-off" title="Não duplica: os alunos dela são atualizados pelo Nº">já existe</span>'
      : '<span class="badge badge-on">nova</span>';
  }

  function contarImpt() {
    var marcadas = impt.turmas.filter(function (t, i) { return impt.marcadas[i]; }).length;
    var salvar = $("impt-salvar");
    if (salvar) {
      salvar.disabled = !marcadas || impt.salvando;
      salvar.textContent = marcadas ? "Salvar " + plural(marcadas, "turma", "turmas") : "Marque uma turma";
    }
    var todas = $("impt-todas");
    if (todas) {
      todas.checked = marcadas === impt.turmas.length;
      todas.indeterminate = marcadas > 0 && marcadas < impt.turmas.length;
    }
  }

  function avisosImpt() {
    var avisos = [];
    impt.ignoradas.forEach(function (aba) {
      avisos.push('"' + aba + '" não tem lista de alunos e ficou de fora.');
    });
    impt.repetidas.forEach(function (nome) {
      avisos.push('"' + nome + '" aparece mais de uma vez no arquivo: entrou só a primeira.');
    });
    if (impt.saidas) {
      avisos.push(GabaLista.avisoDeSaidas(impt.saidas));
    }
    impt.turmas.forEach(function (t) {
      t.problemas.forEach(function (p) { avisos.push(t.nome + ": " + p); });
    });
    return avisos;
  }

  function listaDeAvisos(avisos) {
    return avisos.length ? '<ul class="imp-problemas">' + avisos.map(function (p) {
      return "<li>" + esc(p) + "</li>";
    }).join("") + "</ul>" : "";
  }

  /* quem a regra de saida tirou da chamada: o professor precisa ver a lista, nao so a conta */
  function linhasFora() {
    var out = [];
    (impt.turmas || []).forEach(function (t, i) {
      (t.fora || []).forEach(function (f) {
        out.push([nomeImpt(i), f.numero === null || f.numero === undefined ? "" : f.numero,
          f.situacao, f.nome]);
      });
    });
    return out;
  }

  function blocoFora() {
    var linhas = linhasFora();
    if (!linhas.length) return "";
    return '<details class="imp-fora"><summary>' + plural(linhas.length, "linha ficou de fora", "linhas ficaram de fora") +
      ": quem saiu da turma</summary>" +
      '<table class="imp-fora-tabela"><thead><tr><th>Turma</th><th class="impt-num">Nº</th><th>Situação na chamada</th><th>Estudante</th></tr></thead><tbody>' +
      linhas.map(function (l) {
        return "<tr><td>" + esc(l[0]) + '</td><td class="impt-num">' + esc(l[1] === "" ? "—" : l[1]) +
          "</td><td>" + esc(l[2]) + "</td><td>" + esc(l[3]) + "</td></tr>";
      }).join("") + "</tbody></table>" +
      '<div class="cad-acoes"><button type="button" id="impt-fora-csv" class="btn-ghost">Baixar essa lista (CSV)</button></div>' +
      "</details>";
  }

  function baixarCsvFora() {
    var linhas = linhasFora();
    if (!linhas.length) return;
    var corpo = [["Turma", "Nº", "Situação na chamada", "Estudante"]].concat(linhas);
    var blob = new Blob([csvSeguro(corpo)], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a"), url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "Gaba-ficaram-de-fora-" + String(impt.arquivo || "chamada").replace(/\.[a-z0-9]{2,4}$/i, "") + ".csv";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function desenharImportacaoTurmas() {
    var box = $("impt-painel");
    if (!box) return;
    if (!impt.escola) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    var titulo = '<h4 class="impt-titulo">Turmas para <em>' + esc(impt.escola) + "</em></h4>";
    var rodape = '<p id="impt-status" class="app-status"></p>';
    if (impt.lendo) {
      box.innerHTML = titulo + rodape;
      imptStatus("Lendo " + impt.arquivo + " neste aparelho...", "");
      return;
    }
    if (impt.feito) {
      box.innerHTML = titulo + '<div class="imp-resumo">' + impt.feito.resumo + "</div>" +
        listaDeAvisos(impt.feito.avisos) + blocoFora() +
        '<div class="cad-acoes"><button type="button" id="impt-cancelar" class="btn-ghost">Fechar</button></div>' + rodape;
      imptStatus(impt.feito.status, impt.feito.tipo);
      return;
    }
    if (impt.erro || !impt.turmas.length) {
      box.innerHTML = titulo +
        '<div class="cad-acoes"><button type="button" id="impt-outro" class="btn-primary">Escolher outro arquivo</button>' +
        '<button type="button" id="impt-cancelar" class="btn-ghost">Cancelar</button></div>' + rodape;
      imptStatus(impt.erro || 'Não achei turmas em "' + impt.arquivo + '". Use uma aba por turma (o nome da aba vira o ' +
        "nome da turma) ou uma coluna Turma ao lado do nome do aluno.", "erro");
      return;
    }
    var alunos = impt.turmas.reduce(function (n, t) { return n + t.alunos.length; }, 0);
    box.innerHTML = titulo +
      '<div class="imp-resumo"><strong>' + plural(impt.turmas.length, "turma", "turmas") + "</strong> em \"<em>" +
      esc(impt.arquivo) + "</em>\"" + (alunos ? " &middot; " + plural(alunos, "aluno", "alunos") : " &middot; só os nomes, sem alunos") +
      "</div>" + listaDeAvisos(avisosImpt()) + blocoFora() +
      '<div class="cad-linha"><div class="field"><label for="impt-ano">Ano / período das turmas novas</label>' +
      '<input type="text" id="impt-ano" value="' + esc(impt.ano) + '" placeholder="Ex.: 2026"></div></div>' +
      (alunos ? '<label class="cad-check"><input type="checkbox" id="impt-alunos"' + (impt.comAlunos ? " checked" : "") +
        '> Trazer também os alunos de cada turma</label>' : "") +
      '<div class="imp-tabela impt-tabela"><table><thead><tr>' +
      '<th class="impt-marca"><input type="checkbox" id="impt-todas" checked aria-label="Marcar todas as turmas"></th>' +
      "<th>Turma</th><th class=\"impt-num\">Alunos</th><th></th></tr></thead><tbody>" +
      impt.turmas.map(function (t, i) {
        return "<tr><td class=\"impt-marca\"><input type=\"checkbox\" data-impt=\"" + i + "\"" + (impt.marcadas[i] ? " checked" : "") +
          ' aria-label="Importar ' + esc(nomeImpt(i)) + '"></td>' +
          '<td><input type="text" class="impt-nome" data-impt-nome="' + i + '" value="' + esc(nomeImpt(i)) +
          '" maxlength="120" aria-label="Nome da turma"></td>' +
          '<td class="impt-num">' + (t.alunos.length || "&mdash;") + "</td>" +
          '<td data-impt-selo="' + i + '">' + seloImpt(i) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="ajuda">O nome de cada turma pode ser corrigido aqui antes de salvar. Turma que já existe nesta escola não é duplicada: ' +
      "os alunos dela são atualizados pelo Nº.</p>" +
      '<div class="cad-acoes"><button type="button" id="impt-salvar" class="btn-primary"></button>' +
      '<button type="button" id="impt-cancelar" class="btn-ghost">Cancelar</button></div>' + rodape;
    contarImpt();
  }

  function fecharImportacaoTurmas() {
    if (impt.lendo || impt.salvando) return;
    impt.alvo = "";
    impt.escola = "";
    impt.turmas = [];
    impt.feito = null;
    impt.erro = "";
    desenharImportacaoTurmas();
  }

  function abrirImportacaoTurmas(escola) {
    if (impt.lendo || impt.salvando) {
      aviso("Espere a importação em andamento terminar.", "erro");
      return;
    }
    impt.alvo = escola;
    var arquivo = $("impt-arquivo");
    if (arquivo) arquivo.click();
  }

  async function lerTurmasDaEscola(files) {
    var versao = versaoConta;
    if (impt.lendo || impt.salvando) return;
    var lista = [].slice.call(files || []);
    if (!lista.length || !impt.alvo) return;
    impt.escola = impt.alvo;
    impt.arquivo = lista.length === 1 ? lista[0].name : plural(lista.length, "arquivo", "arquivos");
    impt.lendo = true;
    impt.erro = "";
    impt.feito = null;
    impt.turmas = [];
    impt.nomes = {};
    impt.marcadas = {};
    impt.ids = Object.create(null);
    impt.ano = String(new Date().getFullYear());
    impt.comAlunos = true;
    desenharImportacaoTurmas();
    var box = $("impt-painel");
    if (box && box.scrollIntoView) box.scrollIntoView({ block: "start", behavior: "smooth" });
    try {
      var itens = await arquivosParaItens(lista);
      if (versao !== versaoConta) return;
      var r = GabaLista.turmasDaPasta(itens);
      impt.turmas = r.turmas;
      impt.ignoradas = r.ignoradas;
      impt.repetidas = r.repetidas;
      impt.saidas = r.saidas;
      r.turmas.forEach(function (t, i) { impt.marcadas[i] = true; });
    } catch (err) {
      if (versao !== versaoConta) return;
      impt.erro = mensagemErro(err);
    }
    impt.lendo = false;
    desenharImportacaoTurmas();
  }

  async function salvarImportacaoTurmas() {
    var versao = versaoConta;
    if (impt.salvando) return;
    if (!dbOk()) {
      imptStatus(faltaParaOBanco() + " As turmas só podem ser guardadas no banco do professor.", "erro");
      return;
    }
    var escolhidas = [];
    impt.turmas.forEach(function (t, i) {
      if (impt.marcadas[i]) escolhidas.push({ t: t, nome: String(nomeImpt(i)).replace(/\s+/g, " ").trim() });
    });
    if (!escolhidas.length) {
      imptStatus("Marque pelo menos uma turma.", "erro");
      return;
    }
    var vistos = Object.create(null);
    for (var v = 0; v < escolhidas.length; v++) {
      var k = GabaLista.limpo(escolhidas[v].nome);
      if (!k) {
        imptStatus("Uma das turmas marcadas ficou sem nome.", "erro");
        return;
      }
      if (vistos[k]) {
        imptStatus('Duas turmas ficaram com o nome "' + escolhidas[v].nome + '": mude um deles antes de salvar.', "erro");
        return;
      }
      vistos[k] = true;
    }
    var campoAno = $("impt-ano");
    var ano = campoAno ? campoAno.value.trim() : "";
    if (!ano) {
      imptStatus("Diga o ano / período das turmas novas (ex.: 2026).", "erro");
      if (campoAno) campoAno.focus();
      return;
    }
    var comAlunos = $("impt-alunos") ? $("impt-alunos").checked : false;
    impt.ano = ano;
    impt.comAlunos = comAlunos;
    var escola = impt.escola;
    impt.salvando = true;
    $("impt-painel").querySelectorAll("input, button").forEach(function (el) { el.disabled = true; });
    var novas = 0;
    var existentes = 0;
    var gravados = 0;
    var problemas = [];
    var atual = "";
    try {
      for (var n = 0; n < escolhidas.length; n++) {
        var x = escolhidas[n];
        atual = x.nome;
        imptStatus("Salvando " + (n + 1) + " de " + escolhidas.length + ": " + x.nome + "...", "");
        var chaveNome = GabaLista.limpo(x.nome);
        var existe = turmaJaNaEscola(escola, x.nome) || impt.ids[chaveNome];
        var turma = existe || await GabaDB.salvarTurma({ nome: x.nome, ano: ano, escola: escola });
        if (versao !== versaoConta) return;
        impt.ids[chaveNome] = turma;
        var id = turma.id;
        if (existe) existentes++;
        else {
          novas++;
          app.turmas.push(turma);
        }
        if (comAlunos && x.t.alunos.length) {
          var r = await GabaDB.salvarAlunosEmLote(id, x.t.alunos);
          if (versao !== versaoConta) return;
          gravados += r.gravados;
          (r.problemas || []).forEach(function (p) { problemas.push(x.nome + ": " + p); });
        }
      }
    } catch (err) {
      if (versao !== versaoConta) return;
      await carregarTudo();
      if (versao !== versaoConta) return;
      impt.salvando = false;
      desenharImportacaoTurmas();
      imptStatus(mensagemErro(err) + ' (parou em "' + atual + '"). Salvar de novo termina o serviço sem duplicar ' +
        "as turmas que já entraram.", "erro");
      return;
    }
    if (window.GabaEscolas) GabaEscolas.setFiltro(escola);
    var partes = [];
    if (novas) partes.push(plural(novas, "turma nova", "turmas novas"));
    if (existentes) partes.push(plural(existentes, "já existia", "já existiam"));
    impt.feito = {
      resumo: "<strong>" + esc(partes.join(", ")) + "</strong> em \"<em>" + esc(escola) + "</em>\"" +
        (gravados ? " &middot; " + plural(gravados, "aluno salvo", "alunos salvos") : ""),
      avisos: problemas,
      status: "Pronto. As turmas já aparecem na lista abaixo e o topo mostra só esta escola.",
      tipo: "ok"
    };
    await carregarTudo();
    if (versao !== versaoConta) return;
    impt.salvando = false;
    desenharImportacaoTurmas();
    aviso(plural(novas + existentes, "turma importada", "turmas importadas") + ' em "' + escola + '"' +
      (gravados ? ", com " + plural(gravados, "aluno", "alunos") : "") + ".", "ok");
  }

  function ligarImportacaoTurmas() {
    var arquivo = $("impt-arquivo");
    if (arquivo) arquivo.addEventListener("change", function () {
      lerTurmasDaEscola(arquivo.files).then(function () { arquivo.value = ""; });
    });
    var box = $("impt-painel");
    if (!box) return;
    box.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      if (b.id === "impt-salvar") salvarImportacaoTurmas();
      else if (b.id === "impt-fora-csv") baixarCsvFora();
      else if (b.id === "impt-cancelar") fecharImportacaoTurmas();
      else if (b.id === "impt-outro") abrirImportacaoTurmas(impt.escola);
    });
    box.addEventListener("change", function (ev) {
      var el = ev.target;
      if (el.id === "impt-todas") {
        impt.turmas.forEach(function (t, i) { impt.marcadas[i] = el.checked; });
        box.querySelectorAll("[data-impt]").forEach(function (c) { c.checked = el.checked; });
      } else if (el.dataset && el.dataset.impt !== undefined) {
        impt.marcadas[el.dataset.impt] = el.checked;
      } else {
        return;
      }
      contarImpt();
    });
    box.addEventListener("input", function (ev) {
      var el = ev.target;
      if (!el.dataset || el.dataset.imptNome === undefined) return;
      var i = el.dataset.imptNome;
      impt.nomes[i] = el.value;
      var selo = box.querySelector('[data-impt-selo="' + i + '"]');
      if (selo) selo.innerHTML = seloImpt(i);
    });
  }

  /* ---------------------------------------------------------------- desenho */

  function desenharTudo() {
    desenharEscolas();
    desenharFiltroEscola();
    desenharPainel();
    desenharTurmas();
    desenharProvas();
    desenharNotas();
    preencherSeletoresAnalise();
    desenharAnalise();
    desenharPainelAnalise();
  }

  function botao(acao, id, rotulo, classe, extra) {
    return '<button type="button" class="' + (classe || "btn-ghost") + '" data-acao="' + esc(acao) +
      '" data-id="' + esc(id) + '"' + (extra ? ' data-extra="' + esc(extra) + '"' : "") + ">" + esc(rotulo) + "</button>";
  }

  function provasSoNoAparelho() {
    return app.locais.filter(function (p) {
      return !app.provas.some(function (b) { return String(b.id) === String(p.id); });
    });
  }

  function leiturasSoNoAparelho() {
    var noBanco = {};
    app.correcoes.forEach(function (c) { noBanco[chave(c)] = true; });
    return app.leituras.filter(function (r) { return !noBanco[chave(r)]; });
  }

  /* a escola escolhida no topo decide quais turmas aparecem em qualquer lista do app */
  function turmasVisiveis() {
    return window.GabaEscolas ? GabaEscolas.visiveis(app.turmas) : app.turmas.slice();
  }

  /* o degrau 2 da escada: a turma nova ja nasce na escola escolhida e com a tela nela */
  function aplicarEscola(nome) {
    var E = window.GabaEscolas;
    var limpo = E ? E.normalizar(nome) : String(nome || "");
    if (E) E.setFiltro(limpo);
    var campo = $("turma-escola");
    if (campo) campo.value = limpo;
    desenharTudo();
    var alvo = $("turma-nome");
    if (alvo) {
      alvo.focus();
      if (alvo.scrollIntoView) alvo.scrollIntoView({ block: "center" });
    }
    aviso('Turma nova em "' + limpo + '": dê o nome e o ano dela.', "ok");
  }

  /* a escola sai do aparelho e do banco junto: apagar so o cadastro local faria ela
     voltar na proxima leitura das escolas do projeto */
  async function tirarEscola(nome) {
    var versao = versaoConta;
    var E = window.GabaEscolas;
    var linhas = app.escolas.filter(function (r) { return E.chave(r.nome) === E.chave(nome); });
    for (var n = 0; n < linhas.length; n++) {
      await GabaDB.excluirEscola(linhas[n].id);
      validarConta(versao);
    }
    E.remover(nome);
    if (E.chave(E.filtro()) === E.chave(nome)) E.setFiltro("");
  }

  async function criarEscola(nomeBruto) {
    var versao = versaoConta;
    var E = window.GabaEscolas;
    var criado = E.adicionar(nomeBruto);
    if (criado.vazio) {
      aviso("Escreva o nome da escola.", "erro");
      return;
    }
    if (!criado.novo) {
      aviso('"' + criado.nome + '" já está no cadastro.', "erro");
      return;
    }
    if (dbOk()) {
      try {
        var escola = await GabaDB.salvarEscola({ nome: criado.nome });
        if (versao !== versaoConta) return;
        app.escolas.push(escola);
      } catch (err) {
        if (versao !== versaoConta) return;
        aviso('Escola criada neste aparelho. No banco deu: ' + mensagemErro(err), "erro");
        desenharTudo();
        return;
      }
    }
    aplicarEscola(criado.nome);
  }

  /* a escada comeca aqui: a escola existe antes de ter turma dentro dela */
  function desenharEscolas() {
    var box = $("lista-escolas-cad");
    if (!box) return;
    var E = window.GabaEscolas;
    if (!E) return;
    var lista = E.noFiltro(app.turmas);
    if (!lista.length) {
      box.innerHTML = '<p class="cad-status">Nenhuma escola cadastrada ainda: crie a primeira acima e as turmas entram nela.</p>';
      return;
    }
    var filtro = E.filtro();
    box.innerHTML = lista.map(function (e) {
      var ativa = E.chave(e.nome) === E.chave(filtro);
      return '<div class="item-lista"><div class="item-cab"><strong>' + esc(e.nome) + "</strong>" +
        "<span>" + (e.turmas ? plural(e.turmas, "turma", "turmas") : "ainda sem turma") + "</span>" +
        (ativa ? '<span class="badge badge-on">na tela</span>' : "") + "</div>" +
        '<div class="item-acoes item-acoes-linha">' +
        botao("turma-aqui", e.nome, "Adicionar turma") +
        botao("importar-turmas", e.nome, "Importar turmas") +
        botao("escola-filtrar", e.nome, ativa ? "Ver todas" : "Ver só esta") +
        (e.cadastrada ? botao("apagar-escola", e.nome, "Tirar do cadastro", "btn-danger") : "") +
        "</div></div>";
    }).join("");
  }

  function desenharFiltroEscola() {
    var sel = $("filtro-escola");
    var box = $("escola-filtro-box");
    if (!sel || !box) return;
    var E = window.GabaEscolas;
    var lista = E ? E.noFiltro(app.turmas) : [];
    var sem = E ? app.turmas.filter(function (t) { return !E.normalizar(t.escola); }).length : 0;
    var atual = E ? E.filtro() : "";
    if (atual && !lista.some(function (e) { return e.chave === E.chave(atual); }) &&
      !(sem && E.chave(atual) === E.chave(E.SEM_ESCOLA))) {
      E.setFiltro("");
      atual = "";
    }
    var partes = ['<option value="">Todas as escolas</option>'];
    lista.forEach(function (e) {
      partes.push('<option value="' + esc(e.nome) + '">' + esc(e.nome) +
        (e.turmas ? " · " + plural(e.turmas, "turma", "turmas") : " · ainda sem turma") + "</option>");
    });
    if (sem) {
      partes.push('<option value="' + esc(E.SEM_ESCOLA) + '">' + esc(E.SEM_ESCOLA) +
        " · " + plural(sem, "turma", "turmas") + "</option>");
    }
    sel.innerHTML = partes.join("");
    sel.value = atual;
    box.hidden = !atual && !lista.length && !sem;
    var nomeTopo = $("escola-botao-nome");
    if (nomeTopo) {
      nomeTopo.textContent = !atual ? "Todas" : E.chave(atual) === E.chave(E.SEM_ESCOLA) ? "Sem escola" : atual;
    }
    var dl = $("lista-escolas");
    if (dl) {
      dl.innerHTML = lista.map(function (e) { return '<option value="' + esc(e.nome) + '"></option>'; }).join("");
    }
  }

  /* as duas contas do alívio: quanto de papel e de caneta o app já tirou da mão do professor */
  var GRAMA_POR_FOLHA = 5;
  var SEG_POR_FOLHA = 22;

  function papelDevolvido(folhas) {
    var g = folhas * GRAMA_POR_FOLHA;
    return g >= 1000 ? decimal((g / 1000).toFixed(1)) + " kg" : g + " g";
  }

  function tempoDevolvido(seg) {
    var h = Math.floor(seg / 3600);
    var m = Math.round((seg % 3600) / 60);
    if (!h) return m + " min";
    return m ? h + "h" + (m < 10 ? "0" : "") + m : h + "h";
  }

  function desenharPilhas(visiveis) {
    var box = $("dash-pilhas");
    if (!box) return;
    if (!visiveis.length) {
      box.innerHTML = '<p class="cad-status">Nenhuma turma ainda: cadastre em Bastidor &rsaquo; Turmas.</p>';
      return;
    }
    var lidas = app.correcoes.concat(leiturasSoNoAparelho());
    box.innerHTML = visiveis.map(function (t) {
      var alunos = app.alunos.filter(function (a) { return String(a.turma_id) === String(t.id); }).length;
      var feitas = lidas.filter(function (r) { return String(r.turma_id) === String(t.id); }).length;
      var pct = alunos ? Math.min(100, Math.round(feitas / alunos * 100)) : 0;
      var falta = Math.max(alunos - feitas, 0);
      return '<div class="item-lista"><div class="item-cab"><strong>' + esc(t.nome) + "</strong>" +
        "<span>" + plural(alunos, "aluno", "alunos") + " · " + plural(feitas, "folha lida", "folhas lidas") + "</span>" +
        (falta ? '<span class="alivio-falta">faltam ' + falta + "</span>"
               : '<span class="alivio-falta zerada">pilha zerada</span>') +
        '</div><span class="alivio-barra"><i style="width:' + pct + '%"></i></span></div>';
    }).join("");
  }

  function desenharPainel() {
    var soAparelho = leiturasSoNoAparelho().length;
    var visiveis = turmasVisiveis();
    var dasVisiveis = {};
    visiveis.forEach(function (t) { dasVisiveis[String(t.id)] = true; });
    var filtrando = window.GabaEscolas && GabaEscolas.filtro();
    var lidas = app.correcoes.length + soAparelho;
    setTexto("dash-papel", papelDevolvido(lidas));
    setTexto("dash-tempo", tempoDevolvido(lidas * SEG_POR_FOLHA));
    setTexto("dash-papel-detalhe", plural(lidas, "folha", "folhas") + " × " + GRAMA_POR_FOLHA +
      " g: papel que você não carregou, não conferiu e não guardou.");
    setTexto("dash-tempo-detalhe", plural(lidas, "folha", "folhas") + " × " + SEG_POR_FOLHA +
      " s de caneta na mão, na conta de uma correção manual.");
    setTexto("dash-turmas-count", visiveis.length);
    setTexto("dash-alunos-count", filtrando
      ? app.alunos.filter(function (a) { return dasVisiveis[String(a.turma_id)]; }).length
      : app.alunos.length);
    setTexto("dash-provas-count", app.provas.length + provasSoNoAparelho().length);
    setTexto("dash-correcoes-count", lidas);
    setTexto("dash-nota", (filtrando ? "Mostrando a escola \"" + filtrando + "\". " : "") + (dbOk()
      ? (soAparelho ? plural(soAparelho, "folha corrigida", "folhas corrigidas") + " ainda só neste aparelho." : "Tudo que foi lido está no banco.")
      : faltaParaOBanco() + " Turmas, provas e notas ficam só neste aparelho."));
    desenharPilhas(visiveis);
    atualizarBannerBackup();
  }

  function setTexto(id, valor) {
    var el = $(id);
    if (el) el.textContent = String(valor);
  }

  function desenharTurmas() {
    var box = $("lista-turmas");
    if (!box) return;
    var visiveis = turmasVisiveis();
    ["aluno-turma-select", "imp-turma"].forEach(function (id) {
      var sel = $(id);
      if (!sel) return;
      var antes = sel.value;
      sel.innerHTML = '<option value="">Selecione a turma...</option>';
      visiveis.forEach(function (t) {
        var opt = document.createElement("option");
        opt.value = String(t.id);
        opt.textContent = String(t.nome || t.id);
        sel.appendChild(opt);
      });
      if (antes && visiveis.some(function (t) { return String(t.id) === antes; })) sel.value = antes;
    });
    if (!visiveis.length) {
      box.innerHTML = "<p class=\"cad-status\">" + (dbOk()
        ? "Nenhuma turma no banco. Crie a primeira acima."
        : esc(faltaParaOBanco()) + " As turmas entram no banco depois disso.") + "</p>";
      return;
    }
    var E = window.GabaEscolas;
    var mostrarEscola = !(E && E.filtro());
    function rotuloEscola(t) {
      if (!E) return t.escola || "sem escola";
      return GabaEscolas.normalizar(t.escola) || GabaEscolas.SEM_ESCOLA;
    }
    box.innerHTML = visiveis.map(function (t) {
      var alunos = app.alunos.filter(function (a) { return String(a.turma_id) === String(t.id); })
        .sort(function (a, b) { return (Number(a.numero) || 0) - (Number(b.numero) || 0); });
      var roster = alunos.map(function (a) {
        return '<div class="linha-aluno"><span>' + esc(a.numero || "-") + "</span><span>" + esc(a.nome) +
          "</span><span>" + botao("apagar-aluno", a.id, "Apagar", "btn-ghost pequeno") + "</span></div>";
      }).join("");
      return '<div class="item-lista"><div class="item-cab"><strong>' + esc(t.nome) + "</strong>" +
        "<span>" + esc(t.ano || "") + "</span>" +
        (mostrarEscola ? "<span>" + esc(rotuloEscola(t)) + "</span>" : "") +
        "<span>" + plural(alunos.length, "aluno", "alunos") + "</span></div>" +
        '<div class="item-acoes item-acoes-linha">' + botao("renomear-turma", t.id, "Renomear") +
        botao("escola-turma", t.id, "Mudar escola") +
        botao("apagar-turma", t.id, "Apagar", "btn-danger") + "</div>" +
        "<details><summary>Ver alunos</summary>" + (roster || '<p class="text-muted">Nenhum aluno ainda.</p>') +
        "</details></div>";
    }).join("");
  }

  function nomeProva(id) {
    var p = app.provas.filter(function (x) { return String(x.id) === String(id); })[0];
    if (p) return p.titulo;
    var l = app.locais.filter(function (x) { return String(x.id) === String(id); })[0];
    return l ? l.titulo + " (neste aparelho)" : "(prova apagada)";
  }

  function nomeTurma(id) {
    var t = app.turmas.filter(function (x) { return String(x.id) === String(id); })[0];
    return t ? t.nome : "";
  }

  function modoEmPalavras(p) {
    var tipos = Number(p.num_tipos) || 0;
    if (p.modo === "turma") return "por tipo" + (tipos > 1 ? " · " + tipos + " tipos" : "");
    if (p.modo === "aluno") return "um por aluno";
    return "todos iguais";
  }

  /* a revisão de gabarito, peso e descritor abre dentro da prova, não no meio da impressão */
  var provaRevisada = "";

  async function revisarProva(id) {
    var versao = versaoConta;
    provaRevisada = String(id || "");
    if (provaRevisada && window.GabaCaderno) {
      var sel = $("cad-prova");
      var tem = sel && [].some.call(sel.options, function (o) { return o.value === provaRevisada; });
      if (!tem) await GabaCaderno.carregarListas();
      if (versao !== versaoConta) return;
      if (!selecionar("cad-prova", provaRevisada)) provaRevisada = "";
    }
    desenharProvas();
    var aberta = provaRevisada && $("prova-revisao");
    if (aberta && aberta.scrollIntoView) aberta.parentNode.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /* o documento importado entra na lista e já abre a revisão das questões */
  async function provaImportada(id) {
    if (window.GabaCaderno && GabaCaderno.estado && GabaCaderno.estado.provasLocais) {
      app.locais = GabaCaderno.estado.provasLocais;
    }
    desenharTudo();
    await revisarProva(id);
  }

  function desenharProvas() {
    var box = $("lista-provas");
    if (!box) return;
    var revisao = $("prova-revisao");
    if (revisao && box.contains(revisao)) box.parentNode.insertBefore(revisao, box.nextSibling);
    function acaoRevisar(p) {
      return botao("revisar-prova", p.id, provaRevisada === String(p.id) ? "Fechar revisão" : "Revisar questões");
    }
    var linhas = app.provas.map(function (p) {
      var qtd = (p.questoes || []).length || p.quantidade_questoes || 0;
      return '<div class="item-lista" data-prova="' + esc(p.id) + '"><div class="item-cab"><strong>' + esc(p.titulo) + "</strong>" +
        (p.disciplina ? "<span>" + esc(p.disciplina) + "</span>" : "") +
        "<span>" + plural(qtd, "questão", "questões") + "</span>" +
        "<span>" + esc(modoEmPalavras(p)) + "</span></div>" +
        '<div class="item-acoes item-acoes-linha">' +
        botao("prova-no-caderno", p.id, "Imprimir cadernos", "btn-primary pequeno-cheio") + acaoRevisar(p) +
        botao("prova-no-leitor", p.id, "Ler folhas") +
        botao("apagar-prova", p.id, "Apagar", "btn-danger") + "</div></div>";
    });
    var locais = provasSoNoAparelho().map(function (p) {
      var qtd = (p.questoes || []).length || 0;
      var tipos = (p.tipos || []).length;
      var alunos = (p.alunos || []).length;
      return '<div class="item-lista so-aparelho" data-prova="' + esc(p.id) + '"><div class="item-cab"><strong>' + esc(p.titulo) + "</strong>" +
        "<span>" + plural(qtd, "questão", "questões") + "</span>" +
        (tipos > 1 ? "<span>por tipo · " + tipos + " tipos</span>" : "") +
        (alunos ? "<span>" + plural(alunos, "aluno", "alunos") + "</span>" : "") +
        '<span class="so-aparelho-tag">só neste aparelho</span></div>' +
        '<div class="item-acoes item-acoes-linha">' +
        botao("prova-no-caderno", p.id, "Imprimir cadernos", "btn-primary pequeno-cheio") + acaoRevisar(p) +
        botao("salvar-prova-no-banco", p.id, "Salvar no banco") + "</div></div>";
    });
    box.innerHTML = linhas.concat(locais).join("") ||
      "<p class=\"cad-status\">Nenhuma prova ainda. Importe o documento ou digite o gabarito acima.</p>";
    if (!revisao) return;
    var item = provaRevisada ? [].filter.call(box.querySelectorAll("[data-prova]"), function (el) {
      return el.dataset.prova === provaRevisada;
    })[0] : null;
    if (!item) provaRevisada = "";
    if (item) item.appendChild(revisao);
    revisao.hidden = !item;
  }

  function chave(r) {
    return String(r.qr_payload || r.qr_texto ||
      (r.prova_id + "|" + (r.aluno_numero || r.aluno_id || "") + "|" + (r.codigo || "")));
  }

  function desenharNotas() {
    var corpo = $("tabela-relatorios");
    if (!corpo) return;
    var doBanca = app.correcoes.map(function (c) { return { r: c, banco: true }; });
    var noAparelho = leiturasSoNoAparelho().map(function (r) { return { r: r, banco: false }; });
    var linhas = doBanca.concat(noAparelho).sort(function (a, b) {
      return String(b.r.created_at || "").localeCompare(String(a.r.created_at || ""));
    }).slice(0, 600);

    if (!linhas.length) {
      corpo.innerHTML = '<tr><td colspan="6" class="text-muted">Nenhuma correção registrada.</td></tr>';
      return;
    }
    corpo.innerHTML = linhas.map(function (l) {
      var r = l.r;
      var total = r.total_questoes || (r.respostas || []).length || 0;
      var selo = l.banco ? "" : ' <span class="so-aparelho-tag" title="' +
        esc(r.sync_error || "ainda não subiu para o banco") + '">aparelho</span>';
      var nivel = nivelDe(r.nota);
      return "<tr><td>" + esc(dataCurta(r.created_at)) + "</td>" +
        "<td>" + esc(r.aluno_numero || "-") + " — " + esc(r.aluno_nome || "") + selo + "</td>" +
        "<td>" + esc(nomeTurma(r.turma_id)) + "</td>" +
        "<td>" + esc(nomeProva(r.prova_id)) + "</td>" +
        "<td><strong>" + esc(decimal(Number(r.nota || 0).toFixed(1))) + "</strong> " +
        '<span class="text-muted">' + esc(String(r.acertos || 0)) + "/" + esc(String(total)) +
        (r.codigo ? " · tipo " + esc(String(r.versao || 1)) + " " + esc(r.codigo) : "") +
        (r.branco ? " · " + esc(String(r.branco)) + " em branco" : "") + "</span></td>" +
        "<td>" + (nivel ? '<span class="ana-nivel">' + esc(nivel) + "</span>" :
          '<span class="text-muted">–</span>') + "</td></tr>";
    }).join("");
  }

  function dataCurta(iso) {
    var t = String(iso || "");
    if (t.length < 16) return t;
    return t.slice(8, 10) + "/" + t.slice(5, 7) + " " + t.slice(11, 16);
  }

  /* ------------------------------------------------- analise de item e distratores */

  var ana = { itens: [], provaId: "" };

  function decimal(v) {
    return String(v).replace(".", ",");
  }

  function provasParaAnalise() {
    var soAparelho = {};
    provasSoNoAparelho().forEach(function (p) { soAparelho[String(p.id)] = true; });
    return todasAsProvas().map(function (p) {
      return { id: p.id, titulo: p.titulo || String(p.id), questoes: (p.questoes || []).length,
        local: Boolean(soAparelho[String(p.id)]) };
    });
  }

  function todasAsProvas() {
    return app.provas.concat(provasSoNoAparelho());
  }

  function folhasParaAnalise(prova, turmaId) {
    var filtroAtivo = Boolean(window.GabaEscolas && typeof GabaEscolas.filtro === "function" && GabaEscolas.filtro());
    var turmasPermitidas = {};
    if (filtroAtivo) turmasVisiveis().forEach(function (t) { turmasPermitidas[String(t.id)] = true; });
    return app.correcoes.concat(leiturasSoNoAparelho()).filter(function (r) {
      if (String(r.prova_id || "") !== String(prova.id)) return false;
      if (filtroAtivo && r.turma_id && !turmasPermitidas[String(r.turma_id)]) return false;
      if (turmaId && String(r.turma_id || "") !== String(turmaId)) return false;
      return true;
    });
  }

  function preencherSeletor(id, opcoes, valorAntes, vazio) {
    var sel = $(id);
    if (!sel) return "";
    sel.innerHTML = '<option value="">' + esc(vazio) + "</option>" + opcoes.map(function (o) {
      return '<option value="' + esc(String(o.valor)) + '">' + esc(o.rotulo) + "</option>";
    }).join("");
    if (valorAntes && opcoes.some(function (o) { return String(o.valor) === valorAntes; })) sel.value = valorAntes;
    return sel.value;
  }

  function ordenarItens(itens, modo) {
    var l = itens.slice();
    function distrForte(it) {
      return it.distratores.reduce(function (m, d) { return Math.max(m, d.proporcao); }, 0);
    }
    function disc(it) {
      return it.discriminacao === null ? 9 : it.discriminacao;
    }
    if (modo === "acerto") l.sort(function (a, b) { return a.proporcao - b.proporcao || a.numero - b.numero; });
    else if (modo === "discriminacao") l.sort(function (a, b) { return disc(a) - disc(b) || a.numero - b.numero; });
    else if (modo === "distrator") l.sort(function (a, b) { return distrForte(b) - distrForte(a) || a.numero - b.numero; });
    return l;
  }

  function cartao(rotulo, valor, detalhe) {
    return '<div class="ana-card"><h3>' + esc(valor) + "</h3><p>" + esc(rotulo) + "</p>" +
      (detalhe ? '<span class="ana-detalhe">' + esc(detalhe) + "</span>" : "") + "</div>";
  }

  function desenharResumo(r) {
    var box = $("ana-resumo");
    if (!box) return;
    if (!r) { box.innerHTML = ""; return; }
    function grupos(nome, lista) {
      return lista.length ? nome + ": " + lista.join(", ") : "";
    }
    var avisos = [
      grupos("sem gabarito", r.semGabarito),
      grupos("muito fácil", r.faceis),
      grupos("muito difícil", r.dificeis),
      grupos("distrator mais marcado que o gabarito", r.distratores),
      grupos("discriminação fraca", r.discriminacaoBaixa)
    ].filter(Boolean);
    box.innerHTML = '<div class="ana-cards">' +
      cartao("Folhas lidas", r.alunos, "") +
      cartao("Média da turma", decimal(r.media.toFixed(2)), "nota de 0 a 10" +
        (nivelDe(r.media) ? " · " + nivelDe(r.media) : "")) +
      cartao("Questões", r.itens, "") +
      cartao("A revisar", r.revisar.length, r.revisar.length ? "itens " + r.revisar.slice(0, 8).join(", ") +
        (r.revisar.length > 8 ? "…" : "") : "nenhum item sinalizado") +
      cartao("Discriminação média", r.mediaDiscriminacao === null ? "–"
        : decimal(r.mediaDiscriminacao.toFixed(2)), r.mediaDiscriminacao === null
        ? "precisa de 6 folhas ou mais" : "bom acima de 0,30") +
      "</div>" + (avisos.length ? '<ul class="ana-avisos">' + avisos.map(function (a) {
        return "<li>" + esc(a) + "</li>";
      }).join("") + "</ul>" : "");
  }

  function linhaItem(it) {
    var pct = Math.round(it.proporcao * 100);
    var distr = it.distratores.map(function (d) {
      var cls = d.quantidade > 0 && d.letra === it.distratorMaisForte && it.distratorMaisForte !== it.gabarito
        ? " forte" : "";
      return '<span class="ana-distr' + cls + '" title="' + esc(d.texto) + '">' + esc(d.letra) +
        " <b>" + esc(String(d.quantidade)) + "</b></span>";
    }).join("");
    var bandeiras = it.bandeiras.map(function (b) {
      return '<span class="ana-chip">' + esc(window.GabaAnalise ? GabaAnalise.rotuloBandeira(b) : b) + "</span>";
    }).join("");
    var pedagogico = [it.descritor, it.habilidade_bncc].filter(Boolean).join(" · ");
    var semParte = !it.parte || (window.GabaAnalise && it.parte === GabaAnalise.SEM_PARTE);
    return '<tr data-q="' + esc(String(it.numero)) + '"' + (it.bandeiras.length ? ' class="sinalizada"' : "") +
      '><td class="ana-num">' + esc(String(it.numero)) + "</td>" +
      "<td>" + esc(it.gabarito || "—") + "</td>" +
      "<td>" + esc(decimal(it.peso)) + "</td>" +
      "<td>" + esc(semParte ? "—" : it.parte) + "</td>" +
      "<td>" + esc(String(it.acertos)) + "/" + esc(String(it.participantes)) + "</td>" +
      '<td class="ana-pc"><span class="ana-barra"><i style="width:' + pct + '%"></i></span>' +
      esc(String(pct)) + "%</td>" +
      "<td>" + esc(String(it.branco)) + "</td>" +
      "<td>" + esc(it.discriminacao === null ? "–" : decimal(it.discriminacao.toFixed(2))) + "</td>" +
      "<td class=\"ana-distrs\">" + distr + "</td>" +
      '<td class="ana-ped" title="' + esc(pedagogico) + '">' + esc(pedagogico || "—") + "</td>" +
      '<td class="ana-flags">' + (bandeiras || '<span class="ana-ok">sem sinal</span>') + "</td></tr>";
  }

  function preencherSeletoresAnalise() {
    var lista = provasParaAnalise();
    var selProva = $("ab-prova");
    var selTurma = $("ab-turma");
    if (!selProva) return;
    var provAntes = selProva.value || ana.provaId || (lista.length === 1 ? String(lista[0].id) : "");
    preencherSeletor("ab-prova", lista.map(function (p) {
      return { valor: p.id, rotulo: p.titulo + (p.questoes ? " · " + p.questoes + " questões" : "") +
        (p.local ? " (neste aparelho)" : "") };
    }), provAntes, "Selecione a prova...");
    var turmaAntes = selTurma ? selTurma.value : "";
    preencherSeletor("ab-turma", turmasVisiveis().map(function (t) {
      return { valor: t.id, rotulo: String(t.nome || t.id) };
    }), turmaAntes, "Todas as turmas");
  }

  function provaAtualAnalise() {
    var sel = $("ab-prova");
    var id = sel ? sel.value : "";
    return id ? todasAsProvas().filter(function (p) { return String(p.id) === id; })[0] : null;
  }

  function turmaAtualAnalise() {
    var sel = $("ab-turma");
    return sel ? sel.value : "";
  }

  function semFolhas(turmaId) {
    return "Nenhuma folha lida desta prova" + (turmaId ? " nesta turma" : "") +
      ". Passe as folhas no Leitor antes de analisar.";
  }

  function desenharAnalise() {
    var prova = provaAtualAnalise();
    var turmaId = turmaAtualAnalise();
    var statusEl = $("ana-status");

    if (!prova) {
      ana.itens = [];
      ana.provaId = "";
      desenharResumo(null);
      if (statusEl) statusEl.textContent = "Escolha a prova para ver o desempenho questão por questão.";
      var caixa = $("ana-itens");
      if (caixa) caixa.innerHTML = "";
      return;
    }
    var folhas = folhasParaAnalise(prova, turmaId);
    ana.provaId = String(prova.id);
    if (!window.GabaAnalise) {
      if (statusEl) statusEl.textContent = "O módulo de análise não carregou: recarregue a página.";
      return;
    }
    if (!folhas.length) {
      ana.itens = [];
      desenharResumo(resumoVazio());
      if (statusEl) statusEl.textContent = semFolhas(turmaId);
      var vazio = $("ana-itens");
      if (vazio) vazio.innerHTML = "";
      return;
    }
    ana.itens = GabaAnalise.itens(prova, folhas);
    var r = GabaAnalise.resumo(prova, folhas);
    desenharResumo(r);
    var mostrar = ($("ana-revisar") || {}).checked ? ana.itens.filter(function (it) { return it.bandeiras.length; }) : ana.itens;
    var ordenadas = ordenarItens(mostrar, ($("ana-ordenar") || {}).value || "numero");
    var corpo = $("ana-itens");
    if (statusEl) {
      statusEl.textContent = plural(r.alunos, "folha", "folhas") + " de \"" + (prova.titulo || prova.id) + "\" · " +
        plural(r.itens, "questão", "questões") + " · " + r.revisar.length + " a revisar" +
        (mostrar.length < ana.itens.length ? " (mostrando só as sinalizadas)" : "");
    }
    corpo.innerHTML = !mostrar.length
      ? '<p class="text-muted">Nenhuma questão sinalizada nesta prova: pode imprimir a próxima.</p>'
      : '<div class="ana-tabela"><table class="data-table"><thead><tr><th>Nº</th><th>Gab</th><th>Peso</th><th>Parte</th>' +
        "<th>Acertos</th><th>% de acerto</th><th>Branco</th><th>Disc.</th><th>Distratores (letra e nº de marcas)</th>" +
        "<th>Descritor / BNCC</th><th>O que revisar</th></tr></thead><tbody>" +
        ordenadas.map(linhaItem).join("") + "</tbody></table></div>";
  }

  function resumoVazio() {
    return { alunos: 0, media: 0, itens: 0, porParte: [], revisar: [], semGabarito: [], faceis: [], dificeis: [],
      distratores: [], discriminacaoBaixa: [], mediaDiscriminacao: null };
  }

  function csvDaAnalise(itens) {
    var cabecalho = ["Questao", "Gabarito", "Peso", "Parte", "Participantes", "Acertos", "% acerto", "Em branco",
      "Discriminacao", "A", "B", "C", "D", "E", "Distrator mais forte", "Descritor", "Habilidade BNCC", "Bandeiras"];
    var linhas = (itens || []).map(function (it) {
      return [it.numero, it.gabarito, decimal(it.peso), it.parte, it.participantes, it.acertos,
        decimal((it.proporcao * 100).toFixed(1)), it.branco,
        it.discriminacao === null ? "" : decimal(it.discriminacao.toFixed(2)),
        it.contagem.A, it.contagem.B, it.contagem.C, it.contagem.D, it.contagem.E,
        it.distratorMaisForte, it.descritor, it.habilidade_bncc,
        it.bandeiras.map(function (b) { return window.GabaAnalise ? GabaAnalise.rotuloBandeira(b) : b; }).join(" | ")
      ].map(function (v) {
        return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      }).join(";");
    });
    return "\ufeff" + cabecalho.join(";") + "\r\n" + linhas.join("\r\n") + "\r\n";
  }

  async function baixarCsvAnalise() {
    if (!ana.itens.length) {
      aviso("Escolha primeiro uma prova com folhas lidas.", "erro");
      return;
    }
    var prova = todasAsProvas().filter(function (p) { return String(p.id) === String(ana.provaId); })[0];
    var blob = new Blob([csvDaAnalise(ana.itens)], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "analise-item-" + String((prova && (prova.titulo || prova.id)) || "prova")
      .replace(/[^a-z0-9_-]+/gi, "-") + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    aviso("CSV da análise gerado com " + plural(ana.itens.length, "questão", "questões") + ".", "ok");
  }

  /* ------------------------------------------------------------- abrir abas */

  function selecionar(seletor, id) {
    var el = $(seletor);
    if (!el) return false;
    el.value = String(id);
    if (String(el.value) !== String(id)) {
      aviso("Esta prova ainda não apareceu na lista de " + (seletor === "cad-prova" ? "cadernos" : "leitor") + ".", "erro");
      return false;
    }
    el.dispatchEvent(new Event("change"));
    return true;
  }

  async function abrirNoCaderno(id) {
    var versao = versaoConta;
    switchTab("caderno");
    if (!window.GabaCaderno) return;
    await GabaCaderno.carregarListas();
    if (versao === versaoConta) selecionar("cad-prova", id);
  }

  async function abrirNoLeitor(id) {
    var versao = versaoConta;
    switchTab("scanner");
    if (!window.GabaScanner) return;
    await GabaScanner.preencherListas(app.locais);
    if (versao === versaoConta) selecionar("scan-prova", id);
  }

  /* --------------------------------------------------------------- formularios */

  /* ---- análise básica: painel pedagógico alimentado apenas pelos dados reais do app ---- */

  var ab = { painel: "ab-resumo", modelo: null, dados: null, questao: null, descritor: null, retornoFicha: null };

  function indicadorQuestao(numero, compacto) {
    var n = String(numero == null ? "" : numero);
    var classe = compacto ? "questao-selo questao-selo-compacto" : "questao-selo";
    return '<span class="' + classe + '" aria-label="Questão ' + esc(n) + '">' +
      (compacto ? "" : '<svg viewBox="0 0 20 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2h7l4 4v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"></path><path d="M12 2v5h4M7 12h6M7 16h4"></path></svg>') +
      '<span>' + esc((n.length < 2 ? "0" : "") + n) + "</span></span>";
  }

  function textoBusca(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function fmtAb(n, casas) {
    return n === null || n === undefined || !Number.isFinite(Number(n)) ? "—"
      : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }

  function pctAb(n) { return n === null || n === undefined ? "Sem dados" : fmtAb(n, 1) + "%"; }

  function nomeTurmaAnalise(id) {
    var t = (ab.modelo && ab.modelo.turmas || []).filter(function (x) { return String(x.id) === String(id); })[0];
    return t ? t.nome : "Turma não informada";
  }

  function catalogoDaProva(prova) {
    if (!window.GabaDescritores) return [];
    if (typeof GabaDescritores.filtrar !== "function") return typeof GabaDescritores.todos === "function" ? GabaDescritores.todos() : [];
    return GabaDescritores.filtrar({
      disciplina: prova.disciplina || "",
      ano: prova.ano || prova.serie || "",
      matriz: prova.matriz || ""
    });
  }

  function versoesPurasDaProva(prova) {
    var lista = [], lote = window.GabaCaderno && GabaCaderno.loteImpresso ? GabaCaderno.loteImpresso(prova.id) : null;
    (lote && lote.itens || []).forEach(function (it) { if (it && it.versao) lista.push(it.versao); });
    var scanner = window.GabaScanner && GabaScanner.estado;
    if (scanner && scanner.prova && String(scanner.prova.id) === String(prova.id)) {
      Object.keys(scanner.versoes || {}).forEach(function (chaveVersao) {
        var v = scanner.versoes[chaveVersao];
        if (v) lista.push(v);
      });
    }
    return lista;
  }

  function modeloAtualAnalise() {
    var prova = provaAtualAnalise();
    if (!prova || !window.GabaBasica || typeof GabaBasica.montarPainel !== "function") return null;
    var turmas = turmasVisiveis(), ids = Object.create(null);
    turmas.forEach(function (t) { ids[String(t.id)] = true; });
    var filtroAtivo = Boolean(window.GabaEscolas && typeof GabaEscolas.filtro === "function" && GabaEscolas.filtro());
    var alunos = app.alunos.filter(function (a) { return !filtroAtivo || a.turma_id && ids[String(a.turma_id)]; });
    var correcoes = app.correcoes.concat(app.leituras).filter(function (r) {
      if (String(r.prova_id || "") !== String(prova.id)) return false;
      return !filtroAtivo || !r.turma_id || ids[String(r.turma_id)];
    });
    return GabaBasica.montarPainel(prova, correcoes, turmas, alunos, versoesPurasDaProva(prova), catalogoDaProva(prova));
  }

  function atualizarModeloAnalise() {
    ab.modelo = modeloAtualAnalise();
    ab.dados = ab.modelo && typeof GabaBasica.analisarPainel === "function"
      ? GabaBasica.analisarPainel(ab.modelo, turmaAtualAnalise()) : null;
    var csv = $("ab-csv"), limites = $("ab-limites"), prova = provaAtualAnalise();
    if (csv) csv.disabled = !ab.dados;
    if (limites) limites.hidden = !ab.dados;
    if ($("ab-escopo")) $("ab-escopo").textContent = turmaAtualAnalise() ? nomeTurmaAnalise(turmaAtualAnalise()) : "Todas as turmas";
    if ($("ab-participacao")) $("ab-participacao").textContent = ab.dados
      ? ab.dados.alunos.length + " cadastrados · " + ab.dados.corrigidos.length + " corrigidos · " + plural(ab.modelo.prova.questoes.length, "questão", "questões")
      : prova ? "O módulo de análise ainda está carregando." : "Escolha uma prova nos filtros.";
    if ($("ab-anuncio")) $("ab-anuncio").textContent = ab.dados
      ? (turmaAtualAnalise() ? nomeTurmaAnalise(turmaAtualAnalise()) : "Todas as turmas") + ": " + ab.dados.corrigidos.length + " corrigidos e " + ab.dados.semLeitura + " sem leitura."
      : "Nenhuma prova selecionada.";
  }

  window.switchAnalise = function switchAnalise(id, focar) {
    if (!$(id)) return;
    ab.painel = id;
    document.querySelectorAll(".ab-painel").forEach(function (el) {
      var ativo = el.id === id;
      el.classList.toggle("active", ativo);
      el.hidden = !ativo;
    });
    document.querySelectorAll("#analise-segmento [data-sub]").forEach(function (b) {
      var ativo = b.dataset.sub === id;
      b.setAttribute("aria-selected", String(ativo));
      b.tabIndex = ativo ? 0 : -1;
      if (ativo && focar) b.focus();
    });
    desenharPainelAnalise();
  };

  function vazioAb(titulo, texto) {
    return '<div class="ab-vazio"><h3>' + esc(titulo) + "</h3><p>" + esc(texto) + "</p></div>";
  }

  function barraAb(taxa, rotulo) {
    var largura = taxa === null || taxa === undefined ? 0 : Math.max(0, Math.min(100, taxa));
    return '<div class="ab-barra-grafico"><div><span>' + esc(rotulo) + "</span><b>" + pctAb(taxa) +
      '</b></div><span class="ab-trilho-grafico" aria-hidden="true"><i style="width:' + largura + '%"></i></span></div>';
  }

  function kpiAb(rotulo, valor, unidade, detalhe) {
    return '<article class="ab-kpi"><p>' + esc(rotulo) + '</p><strong>' + valor + (unidade ? " <small>" + esc(unidade) + "</small>" : "") +
      '</strong><span>' + esc(detalhe) + "</span></article>";
  }

  function graficoDistribuicao() {
    var d = ab.dados, rotulos = ["0–<2", "2–<4", "4–<6", "6–<8", "8–10"];
    if (!d.notas.length) return vazioAb("Ainda não há notas para distribuir", "Alunos sem leitura não entram nas faixas de nota.");
    var maior = Math.max.apply(null, [1].concat(d.faixas));
    var descricao = rotulos.map(function (r, i) { return r + ": " + d.faixas[i] + " alunos"; }).join("; ");
    var barras = d.faixas.map(function (n, i) {
      var x = 74 + i * 112, altura = n / maior * 160, y = 200 - altura;
      return '<rect class="ab-svg-barra" x="' + x + '" y="' + y + '" width="58" height="' + altura + '" rx="8"></rect>' +
        '<text class="ab-svg-contagem" x="' + (x + 29) + '" y="' + (y - 11) + '" text-anchor="middle">' + n + "</text>" +
        '<text x="' + (x + 29) + '" y="235" text-anchor="middle">' + rotulos[i] + "</text>";
    }).join("");
    return '<svg class="ab-grafico-svg" viewBox="0 0 640 265" role="img" aria-labelledby="ab-dist-titulo ab-dist-desc"><title id="ab-dist-titulo">Distribuição de notas</title><desc id="ab-dist-desc">' + esc(descricao) + '. Sem leitura não entra no gráfico.</desc><line x1="44" y1="200" x2="622" y2="200"></line>' + barras + "</svg>";
  }

  function nivelDe(nota) {
    return window.GabaProficiencia ? GabaProficiencia.rotulo(nota) : "";
  }

  function seloNivel(nota) {
    var n = nivelDe(nota);
    return n ? '<span class="ana-nivel">' + esc(n) + "</span>" : "";
  }

  function chipsNiveis(dist) {
    if (!dist) return "";
    return dist.map(function (d) {
      return '<span class="ana-nivel" title="' + esc(GabaProficiencia.faixa(d)) + '">' + esc(d.nivel) +
        " <b>" + esc(String(d.quantidade)) + "</b></span>";
    }).join("");
  }

  /* as folhas do recorte atual no formato que o motor de análise espera */
  function folhasDoPainel() {
    if (!ab.dados || !ab.modelo) return [];
    var prova = ab.modelo.prova;
    return ab.dados.corrigidos.filter(function (a) {
      return a.correcao && a.correcao.respostas.length > 0;
    }).map(function (a) {
      return { prova_id: prova.id, aluno_id: a.id, turma_id: a.turma_id, nota: a.correcao.nota,
        total_questoes: a.correcao.respostas.length,
        respostas: a.correcao.respostas.map(function (l) { return String(l || "").toUpperCase().charAt(0); }) };
    });
  }

  /* a tabela só aparece quando a prova tem duas partes ou mais: com uma só, a análise
     por parte repetiria a nota da prova inteira */
  function desenharResumoPartes() {
    var box = $("ab-resumo-partes");
    if (!box) return;
    if (!ab.dados || !ab.modelo || !window.GabaAnalise) { box.innerHTML = ""; return; }
    var prova = ab.modelo.prova;
    var folhas = folhasDoPainel();
    var partes = GabaAnalise.resumo(prova, folhas).porParte || [];
    if (partes.length < 2) { box.innerHTML = ""; return; }
    box.innerHTML = '<article class="ab-card ab-partes"><h3>Nota por parte</h3>' +
      "<p>Cada disciplina ou bloco da prova tem nota própria, de 0 a 10; a discriminação é medida dentro da parte.</p>" +
      '<div class="ab-tabela" role="region" aria-label="Nota por parte; role horizontalmente se necessário" tabindex="0">' +
      '<table class="data-table"><thead><tr><th>Parte</th><th>Questões</th><th>Média</th><th>Nível da média</th>' +
      "<th>Discriminação</th><th>Folhas por nível</th><th>A revisar</th></tr></thead><tbody>" +
      partes.map(function (p) {
        var dist = window.GabaProficiencia ? GabaProficiencia.distribuicao(
          folhas.map(function (r) { return GabaAnalise.notaNaParte(prova, r, p.parte); })) : null;
        return "<tr><td><strong>" + esc(p.parte) + "</strong></td>" +
          "<td>" + esc(String(p.itens)) + "</td>" +
          "<td>" + esc(decimal(p.media.toFixed(2))) + "</td>" +
          "<td>" + seloNivel(p.media) + "</td>" +
          "<td>" + esc(p.mediaDiscriminacao === null ? "–" : decimal(p.mediaDiscriminacao.toFixed(2))) + "</td>" +
          '<td class="ana-niveis">' + (chipsNiveis(dist) || "–") + "</td>" +
          "<td>" + esc(p.revisar.length ? p.revisar.slice(0, 10).join(", ") +
            (p.revisar.length > 10 ? "…" : "") : "nenhuma") + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="ajuda">A média desta tabela é a nota de cada folha dentro da parte; o nível segue os cortes definidos acima.</p>' +
      "</article>";
  }

  function desenharCortes() {
    var box = $("ana-cortes-lista");
    if (!box || !window.GabaProficiencia) return;
    box.innerHTML = GabaProficiencia.cortes().map(function (c, i) {
      return '<div class="cortes-linha">' +
        '<input type="text" data-campo="nivel" data-i="' + i + '" value="' + esc(c.nivel) + '">' +
        '<input type="text" inputmode="decimal" data-campo="min" data-i="' + i + '" value="' +
        decimal(c.min) + '" title="a partir desta nota">' +
        "</div>";
    }).join("");
  }

  function salvarCortes() {
    var avisoEl = $("ana-cortes-aviso");
    var inputs = [].slice.call(document.querySelectorAll("#ana-cortes-lista [data-campo]"));
    var pares = {};
    inputs.forEach(function (el) {
      var i = el.dataset.i;
      pares[i] = pares[i] || { nivel: "", min: 0 };
      if (el.dataset.campo === "nivel") pares[i].nivel = el.value;
      else pares[i].min = String(el.value).replace(",", ".");
    });
    var lista = Object.keys(pares).map(Number).sort(function (a, b) { return a - b; })
      .map(function (i) { return pares[i]; });
    var ok = lista.every(function (c) {
      if (!String(c.nivel).trim()) return true;
      var n = Number(c.min);
      return String(c.min).trim() !== "" && n >= 0 && n <= 10;
    });
    if (!ok) {
      if (avisoEl) avisoEl.textContent = "Escreva uma nota de 0 a 10 em cada nível (vírgula ou ponto valem).";
      return;
    }
    try {
      GabaProficiencia.salvar(lista);
    } catch (e) {
      if (avisoEl) avisoEl.textContent = "Não foi possível guardar: " + e.message;
      return;
    }
    desenharCortes();
    if (avisoEl) avisoEl.textContent = "Cortes salvos neste aparelho.";
    desenharPainelAnalise();
    desenharNotas();
  }

  function voltarCortesPadrao() {
    if (!window.GabaProficiencia) return;
    GabaProficiencia.limpar();
    desenharCortes();
    var avisoEl = $("ana-cortes-aviso");
    if (avisoEl) avisoEl.textContent = "Cortes padrão restaurados.";
    desenharPainelAnalise();
    desenharNotas();
  }

  function desenharBasicaResumo() {
    var box = $("ab-resumo-cards"), dist = $("ab-resumo-distrib");
    if (!box) return;
    if (dist) dist.innerHTML = "";
    atualizarModeloAnalise();
    if (!ab.dados) {
      box.innerHTML = vazioAb("Escolha uma prova para começar", "Os resultados aparecem aqui depois que uma prova é selecionada.");
      desenharResumoPartes();
      return;
    }
    var d = ab.dados;
    var cards = kpiAb("Média da prova", fmtAb(d.media, 1), "de 10", d.notas.length + " notas registradas; só corrigidos" +
      (nivelDe(d.media) ? " · " + nivelDe(d.media) : "")) +
      kpiAb("Folhas corrigidas", fmtAb(d.corrigidos.length), "de " + d.alunos.length, "Uma correção por aluno") +
      kpiAb("Sem leitura", fmtAb(d.semLeitura), "", "Sem nota; não entra na média") +
      kpiAb("Leituras para revisar", fmtAb(d.revisao), "", "Marcações sinalizadas pelo leitor");
    var faixas = ["0 a menos de 2", "2 a menos de 4", "4 a menos de 6", "6 a menos de 8", "8 a 10"];
    var maior = Math.max.apply(null, d.faixas), modais = faixas.filter(function (_, i) { return d.faixas[i] === maior; });
    var relatoNotas = d.notas.length ? (modais.length === 1 ? "A faixa mais frequente é " + modais[0] : "As faixas mais frequentes são " + modais.join(" e ")) + ", com " + plural(maior, "aluno", "alunos") + ". " + d.notas.filter(function (n) { return n < 6; }).length + " de " + d.notas.length + " notas ficaram abaixo de 6; isso não determina aprovação." : "Não há notas registradas neste recorte.";
    var turmas = ab.modelo.turmas.map(function (t) { return { turma: t, dados: GabaBasica.analisarPainel(ab.modelo, t.id) }; });
    var comparacao = turmas.map(function (t) {
      var selecionada = String(t.turma.id) === String(turmaAtualAnalise());
      return '<div class="ab-compara' + (selecionada ? " selecionada" : "") + '"><div><strong>' + esc(t.turma.nome) + "</strong><span>" + fmtAb(t.dados.media, 1) +
        ' / 10</span></div><span class="ab-trilho-grafico" aria-hidden="true"><i style="width:' + (t.dados.media === null ? 0 : t.dados.media * 10) + '%"></i></span><p>' + t.dados.corrigidos.length + " corrigidos · " + t.dados.semLeitura + " sem leitura</p></div>";
    }).join("");
    var comNota = turmas.filter(function (t) { return t.dados.media !== null; }).sort(function (a, b) { return a.dados.media - b.dados.media; });
    var diferenca = comNota.length > 1 ? comNota[comNota.length - 1].dados.media - comNota[0].dados.media : null;
    var relatoTurmas = diferenca === null ? "São necessárias duas turmas com notas para comparar." : "A distância entre a maior e a menor média é " + fmtAb(diferenca, 2) + (+diferenca.toFixed(2) > 0 && +diferenca.toFixed(2) < 2 ? " ponto" : " pontos") + ". Todas as turmas permanecem visíveis" + (turmaAtualAnalise() ? "; o contorno destaca a selecionada" : "") + ". As médias não explicam a causa da diferença.";
    var itens = d.itens.slice().sort(function (a, b) { return questaoDoItem(a).numero - questaoDoItem(b).numero; });
    var graficoItens = '<div class="ab-questao-grafico" aria-label="Acerto por questão, de zero a cem por cento">' + itens.map(function (item) {
      var q = questaoDoItem(item);
      return '<button type="button" data-ab-questao="' + esc(q.numero) + '" aria-label="Questão ' + esc(q.numero) + ": " + pctAb(item.taxa) + ' de acerto; abrir detalhes"><span>' + pctAb(item.taxa) + '</span><i aria-hidden="true"><b style="height:' + (item.taxa || 0) + '%"></b></i>' + indicadorQuestao(q.numero, true) + "</button>";
    }).join("") + "</div>";
    var comTaxa = d.itens.filter(function (q) { return q.taxa !== null; }).sort(function (a, b) { return a.taxa - b.taxa; });
    var minimo = comTaxa[0], relatoItens = minimo ? "A questão " + questaoDoItem(minimo).numero + " teve a menor taxa: " + pctAb(minimo.taxa) + " (" + minimo.acertos + "/" + minimo.participantes + "). Abra o item para comparar o gabarito às alternativas marcadas, sem atribuir automaticamente o resultado ao aluno ou ao enunciado." : "Ainda não há respostas corrigidas para comparar os itens.";
    var habilidades = d.descritores.filter(function (x) { return x.codigo !== "__sem_descritor__"; });
    var graficoHab = '<div class="ab-habilidades-grafico">' + habilidades.map(function (h) {
      return '<button type="button" data-ab-descritor="' + esc(h.codigo) + '"><span><strong>' + esc(h.descricao) + "</strong><b>" + pctAb(h.taxa) + '</b></span><i aria-hidden="true"><b style="width:' + (h.taxa || 0) + '%"></b></i><small>' + esc(h.codigo) + " · " + plural(h.questoes.length, "questão", "questões") + " · " + h.acertos + "/" + h.total + " acertos</small></button>";
    }).join("") + "</div>";
    var menorHab = habilidades.filter(function (h) { return h.taxa !== null; })[0];
    var relatoHab = menorHab ? "Neste recorte, “" + menorHab.descricao + "” tem " + pctAb(menorHab.taxa) + " de acerto. " + (menorHab.questoes.length === 1 ? "É apenas 1 questão" : "São apenas " + menorHab.questoes.length + " questões") + ": uma pista para retomar os textos e ouvir justificativas, não uma medida definitiva." : "Sem respostas suficientes para interpretar habilidades.";
    box.innerHTML = '<div class="ab-kpis">' + cards + '</div><div class="ab-resumo-grade"><article class="ab-card"><h3>Como as notas se distribuem</h3><p>Número de alunos por faixa de nota.</p>' + graficoDistribuicao() + '<p class="ab-relato"><strong>Leitura rápida.</strong> ' + esc(relatoNotas) + '</p></article><article class="ab-card"><h3>Comparação entre turmas</h3><p>Média de nota, de 0 a 10 · somente corrigidos.</p><div class="ab-comparacao">' + comparacao + '</div><p class="ab-relato"><strong>Leitura rápida.</strong> ' + esc(relatoTurmas) + '</p></article><article class="ab-card"><h3>Acerto por questão</h3><p>Toque numa barra para abrir o item.</p>' + graficoItens + '<p class="ab-relato"><strong>Leitura rápida.</strong> ' + esc(relatoItens) + '</p></article><article class="ab-card"><h3>Onde vale retomar</h3><p>Acerto por habilidade · menores taxas primeiro.</p>' + graficoHab + '<p class="ab-relato"><strong>Leitura rápida.</strong> ' + esc(relatoHab) + "</p></article></div>";
    desenharResumoPartes();
  }

  function alunosFiltrados() {
    if (!ab.dados) return [];
    var busca = textoBusca((($("ab-aluno-busca") || {}).value || "").trim());
    var filtro = ($("ab-aluno-filtro") || {}).value || "todos";
    return ab.dados.alunos.filter(function (a) {
      var c = a.correcao;
      return (!busca || textoBusca(a.nome).indexOf(busca) >= 0 || textoBusca(a.matricula).indexOf(busca) >= 0) &&
        (filtro === "todos" || filtro === "corrigidos" && c || filtro === "sem" && !c || filtro === "revisar" && c && c.confusao.length);
    });
  }

  function desenharBasicaAluno() {
    var box = $("ab-aluno-conteudo"), statusEl = $("ab-aluno-status");
    if (!box) return;
    atualizarModeloAnalise();
    if (!ab.dados) { box.innerHTML = ""; if (statusEl) statusEl.textContent = "Escolha a prova para consultar os alunos."; return; }
    var lista = alunosFiltrados();
    if (statusEl) statusEl.textContent = lista.length + " de " + ab.dados.alunos.length + " alunos neste filtro · toque para abrir a ficha.";
    box.innerHTML = lista.length ? lista.map(function (a) {
      var c = a.correcao, iniciais = a.nome.split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0); }).join("");
      return '<button type="button" class="ab-aluno-linha" data-ab-aluno="' + esc(a.id) + '" aria-label="Abrir ficha de ' + esc(a.nome) + '"><span class="ab-avatar" aria-hidden="true">' + esc(iniciais) + '</span><span class="ab-aluno-nome"><strong>' + esc(a.nome) + "</strong><small>" + esc(nomeTurmaAnalise(a.turma_id)) + (a.numero !== "" ? " · Nº " + esc(a.numero) : "") + "<br>Matrícula " + esc(a.matricula || "não informada") + '</small></span><span class="ab-aluno-nota"><strong>' + (c && c.nota !== null ? fmtAb(c.nota, 1) : "—") + "</strong><small>" + (c ? c.acertos + "/" + c.total + " acertos" : "Sem nota") + '</small>' + (c && c.nota !== null ? seloNivel(c.nota) : "") + '</span><span class="ab-aluno-situacao">' + (c ? "Corrigido" + (c.confusao.length ? " · revisar leitura" : "") : "Sem leitura") + "</span></button>";
    }).join("") : vazioAb("Nenhum aluno neste filtro", "Tente outro nome, matrícula ou situação de leitura.");
  }

  function tituloHabilidade(q) {
    return ab.modelo.descricoes[q.descritor] || (q.descritor ? "Habilidade sem descrição disponível" : "Sem descritor informado");
  }

  function questaoDoItem(item) { return item.questao || item; }

  function itensPainelOrdenados() {
    if (!ab.dados) return [];
    var lista = ab.dados.itens.slice(), modo = ($("ana-ordenar") || {}).value || "numero";
    if (($("ana-revisar") || {}).checked) {
      var sinalizadas = {};
      ana.itens.filter(function (it) { return it.bandeiras.length; }).forEach(function (it) { sinalizadas[String(it.numero)] = true; });
      lista = lista.filter(function (it) { return sinalizadas[String(questaoDoItem(it).numero)]; });
    }
    lista.sort(function (a, b) {
      if (modo === "acerto") return (a.taxa === null ? 999 : a.taxa) - (b.taxa === null ? 999 : b.taxa);
      if (modo === "discriminacao") return (a.discriminacao === null ? 9 : a.discriminacao) - (b.discriminacao === null ? 9 : b.discriminacao);
      if (modo === "distrator") {
        function forte(x) { var q = questaoDoItem(x); return Math.max.apply(null, [0].concat(Object.keys(x.contagem || {}).filter(function (l) { return l !== q.gabarito; }).map(function (l) { return x.contagem[l]; }))); }
        return forte(b) - forte(a);
      }
      return questaoDoItem(a).numero - questaoDoItem(b).numero;
    });
    return lista;
  }

  function desenharQuestoesPainel() {
    var box = $("ab-questao-conteudo");
    if (!box) return;
    atualizarModeloAnalise();
    if (!ab.dados) { box.innerHTML = vazioAb("Escolha uma prova", "Os detalhes das questões aparecem aqui."); return; }
    var itens = itensPainelOrdenados();
    box.innerHTML = itens.length ? itens.map(function (it) {
      var q = questaoDoItem(it);
      var alternativas = q.alternativas.map(function (alt) {
        var n = it.contagem[alt.letra] || 0;
        return '<li class="ab-alternativa' + (alt.letra === q.gabarito ? " correta" : "") + '"><b>' + esc(alt.letra) + '</b><span>' + esc(alt.texto) + (alt.letra === q.gabarito ? " · Gabarito" : "") + '</span><small>' + n + " marcações · " + pctAb(it.participantes ? n / it.participantes * 100 : null) + "</small></li>";
      }).join("");
      var disc = it.discriminacao === null ? "Não disponível para este recorte." : "Índice: " + fmtAb(it.discriminacao, 3) + ".";
      var cabecalho = indicadorQuestao(q.numero, false) + '<span><strong>' + esc(tituloHabilidade(q)) + '</strong><small>' +
        esc(q.descritor || "Sem descritor") + (q.bncc ? " · BNCC " + esc(q.bncc) : "") +
        (q.parte ? ' · <span class="ana-parte">' + esc(q.parte) + "</span>" : "") +
        '</small></span><span class="ab-item-taxa"><strong>' + pctAb(it.taxa) + '</strong><small>' +
        it.acertos + "/" + it.participantes + " acertos</small></span>";
      var textoQuestao = '<div class="ab-enunciado">' + esc(q.enunciado || "Enunciado não informado.") +
        (q.comando ? "<p><strong>" + esc(q.comando) + "</strong></p>" : "") + "</div>";
      var dadosItem = '<div class="ab-item-dados"><span>' + it.participantes + " folhas corrigidas</span><span>" +
        it.branco + " em branco</span>" + (it.outras ? "<span>" + it.outras + " respostas inválidas</span>" : "") + "</div>";
      return '<details class="ab-item" id="ab-questao-' + esc(q.numero) + '"' +
        (String(ab.questao) === String(q.numero) ? " open" : "") + "><summary>" + cabecalho +
        '</summary><div class="ab-item-corpo">' + textoQuestao +
        (!q.gabarito ? '<p class="ab-alerta">Sem gabarito informado: não interpretar taxa de acerto.</p>' : "") +
        '<ul class="ab-alternativas">' + alternativas + "</ul>" + barraAb(it.taxa, "Acertos na questão") + dadosItem +
        '<p class="ab-relato"><strong>Discriminação.</strong> ' + esc(disc) +
        " É a diferença entre as taxas dos 25% com maiores e menores notas; varia de −1 a 1 e só é calculada com participantes suficientes. O valor convida a examinar item e contexto, não define sua qualidade.</p></div></details>";
    }).join("") : vazioAb("Nenhuma questão neste filtro", "Desmarque o filtro de revisão para ver todos os itens.");
    ab.questao = null;
  }

  function desenharBasicaDescritor() {
    var box = $("ab-desc-conteudo"), statusEl = $("ab-desc-status");
    if (!box) return;
    atualizarModeloAnalise();
    if (!ab.dados) { box.innerHTML = ""; if (statusEl) statusEl.textContent = "Escolha a prova para ver o desempenho por descritor."; return; }
    if (statusEl) statusEl.textContent = ab.dados.descritores.length + " descritores neste recorte. Abra um para ver a composição.";
    box.innerHTML = ab.dados.descritores.length ? ab.dados.descritores.map(function (d, i) {
      return '<details class="ab-item ab-descritor" data-ab-codigo="' + esc(d.codigo) + '"' + (ab.descritor === d.codigo ? " open" : "") + '><summary><span><strong>' + esc(d.descricao) + "</strong><small>" + esc(d.codigo === "__sem_descritor__" ? "Código não informado" : d.codigo) + (d.parte ? " · " + esc(d.parte) : "") + " · " + plural(d.questoes.length, "questão", "questões") + " · " + d.acertos + "/" + d.total + ' acertos</small></span><span class="ab-item-taxa"><strong>' + pctAb(d.taxa) + '</strong><small>nesta prova</small></span></summary><div class="ab-item-corpo"><p class="text-muted">A taxa reúne respostas aos itens desta habilidade; não representa quantos alunos a dominam.</p>' + barraAb(d.taxa, "Taxa de acerto") + d.questoes.map(function (it) { var q = it.questao || it; return '<div class="ab-descritor-questao"><div><strong>Questão ' + esc(q.numero) + " · " + pctAb(it.taxa) + (q.parte ? " · " + esc(q.parte) : "") + "</strong><p>" + esc(q.comando || String(q.enunciado || "").slice(0, 180) || "Texto disponível na aba Questões") + '</p></div><button type="button" class="btn-ghost" data-ab-questao="' + esc(q.numero) + '">Abrir questão</button></div>'; }).join("") + "</div></details>";
    }).join("") : vazioAb("Nenhum descritor vinculado", "Vincule descritores às questões na revisão da prova.");
    ab.descritor = null;
  }

  function desenharPainelAnalise() {
    if (ab.painel === "ab-resumo") desenharBasicaResumo();
    else if (ab.painel === "ab-aluno") desenharBasicaAluno();
    else if (ab.painel === "ab-questao") desenharQuestoesPainel();
    else desenharBasicaDescritor();
  }

  function abrirFichaAnalise(id, origem) {
    if (!ab.dados || !ab.modelo) return;
    var aluno = ab.dados.alunos.filter(function (a) { return String(a.id) === String(id); })[0];
    var dialogo = $("ab-ficha");
    if (!aluno || !dialogo) return;
    ab.retornoFicha = origem;
    $("ab-ficha-titulo").textContent = aluno.nome;
    $("ab-ficha-subtitulo").textContent = nomeTurmaAnalise(aluno.turma_id) + " · Matrícula " + (aluno.matricula || "não informada");
    var c = aluno.correcao, conteudo = $("ab-ficha-conteudo");
    if (!c) {
      conteudo.innerHTML = vazioAb("Sem leitura · sem nota", "Ainda não há correção para este aluno. A ausência de leitura não comprova falta e não equivale a nota zero.");
    } else {
      var grupos = Object.create(null);
      ab.modelo.prova.questoes.forEach(function (q) {
        var codigo = q.descritor || "__sem_descritor__";
        if (!grupos[codigo]) grupos[codigo] = { codigo: codigo, nome: tituloHabilidade(q), acertos: 0, total: 0 };
        if (q.gabarito) { grupos[codigo].total += 1; if (c.respostas[q.indice] === q.gabarito) grupos[codigo].acertos += 1; }
      });
      var linhas = ab.modelo.prova.questoes.map(function (q) {
        var resposta = c.respostas[q.indice], resultado = !q.gabarito ? "Sem gabarito" : !resposta ? "Branco / inválida" : resposta === q.gabarito ? "Acerto" : "Erro";
        var revisar = c.revisarBase.indexOf(q.indice) >= 0;
        return "<tr><th scope=\"row\">" + indicadorQuestao(q.numero, true) + "</th><td>" + esc(resposta || "—") + "</td><td>" + esc(q.gabarito || "—") + "</td><td>" + esc(resultado) + (revisar ? " · revisar leitura" : "") + "</td><td>" + esc(tituloHabilidade(q)) + (q.descritor ? " · " + esc(q.descritor) : "") + "</td></tr>";
      }).join("");
      var confusao = c.confusao.length ? '<div class="ab-alerta"><strong>Leitura para revisar.</strong> O leitor sinalizou ' + (c.confusao.length === 1 ? "a questão " : "as questões ") + esc(c.confusao.join(", ")) + " na ordem do caderno impresso. " + (c.revisarBase.length ? (c.revisarBase.length === 1 ? "Corresponde à questão base " : "Correspondem às questões base ") + esc(c.revisarBase.map(function (i) { return ab.modelo.prova.questoes[i] && ab.modelo.prova.questoes[i].numero; }).filter(Boolean).join(", ")) + "." : "Este caderno não tem mapeamento disponível para apontar a correspondente na ordem base.") + " Confira a folha original; nada foi ajustado automaticamente.</div>" : "";
      var habilidades = Object.keys(grupos).map(function (codigo) { var h = grupos[codigo], taxa = h.total ? h.acertos / h.total * 100 : null; return '<div class="ab-ficha-habilidade"><strong>' + esc(h.nome) + "</strong><p>" + esc(codigo === "__sem_descritor__" ? "Sem código" : codigo) + " · " + h.acertos + "/" + h.total + " itens com gabarito</p>" + barraAb(taxa, "Acerto nesta prova") + "</div>"; }).join("");
      conteudo.innerHTML = '<div class="ab-ficha-kpis">' + kpiAb("Nota registrada", fmtAb(c.nota, 1), "de 10", "") + kpiAb("Acertos", c.acertos, "de " + c.total, "") + kpiAb("Brancos / inválidas", c.branco, "", "") + "</div>" + confusao + '<h3>Respostas na ordem base</h3><p class="ajuda">Questões e letras já convertidas à prova base.</p><div class="ab-tabela" role="region" aria-label="Respostas, gabarito e habilidade; role horizontalmente se necessário" tabindex="0"><table class="data-table"><thead><tr><th>Questão</th><th>Resposta</th><th>Gabarito</th><th>Resultado</th><th>Habilidade</th></tr></thead><tbody>' + linhas + "</tbody></table></div><h3 class=\"secao\">Acerto por habilidade nesta prova</h3>" + habilidades;
    }
    dialogo.showModal();
  }

  function linhasCsvPainel() {
    if (!ab.dados || !ab.modelo) return [];
    var linhas = [["Prova", ab.modelo.prova.titulo], ["Turma", turmaAtualAnalise() ? nomeTurmaAnalise(turmaAtualAnalise()) : "Todas as turmas"], ["Visão", ab.painel], []], d = ab.dados;
    if (ab.painel === "ab-resumo") {
      linhas.push(["Indicador", "Valor"], ["Média (0 a 10)", d.media === null ? "" : fmtAb(d.media, 2)], ["Alunos cadastrados", d.alunos.length], ["Folhas corrigidas", d.corrigidos.length], ["Sem leitura", d.semLeitura], ["Leituras para revisar", d.revisao]);
    } else if (ab.painel === "ab-aluno") {
      linhas.push(["Aluno", "Matrícula", "Turma", "Situação", "Nota", "Acertos", "Brancos / inválidas", "Revisar no caderno"]);
      alunosFiltrados().forEach(function (a) { var c = a.correcao; linhas.push([a.nome, a.matricula, nomeTurmaAnalise(a.turma_id), c ? "Corrigido" : "Sem leitura", c && c.nota !== null ? fmtAb(c.nota, 2) : "", c ? c.acertos : "", c ? c.branco : "", c ? c.confusao.join(", ") : ""]); });
    } else if (ab.painel === "ab-questao") {
      linhas.push(["Questão", "Parte", "Habilidade", "Descritor", "Gabarito", "Acertos", "Participantes", "Acerto (%)", "Brancos", "Inválidas", "Discriminação"]);
      itensPainelOrdenados().forEach(function (it) { var q = questaoDoItem(it); linhas.push([q.numero, q.parte || "", tituloHabilidade(q), q.descritor, q.gabarito, it.acertos, it.participantes, it.taxa === null ? "" : fmtAb(it.taxa, 2), it.branco, it.outras, it.discriminacao === null ? "" : fmtAb(it.discriminacao, 3)]); });
    } else {
      linhas.push(["Habilidade", "Parte", "Descritor", "Questões base", "Acertos", "Respostas em itens com gabarito", "Acerto (%)"]);
      d.descritores.forEach(function (x) { linhas.push([x.descricao, x.parte || "", x.codigo === "__sem_descritor__" ? "" : x.codigo, x.questoes.map(function (it) { return (it.questao || it).numero; }).join(", "), x.acertos, x.total, x.taxa === null ? "" : fmtAb(x.taxa, 2)]); });
    }
    return linhas;
  }

  function csvSeguro(linhas) {
    return "\ufeff" + linhas.map(function (linha) { return linha.map(function (valor) {
      var s = String(valor == null ? "" : valor);
      if (typeof valor === "string" && /^[\s]*[=+@-]/.test(s) && !/^-\d[\d.]*(?:,\d+)?$/.test(s)) s = "'" + s;
      return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(";"); }).join("\r\n") + "\r\n";
  }

  function baixarCsvPainel() {
    if (!ab.dados) return;
    var blob = new Blob([csvSeguro(linhasCsvPainel())], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a"), url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "Gaba-analise-" + ab.painel.replace("ab-", "") + ".csv";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  window.gerarCamposGabarito = function gerarCamposGabarito() {
    var inputQtd = $("prova-qtd");
    if (!inputQtd) return;
    var qtd = Math.max(1, Math.min(90, parseInt(inputQtd.value, 10) || 10));
    inputQtd.value = String(qtd);
    var container = $("gabarito-inputs");
    if (!container) return;
    var letras = ["A", "B", "C", "D", "E"];
    container.innerHTML = "";
    for (let i = 1; i <= qtd; i++) {
      const div = document.createElement("div");
      div.innerHTML = "<label for=\"gab-resposta-" + i + "\">" + indicadorQuestao(i, true) + "</label>" +
        "<select id=\"gab-resposta-" + i + "\" class=\"gab-q\" data-q=\"" + i + "\" aria-label=\"Gabarito da questão " + i + "\">" +
        letras.map(function (l) { return "<option>" + l + "</option>"; }).join("") + "</select>";
      container.appendChild(div);
    }
  };

  function provaDoFormulario() {
    var gabarito = [].map.call(document.querySelectorAll("#gabarito-inputs .gab-q"), function (s) { return s.value; });
    if (!gabarito.length) {
      window.gerarCamposGabarito();
      gabarito = [].map.call(document.querySelectorAll("#gabarito-inputs .gab-q"), function (s) { return s.value; });
    }
    return {
      titulo: $("prova-titulo").value.trim(),
      disciplina: $("prova-disciplina").value.trim() || "Geral",
      alternativas: 5,
      modo: "fixa",
      num_tipos: 1,
      quantidade_questoes: gabarito.length,
      gabarito: gabarito,
      questoes: gabarito.map(function (g, i) {
        return { numero: i + 1, enunciado: "", alternativas: [], gabarito: g, peso: 1, descritor: "", habilidade_bncc: "" };
      }),
      tipos: [],
      embaralhar_questoes: false,
      embaralhar_alternativas: false
    };
  }

  var BASTIDOR = ["turmas", "provas", "caderno", "config"];

  window.switchTab = function switchTab(tabId) {
    document.querySelectorAll(".tab-content").forEach(function (el) { el.classList.remove("active"); });
    var alvo = $("tab-" + tabId);
    if (alvo) alvo.classList.add("active");
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      var noBastidor = btn.dataset.grupo === "bastidor" && BASTIDOR.indexOf(tabId) >= 0;
      btn.classList.toggle("active", noBastidor || btn.dataset.tab === tabId);
    });
    var faixa = $("tabs-bastidor");
    if (faixa) faixa.hidden = BASTIDOR.indexOf(tabId) < 0;
    if (window.GabaAjuda) GabaAjuda.registrarTela(tabId);
    atualizarAba();
  };

  /* --- backup / restauração --- */

  function atualizarBannerBackup() {
    var banner = $("banner-backup");
    if (!banner) return;
    var info = window.GabaBackup && GabaBackup.ultimoBackup();
    banner.hidden = Boolean(info) || !dbOk();
  }

  function atualizarStatusBackup() {
    var el = $("backup-status");
    if (!el) return;
    var info = window.GabaBackup && GabaBackup.ultimoBackup();
    if (!info) {
      el.hidden = false;
      el.className = "cad-status";
      el.textContent = "Nenhuma cópia foi baixada ainda.";
      return;
    }
    var d = new Date(info.data);
    var c = info.contagens || {};
    var partes = [];
    if (c.escolas) partes.push(c.escolas + " escola" + (c.escolas > 1 ? "s" : ""));
    if (c.turmas) partes.push(c.turmas + " turma" + (c.turmas > 1 ? "s" : ""));
    if (c.alunos) partes.push(c.alunos + " aluno" + (c.alunos > 1 ? "s" : ""));
    if (c.provas) partes.push(c.provas + " prova" + (c.provas > 1 ? "s" : ""));
    if (c.correcoes) partes.push(c.correcoes + " correç" + (c.correcoes > 1 ? "ões" : "ão"));
    el.hidden = false;
    el.className = "cad-status backup-ok";
    el.textContent = "Última cópia: " + d.toLocaleDateString("pt-BR") + " — " + (partes.join(", ") || "vazio");
  }

  async function fazerBackup() {
    if (!window.GabaBackup) return;
    var versao = versaoConta;
    aviso("Baixando a cópia de segurança…", "ok");
    try {
      var c = await GabaBackup.exportar();
      if (versao !== versaoConta) return;
      var total = 0;
      Object.keys(c).forEach(function (k) { total += c[k]; });
      aviso("Cópia baixada: " + total + " registros.", "ok");
    } catch (err) {
      if (versao !== versaoConta) return;
      aviso(mensagemErro(err), "erro");
    }
    atualizarBannerBackup();
    atualizarStatusBackup();
  }

  async function iniciarRestauracao() {
    if (!window.GabaBackup) return;
    var versao = versaoConta;
    var input = $("arquivo-restaurar");
    if (!input) return;
    input.value = "";
    input.onchange = async function () {
      var arquivo = input.files && input.files[0];
      if (!arquivo) return;
      var envelope;
      try {
        envelope = await GabaBackup.lerArquivo(arquivo);
      } catch (err) {
        if (versao !== versaoConta) return;
        aviso(mensagemErro(err), "erro");
        return;
      }
      if (versao !== versaoConta) return;
      var c = GabaBackup.contagens(envelope.tabelas);
      var resumo = [
        c.escolas + " escola" + (c.escolas !== 1 ? "s" : ""),
        c.turmas + " turma" + (c.turmas !== 1 ? "s" : ""),
        c.alunos + " aluno" + (c.alunos !== 1 ? "s" : ""),
        c.provas + " prova" + (c.provas !== 1 ? "s" : ""),
        c.prova_versoes + " versõ" + (c.prova_versoes !== 1 ? "es" : ""),
        c.correcoes + " correç" + (c.correcoes !== 1 ? "ões" : "ão"),
        c.professores + " professor" + (c.professores !== 1 ? "es" : "")
      ].join(", ");
      var data = envelope.data ? new Date(envelope.data).toLocaleDateString("pt-BR") : "?";
      var ok = await pedir({
        titulo: "Restaurar cópia de segurança",
        texto: arquivo.name + " — " + data + "\n\n" + resumo +
          "\n\nRestaurar não apaga o que está no banco: registros do arquivo são comparados por id. Linhas novas são inseridas e linhas existentes voltam ao conteúdo do backup.",
        ok: "Restaurar",
        cancelar: "Cancelar",
        perigo: true
      });
      if (!ok || versao !== versaoConta) return;
      aviso("Restaurando…", "ok");
      try {
        var res = await GabaBackup.restaurar(envelope, function (tabela, n) {
          if (versao === versaoConta) aviso("Restaurando " + tabela + " (" + n + " linhas)…", "ok");
        });
        if (versao !== versaoConta) return;
        var total = 0;
        Object.keys(res).forEach(function (k) { total += res[k]; });
        aviso("Restauração concluída: " + total + " registros.", "ok");
        await carregarTudo();
      } catch (err) {
        if (versao !== versaoConta) return;
        aviso(mensagemErro(err), "erro");
      }
    };
    input.click();
  }

  function ligar() {
    var filtro = $("filtro-escola");
    if (filtro) filtro.addEventListener("change", async function () {
      if (window.GabaEscolas) GabaEscolas.setFiltro(filtro.value);
      desenharTudo();
      if (window.GabaCaderno) {
        try { await GabaCaderno.carregarListas(); } catch (err) { /* o caderno já avisou do banco */ }
      }
      if (window.GabaScanner) GabaScanner.aoAbrir();
      aviso(filtro.value ? "Mostrando só as turmas de " + filtro.value + "."
        : "Mostrando as turmas de todas as escolas.", "ok");
    });

    ligarPainel();
    var escolaBotao = $("escola-botao");
    if (escolaBotao) escolaBotao.addEventListener("click", escolherEscolaTopo);

    var btnBackup = $("btn-backup");
    if (btnBackup) btnBackup.addEventListener("click", fazerBackup);
    var btnBackupBanner = $("btn-backup-banner");
    if (btnBackupBanner) btnBackupBanner.addEventListener("click", fazerBackup);
    var btnRestaurar = $("btn-restaurar");
    if (btnRestaurar) btnRestaurar.addEventListener("click", iniciarRestauracao);

    var segmento = $("alunos-segmento");
    if (segmento) segmento.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-seg]");
      if (!b) return;
      segmento.querySelectorAll("[data-seg]").forEach(function (outro) {
        outro.setAttribute("aria-selected", String(outro === b));
      });
      document.querySelectorAll("[data-painel]").forEach(function (p) {
        p.hidden = p.dataset.painel !== b.dataset.seg;
      });
    });

    document.querySelectorAll("input[name=prova-nova]").forEach(function (r) {
      r.addEventListener("change", function () {
        document.querySelectorAll("[data-nova]").forEach(function (p) {
          p.hidden = p.dataset.nova !== r.value;
        });
      });
    });

    document.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-ir]");
      if (b) window.switchTab(b.dataset.ir);
    });

    /* trocar a prova no caderno fecha a revisão de outra prova */
    var cadProva = $("cad-prova");
    if (cadProva) cadProva.addEventListener("change", function () {
      if (provaRevisada && cadProva.value !== provaRevisada) {
        provaRevisada = "";
        desenharProvas();
      }
    });

    ["lista-escolas-cad", "lista-turmas", "lista-provas"].forEach(function (id) {
      var box = $(id);
      if (!box) return;
      box.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-acao]");
        if (b) executar(b.dataset.acao, b.dataset.id, b.dataset.extra);
      });
    });
    var sincronizar = $("nota-sincronizar");
    if (sincronizar) sincronizar.addEventListener("click", function () { executar("sincronizar-fila"); });

    ["ab-prova", "ab-turma"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", function () {
        ab.questao = null; ab.descritor = null;
        desenharAnalise();
        desenharPainelAnalise();
      });
    });
    var ordenar = $("ana-ordenar");
    if (ordenar) ordenar.addEventListener("change", function () { desenharAnalise(); desenharQuestoesPainel(); });
    var soRevisar = $("ana-revisar");
    if (soRevisar) soRevisar.addEventListener("change", function () { desenharAnalise(); desenharQuestoesPainel(); });
    var csv = $("ana-csv");
    if (csv) csv.addEventListener("click", baixarCsvAnalise);
    var csvPainel = $("ab-csv");
    if (csvPainel) csvPainel.addEventListener("click", baixarCsvPainel);
    var cortesSalvar = $("ana-cortes-salvar");
    if (cortesSalvar) cortesSalvar.addEventListener("click", salvarCortes);
    var cortesPadrao = $("ana-cortes-padrao");
    if (cortesPadrao) cortesPadrao.addEventListener("click", voltarCortesPadrao);
    desenharCortes();
    var buscaAluno = $("ab-aluno-busca"), filtroAluno = $("ab-aluno-filtro");
    if (buscaAluno) buscaAluno.addEventListener("input", desenharBasicaAluno);
    if (filtroAluno) filtroAluno.addEventListener("change", desenharBasicaAluno);
    var fecharFicha = $("ab-ficha-fechar"), ficha = $("ab-ficha");
    if (fecharFicha && ficha) fecharFicha.addEventListener("click", function () { ficha.close(); });
    if (ficha) ficha.addEventListener("close", function () {
      if (ab.retornoFicha && ab.retornoFicha.isConnected) ab.retornoFicha.focus();
      ab.retornoFicha = null;
    });

    var tabsAnalise = [].slice.call(document.querySelectorAll("#analise-segmento [role=tab]"));
    tabsAnalise.forEach(function (tab, indice) {
      tab.addEventListener("keydown", function (ev) {
        var alvo;
        if (ev.key === "ArrowRight" || ev.key === "ArrowDown") alvo = (indice + 1) % tabsAnalise.length;
        if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") alvo = (indice + tabsAnalise.length - 1) % tabsAnalise.length;
        if (ev.key === "Home") alvo = 0;
        if (ev.key === "End") alvo = tabsAnalise.length - 1;
        if (alvo !== undefined) { ev.preventDefault(); window.switchAnalise(tabsAnalise[alvo].dataset.sub, true); }
      });
    });

    var tabRelatorios = $("tab-relatorios");
    if (tabRelatorios) tabRelatorios.addEventListener("click", function (ev) {
      var aluno = ev.target.closest("[data-ab-aluno]");
      if (aluno) { abrirFichaAnalise(aluno.dataset.abAluno, aluno); return; }
      var questao = ev.target.closest("[data-ab-questao]");
      if (questao) {
        var numero = questao.dataset.abQuestao;
        ab.questao = numero;
        window.switchAnalise("ab-questao");
        var detalhe = $("ab-questao-" + numero);
        if (detalhe) { detalhe.open = true; detalhe.querySelector("summary").focus(); detalhe.scrollIntoView({ block: "nearest" }); }
        return;
      }
      var descritor = ev.target.closest("[data-ab-descritor]");
      if (descritor) {
        var codigo = descritor.dataset.abDescritor;
        ab.descritor = codigo;
        window.switchAnalise("ab-descritor");
        var detalheDesc = [].slice.call(document.querySelectorAll("[data-ab-codigo]")).filter(function (el) {
          return el.dataset.abCodigo === codigo;
        })[0];
        if (detalheDesc) { detalheDesc.open = true; detalheDesc.querySelector("summary").focus(); detalheDesc.scrollIntoView({ block: "nearest" }); }
      }
    });

    var formEscola = $("form-escola");
    if (formEscola) formEscola.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var nomeDigitado = $("escola-nome").value;
      $("form-escola").reset();
      try {
        await criarEscola(nomeDigitado);
      } catch (err) {
        aviso(mensagemErro(err), "erro");
      }
    });

    var formTurma = $("form-turma");
    if (formTurma) formTurma.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var versao = versaoConta;
      try {
        await GabaDB.salvarTurma({
          nome: $("turma-nome").value,
          ano: $("turma-ano").value,
          escola: $("turma-escola") ? $("turma-escola").value : ""
        });
        if (versao !== versaoConta) return;
        $("form-turma").reset();
        aviso("Turma salva.", "ok");
        await carregarTudo();
      } catch (err) {
        if (versao !== versaoConta) return;
        aviso(mensagemErro(err), "erro");
      }
    });

    var formAluno = $("form-aluno");
    if (formAluno) formAluno.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var versao = versaoConta;
      try {
        await GabaDB.salvarAluno({
          turma_id: $("aluno-turma-select").value,
          nome: $("aluno-nome").value,
          numero: $("aluno-numero").value
        });
        if (versao !== versaoConta) return;
        $("aluno-nome").value = "";
        $("aluno-numero").value = "";
        aviso("Aluno salvo.", "ok");
        await carregarTudo();
      } catch (err) {
        if (versao !== versaoConta) return;
        aviso(mensagemErro(err), "erro");
      }
    });

    var formProva = $("form-prova");
    if (formProva) formProva.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var versao = versaoConta;
      if (!dbOk()) {
        aviso(faltaParaOBanco() + " Ou importe o documento da prova acima.", "erro");
        return;
      }
      try {
        var salva = await GabaDB.salvarProva(provaDoFormulario());
        if (versao !== versaoConta) return;
        $("form-prova").reset();
        window.gerarCamposGabarito();
        aviso("Prova \"" + salva.titulo + "\" salva. Para imprimir, use Imprimir cadernos na lista.", "ok");
        await carregarTudo();
      } catch (err) {
        if (versao !== versaoConta) return;
        aviso(mensagemErro(err), "erro");
      }
    });

    var arquivo = $("imp-arquivo");
    if (arquivo) arquivo.addEventListener("change", function () {
      lerArquivos(arquivo.files).then(function () { arquivo.value = ""; });
    });
    ligarImportacaoTurmas();
    var ver = $("imp-ver");
    if (ver) ver.addEventListener("click", lerTexto);
    var gravarLista = $("imp-salvar");
    if (gravarLista) gravarLista.addEventListener("click", salvarLista);
    var limpar = $("imp-limpar");
    if (limpar) limpar.addEventListener("click", limparLista);
    var campo = $("imp-texto");
    if (campo) campo.addEventListener("paste", function () {
      setTimeout(lerTexto, 60);
    });

    var formConfig = $("form-config");
    if (formConfig) formConfig.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var url = $("cfg-url").value.trim();
      var key = $("cfg-key").value.trim();
      if (window.GabaSync && !navigator.onLine) aviso("Sem rede agora, mas as credenciais ficam guardadas aqui.", "erro");
      if (window.GabaDB) GabaDB.saveConfig(url, key);
      ajustes.credencialAberta = false;
      await carregarTudo();
      montarConfig();
      aviso(temConexao()
        ? (url || key
          ? "Este aparelho passa a usar o banco de " + url + ", e não a conexão do app."
          : "O aparelho volta a usar a conexão que vem dentro do app.")
        : "Nada sobe deste aparelho: a conexão está desligada aqui.", "ok");
    });

    var usarEmbutida = $("btn-usar-embutida");
    if (usarEmbutida) usarEmbutida.addEventListener("click", async function () {
      GabaDB.usarCredencialDoPacote();
      await carregarTudo();
      montarConfig();
      aviso(temConexao()
        ? "Conexão do app ativada neste aparelho. É só entrar com e-mail e senha."
        : "Ainda sem conexão: preencha js/credencial.js com a URL e a anon key do projeto.", "ok");
    });

    var trocarCredencial = $("btn-trocar-credencial");
    if (trocarCredencial) trocarCredencial.addEventListener("click", function () {
      ajustes.credencialAberta = true;
      desenharAjustes();
      var campo = $("cfg-url");
      if (campo) campo.focus();
    });

    var formLogin = $("form-login");
    if (formLogin) formLogin.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      try {
        await entrarComo($("login-email").value, $("login-senha").value);
        $("form-login").reset();
      } catch (err) {
        aviso(mensagemErro(err), "erro");
      }
    });

    var abrirConta = $("btn-nova-conta");
    if (abrirConta) abrirConta.addEventListener("click", function () {
      ajustes.contaAberta = true;
      desenharAjustes();
      var campo = $("conta-nome");
      if (campo) campo.focus();
    });

    var formConta = $("form-conta");
    if (formConta) formConta.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      try {
        var aberto = await GabaDB.criarConta($("conta-nome").value, $("conta-email").value, $("conta-senha").value);
        $("form-conta").reset();
        if (!aberto.confirmado) {
          aviso("Conta criada, mas o projeto pede a confirmação do e-mail: abra a mensagem que chegou " +
            "para você e entre depois. Para dispensar a confirmação, desligue \"Confirm email\" no Supabase.", "erro");
          return;
        }
        ajustes.contaAberta = false;
        await carregarProfessor();
        desenharAjustes();
        await descerFila();
        await carregarTudo();
        aviso("Conta criada e você já está dentro como " + quemE() + ".", "ok");
      } catch (err) {
        aviso(mensagemErro(err), "erro");
      }
    });

    var sairBotao = $("btn-sair");
    if (sairBotao) sairBotao.addEventListener("click", sairDaConta);

    ligarSelo();
  }

  async function entrarComo(email, senha) {
    await GabaDB.entrar(email, senha);
    await carregarProfessor();
    desenharAjustes();
    var fila = await descerFila();
    await carregarTudo();
    aviso("Dentro. O Gaba agora salva como " + quemE() + "." +
      (fila && fila.synced ? " " + plural(fila.synced, "leitura presa", "leituras presas") + " no aparelho " + (fila.synced === 1 ? "subiu" : "subiram") + " para o banco." : ""), "ok");
  }

  async function sairDaConta() {
    try {
      await GabaDB.sair();
      app.professor = null;
      badge();
      desenharAjustes();
      await carregarTudo();
      aviso("Você saiu. Suas leituras ficam guardadas na sua conta neste aparelho e reaparecem quando você entrar de novo.", "ok");
    } catch (err) {
      aviso(mensagemErro(err), "erro");
    }
  }

  function desenharSelo() {
    var eu = app.professor;
    var conectavel = temConexao();
    var login = $("selo-login");
    if (login) login.hidden = !conectavel || Boolean(eu);
    var dentro = $("selo-dentro");
    if (dentro) dentro.hidden = !eu;
    var semBanco = $("selo-sem-banco");
    if (semBanco) semBanco.hidden = conectavel;
    if (eu) {
      var cfg = GabaDB.readConfig();
      setTexto("selo-nome", eu.nome || cfg.professorNome || String(eu.email || "").split("@")[0]);
      setTexto("selo-quem-email", eu.email || "");
    }
  }

  function abrirSelo(abrir) {
    var painel = $("selo-painel");
    var botao = $("status-conexao");
    if (!painel || !botao) return;
    painel.hidden = !abrir;
    botao.setAttribute("aria-expanded", abrir ? "true" : "false");
    if (!abrir) return;
    var erro = $("selo-erro");
    if (erro) erro.hidden = true;
    desenharSelo();
    var primeiro = !$("selo-login").hidden ? $("selo-email") : (!$("selo-dentro").hidden ? $("selo-sair") : $("selo-ir-ajustes"));
    if (primeiro) primeiro.focus();
  }

  function ligarSelo() {
    var botao = $("status-conexao");
    var caixa = $("conta-selo");
    if (!botao || !caixa) return;
    botao.addEventListener("click", function () {
      abrirSelo($("selo-painel").hidden);
    });
    document.addEventListener("click", function (ev) {
      if (!$("selo-painel").hidden && !caixa.contains(ev.target)) abrirSelo(false);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !$("selo-painel").hidden) {
        abrirSelo(false);
        botao.focus();
      }
    });

    $("selo-login").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var erro = $("selo-erro");
      var enviar = this.querySelector("button[type=submit]");
      erro.hidden = true;
      enviar.disabled = true;
      try {
        await entrarComo($("selo-email").value, $("selo-senha").value);
        this.reset();
        abrirSelo(false);
      } catch (err) {
        erro.textContent = mensagemErro(err);
        erro.hidden = false;
        $("selo-senha").select();
      } finally {
        enviar.disabled = false;
      }
    });

    $("selo-sair").addEventListener("click", async function () {
      abrirSelo(false);
      await sairDaConta();
    });

    $("selo-ir-ajustes").addEventListener("click", function () {
      abrirSelo(false);
      window.switchTab("config");
    });
  }

  function quemE() {
    var cfg = window.GabaDB ? GabaDB.readConfig() : {};
    var eu = app.professor;
    if (!eu) return "sem login";
    return eu.nome || cfg.professorNome || eu.email || "professor";
  }

  function montarConfig() {
    var cfg = window.GabaDB ? GabaDB.readConfig() : { url: "", key: "" };
    var inputUrl = $("cfg-url");
    var inputKey = $("cfg-key");
    if (inputUrl) inputUrl.value = cfg.url || "";
    if (inputKey) inputKey.value = cfg.key || "";
    badge();
    desenharAjustes();
  }

  /* a conexao ja vem dentro do pacote (js/credencial.js): os campos de digitar somem e
     o que o professor ve todo dia e o login dele, que agora e o que abre o banco. */
  function desenharAjustes() {
    var cfg = window.GabaDB ? GabaDB.readConfig() : { url: "", key: "" };
    var cheio = Boolean(cfg.url && cfg.key);
    var eu = app.professor;
    var form = $("form-config");
    if (form) form.hidden = cheio && !ajustes.credencialAberta;
    var urlSalva = $("cfg-url-salva");
    if (urlSalva) urlSalva.textContent = cfg.url || "";
    var como = $("cfg-como");
    if (como) como.textContent = cfg.doPacote ? "Conexão embutida no app" : "Conexão guardada neste aparelho";
    var guarda = $("cfg-salva");
    if (guarda) guarda.hidden = !cheio;
    var trocar = $("btn-trocar-credencial");
    if (trocar) trocar.hidden = !cheio;
    var usar = $("btn-usar-embutida");
    if (usar) usar.hidden = !(window.GabaDB && GabaDB.temCredencialDoPacote() && !cheio);
    var dicaCfg = $("cfg-aviso");
    if (dicaCfg && !cheio && window.GabaDB && GabaDB.temCredencialDoPacote) {
      dicaCfg.textContent = GabaDB.temCredencialDoPacote()
        ? "A conexão embutida está desligada neste aparelho. Use \"Usar a conexão que vem no app\" para religar."
        : "Nenhum banco ainda: preencha js/credencial.js com a Project URL e a anon key, ou digite aqui só para este aparelho.";
    }
    var logado = $("professor-logado");
    if (logado) logado.hidden = !eu;
    var formLogin = $("form-login");
    if (formLogin) formLogin.hidden = Boolean(eu);
    var pedirLogin = $("login-obrigatorio");
    if (pedirLogin) pedirLogin.hidden = Boolean(eu) || !cheio;
    var abrirConta = $("btn-nova-conta");
    if (abrirConta) abrirConta.hidden = Boolean(eu) || ajustes.contaAberta;
    var formConta = $("form-conta");
    if (formConta) formConta.hidden = Boolean(eu) || !ajustes.contaAberta;
    if (eu) {
      setTexto("logado-nome", eu.nome || cfg.professorNome || String(eu.email || "").split("@")[0]);
      setTexto("logado-email", eu.email || "");
    }
    atualizarStatusBackup();
  }

  document.addEventListener("DOMContentLoaded", function () {
    montarConfig();
    window.gerarCamposGabarito();
    ligar();
    carregarTudo();
    /* sem service worker o celular nao oferece instalar na tela inicial nem abre sem internet */
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(function () {});
  });

  window.GabaApp = {
    estado: app,
    importar: imp,
    indicadorQuestao: indicadorQuestao,
    carregarTudo: carregarTudo,
    provaDoFormulario: provaDoFormulario,
    mensagemErro: mensagemErro,
    esc: esc,
    chave: chave,
    abrirNoCaderno: abrirNoCaderno,
    abrirNoLeitor: abrirNoLeitor,
    provaImportada: provaImportada,
    revisarProva: revisarProva,
    salvarProvaLocal: salvarProvaLocal,
    analise: {
      desenhar: desenharAnalise,
      itens: function () { return ana.itens; },
      estado: ana,
      csv: csvDaAnalise,
      folhas: folhasParaAnalise,
      baixar: baixarCsvAnalise
    },
    lista: {
      arquivos: lerArquivos,
      texto: lerTexto,
      analisar: analisar,
      salvar: salvarLista,
      limpar: limparLista,
      previa: desenharPrevia
    }
  };
})();
