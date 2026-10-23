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

  function badge() {
    var el = $("status-conexao");
    if (!el) return;
    if (dbOk()) {
      el.textContent = "Supabase Conectado";
      el.className = "badge badge-on";
    } else if (temConexao()) {
      el.textContent = "Precisa entrar";
      el.className = "badge badge-off";
    } else {
      el.textContent = "Só neste aparelho";
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

  async function executar(nome, id, extra) {
    var alvo;
    try {
      if (nome === "turma-aqui") {
        aplicarEscola(id);
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
        if (!confirm('Tirar "' + id + '" do cadastro?' + (quantas
          ? "\nAs " + quantas + " turma(s) com esse nome continuam com o nome delas." : ""))) return;
        await tirarEscola(id);
        aviso("Escola fora do cadastro.", "ok");
      } else if (nome === "escola-turma") {
        var outra = app.turmas.filter(function (x) { return String(x.id) === id; })[0];
        if (!outra) return;
        var conhecidas = window.GabaEscolas
          ? GabaEscolas.noFiltro(app.turmas).map(function (e) { return e.nome; }).join("  ·  ") : "";
        var escola = prompt("Escola desta turma (deixe vazio para a turma ficar sem escola):\n\n" +
          (conhecidas ? "Escolas do cadastro: " + conhecidas : "Nenhuma escola cadastrada ainda."), outra.escola || "");
        if (escola === null) return;
        await GabaDB.salvarTurma({ id: id, nome: outra.nome, ano: outra.ano, escola: escola });
        aviso("Escola da turma atualizada.", "ok");
      } else if (nome === "renomear-turma") {
        var t = app.turmas.filter(function (x) { return String(x.id) === id; })[0];
        var nomeNovo = t ? prompt("Nome da turma:", t.nome) : null;
        if (nomeNovo === null) return;
        await GabaDB.salvarTurma({ id: id, nome: nomeNovo, ano: t ? t.ano : "", escola: t ? t.escola : "" });
        aviso("Turma atualizada.", "ok");
      } else if (nome === "apagar-turma") {
        alvo = app.turmas.filter(function (x) { return String(x.id) === id; })[0];
        var qtd = app.alunos.filter(function (a) { return String(a.turma_id) === id; }).length;
        if (!confirm("Apagar a turma \"" + (alvo ? alvo.nome : id) + "\" e os " + qtd + " aluno(s) dela?\nAs notas já corrigidas continuam no banco.")) return;
        await GabaDB.excluirTurma(id);
        aviso("Turma apagada.", "ok");
      } else if (nome === "apagar-aluno") {
        alvo = app.alunos.filter(function (x) { return String(x.id) === id; })[0];
        if (!confirm("Apagar " + (alvo ? alvo.nome + " (nº " + alvo.numero + ")" : "este aluno") +
          "? As folhas impressas dele continuam podendo ser lidas.")) return;
        await GabaDB.excluirAluno(id);
        aviso("Aluno apagado.", "ok");
      } else if (nome === "salvar-prova-no-banco") {
        await salvarProvaLocal(id);
        return;
      } else if (nome === "apagar-prova") {
        alvo = app.provas.filter(function (x) { return String(x.id) === id; })[0];
        if (!confirm("Apagar a prova \"" + (alvo ? alvo.titulo : id) + "\"?\nAs notas já corrigidas continuam no banco.")) return;
        await GabaDB.excluirProva(id);
        aviso("Prova apagada.", "ok");
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
          aviso("Sem login o banco não atende: " + restantes + " leitura(s) presas neste aparelho. Entre na aba Ajustes.", "erro");
        } else {
          aviso((r.synced ? r.synced + " subida(s) ao banco. " : "") +
            (restantes ? restantes + " leitura(s) ainda só neste aparelho." : "Nada parado no aparelho."), restantes ? "erro" : "ok");
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
    prova.__local = false;
    if (window.GabaCaderno && GabaCaderno.esquecerProvaLocal) await GabaCaderno.esquecerProvaLocal(id);
    prova.id = salvo.id;
    await carregarTudo();
    if (lote) {
      aviso("Prova salva no banco como \"" + salvo.titulo + "\". ATENÇÃO: você já tinha impresso " +
        lote.itens.length + " caderno(s) com o id antigo: imprima de novo antes de ler, senão o leitor " +
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
      '<div class="imp-resumo"><strong>' + imp.alunos.length + " aluno(s) lido(s)</strong>" +
      (imp.fonte ? ' da aba "<em>' + esc(imp.fonte) + "</em>\"" : "") +
      " &middot; " + imp.puladas + " linha(s) ignoradas" +
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
        ? '<p class="text-muted">+ ' + (imp.alunos.length - mostrados.length) + " aluno(s) na mesma lista.</p>" : "") +
      (imp.alunos.some(function (a) { return a.numeroAutomatico; })
        ? '<p class="text-muted">* linha sem número de chamada: o Nº foi dado na ordem.</p>' : "");
    if (salvar) salvar.disabled = false;
    if (!aviso) impStatus("Pronto para salvar " + imp.alunos.length + " aluno(s). Leia os avisos antes.", "ok");
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
        " aba(s) com alunos; usei \"" + imp.fonte + "\" com " + imp.alunos.length +
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
        doc.abas.forEach(function (a) { itens.push({ rotulo: a.nome, linhas: a.linhas }); });
      } else {
        itens.push({ rotulo: f.name || "arquivo", linhas: P.separar(P.decodar(buf)) });
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
      impStatus(r.gravados + " aluno(s) salvos em \"" + nomeTurma(turmaId) + "\"" +
        (sobra ? ", " + sobra + " ficaram de fora" : "") +
        ". Reimportar a mesma lista corrige os dados em vez de duplicar a turma.", r.gravados ? "ok" : "erro");
      aviso("Lista importada: " + r.gravados + " aluno(s).", r.gravados ? "ok" : "erro");
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

  /* ---------------------------------------------------------------- desenho */

  function desenharTudo() {
    desenharEscolas();
    desenharFiltroEscola();
    desenharPainel();
    desenharTurmas();
    desenharProvas();
    desenharNotas();
    desenharAnalise();
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
      box.innerHTML = '<p class="text-muted">Nenhuma escola cadastrada ainda: crie a primeira acima e as turmas entram nela.</p>';
      return;
    }
    var filtro = E.filtro();
    box.innerHTML = lista.map(function (e) {
      var ativa = E.chave(e.nome) === E.chave(filtro);
      return '<div class="item-lista"><div class="item-cab"><strong>' + esc(e.nome) + "</strong>" +
        "<span>" + (e.turmas ? e.turmas + " turma(s)" : "ainda sem turma") + "</span>" +
        (ativa ? '<span class="badge badge-on">na tela</span>' : "") +
        '<span class="item-acoes">' +
        botao("turma-aqui", e.nome, "adicionar turma", "btn-ghost pequeno") +
        botao("escola-filtrar", e.nome, ativa ? "ver todas" : "ver só esta", "btn-ghost pequeno") +
        (e.cadastrada ? botao("apagar-escola", e.nome, "tirar do cadastro", "btn-danger") : "") +
        "</span></div></div>";
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
        (e.turmas ? " · " + e.turmas + " turma(s)" : " · ainda sem turma") + "</option>");
    });
    if (sem) {
      partes.push('<option value="' + esc(E.SEM_ESCOLA) + '">' + esc(E.SEM_ESCOLA) +
        " · " + sem + " turma(s)</option>");
    }
    sel.innerHTML = partes.join("");
    sel.value = atual;
    box.hidden = !atual && lista.length < 2 && !sem;
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
      box.innerHTML = '<div class="item-lista"><div class="item-cab">' +
        '<span class="text-muted">Nenhuma turma ainda: cadastre em Bastidor &rsaquo; Turmas.</span></div></div>';
      return;
    }
    var lidas = app.correcoes.concat(leiturasSoNoAparelho());
    box.innerHTML = visiveis.map(function (t) {
      var alunos = app.alunos.filter(function (a) { return String(a.turma_id) === String(t.id); }).length;
      var feitas = lidas.filter(function (r) { return String(r.turma_id) === String(t.id); }).length;
      var pct = alunos ? Math.min(100, Math.round(feitas / alunos * 100)) : 0;
      var falta = Math.max(alunos - feitas, 0);
      return '<div class="item-lista"><div class="item-cab"><strong>' + esc(t.nome) + "</strong>" +
        "<span>" + alunos + " aluno(s) · " + feitas + " folha(s) lida(s)</span>" +
        (falta ? '<span class="alivio-falta">faltam ' + falta + "</span>"
               : '<span class="alivio-falta" style="color:var(--primary)">pilha zerada</span>') +
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
    setTexto("dash-papel-detalhe", lidas + " folha(s) × " + GRAMA_POR_FOLHA +
      " g: papel que você não carregou, não conferiu e não guardou.");
    setTexto("dash-tempo-detalhe", lidas + " folha(s) × " + SEG_POR_FOLHA +
      " s de caneta na mão, na conta de uma correção manual.");
    setTexto("dash-turmas-count", visiveis.length);
    setTexto("dash-alunos-count", filtrando
      ? app.alunos.filter(function (a) { return dasVisiveis[String(a.turma_id)]; }).length
      : app.alunos.length);
    setTexto("dash-provas-count", app.provas.length + provasSoNoAparelho().length);
    setTexto("dash-correcoes-count", lidas);
    setTexto("dash-nota", (filtrando ? "Mostrando a escola \"" + filtrando + "\". " : "") + (dbOk()
      ? (soAparelho ? soAparelho + " folha(s) corrigida(s) ainda só neste aparelho." : "Tudo que foi lido está no banco.")
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
      sel.innerHTML = '<option value="">Selecione a Turma...</option>';
      visiveis.forEach(function (t) {
        var opt = document.createElement("option");
        opt.value = String(t.id);
        opt.textContent = String(t.nome || t.id);
        sel.appendChild(opt);
      });
      if (antes && visiveis.some(function (t) { return String(t.id) === antes; })) sel.value = antes;
    });
    if (!visiveis.length) {
      box.innerHTML = "<p class=\"text-muted\">" + (dbOk()
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
          "</span><span>" + botao("apagar-aluno", a.id, "apagar", "btn-ghost pequeno") + "</span></div>";
      }).join("");
      return '<div class="item-lista"><div class="item-cab"><strong>' + esc(t.nome) + "</strong>" +
        "<span>" + esc(t.ano || "") + "</span>" +
        (mostrarEscola ? "<span>" + esc(rotuloEscola(t)) + "</span>" : "") +
        "<span>" + alunos.length + " aluno(s)</span>" +
        '<span class="item-acoes">' + botao("escola-turma", t.id, "mudar escola") +
        botao("renomear-turma", t.id, "renomear") +
        botao("apagar-turma", t.id, "apagar", "btn-danger") + "</span></div>" +
        "<details><summary>ver alunos</summary>" + (roster || '<p class="text-muted">Nenhum aluno ainda.</p>') +
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

  function desenharProvas() {
    var box = $("lista-provas");
    if (!box) return;
    var linhas = app.provas.map(function (p) {
      var qtd = (p.questoes || []).length || p.quantidade_questoes || 0;
      return '<div class="item-lista"><div class="item-cab"><strong>' + esc(p.titulo) + "</strong>" +
        "<span>" + esc(p.disciplina || "") + "</span><span>" + qtd + " questões</span>" +
        "<span>" + esc(p.modo || "fixa") + (p.num_tipos > 1 ? " · " + p.num_tipos + " tipos" : "") + "</span>" +
        '<span class="item-acoes">' + botao("prova-no-caderno", p.id, "cadernos") +
        botao("prova-no-leitor", p.id, "ler folhas") +
        botao("apagar-prova", p.id, "apagar", "btn-danger") + "</span></div></div>";
    });
    var locais = provasSoNoAparelho().map(function (p) {
      var qtd = (p.questoes || []).length || 0;
      return '<div class="item-lista so-aparelho"><div class="item-cab"><strong>' + esc(p.titulo) + "</strong>" +
        "<span>" + qtd + " questões</span><span>só neste aparelho</span>" +
        '<span class="item-acoes">' + botao("salvar-prova-no-banco", p.id, "salvar no banco", "btn-success") +
        botao("prova-no-caderno", p.id, "cadernos") + "</span></div></div>";
    });
    box.innerHTML = linhas.concat(locais).join("") ||
      "<p class=\"text-muted\">Nenhuma prova ainda. Importe um .docx na aba Cadernos ou crie o gabarito acima.</p>";
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
        "<td><strong>" + esc(Number(r.nota || 0).toFixed(1)) + "</strong> " +
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

  function desenharAnalise() {
    var sel = $("ana-prova");
    if (!sel) return;
    var lista = provasParaAnalise();
    var antes = sel.value || ana.provaId || (lista.length === 1 ? String(lista[0].id) : "");
    var escolhida = preencherSeletor("ana-prova", lista.map(function (p) {
      return { valor: p.id, rotulo: p.titulo + (p.questoes ? " · " + p.questoes + " questões" : "") +
        (p.local ? " (neste aparelho)" : "") };
    }), antes, "Selecione a prova...");
    var selTurma = $("ana-turma");
    var turmaAntes = selTurma ? selTurma.value : "";
    preencherSeletor("ana-turma", turmasVisiveis().map(function (t) {
      return { valor: t.id, rotulo: String(t.nome || t.id) };
    }), turmaAntes, "Todas as turmas");
    var statusEl = $("ana-status");

    if (!escolhida) {
      ana.itens = [];
      ana.provaId = "";
      desenharResumo(null);
      if (statusEl) {
        statusEl.textContent = lista.length
          ? "Escolha a prova para ver o desempenho questão por questão."
          : "Nenhuma prova ainda: importe o .docx na aba Cadernos ou salve o gabarito na aba Provas.";
      }
      var caixa = $("ana-itens");
      if (caixa) caixa.innerHTML = "";
      return;
    }
    var prova = todasAsProvas().filter(function (p) { return String(p.id) === String(escolhida); })[0];
    var turmas = $("ana-turma") ? $("ana-turma").value : "";
    var folhas = folhasParaAnalise(prova, turmas);
    ana.provaId = escolhida;
    if (!window.GabaAnalise) {
      if (statusEl) statusEl.textContent = "O módulo de análise não carregou: recarregue a página.";
      return;
    }
    if (!folhas.length) {
      ana.itens = [];
      desenharResumo(resumoVazio());
      if (statusEl) {
        statusEl.textContent = "Nenhuma folha lida desta prova" + (turmas ? " nesta turma" : "") +
          ". Passe as folhas no Leitor antes de analizar.";
      }
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
      statusEl.textContent = r.alunos + " folha(s) de \"" + (prova.titulo || prova.id) + "\" · " +
        r.itens + " questão(ões) · " + r.revisar.length + " a revisar" +
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
    aviso("CSV da análise gerado com " + ana.itens.length + " questão(ões).", "ok");
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

    ["ana-prova", "ana-turma", "ana-ordenar"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", desenharAnalise);
    });
    var soRevisar = $("ana-revisar");
    if (soRevisar) soRevisar.addEventListener("change", desenharAnalise);
    var csv = $("ana-csv");
    if (csv) csv.addEventListener("click", baixarCsvAnalise);

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
        aviso(faltaParaOBanco() + " Ou importe o .docx na aba Cadernos para imprimir agora.", "erro");
        return;
      }
      try {
        var salva = await GabaDB.salvarProva(provaDoFormulario());
        $("form-prova").reset();
        window.gerarCamposGabarito();
        aviso("Prova \"" + salva.titulo + "\" salva. Abra os cadernos na aba Cadernos.", "ok");
        await carregarTudo();
      } catch (err) {
        aviso(mensagemErro(err), "erro");
      }
    });

    var arquivo = $("imp-arquivo");
    if (arquivo) arquivo.addEventListener("change", function () {
      lerArquivos(arquivo.files).then(function () { arquivo.value = ""; });
    });
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
        await GabaDB.entrar($("login-email").value, $("login-senha").value);
        $("form-login").reset();
        await carregarProfessor();
        desenharAjustes();
        var fila = await descerFila();
        await carregarTudo();
        aviso("Dentro. O Gaba agora salva como " + quemE() + "." +
          (fila && fila.synced ? " " + fila.synced + " leitura(s) presas no aparelho subiram para o banco." : ""), "ok");
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
    if (sairBotao) sairBotao.addEventListener("click", async function () {
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
