/* Login e QR simulados; o payload real é interceptado sem acesso ao banco externo. */
"use strict";

var hud = require("./hudChrome");
var porta = Number(process.argv[2] || 8796);
var base = "http://127.0.0.1:" + porta;

/* Executado antes de qualquer script do app; não há acesso ao banco externo. */
function prepararPagina() {
  "use strict";
  var t = window.__isolamento = {
    erros: [], casos: [], user: null, online: false, enviados: [], assinantes: [],
    gateLeitura: null, gateSessao: null, gateInsert: null, gateEscrita: null, escritas: [],
    url: "https://isolamento-um.invalid", dados: {}, resets: { caderno: 0, scanner: 0 }
  };
  t.A = { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "a@isolamento.invalid", user_metadata: { nome: "Docente Ficticia Alfa" } };
  t.B = { id: "bbbbbbbb-0000-4000-8000-000000000002", email: "b@isolamento.invalid", user_metadata: { nome: "Docente Ficticio Beta" } };
  t.P = "22222222-0000-4000-8000-000000000001";
  t.T = "11111111-0000-4000-8000-000000000001";
  t.AL = "33333333-0000-4000-8000-000000000001";
  t.S = "55555555-0000-4000-8000-000000000001";
  t.escola = "ESCOLA FICTICIA COMPARTILHADA";
  t.copy = function (x) { return JSON.parse(JSON.stringify(x)); };
  t.defer = function () {
    var resolve;
    var promise = new Promise(function (r) { resolve = r; });
    return { promise: promise, resolve: resolve, capturas: [] };
  };
  t.emitir = function (u) {
    t.user = u;
    t.assinantes.slice().forEach(function (fn) { fn(u ? "SIGNED_IN" : "SIGNED_OUT", u ? { user: u } : null); });
  };
  window.addEventListener("error", function () { t.erros.push("window.error"); });
  window.addEventListener("unhandledrejection", function () { t.erros.push("unhandledrejection"); });
  var consoleError = console.error;
  console.error = function () { t.erros.push("console.error"); consoleError.apply(console, arguments); };
  Object.defineProperty(navigator, "onLine", { configurable: true, get: function () { return t.online; } });
  /* Não registrar SW: evita cache/interceptação fora deste teste. */
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = function () { return Promise.resolve({}); };
  }
  window.QRCode = {
    toDataURL: function () {
      var canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
      canvas.getContext("2d").fillRect(0, 0, 32, 32);
      return Promise.resolve(canvas.toDataURL());
    }
  };
  localStorage.setItem("gaba_supabase_url", t.url);
  localStorage.setItem("gaba_supabase_anon_key", "CHAVE-FICTICIA-SEM-ACESSO");
  t.legado = {
    gaba_caderno_cfg: JSON.stringify({ escola: "ESCOLA FICTICIA LEGADA", professor: "Docente Ficticio Legado" }),
    gaba_lote_impresso: JSON.stringify({ prova_id: t.P, titulo: "LOTE FICTICIO LEGADO", itens: [{ aluno: { nome: "Aluno Ficticio Legado" }, versao: { codigo: "LEGADO" } }] }),
    gaba_ultimo_lote: JSON.stringify({ prova_id: t.P, marcador: "LEGADO" }),
    gaba_escolas_registro: "ESCOLA FICTICIA LEGADA",
    gaba_escola_filtro: "ESCOLA FICTICIA LEGADA"
  };
  Object.keys(t.legado).forEach(function (k) { localStorage.setItem(k, t.legado[k]); });
  t.legadoPronto = new Promise(function (resolve, reject) {
    var req = indexedDB.open("gaba-omr", 2);
    req.onupgradeneeded = function () {
      ["pending", "results", "provas"].forEach(function (s) { req.result.createObjectStore(s, { keyPath: "id" }); });
    };
    req.onerror = function () { reject(new Error("fixture IndexedDB legado")); };
    req.onsuccess = function () {
      var db = req.result;
      var tx = db.transaction(["pending", "results", "provas"], "readwrite");
      ["pending", "results", "provas"].forEach(function (s) {
        tx.objectStore(s).put({ id: "id-ficticio-igual", marcador: "LEGADO", titulo: "PROVA FICTICIA LEGADA" });
      });
      tx.oncomplete = function () { db.close(); resolve(true); };
      tx.onerror = tx.onabort = function () { db.close(); reject(new Error("gravar fixture legado")); };
    };
  });
  t.legadoPronto.catch(function () { t.erros.push("fixture legado"); });

  function sessao() { return t.user ? { user: t.copy(t.user) } : null; }
  var client = {
    auth: {
      getSession: function () {
        var captured = sessao();
        var gate = t.gateSessao;
        if (gate) {
          t.gateSessao = null;
          gate.capturas.push(true);
          return gate.promise.then(function () { return { data: { session: captured }, error: null }; });
        }
        return Promise.resolve({ data: { session: captured }, error: null });
      },
      signInWithPassword: function (p) {
        var u = [t.A, t.B].filter(function (x) { return x.email === p.email; })[0];
        if (!u || p.password !== "senha-ficticia") throw new Error("credencial ficticia invalida");
        t.emitir(u);
        return Promise.resolve({ data: { user: t.copy(u), session: sessao() }, error: null });
      },
      signOut: function () { t.emitir(null); return Promise.resolve({ error: null }); },
      onAuthStateChange: function (fn) {
        t.assinantes.push(fn);
        return { data: { subscription: { unsubscribe: function () { t.assinantes = t.assinantes.filter(function (x) { return x !== fn; }); } } } };
      }
    },
    from: function (table) {
      if (table === "alunos" || table === "prova_versoes") {
        var operation, rows;
        function escrever() {
          t.escritas.push({ tabela: table, operacao: operation, quantidade: rows ? rows.length : 0, sessao: t.user && t.user.id });
          var gate = t.gateEscrita;
          if (gate) {
            t.gateEscrita = null;
            gate.capturas.push(true);
            return gate.promise.then(function () { return { data: rows || [], error: gate.error || null }; });
          }
          return Promise.resolve({ data: rows || [], error: null });
        }
        return {
          delete: function () { operation = "delete"; return { eq: escrever }; },
          insert: function (r) { operation = "insert"; rows = t.copy(r); return escrever(); },
          upsert: function (r) { operation = "upsert"; rows = t.copy(r); return { select: escrever }; }
        };
      }
      var payload;
      var q = {
        upsert: function (p) { payload = t.copy(p); return q; },
        insert: function (p) { payload = t.copy(p); return q; },
        select: function () { return q; },
        single: function () {
          if (table === "professores") return Promise.resolve({ data: Object.assign({ id: t.user.id }, payload), error: null });
          if (table !== "correcoes") throw new Error("mock recebeu tabela inesperada");
          t.enviados.push({ payload: payload, sessao: t.user && t.user.id, url: t.url });
          var gate = t.gateInsert;
          if (gate) {
            t.gateInsert = null;
            gate.capturas.push(true);
            return gate.promise.then(function () { return { data: payload, error: null }; });
          }
          return Promise.resolve({ data: payload, error: null });
        }
      };
      return q;
    }
  };
  window.supabase = { createClient: function () { return client; } };
  function ler(method) {
    var id = t.user && t.user.id;
    var key = JSON.stringify([t.url, id]);
    var rows = t.copy((t.dados[key] || {})[method] || []);
    var gate = t.gateLeitura;
    if (gate && gate.userId === id && gate.metodos.indexOf(method) !== -1) {
      gate.capturas.push(method);
      return gate.promise.then(function () { return rows; });
    }
    return Promise.resolve(rows);
  }
  /* Interceptar somente a atribuição dos exports: auth/insertCorrecao permanecem reais. */
  var exportsDB;
  Object.defineProperty(window, "GabaDB", {
    configurable: true,
    get: function () { return exportsDB; },
    set: function (api) {
      exportsDB = api;
      ["listTurmas", "listAlunos", "listProvas", "fetchCorrecoes", "listEscolas", "listProvaVersoes", "listSaidas"].forEach(function (m) {
        api[m] = function () { return ler(m); };
      });
      t.upsertProvaVersoesReal = api.upsertProvaVersoes;
      api.upsertProvaVersoes = function () { return Promise.resolve(1); };
    }
  });
}

/* Não imprime objetos, nomes recebidos da UI, credenciais, URLs remotas ou stacks. */
async function executarCasos() {
  "use strict";
  var t = window.__isolamento;
  function check(nome, ok, detalhe) {
    /* detalhe so aceita booleanos, numeros e os ids ficticios: nada de nome, url ou stack */
    if (!ok) {
      t.falhou = nome + (detalhe === undefined ? "" : " [" + JSON.stringify(detalhe) + "]");
      throw new Error("Falha: " + nome);
    }
    t.casos.push(nome);
  }
  function el(id) { var x = document.getElementById(id); if (!x) throw new Error("controle de teste ausente"); return x; }
  async function esperar(fn) {
    var end = Date.now() + 15000;
    while (!fn()) {
      if (Date.now() > end) throw new Error("timeout de sincronizacao do teste");
      await new Promise(function (r) { setTimeout(r, 20); });
    }
  }
  function row(m, id) {
    return { id: id || "id-ficticio-igual", prova_id: t.P, aluno_id: t.AL, turma_id: t.T,
      aluno_nome: "Aluno Ficticio " + m, marcador: m, qr_texto: "QR-FICTICIO-" + m + "-" + (id || "igual"),
      respostas: ["A"], acertos: 1, total_questoes: 1, nota: 10, created_at: "2026-10-01T00:00:00.000Z" };
  }
  function prova(m) {
    return { id: t.P, titulo: "PROVA FICTICIA " + m, marcador: m, turma_id: t.T, disciplina: "Matematica",
      quantidade_questoes: 1, total_questoes: 1, alternativas: 2,
      questoes: [{ enunciado: "Questao ficticia " + m, gabarito: "A", peso: 1, alternativas: [{ letra: "A", texto: "Um" }, { letra: "B", texto: "Dois" }] }] };
  }
  function dados(u, m) {
    t.dados[JSON.stringify([t.url, u.id])] = {
      listTurmas: [{ id: t.T, nome: "TURMA FICTICIA " + m, ano: "9", escola: t.escola, marcador: m }],
      listAlunos: [{ id: t.AL, turma_id: t.T, nome: "Aluno Ficticio " + m, numero: 1, marcador: m }],
      listProvas: [prova(m)], fetchCorrecoes: [row(m)], listEscolas: [], listProvaVersoes: [],
      listSaidas: [{ id: t.S, turma_id: t.T, chave: "n:9", numero: 9, nome: "Aluno Ficticio " + m,
        situacao: "Transferido", fonte: "CHAMADA FICTICIA " + m, marcador: m }]
    };
  }
  async function login(u) {
    t.online = false; // a fila automática real roda, mas não drena as fixtures das corridas
    el("login-email").value = u.email;
    el("login-senha").value = "senha-ficticia";
    el("form-login").requestSubmit();
    await esperar(function () { return GabaApp.estado.professor && GabaApp.estado.professor.id === u.id && el("login-email").value === ""; });
    await GabaApp.carregarTudo();
    await esperar(function () { return GabaApp.estado.professor && GabaApp.estado.professor.id === u.id && GabaApp.estado.momento > 0; });
  }
  async function logout() {
    t.online = false;
    el("btn-sair").click();
    await esperar(function () { return t.user === null && !GabaApp.estado.professor && GabaSync.contaAtual().indexOf("sem-conta") >= 0; });
    await GabaApp.carregarTudo();
  }
  async function snapshot() {
    return { banco: GabaSync.nomeBanco(), conta: GabaSync.contaAtual(), chave: GabaSync.chaveLocal("gaba_caderno_cfg"),
      fila: await GabaSync.listPending(), resultados: await GabaSync.listResults(), provas: await GabaSync.listarProvas() };
  }
  function somente(rows, m) { return rows.length > 0 && rows.every(function (r) { return r.marcador === m; }); }
  async function gravar(m) {
    await GabaSync.enqueue(row(m));
    await GabaSync.saveLocalResult(Object.assign(row(m, "resultado-ficticio-igual"), { nota: m === "A" ? 7 : 8 }));
    await GabaSync.guardarProva(prova(m));
    return snapshot();
  }
  function locais(m) {
    var cfg = { escola: "ESCOLA FICTICIA " + m, professor: "Docente Ficticio " + m, instrucoes: "INSTRUCOES FICTICIAS " + m };
    var lote = { prova_id: t.P, titulo: "LOTE FICTICIO " + m, marcador: m, questoes: prova(m).questoes,
      itens: [{ aluno: { id: t.AL, nome: "Aluno Ficticio " + m, numero: 1 }, versao: { codigo: "FICTICIO-" + m } }] };
    localStorage.setItem(GabaSync.chaveLocal("gaba_caderno_cfg"), JSON.stringify(cfg));
    localStorage.setItem(GabaSync.chaveLocal("gaba_lote_impresso"), JSON.stringify(lote));
    localStorage.setItem(GabaSync.chaveLocal("gaba_ultimo_lote"), JSON.stringify({ marcador: m }));
    GabaEscolas.adicionar(t.escola);
    GabaEscolas.setFiltro(t.escola);
  }
  function cfgNaoExposta(m) {
    return ["cad-escola", "cad-professor", "cad-instrucoes"].every(function (id) { return el(id).value.indexOf("FICTICIA " + m) < 0 && el(id).value.indexOf("Ficticio " + m) < 0 && el(id).value.indexOf("FICTICIAS " + m) < 0; });
  }
  function cachesLimpos() {
    var c = GabaCaderno.estado, s = GabaScanner.estado;
    return !c.batch && !c.ultimoHtml && c.cortes.length === 0 && !c.sujo &&
      s.resultados.length === 0 && Object.keys(s.lidos).length === 0 && Object.keys(s.versoes).length === 0 &&
      Object.keys(s.porAluno).length === 0 && !s.recipe && !s.prova && s.alunos.length === 0 && !s.turmaId &&
      !s.stream && !s.worker && !s.rodando && !s.pendente && !s.ultimaChave && !s.fonte &&
      el("print-root").innerHTML === "" && el("scan-ultimas").innerHTML === "" &&
      !GabaCaderno.seletorDeDescritor.aberto() && el("cad-imprimir").disabled;
  }
  async function primeUI(m) {
    await GabaCaderno.carregarListas();
    el("cad-prova").value = t.P;
    el("cad-turma").value = t.T;
    /* Aguardar o carregamento real de alunos sem deixar handler change em voo. */
    await GabaCaderno.carregarListas();
    el("cad-modo").value = "fixa";
    el("cad-professor").value = "Docente Ficticio " + m;
    el("cad-instrucoes").value = "INSTRUCOES FICTICIAS " + m;
    el("cad-instrucoes").dispatchEvent(new Event("change", { bubbles: true }));
    await GabaCaderno.gerarLote();
    GabaCaderno.desenharQuestoes(prova(m));
    var input = document.querySelector("#cad-questoes .q-desc");
    if (!input) throw new Error("picker ficticio indisponivel");
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    var s = GabaScanner.estado;
    s.prova = prova(m); s.provas = [prova(m)]; s.alunos = [{ id: t.AL, nome: "Aluno Ficticio " + m, numero: 1 }];
    s.turmaId = t.T;
    await GabaScanner.montarIndice();
    s.resultados = [row(m)]; s.lidos = { "QR-FICTICIO": { nome: "Aluno Ficticio " + m } };
    s.ultimaChave = "CHAVE-FICTICIA-" + m;
    el("scan-ultimas").textContent = "RESULTADO FICTICIO " + m;
    GabaCaderno.estado.sujo = true;
    check("pre-condicao: preview, lote, picker e caches realmente preenchidos " + m,
      !!GabaCaderno.estado.batch && !!GabaCaderno.estado.ultimoHtml && !!el("print-root").innerHTML &&
      GabaCaderno.seletorDeDescritor.aberto() && Object.keys(s.versoes).length > 0 && s.resultados.length === 1);
  }
  function semMarcadorA() {
    var a = GabaApp.estado, c = GabaCaderno.estado, s = GabaScanner.estado;
    var rows = [].concat(a.turmas, a.alunos, a.provas, a.locais, a.correcoes, a.leituras, a.escolas, a.saidas,
      c.provasLocais, c.provasSupabase, c.turmas, c.alunos, s.provas, s.alunos, s.resultados);
    return rows.every(function (r) { return !r || r.marcador !== "A"; }) &&
      document.body.textContent.indexOf("TURMA FICTICIA A") < 0 && document.body.textContent.indexOf("PROVA FICTICIA A") < 0 &&
      el("print-root").textContent.indexOf("Aluno Ficticio A") < 0;
  }
  async function flush() { t.online = true; try { return await GabaSync.flush(); } finally { t.online = false; } }

  await t.legadoPronto;
  await GabaApp.carregarTudo();
  check("API de contexto e reinicio dos dois modulos disponivel",
    ["definirConta", "contaAtual", "chaveLocal", "nomeBanco"].every(function (k) { return typeof GabaSync[k] === "function"; }) &&
    typeof GabaCaderno.reiniciarConta === "function" && typeof GabaScanner.reiniciarConta === "function");
  [ [GabaCaderno, "caderno"], [GabaScanner, "scanner"] ].forEach(function (pair) {
    var original = pair[0].reiniciarConta;
    pair[0].reiniciarConta = function () { t.resets[pair[1]]++; return original.apply(this, arguments); };
  });
  var guestVazio = await snapshot();
  check("sem-conta usa banco novo e nao le IndexedDB legado", guestVazio.banco !== "gaba-omr" && guestVazio.fila.length === 0 && guestVazio.resultados.length === 0 && guestVazio.provas.length === 0);
  check("chaves globais legadas invisiveis no caderno e escolas", !GabaCaderno.loteImpresso() && GabaEscolas.listar().length === 0 && GabaEscolas.filtro() === "" && el("cad-professor").value.indexOf("Legado") < 0);
  var guest = await gravar("GUEST");
  var enviadosAntes = t.enviados.length;
  var gFlush = await flush();
  check("fila guest nunca envia mesmo online", gFlush.reason === "unauthenticated" && t.enviados.length === enviadosAntes && (await GabaSync.countPending()) === 1);

  dados(t.A, "A"); dados(t.B, "B");
  await login(t.A);
  var aVazio = await snapshot();
  check("login A nao herda fila, resultados ou provas guest", aVazio.fila.length === 0 && aVazio.resultados.length === 0 && aVazio.provas.length === 0 && t.enviados.length === enviadosAntes);
  var cardA = el("lista-turmas").textContent;
  check("pre-condicao A: a turma traz o aluno que saiu da sala",
    (GabaApp.estado.saidas || []).some(function (s) { return s.marcador === "A"; }),
    { ditas: (GabaApp.estado.saidas || []).length });
  check("pre-condicao A: o card da turma mostra quem ficou de fora",
    cardA.indexOf("ficou de fora") >= 0 && cardA.indexOf("Transferido") >= 0,
    { noCard: cardA.indexOf("ficou de fora") >= 0, situacao: cardA.indexOf("Transferido") >= 0 });
  var a = await gravar("A"); locais("A");
  await primeUI("A");
  /* Gerar preview pode atualizar o lote e a configuração: guardar o conteúdo exato próprio. */
  var persistidoA = {};
  ["gaba_caderno_cfg", "gaba_lote_impresso", "gaba_ultimo_lote", "gaba_escolas_registro", "gaba_escola_filtro"].forEach(function (k) { persistidoA[k] = localStorage.getItem(GabaSync.chaveLocal(k)); });
  await logout();
  var guestRetorno = await snapshot();
  check("logout restaura somente o banco guest, sem expor A", guestRetorno.banco === guest.banco && somente(guestRetorno.fila, "GUEST") && somente(guestRetorno.resultados, "GUEST") && somente(guestRetorno.provas, "GUEST") && semMarcadorA());
  check("logout limpa preview, resultados, caches, picker e config", cachesLimpos() && cfgNaoExposta("A") && !GabaCaderno.loteImpresso() && GabaEscolas.filtro() === "" && GabaEscolas.listar().length === 0 && !localStorage.getItem(GabaSync.chaveLocal("gaba_ultimo_lote")));

  await login(t.B);
  var bVazio = await snapshot();
  check("B nao le A nem guest com mesmos IDs", bVazio.fila.length === 0 && bVazio.resultados.length === 0 && bVazio.provas.length === 0 && semMarcadorA());
  check("B recebe config, picker, escolas e ultimo lote limpos", cachesLimpos() && cfgNaoExposta("A") && !GabaCaderno.loteImpresso() && GabaEscolas.listar().length === 0 && GabaEscolas.filtro() === "" && !localStorage.getItem(GabaSync.chaveLocal("gaba_ultimo_lote")));
  check("mesmo nome de escola em B nao e bloqueado pelo cadastro A", GabaEscolas.adicionar(t.escola).novo === true);
  var b = await gravar("B"); locais("B");
  check("bancos, escopos e chaves A/B/guest sem colisao", new Set([a.banco, b.banco, guest.banco]).size === 3 && new Set([a.conta, b.conta, guest.conta]).size === 3 && new Set([a.chave, b.chave, guest.chave]).size === 3);
  check("B grava e le provas, resultados e fila com IDs iguais", somente(b.fila, "B") && somente(b.resultados, "B") && somente(b.provas, "B") && b.fila[0].id === a.fila[0].id && b.provas[0].id === a.provas[0].id);
  await primeUI("B");
  await logout();
  check("troca B para guest tambem reinicia ambos os modulos", cachesLimpos() && cfgNaoExposta("B"));
  await login(t.A);
  var aRetorno = await snapshot();
  check("retorno A conserva fila, resultados e provas sem B", aRetorno.banco === a.banco && somente(aRetorno.fila, "A") && somente(aRetorno.resultados, "A") && somente(aRetorno.provas, "A"));
  check("retorno A conserva todas as chaves locais proprias", Object.keys(persistidoA).every(function (k) { return localStorage.getItem(GabaSync.chaveLocal(k)) === persistidoA[k]; }));
  check("retorno A restaura config e lote A, nao B", el("cad-professor").value === "Docente Ficticio A" && GabaCaderno.loteImpresso(t.P).titulo.indexOf("B") < 0 && GabaEscolas.tem(t.escola));

  /* App, caderno e scanner capturam A antes da troca; liberar depois de B carregar. */
  var gateLoad = t.defer(); gateLoad.userId = t.A.id;
  gateLoad.metodos = ["listTurmas", "listAlunos", "listProvas", "fetchCorrecoes", "listProvaVersoes", "listSaidas"];
  t.gateLeitura = gateLoad;
  var loadA = GabaApp.carregarTudo();
  var loadCadernoA = GabaCaderno.carregarListas();
  var loteOriginal = GabaCaderno.loteImpresso;
  var loadScannerA;
  try {
    GabaCaderno.loteImpresso = function () { return null; };
    GabaScanner.estado.prova = Object.assign(prova("A"), { questoes: [] });
    loadScannerA = GabaScanner.montarIndice();
  } finally { GabaCaderno.loteImpresso = loteOriginal; }
  await esperar(function () { return gateLoad.metodos.every(function (m) { return gateLoad.capturas.indexOf(m) >= 0; }); });
  await logout(); await login(t.B);
  t.gateLeitura = null; gateLoad.resolve();
  await Promise.all([loadA, loadCadernoA, loadScannerA]);
  var tardia = { professor: GabaApp.estado.professor.id, marcadorA: semMarcadorA(),
    provas: (GabaApp.estado.provas || []).map(function (p) { return p.marcador; }).join(","),
    saidas: (GabaApp.estado.saidas || []).map(function (s) { return s.marcador; }).join(",") };
  check("respostas tardias de carregarTudo/carregarListas A nao repovoam B",
    GabaApp.estado.professor.id === t.B.id && semMarcadorA() && somente(GabaApp.estado.provas, "B"), tardia);
  check("indice async tardio do scanner A nao restaura receita nem versoes em B", cachesLimpos());

  /* Somente B sobe; insertCorrecao REAL deve fixar o dono no payload. */
  var startB = t.enviados.length;
  var resultB = await flush();
  var envB = t.enviados.slice(startB);
  check("flush envia exclusivamente fila B com dono explicito no payload real", resultB.synced === 1 && envB.length === 1 && envB.every(function (e) { return e.payload.dono === t.B.id && e.sessao === t.B.id && e.payload.aluno_nome === "Aluno Ficticio B"; }) && (await GabaSync.countPending()) === 0);
  await logout(); await login(t.A);
  check("flush B nao remove fila A de ID igual", (await GabaSync.listPending()).length === 1 && somente(await GabaSync.listPending(), "A"));

  /* Troca enquanto usuario()/getSession aguarda: nem o primeiro insert pode ocorrer. */
  var gateAuth = t.defer(); t.gateSessao = gateAuth;
  var startAuth = t.enviados.length;
  t.online = true;
  var flushAuth = GabaSync.flush();
  await esperar(function () { return gateAuth.capturas.length === 1; });
  await logout(); await login(t.B);
  await GabaSync.enqueue(row("B", "corrida-auth"));
  gateAuth.resolve();
  var authResult = await flushAuth;
  check("troca durante identidade async nao envia nem remove fila B", authResult.reason === "account-changed" && t.enviados.length === startAuth && somente(await GabaSync.listPending(), "B"));
  await logout(); await login(t.A);
  check("troca durante identidade async preserva fila original A", somente(await GabaSync.listPending(), "A"));

  /* Primeiro insert A em voo; segundo A e linha B de mesmo ID não podem ser tocados. */
  await GabaSync.enqueue(row("A", "zz-segundo-ficticio"));
  var gateInsert = t.defer(); t.gateInsert = gateInsert;
  var startRace = t.enviados.length;
  t.online = true;
  var flushRace = GabaSync.flush();
  await esperar(function () { return gateInsert.capturas.length === 1; });
  await logout(); await login(t.B);
  await GabaSync.enqueue(row("B")); // mesmo ID do primeiro item A
  var filaBAntes = JSON.stringify(await GabaSync.listPending());
  gateInsert.resolve();
  var raceResult = await flushRace;
  var envRace = t.enviados.slice(startRace);
  check("insert A em voo fixa dono A e interrompe envio seguinte apos troca", raceResult.reason === "account-changed" && envRace.length === 1 && envRace[0].payload.dono === t.A.id && envRace[0].sessao === t.A.id);
  check("resposta insert A tardia nao remove nem altera fila B", JSON.stringify(await GabaSync.listPending()) === filaBAntes);
  await logout(); await login(t.A);
  check("resposta insert A tardia conserva ambos os itens A para retry", (await GabaSync.countPending()) === 2 && somente(await GabaSync.listPending(), "A"));
  var startA = t.enviados.length;
  var resultA = await flush();
  check("retry A envia ambos com dono A e preserva resultados/provas", resultA.synced === 2 && t.enviados.slice(startA).length === 2 && t.enviados.slice(startA).every(function (e) { return e.payload.dono === t.A.id; }) && (await GabaSync.countPending()) === 0 && somente(await GabaSync.listResults(), "A") && somente(await GabaSync.listarProvas(), "A"));

  await GabaCaderno.carregarListas();
  await GabaApp.revisarProva(t.P);
  var gateRevisao = t.defer();
  var salvarOriginal = GabaDB.salvarProva;
  var listasOriginal = GabaCaderno.carregarListas;
  var tituloPrivado = "TITULO-FICTICIO-PRIVADO-A";
  GabaApp.estado.locais = [Object.assign(prova("A"), { titulo: tituloPrivado })];
  GabaDB.salvarProva = function () { return Promise.resolve(Object.assign(prova("A"), { id: "44444444-0000-4000-8000-000000000001", titulo: tituloPrivado })); };
  GabaCaderno.carregarListas = function () { gateRevisao.capturas.push(true); return gateRevisao.promise; };
  var promocao = GabaApp.salvarProvaLocal(t.P).then(function () { return false; }, function (err) { return /A conta mudou/.test(err.message); });
  await esperar(function () { return gateRevisao.capturas.length === 1; });
  await logout(); await login(t.B);
  gateRevisao.resolve();
  check("aviso de promocao tardia nao mostra titulo privado A em B", await promocao && document.body.textContent.indexOf(tituloPrivado) < 0);
  GabaDB.salvarProva = salvarOriginal;
  GabaCaderno.carregarListas = listasOriginal;
  await logout(); await login(t.A);
  await GabaSync.guardarProva(prova("A"));

  var gateVersoes = t.defer(); t.gateEscrita = gateVersoes;
  var inicioVersoes = t.escritas.length;
  var envioVersoes = t.upsertProvaVersoesReal(t.P, [{ aluno: { nome: "Aluno Ficticio A" }, versao: {} }], {}).then(function () { return false; }, function (err) { return err.code === "GABA_SYNC_CONTEXT_CHANGED"; });
  await esperar(function () { return gateVersoes.capturas.length === 1; });
  await logout(); await login(t.B); await logout(); await login(t.A);
  gateVersoes.resolve();
  check("lote interrompe apos delete mesmo na corrida A-B-A", await envioVersoes && t.escritas.length === inicioVersoes + 1 && t.escritas[inicioVersoes].operacao === "delete");

  var alunosLote = Array.from({ length: 401 }, function (_, i) { return { nome: "Aluno Ficticio de Lote " + i, numero: i + 1 }; });
  var gateAlunos = t.defer(); t.gateEscrita = gateAlunos;
  var inicioAlunos = t.escritas.length;
  var envioAlunos = GabaDB.salvarAlunosEmLote(t.T, alunosLote).then(function () { return false; }, function (err) { return err.code === "GABA_SYNC_CONTEXT_CHANGED"; });
  await esperar(function () { return gateAlunos.capturas.length === 1; });
  await logout(); await login(t.B); gateAlunos.resolve();
  check("importacao interrompe blocos restantes ao trocar conta", await envioAlunos && t.escritas.length === inicioAlunos + 1 && t.escritas[inicioAlunos].quantidade === 200 && t.escritas[inicioAlunos].sessao === t.A.id);
  await logout(); await login(t.A);
  var gateTipo = t.defer(); gateTipo.error = { message: "column tipo does not exist", code: "42703" }; t.gateEscrita = gateTipo;
  var inicioTipo = t.escritas.length;
  var envioTipo = GabaDB.salvarAlunosEmLote(t.T, alunosLote.slice(0, 1)).then(function () { return false; }, function (err) { return err.code === "GABA_SYNC_CONTEXT_CHANGED"; });
  await esperar(function () { return gateTipo.capturas.length === 1; });
  await logout(); await login(t.B); gateTipo.resolve();
  check("retry por coluna ausente nao envia dados A em B", await envioTipo && t.escritas.length === inicioTipo + 1);
  await logout(); await login(t.A);

  /* Mesma auth id, outra URL: banco e localStorage precisam mudar juntos. */
  await GabaSync.enqueue(row("A", "url-ficticia-igual"));
  var urlUm = await snapshot();
  var originalUrl = t.url;
  t.url = "https://isolamento-dois.invalid";
  GabaDB.saveConfig(t.url, "CHAVE-FICTICIA-SEM-ACESSO");
  await GabaApp.carregarTudo();
  var urlDois = await snapshot();
  check("troca de URL separa banco, escopo, chaves, fila, provas e resultados", urlDois.banco !== urlUm.banco && urlDois.conta !== urlUm.conta && urlDois.chave !== urlUm.chave && urlDois.fila.length === 0 && urlDois.resultados.length === 0 && urlDois.provas.length === 0);
  check("troca URL limpa UI, cfg, ultimo lote e cadastro de escolas", cachesLimpos() && cfgNaoExposta("A") && !GabaCaderno.loteImpresso() && GabaEscolas.listar().length === 0 && GabaEscolas.filtro() === "" && !localStorage.getItem(GabaSync.chaveLocal("gaba_ultimo_lote")));
  var outro = await gravar("OUTRA-URL"); locais("OUTRA-URL");
  check("mesma escola tambem pode nascer na segunda URL", GabaEscolas.tem(t.escola));
  t.url = originalUrl; GabaDB.saveConfig(t.url, "CHAVE-FICTICIA-SEM-ACESSO");
  await GabaApp.carregarTudo();
  var urlRetorno = await snapshot();
  check("retorno URL original conserva dados e nao le segunda URL", urlRetorno.banco === urlUm.banco && somente(urlRetorno.fila, "A") && somente(urlRetorno.resultados, "A") && somente(urlRetorno.provas, "A") && outro.banco !== urlRetorno.banco);
  await logout(); await login(t.B);
  check("flush A e troca URL nao alteraram fila B", JSON.stringify(await GabaSync.listPending()) === filaBAntes);
  await logout();
  var ultimoGuest = await snapshot();
  check("fila guest nunca subiu em nenhum login nem flush", somente(ultimoGuest.fila, "GUEST") && t.enviados.every(function (e) { return e.payload.aluno_nome !== "Aluno Ficticio GUEST"; }));
  check("todos os reinicios passaram pelas transicoes reais de auth", t.resets.caderno >= 10 && t.resets.caderno === t.resets.scanner);
  check("localStorage legado permanece byte a byte intacto", Object.keys(t.legado).every(function (k) { return localStorage.getItem(k) === t.legado[k]; }));
  var intacto = await new Promise(function (resolve, reject) {
    var req = indexedDB.open("gaba-omr", 2);
    req.onerror = function () { reject(new Error("reabrir fixture legado")); };
    req.onsuccess = async function () {
      var db = req.result;
      try {
        var counts = await Promise.all(["pending", "results", "provas"].map(function (s) {
          return new Promise(function (res, rej) {
            var r = db.transaction(s, "readonly").objectStore(s).getAll();
            r.onsuccess = function () {
              res(JSON.stringify(r.result) === JSON.stringify([{ id: "id-ficticio-igual", marcador: "LEGADO", titulo: "PROVA FICTICIA LEGADA" }]));
            };
            r.onerror = function () { rej(new Error("ler fixture legado")); };
          });
        }));
        resolve(counts.every(Boolean));
      } catch (e) { reject(e); } finally { db.close(); }
    };
  });
  check("IndexedDB legado preservado nas tres stores e nunca enviado", intacto);
  check("nenhum erro inesperado na pagina", t.erros.length === 0);
  return { casos: t.casos, erros: t.erros.length, loginSimulado: true };
}

/* O observador intercepta todo HTTP antes da inicialização para impedir tráfego externo. */
async function vigiar(alvo) {
  var sock = new WebSocket(alvo.webSocketDebuggerUrl);
  var seq = 0, pending = new Map(), erros = [];
  await new Promise(function (resolve, reject) { sock.onopen = resolve; sock.onerror = function () { reject(new Error("CDP observador indisponivel")); }; });
  function call(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      var timer = setTimeout(function () { pending.delete(id); reject(new Error("timeout CDP observador")); }, 15000);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      sock.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }
  sock.onmessage = function (ev) {
    var m = JSON.parse(ev.data), p = pending.get(m.id);
    if (p) {
      clearTimeout(p.timer); pending.delete(m.id);
      if (m.error) p.reject(new Error("comando CDP observador falhou")); else p.resolve(m.result);
      return;
    }
    if (m.method === "Runtime.exceptionThrown") erros.push("Runtime.exceptionThrown");
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") erros.push("Log.error");
    if (m.method === "Network.responseReceived" && m.params.response.status >= 400) erros.push("HTTP local inesperado: " + new URL(m.params.response.url).pathname);
    if (m.method !== "Fetch.requestPaused") return;
    var r = m.params, u = new URL(r.request.url);
    var local = u.origin === base;
    if (local && u.pathname === "/favicon.ico") {
      call("Fetch.fulfillRequest", { requestId: r.requestId, responseCode: 204 }).catch(function () { erros.push("interceptacao CDP falhou"); });
      return;
    }
    var cdnMock = u.origin === "https://cdn.jsdelivr.net" &&
      (u.pathname === "/npm/@supabase/supabase-js@2" || u.pathname === "/npm/qrcode/build/qrcode.min.js") && r.resourceType === "Script";
    if (!local && !cdnMock) erros.push("tentativa de trafego externo bloqueada");
    var action = local ? call("Fetch.continueRequest", { requestId: r.requestId }) :
      call("Fetch.fulfillRequest", { requestId: r.requestId, responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "application/javascript" }], body: "" });
    action.catch(function () { erros.push("interceptacao CDP falhou"); });
  };
  await call("Runtime.enable"); await call("Log.enable"); await call("Network.enable");
  await call("Network.setBypassServiceWorker", { bypass: true });
  await call("Fetch.enable", { patterns: [{ urlPattern: "http://*", requestStage: "Request" }, { urlPattern: "https://*", requestStage: "Request" }] });
  return {
    erros: erros,
    fechar: function () {
      pending.forEach(function (p) { clearTimeout(p.timer); p.reject(new Error("observador fechado")); });
      pending.clear(); sock.close();
    }
  };
}

(async function principal() {
  var chrome, c, observer, etapa = "preflight";
  var deadline = setTimeout(function () {
    console.error("FALHA: limite global do teste (sem imprimir dados da pagina).");
    if (chrome) hud.fecharChrome(chrome).finally(function () { process.exit(1); });
    else process.exit(1);
  }, 180000);
  try {
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error("porta invalida");
    if (typeof fetch !== "function" || typeof WebSocket !== "function") throw new Error("Node sem fetch/WebSocket");
    var cred = await fetch(base + "/js/credencial.js", { signal: AbortSignal.timeout(5000) });
    if (!cred.ok || !/window\.GabaCredencial\s*=\s*\{\s*url:\s*"",\s*key:\s*""\s*\}/.test(await cred.text())) {
      throw new Error("servidor nao neutralizou credencial");
    }
    etapa = "Chrome descartavel";
    chrome = await hud.abrirChrome("about:blank");
    var alvo = await hud.conectar("about:blank", chrome.porta);
    c = hud.cliente(alvo);
    observer = await vigiar(alvo);
    await c.chama("Page.enable");
    await c.chama("Page.addScriptToEvaluateOnNewDocument", { source: "(" + prepararPagina.toString() + ")();" });
    await c.chama("Page.navigate", { url: base + "/index.html?isolamento-local=ficticio" });
    etapa = "inicializacao";
    await c.espera("document.readyState === 'complete' && window.GabaApp && window.GabaSync && window.GabaCaderno && window.GabaScanner", 30000);
    etapa = "casos de isolamento";
    var resultado = await c.naPagina(executarCasos);
    resultado.casos.forEach(function (nome) { console.log("ok   " + nome); });
    var errosPagina = await c.naPagina(function () { return window.__isolamento.erros.length; });
    if (observer.erros.length || errosPagina || resultado.erros) {
      console.error(JSON.stringify({ observador: observer.erros, errosPagina: errosPagina }));
      throw new Error("erros inesperados observados");
    }
    console.log("OK: " + resultado.casos.length + " casos; login simulado; nenhum banco externo.");
  } catch (err) {
    process.exitCode = 1;
    var caso = "";
    if (c) {
      try {
        caso = await c.naPagina(function () { return window.__isolamento && window.__isolamento.falhou || ""; });
      } catch (ignored) { /* pagina indisponivel */ }
    }
    console.error("FALHA em " + etapa + (caso ? ": " + caso : " (erro/timeout inesperado; dados da pagina omitidos)") + ".");
  } finally {
    clearTimeout(deadline);
    if (observer) observer.fechar();
    if (chrome && process.platform === "win32" && chrome.processo.exitCode === null) {
      try {
        require("child_process").execFileSync("taskkill", ["/PID", String(chrome.processo.pid), "/T", "/F"], { stdio: "ignore" });
      } catch (ignored) {}
    } else if (c) {
      try { await c.chama("Browser.close"); } catch (ignored) {}
    }
    if (c) c.fecha();
    if (chrome) {
      try {
        await hud.fecharChrome(chrome);
        /* O helper tolera arquivo ainda aberto; o teste não tolera perfil restante. */
        require("fs").rmSync(chrome.perfil, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
      } catch (err) {
        process.exitCode = 1;
        console.error("FALHA: nao foi possivel remover o perfil descartavel proprio (" + (err.code || "erro") + ").");
      }
    }
  }
  /* hudChrome mantém timers CDP de 180s; sair somente após o finally completo. */
  process.exit(process.exitCode || 0);
})();
