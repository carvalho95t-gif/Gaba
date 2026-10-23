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

  async function carregarTudo() {
    await carregarProfessor();
    badge();
    if (window.GabaCaderno && GabaCaderno.carregarProvasLocais) {
      try {
        await GabaCaderno.carregarProvasLocais();
      } catch (err) {
        /* fica com o que já está em memória */
      }
    }
    app.locais = (window.GabaCaderno && GabaCaderno.estado && GabaCaderno.estado.provasLocais) || [];
    try {
      app.leituras = window.GabaSync ? await GabaSync.listResults() : [];
    } catch (err) {
      app.leituras = [];
    }
    if (dbOk()) {
      try {
        var tudo = await Promise.all([
          GabaDB.listTurmas(), GabaDB.listAlunos(), GabaDB.listProvas(), GabaDB.fetchCorrecoes()
        ]);
        app.turmas = tudo[0] || [];
        app.alunos = tudo[1] || [];
        app.provas = tudo[2] || [];
        app.correcoes = tudo[3] || [];
      } catch (err) {
        aviso(mensagemErro(err), "erro");
      }
    } else {
      app.turmas = [];
      app.alunos = [];
      app.provas = [];
      app.correcoes = [];
    }
    await carregarEscolas();
    app.momento = Date.now();
    desenharTudo();
    desenharAjustes();
  }

  /* o cadastro de escolas mora no aparelho; o banco e a copia para os outros aparelhos.
     se a tabela ainda nao foi criada, o cadastro local continua valendo sozinho. */
  async function carregarEscolas() {
    app.escolas = [];
    if (!dbOk() || !GabaDB.listEscolas) return;
    try {
      app.escolas = await GabaDB.listEscolas();
      if (window.GabaEscolas) GabaEscolas.sincronizar(app.escolas);
    } catch (err) {
      app.escolas = [];
    }
  }

  async function carregarProfessor() {
    app.professor = null;
    if (!temConexao() || !GabaDB.usuario) return;
    try {
      app.professor = await GabaDB.usuario();
    } catch (err) {
      app.professor = null;
    }
  }

  /* o que foi lido sem login esta guardado no aparelho: no instante em que o professor
     entra, a fila inteira sobe para o banco */
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
        if (!tirar) return;
        await tirarEscola(id);
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
        if (escola === null) return;
        await GabaDB.salvarTurma({ id: id, nome: outra.nome, ano: outra.ano, escola: escola });
        aviso("Escola da turma atualizada.", "ok");
      } else if (nome === "renomear-turma") {
        var t = app.turmas.filter(function (x) { return String(x.id) === id; })[0];
        var nomeNovo = t ? await pedir({ titulo: "Renomear turma", campo: { rotulo: "Nome da turma", valor: t.nome } }) : null;
        if (nomeNovo === null) return;
        await GabaDB.salvarTurma({ id: id, nome: nomeNovo, ano: t ? t.ano : "", escola: t ? t.escola : "" });
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
        if (!apagarTurma) return;
        await GabaDB.excluirTurma(id);
        aviso("Turma apagada.", "ok");
      } else if (nome === "apagar-aluno") {
        alvo = app.alunos.filter(function (x) { return String(x.id) === id; })[0];
        var apagarAluno = await pedir({
          titulo: "Apagar " + (alvo ? alvo.nome + " (nº " + alvo.numero + ")" : "este aluno") + "?",
          texto: "As folhas impressas dele continuam podendo ser lidas.",
          ok: "Apagar",
          perigo: true
        });
        if (!apagarAluno) return;
        await GabaDB.excluirAluno(id);
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
        if (!apagarProva) return;
        await GabaDB.excluirProva(id);
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
        var restantes = await GabaSync.countPending();
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
      aviso(mensagemErro(err), "erro");
    }
    await carregarTudo();
  }

  /* uma prova importada de .docx tem id "docx-...": ao salvar no banco o id muda, entao
     as folhas impressas antes deixam de bater com as versoes novas. */
  async function salvarProvaLocal(id) {
    var prova = (app.locais || []).filter(function (p) { return String(p.id) === id; })[0];
    if (!prova) {
      aviso("Essa prova não está mais neste aparelho.", "erro");
      return;
    }
    var salvo = await GabaDB.salvarProva(prova);
    var lote = window.GabaCaderno && GabaCaderno.loteImpresso ? GabaCaderno.loteImpresso(id) : null;
    var revisando = provaRevisada === id;
    prova.__local = false;
    if (window.GabaCaderno && GabaCaderno.esquecerProvaLocal) await GabaCaderno.esquecerProvaLocal(id);
    prova.id = salvo.id;
    await carregarTudo();
    if (revisando) await revisarProva(salvo.id);
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
    var lista = [].slice.call(files || []);
    if (!lista.length) return;
    impStatus("Lendo " + lista.map(function (f) { return f.name; }).join(", ") + " neste aparelho...", "");
    try {
      analisar(await arquivosParaItens(lista));
    } catch (err) {
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
      imp.salvo = r.gravados;
      await carregarTudo();
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
      avisos.push(impt.saidas === 1 ? "1 aluno marcado como transferido ou remanejado ficou de fora."
        : impt.saidas + " alunos marcados como transferidos ou remanejados ficaram de fora.");
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
        listaDeAvisos(impt.feito.avisos) +
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
      "</div>" + listaDeAvisos(avisosImpt()) +
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
      var r = GabaLista.turmasDaPasta(await arquivosParaItens(lista));
      impt.turmas = r.turmas;
      impt.ignoradas = r.ignoradas;
      impt.repetidas = r.repetidas;
      impt.saidas = r.saidas;
      r.turmas.forEach(function (t, i) { impt.marcadas[i] = true; });
    } catch (err) {
      impt.erro = mensagemErro(err);
    }
    impt.lendo = false;
    desenharImportacaoTurmas();
  }

  async function salvarImportacaoTurmas() {
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
        impt.ids[chaveNome] = turma;
        var id = turma.id;
        if (existe) existentes++;
        else {
          novas++;
          app.turmas.push(turma);
        }
        if (comAlunos && x.t.alunos.length) {
          var r = await GabaDB.salvarAlunosEmLote(id, x.t.alunos);
          gravados += r.gravados;
          (r.problemas || []).forEach(function (p) { problemas.push(x.nome + ": " + p); });
        }
      }
    } catch (err) {
      await carregarTudo();
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
    desenharBasicaResumo();
    desenharBasicaAluno();
    desenharBasicaDescritor();
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
    var E = window.GabaEscolas;
    var linhas = app.escolas.filter(function (r) { return E.chave(r.nome) === E.chave(nome); });
    for (var n = 0; n < linhas.length; n++) await GabaDB.excluirEscola(linhas[n].id);
    E.remover(nome);
    if (E.chave(E.filtro()) === E.chave(nome)) E.setFiltro("");
  }

  async function criarEscola(nomeBruto) {
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
    /* o banco e a copia para os outros aparelhos; sem ele a escola fica neste aparelho */
    if (dbOk()) {
      try {
        app.escolas.push(await GabaDB.salvarEscola({ nome: criado.nome }));
      } catch (err) {
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
    provaRevisada = String(id || "");
    if (provaRevisada && window.GabaCaderno) {
      var sel = $("cad-prova");
      var tem = sel && [].some.call(sel.options, function (o) { return o.value === provaRevisada; });
      if (!tem) await GabaCaderno.carregarListas();
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
      corpo.innerHTML = '<tr><td colspan="5" class="text-muted">Nenhuma correção registrada.</td></tr>';
      return;
    }
    corpo.innerHTML = linhas.map(function (l) {
      var r = l.r;
      var total = r.total_questoes || (r.respostas || []).length || 0;
      var selo = l.banco ? "" : ' <span class="so-aparelho-tag" title="' +
        esc(r.sync_error || "ainda não subiu para o banco") + '">aparelho</span>';
      return "<tr><td>" + esc(dataCurta(r.created_at)) + "</td>" +
        "<td>" + esc(r.aluno_numero || "-") + " — " + esc(r.aluno_nome || "") + selo + "</td>" +
        "<td>" + esc(nomeTurma(r.turma_id)) + "</td>" +
        "<td>" + esc(nomeProva(r.prova_id)) + "</td>" +
        "<td><strong>" + esc(decimal(Number(r.nota || 0).toFixed(1))) + "</strong> " +
        '<span class="text-muted">' + esc(String(r.acertos || 0)) + "/" + esc(String(total)) +
        (r.codigo ? " · tipo " + esc(String(r.versao || 1)) + " " + esc(r.codigo) : "") +
        (r.branco ? " · " + esc(String(r.branco)) + " em branco" : "") + "</span></td></tr>";
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
    return app.correcoes.concat(leiturasSoNoAparelho()).filter(function (r) {
      if (String(r.prova_id || "") !== String(prova.id)) return false;
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
      cartao("Média da turma", decimal(r.media.toFixed(2)), "nota de 0 a 10") +
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
    return '<tr data-q="' + esc(String(it.numero)) + '"' + (it.bandeiras.length ? ' class="sinalizada"' : "") +
      '><td class="ana-num">' + esc(String(it.numero)) + "</td>" +
      "<td>" + esc(it.gabarito || "—") + "</td>" +
      "<td>" + esc(decimal(it.peso)) + "</td>" +
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
      : '<div class="ana-tabela"><table class="data-table"><thead><tr><th>Nº</th><th>Gab</th><th>Peso</th>' +
        "<th>Acertos</th><th>% de acerto</th><th>Branco</th><th>Disc.</th><th>Distratores (letra e nº de marcas)</th>" +
        "<th>Descritor / BNCC</th><th>O que revisar</th></tr></thead><tbody>" +
        ordenadas.map(linhaItem).join("") + "</tbody></table></div>";
  }

  function resumoVazio() {
    return { alunos: 0, media: 0, itens: 0, revisar: [], semGabarito: [], faceis: [], dificeis: [],
      distratores: [], discriminacaoBaixa: [], mediaDiscriminacao: null };
  }

  function csvDaAnalise(itens) {
    var cabecalho = ["Questao", "Gabarito", "Peso", "Participantes", "Acertos", "% acerto", "Em branco",
      "Discriminacao", "A", "B", "C", "D", "E", "Distrator mais forte", "Descritor", "Habilidade BNCC", "Bandeiras"];
    var linhas = (itens || []).map(function (it) {
      return [it.numero, it.gabarito, decimal(it.peso), it.participantes, it.acertos,
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
    switchTab("caderno");
    if (!window.GabaCaderno) return;
    await GabaCaderno.carregarListas();
    selecionar("cad-prova", id);
  }

  async function abrirNoLeitor(id) {
    switchTab("scanner");
    if (!window.GabaScanner) return;
    await GabaScanner.preencherListas(app.locais);
    selecionar("scan-prova", id);
  }

  /* --------------------------------------------------------------- formularios */

  /* ---- análise básica: sub-abas, resumo, ranking, descritor ---- */

  window.switchAnalise = function switchAnalise(id) {
    document.querySelectorAll(".ab-painel").forEach(function (el) { el.classList.remove("active"); });
    var alvo = $(id);
    if (alvo) alvo.classList.add("active");
    document.querySelectorAll("#analise-segmento [data-sub]").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.dataset.sub === id));
    });
  };

  var SITUACAO = {
    dominado: { nivel: "alto", texto: "Dominado" },
    parcial: { nivel: "medio", texto: "Parcial" },
    fragil: { nivel: "baixo", texto: "Frágil" }
  };

  function umaCasa(v) {
    return decimal(Number(v || 0).toFixed(1));
  }

  function nivelDaNota(nota) {
    return nota >= 6 ? "alto" : nota >= 4 ? "medio" : "baixo";
  }

  function etiqueta(nivel, texto) {
    return '<span class="ab-etiqueta ab-' + nivel + '">' + esc(texto) + "</span>";
  }

  function barra(rotulo, pct, valor, nivel, depois) {
    return '<div class="ab-barra"><span class="ab-barra-rotulo">' + esc(rotulo) + "</span>" +
      '<span class="ab-trilho"><i class="ab-' + nivel + '" style="width:' +
      Math.max(2, Math.min(100, pct)) + '%"></i></span>' +
      '<span class="ab-barra-valor">' + esc(valor) + "</span>" + (depois || "") + "</div>";
  }

  function semFolhas(turmaId) {
    return "Nenhuma folha lida desta prova" + (turmaId ? " nesta turma" : "") +
      ". Passe as folhas no Leitor antes de analisar.";
  }

  function desenharBasicaResumo() {
    var box = $("ab-resumo-cards");
    var dist = $("ab-resumo-distrib");
    if (!box) return;
    if (dist) dist.innerHTML = "";
    var prova = provaAtualAnalise();
    var turmaId = turmaAtualAnalise();
    if (!prova || !window.GabaBasica) {
      box.innerHTML = '<p class="cad-status">Escolha a prova para ver a média, quem passou e como as notas se espalham.</p>';
      return;
    }
    var folhas = folhasParaAnalise(prova, turmaId);
    if (!folhas.length) {
      box.innerHTML = '<p class="cad-status">' + esc(semFolhas(turmaId)) + "</p>";
      return;
    }
    var r = GabaBasica.resumoTurma(prova, folhas, turmaId);
    box.innerHTML = '<div class="ana-cards ab-cards">' +
      cartao("Média", umaCasa(r.media), "nota de 0 a 10") +
      cartao("Mediana", umaCasa(r.mediana), "metade tirou mais que isso") +
      cartao("Aprovados", decimal(String(r.taxaAprovacao)) + "%", r.aprovados + " com nota 6 ou mais") +
      cartao("Folhas lidas", String(r.alunos), "") +
      cartao("Menor e maior", umaCasa(r.min) + " – " + umaCasa(r.max), "") +
      cartao("Desvio", umaCasa(r.desvio), "quanto as notas se espalham") +
      "</div>";
    if (dist) {
      var maior = Math.max.apply(null, r.faixas) || 1;
      dist.innerHTML = '<h3 class="secao">Distribuição das notas</h3><div class="form-container">' +
        r.faixaRotulos.map(function (rot, i) {
          return barra(rot.replace("-", " a "), r.faixas[i] / maior * 100,
            plural(r.faixas[i], "folha", "folhas"), i < 2 ? "baixo" : i < 3 ? "medio" : "alto");
        }).join("") + "</div>";
    }
  }

  var abAlunoSel = "";

  function desenharBasicaAluno() {
    var box = $("ab-aluno-conteudo");
    var statusEl = $("ab-aluno-status");
    if (!box) return;
    var prova = provaAtualAnalise();
    var turmaId = turmaAtualAnalise();
    if (!prova || !window.GabaBasica) {
      box.innerHTML = "";
      if (statusEl) statusEl.textContent = "Escolha a prova para ver o ranking e a ficha de cada aluno.";
      return;
    }
    var folhas = folhasParaAnalise(prova, turmaId);
    if (!folhas.length) {
      box.innerHTML = "";
      if (statusEl) statusEl.textContent = semFolhas(turmaId);
      return;
    }
    var rank = GabaBasica.ranking(prova, folhas, turmaId, app.alunos);
    if (statusEl) statusEl.textContent = plural(rank.length, "aluno", "alunos") + " nesta prova. Toque no nome para ver a ficha.";

    var tabela = '<div class="ab-tabela"><table class="data-table"><thead><tr>' +
      "<th>Nº</th><th>Aluno</th><th>Nota</th><th>Posição</th></tr></thead><tbody>" +
      rank.map(function (a) {
        var sel = String(a.aluno_id || a.nome) === abAlunoSel ? " ab-sel" : "";
        return '<tr class="ab-rank-linha' + sel + '" data-aluno="' + esc(String(a.aluno_id || a.nome)) + '">' +
          '<td class="ana-num">' + esc(String(a.numero || "-")) + "</td>" +
          "<td><b>" + esc(a.nome) + "</b></td>" +
          '<td class="ab-nota"><strong>' + esc(umaCasa(a.nota)) + '</strong> <span class="text-muted">' +
          esc(String(a.acertos)) + "/" + esc(String(a.total)) + "</span></td>" +
          "<td>" + etiqueta(nivelDaNota(a.nota), a.posicao + "º") + "</td></tr>";
      }).join("") + "</tbody></table></div>";

    var ficha = "";
    var sel = rank.filter(function (a) { return String(a.aluno_id || a.nome) === abAlunoSel; })[0] || rank[0];
    if (sel) {
      abAlunoSel = String(sel.aluno_id || sel.nome);
      var descs = GabaBasica.perfilAluno(prova, sel);
      var mediaRank = rank.length ? rank.reduce(function (s, a) { return s + a.nota; }, 0) / rank.length : 0;
      var diff = sel.nota - mediaRank;
      var comparacao = Math.abs(diff) < 0.05 ? '<span class="ab-na-media">na média da turma</span>'
        : '<span class="' + (diff > 0 ? "ab-acima" : "ab-abaixo") + '">' + esc(umaCasa(Math.abs(diff))) +
          (diff > 0 ? " acima" : " abaixo") + " da média</span>";
      ficha = '<div class="ab-ficha"><p class="ab-ficha-nome">' + esc(sel.nome) + "</p>" +
        '<p class="ab-ficha-nota">Nota <b>' + esc(umaCasa(sel.nota)) + "</b> · " + comparacao + "</p>" +
        '<p class="ab-rotulo">Descritores</p>' +
        (descs.length ? descs.map(function (d) {
          var s = SITUACAO[d.status];
          return barra(d.descritor, d.taxa, Math.round(d.taxa) + "%", s.nivel, etiqueta(s.nivel, s.texto));
        }).join("") : '<p class="ajuda">Nenhum descritor vinculado às questões desta prova.</p>') +
        "</div>";
    }
    box.innerHTML = tabela + ficha;
  }

  function desenharBasicaDescritor() {
    var box = $("ab-desc-conteudo");
    var statusEl = $("ab-desc-status");
    if (!box) return;
    var prova = provaAtualAnalise();
    var turmaId = turmaAtualAnalise();
    if (!prova || !window.GabaBasica) {
      box.innerHTML = "";
      if (statusEl) statusEl.textContent = "Escolha a prova para ver o desempenho por descritor.";
      return;
    }
    var folhas = folhasParaAnalise(prova, turmaId);
    if (!folhas.length) {
      box.innerHTML = "";
      if (statusEl) statusEl.textContent = semFolhas(turmaId);
      return;
    }
    var catalogo = window.GabaDescritores ? GabaDescritores.todos() : [];
    var descs = GabaBasica.taxaPorDescritor(prova, folhas, turmaId, catalogo);
    if (!descs.length) {
      box.innerHTML = "";
      if (statusEl) statusEl.textContent = "Nenhum descritor vinculado às questões desta prova. Vincule na revisão da prova, na aba Provas.";
      return;
    }
    if (statusEl) statusEl.textContent = plural(descs.length, "descritor", "descritores") + " nesta prova.";
    box.innerHTML = '<div class="ab-tabela"><table class="data-table"><thead><tr>' +
      '<th>Descritor</th><th class="ab-habilidade">Habilidade</th><th>Acerto</th><th>Situação</th></tr></thead><tbody>' +
      descs.map(function (d) {
        var s = SITUACAO[d.status];
        return '<tr><td class="ana-num">' + esc(d.descritor) +
          '<small class="ab-hab-curta">' + esc(d.descricao || "") + "</small></td>" +
          '<td class="ab-habilidade">' + esc(d.descricao || "—") + "</td>" +
          '<td class="ana-pc"><span class="ana-barra"><i class="ab-' + s.nivel + '" style="width:' +
          Math.max(2, d.taxa) + '%"></i></span>' + Math.round(d.taxa) + "%</td>" +
          "<td>" + etiqueta(s.nivel, s.texto) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
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
      div.innerHTML = "<label>Q" + i + ":</label><select class=\"gab-q\" data-q=\"" + i + "\">" +
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
    atualizarAba();
  };

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

    ["ab-prova", "ab-turma", "ana-ordenar"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", function () {
        desenharAnalise();
        desenharBasicaResumo();
        desenharBasicaAluno();
        desenharBasicaDescritor();
      });
    });
    var soRevisar = $("ana-revisar");
    if (soRevisar) soRevisar.addEventListener("change", desenharAnalise);
    var csv = $("ana-csv");
    if (csv) csv.addEventListener("click", baixarCsvAnalise);

    document.addEventListener("click", function (ev) {
      var linha = ev.target.closest(".ab-rank-linha");
      if (!linha) return;
      abAlunoSel = linha.dataset.aluno || "";
      desenharBasicaAluno();
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
      try {
        await GabaDB.salvarTurma({
          nome: $("turma-nome").value,
          ano: $("turma-ano").value,
          escola: $("turma-escola") ? $("turma-escola").value : ""
        });
        $("form-turma").reset();
        aviso("Turma salva.", "ok");
        await carregarTudo();
      } catch (err) {
        aviso(mensagemErro(err), "erro");
      }
    });

    var formAluno = $("form-aluno");
    if (formAluno) formAluno.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      try {
        await GabaDB.salvarAluno({
          turma_id: $("aluno-turma-select").value,
          nome: $("aluno-nome").value,
          numero: $("aluno-numero").value
        });
        $("aluno-nome").value = "";
        $("aluno-numero").value = "";
        aviso("Aluno salvo.", "ok");
        await carregarTudo();
      } catch (err) {
        aviso(mensagemErro(err), "erro");
      }
    });

    var formProva = $("form-prova");
    if (formProva) formProva.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      if (!dbOk()) {
        aviso(faltaParaOBanco() + " Ou importe o documento da prova acima.", "erro");
        return;
      }
      try {
        var salva = await GabaDB.salvarProva(provaDoFormulario());
        $("form-prova").reset();
        window.gerarCamposGabarito();
        aviso("Prova \"" + salva.titulo + "\" salva. Para imprimir, use Imprimir cadernos na lista.", "ok");
        await carregarTudo();
      } catch (err) {
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
      aviso("Você saiu. O banco para de atender até entrar de novo; as leituras continuam neste aparelho.", "ok");
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
