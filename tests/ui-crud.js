/* A UI de verdade: o que o professor digita -> o que aparece na tela -> o que o banco recebe.
   Roda contra um PostgREST falso montado dentro da pagina (em memoria) e com credenciais
   falsas: nenhum pedido sai desta maquina e nada toca o Supabase do professor.
   Precisa do servidor local: node tests/serve.js  ->  node tests/ui-crud.js [porta] */
"use strict";

var hud = require("./hudChrome");

var porta = Number(process.argv[2] || 8788);
var BASE = "http://127.0.0.1:" + porta;

/* ---------- codigo que roda dentro da pagina ---------- */

function vigiarErros() {
  window.__erros = [];
  window.addEventListener("error", function (e) {
    window.__erros.push(String((e && e.message) || e));
  });
  window.addEventListener("unhandledrejection", function (ev) {
    var m = (ev && ev.reason && ev.reason.message) || ev && ev.reason || "sem motivo";
    window.__erros.push("rejeicao: " + String(m));
  });
  var badge = document.getElementById("status-conexao");
  return {
    badge: badge ? badge.textContent : "",
    classe: badge ? badge.className : "",
    turmasVazias: document.getElementById("lista-turmas").textContent.trim().slice(0, 60),
    modulosFaltando: ["GabaDB", "GabaSync", "GabaCaderno", "GabaScanner", "GabaApp", "GabaDocx", "GabaFolha",
      "GabaPlanilha", "GabaLista", "GabaAnalise", "GabaVersoes", "GabaEscolas"].filter(function (n) { return !window[n]; })
  };
}

function instalarFake(cfg) {
  var CHAVES = ["gaba_supabase_url", "gaba_supabase_key", "gaba_supabase_anon_key",
    "gaba_escolas_registro", "gaba_professor_id", "gaba_professor_nome", "gaba_professor_email"];
  var antes = {};
  CHAVES.forEach(function (k) { antes[k] = localStorage.getItem(k); });
  var estado = {
    antes: antes, fetchOriginal: window.fetch, reqs: [], seq: 0,
    mb: { turmas: [], alunos: [], provas: [], correcoes: [], escolas: [], professores: [] },
    auth: { usuarios: [], pedeConfirmacao: false, seq: 0, tokens: [] }
  };
  window.__gaba = estado;
  var mb = estado.mb;

  function novoId() {
    estado.seq += 1;
    return "aaaaaaaa-bbbb-4ccc-8ddd-" + ("000000000000" + estado.seq).slice(-12);
  }
  function cabecalhos(init) {
    var out = {};
    var h = (init && init.headers) || {};
    if (typeof Headers !== "undefined" && h instanceof Headers) {
      h.forEach(function (v, k) { out[k.toLowerCase()] = v; });
      return out;
    }
    if (Array.isArray(h)) {
      h.forEach(function (p) { out[String(p[0]).toLowerCase()] = String(p[1]); });
      return out;
    }
    Object.keys(h).forEach(function (k) { out[String(k).toLowerCase()] = String(h[k]); });
    return out;
  }
  function res(status, payload) {
    if (payload === null) return new Response(null, { status: status, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(payload), { status: status, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  function bate(row, filtros) {
    return filtros.every(function (f) {
      var pedaco = String(f[1]).split(".");
      var op = pedaco[0];
      var val = pedaco.slice(1).join(".");
      var atual = row[f[0]];
      if (op === "eq") return String(atual === null || atual === undefined ? "" : atual) === val;
      if (op === "is") return atual === null || atual === undefined;
      if (op === "in") return val.replace(/[()]/g, "").split(",").indexOf(String(atual)) >= 0;
      return true;
    });
  }
  function filtra(linhas, filtros) { return linhas.filter(function (r) { return bate(r, filtros); }); }
  function ordenar(arr, ordem) {
    var partes = String(ordem).split(",");
    return arr.slice().sort(function (a, b) {
      for (var i = 0; i < partes.length; i++) {
        var f = partes[i].split(".");
        var col = f[0];
        var x = a[col];
        var y = b[col];
        var c;
        if (x === y) c = 0;
        else if (x === null || x === undefined) c = -1;
        else if (y === null || y === undefined) c = 1;
        else if (typeof x === "number" && typeof y === "number") c = x < y ? -1 : 1;
        else c = String(x) < String(y) ? -1 : 1;
        if (c) return f[1] === "desc" ? -c : c;
      }
      return 0;
    });
  }
  /* as unicidades que supabase/schema.sql cria de verdade */
  var UNICAS = { turmas: ["id"], alunos: ["turma_id", "numero"], provas: ["id"], correcoes: ["prova_id", "qr_payload"] };
  function duplicado(tabela, linha) {
    var cols = UNICAS[tabela] || ["id"];
    var outro = mb[tabela].filter(function (row) {
      return cols.every(function (c) { return String(row[c]) === String(linha[c]); });
    })[0];
    if (!outro) return null;
    return {
      code: "23505",
      message: "duplicate key value violates unique constraint \"" + tabela + "_" + cols.join("_") + "_uidx\"",
      detail: "Key (" + cols.join(",") + ")=(" + cols.map(function (c) { return linha[c]; }).join(",") + ") already exists."
    };
  }
  /* upsert com on_conflict: substitui em vez de reclamar */
  function conflito(tabela, linha, onConflict) {
    var cols = (onConflict || "").split(",").filter(Boolean);
    if (!cols.length) return null;
    return mb[tabela].filter(function (row) {
      return cols.every(function (c) { return String(row[c]) === String(linha[c]); });
    })[0] || null;
  }

  /* ------------------------------------------------------------ auth falso
     O GoTrueClient de verdade bate nesta porta: /auth/v1/token, /signup e /logout.
     Nao sai pedido daqui e a sessao fica no localStorage do proprio supabase-js. */
  var auth = estado.auth;
  function achaUsuario(email) {
    var e = String(email || "").trim().toLowerCase();
    return auth.usuarios.filter(function (u) { return u.email === e; })[0] || null;
  }
  function usuarioJson(u) {
    return {
      id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
      phone: null, user_metadata: { nome: u.nome }, app_metadata: { provider: "email" },
      created_at: u.criado, confirmed_at: u.confirmado ? u.criado : null,
      email_confirmed_at: u.confirmado ? u.criado : null, last_sign_in_at: u.criado
    };
  }
  function sessaoPara(u) {
    auth.seq += 1;
    var token = "fake-token-" + auth.seq;
    /* o RLS falso decide pelo portador deste token: so vale o que o proprio fake emitiu */
    auth.tokens.push(token);
    return {
      key: "fake-" + auth.seq, access_token: token,
      token_type: "bearer", expires_in: 36000, refresh_token: "fake-refresh-" + auth.seq,
      user: usuarioJson(u)
    };
  }
  function erroAuth(msg) {
    return res(400, { code: 400, error_code: "invalid_credentials", error: "invalid_credentials",
      error_description: msg, msg: msg, message: msg });
  }
  function autenticar(u, metodo, corpo) {
    var dados = corpo ? JSON.parse(corpo) : {};
    if (metodo === "POST" && /\/token$/.test(u.pathname)) {
      var dono = achaUsuario(dados.email);
      if (!dono || dono.senha !== dados.password) return erroAuth("Invalid login credentials");
      if (!dono.confirmado) return erroAuth("Email not confirmed");
      return res(200, sessaoPara(dono));
    }
    if (metodo === "POST" && /\/signup$/.test(u.pathname)) {
      if (achaUsuario(dados.email)) return erroAuth("User already registered");
      var novo = {
        id: novoId(), email: String(dados.email || "").trim().toLowerCase(),
        senha: String(dados.password || ""), nome: (dados.data || {}).nome || "",
        criado: new Date().toISOString(), confirmado: !auth.pedeConfirmacao
      };
      auth.usuarios.push(novo);
      if (!novo.confirmado) return res(200, { user: usuarioJson(novo) });
      return res(200, sessaoPara(novo));
    }
    if (metodo === "POST" && /\/logout$/.test(u.pathname)) return res(204, null);
    return res(404, { message: "auth falso nao conhece " + u.pathname });
  }

  function tratar(u, metodo, corpo, hd) {
    var tabela = decodeURIComponent(u.pathname.split("/").pop());
    if (!mb[tabela]) return res(404, { code: "42P01", message: 'relation "' + tabela + '" does not exist' });
    var filtros = [];
    u.searchParams.forEach(function (v, k) {
      if (k === "select" || k === "order" || k === "limit" || k === "offset" || k === "on_conflict") return;
      filtros.push([k, v]);
    });
    var aceitaObjeto = /vnd\.pgrst\.object/.test(hd.accept || "");
    var representação = /return=representation/.test(hd.prefer || "");
    var limite = Number(u.searchParams.get("limit") || 0);

    function entrega(arr, status) {
      if (aceitaObjeto && arr.length !== 1) {
        return res(406, { code: "PGRST116", details: "Results contain " + arr.length + " rows",
          message: "JSON object requested, multiple (or no) rows returned" });
      }
      return res(status || 200, aceitaObjeto ? arr[0] : arr);
    }

    /* o RLS de supabase/schema.sql: as tabelas com dado de aluno so atendem quem
       entrou. leitura sem sessao devolve lista vazia (e o que o PostgREST faz de
       verdade) e escrita sem sessao volta 42501. descritores fica de fora porque no
       banco real continua aberto ao anon. */
    var SO_LOGADO = ["turmas", "escolas", "alunos", "provas", "correcoes", "professores", "prova_versoes"];
    function dentro(hd) {
      var portador = String(hd.authorization || "").replace(/^Bearer\s+/i, "");
      return auth.tokens.indexOf(portador) >= 0;
    }
    if (SO_LOGADO.indexOf(tabela) >= 0 && !dentro(hd)) {
      if (metodo === "GET") return entrega([], 200);
      return res(403, { code: "42501", message: 'new row violates row-level security policy for table "' + tabela + '"' });
    }

    if (metodo === "GET") {
      var achadas = filtra(mb[tabela], filtros);
      if (u.searchParams.get("order")) achadas = ordenar(achadas, u.searchParams.get("order"));
      if (limite) achadas = achadas.slice(0, limite);
      return entrega(achadas, 200);
    }
    if (metodo === "POST") {
      var onConflict = u.searchParams.get("on_conflict") || "";
      var gravadas = [];
      var novos = Array.isArray(corpo) ? corpo : [corpo];
      if (estado.semTipo && tabela === "alunos" && novos.some(function (l) { return l && "tipo" in l; })) {
        return res(400, { code: "42703", message: "column alunos.tipo does not exist",
          hint: "rode a migracao outra vez" });
      }
      for (var i = 0; i < novos.length; i++) {
        var linha = Object.assign({}, novos[i]);
        var existente = conflito(tabela, linha, onConflict);
        if (existente) {
          Object.assign(existente, linha);
          gravadas.push(existente);
          continue;
        }
        var dup = duplicado(tabela, linha);
        if (dup) return res(409, dup);
        if (!linha.id) linha.id = novoId();
        if (!linha.created_at) linha.created_at = new Date().toISOString();
        mb[tabela].push(linha);
        gravadas.push(linha);
      }
      return entrega(representação || aceitaObjeto ? gravadas : [], 201);
    }
    if (metodo === "PATCH") {
      var alvo = filtra(mb[tabela], filtros);
      alvo.forEach(function (row) { Object.assign(row, corpo); });
      return entrega(representação ? alvo : [], 200);
    }
    if (metodo === "DELETE") {
      var removidas = filtra(mb[tabela], filtros);
      mb[tabela] = mb[tabela].filter(function (row) { return !bate(row, filtros); });
      return entrega(representação ? removidas : [], removidas.length ? 200 : 204);
    }
    return res(405, { message: "metodo " + metodo + " nao suportado" });
  }

  window.fetch = function (entrada, init) {
    var u = new URL(typeof entrada === "string" ? entrada : entrada.url, location.href);
    if (u.href.indexOf(cfg.url) !== 0) {
      // nao e o banco (o .docx de exemplo, por exemplo): deixa o pedido seguir de verdade
      return estado.fetchOriginal.call(window, entrada, init);
    }
    var o = init || {};
    var metodo = String(o.method || "GET").toUpperCase();
    estado.reqs.push({ url: u.href, metodo: metodo, body: o.body ? String(o.body) : null });
    var corpo = o.body ? JSON.parse(String(o.body)) : null;
    if (u.pathname.indexOf("/auth/v1/") === 0) {
      return Promise.resolve(autenticar(u, metodo, o.body ? String(o.body) : ""));
    }
    return Promise.resolve(tratar(u, metodo, corpo, cabecalhos(o)));
  };

  GabaDB.saveConfig(cfg.url, cfg.key);
  return { instalado: true, configurado: GabaDB.isConfigured() };
}

function montarHelpers() {
  window.espera = function (condicao, ms) {
    var limite = Date.now() + (ms || 9000);
    return new Promise(function (resolve, reject) {
      (function tentar() {
        var v = null;
        try { v = condicao(); } catch (err) { v = null; }
        if (v) return resolve(v);
        if (Date.now() > limite) return reject(new Error("tempo esgotado"));
        setTimeout(tentar, 120);
      })();
    });
  };
  window.texto = function (id) {
    var el = document.getElementById(id);
    return el ? el.textContent : "";
  };
  window.preenche = function (id, valor) {
    var el = document.getElementById(id);
    if (!el) throw new Error("campo sumiu: " + id);
    el.value = String(valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  window.envia = function (id) {
    var f = document.getElementById(id);
    if (typeof f.requestSubmit === "function") f.requestSubmit();
    else f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };
  window.botaoDe = function (pai, acao, id) {
    var todos = [].slice.call(document.querySelectorAll(pai + " [data-acao]")).filter(function (b) {
      return b.dataset.acao === acao && (id === undefined || String(b.dataset.id) === String(id));
    });
    if (!todos.length) throw new Error("botao nao encontrado: " + acao + " em " + pai);
    return todos[0];
  };
  window.previaDe = function () {
    return {
      linhas: [].slice.call(document.querySelectorAll("#imp-previa tbody tr")).map(function (tr) {
        return [].slice.call(tr.cells).map(function (c) { return c.textContent.trim(); });
      }),
      resumo: (document.querySelector("#imp-previa .imp-resumo") || {}).textContent || "",
      problemas: [].slice.call(document.querySelectorAll("#imp-previa .imp-problemas li"))
        .map(function (li) { return li.textContent.replace(/\s+/g, " ").trim(); }),
      status: (document.getElementById("imp-status") || {}).textContent || "",
      salvarPreso: document.getElementById("imp-salvar").disabled,
      turma: document.getElementById("imp-turma").value
    };
  };
  window.pilhasDe = function () {
    return [].slice.call(document.querySelectorAll("#dash-pilhas .item-lista")).map(function (d) {
      var barra = d.querySelector(".alivio-barra i");
      return { turma: (d.querySelector(".item-cab strong") || {}).textContent || "",
        texto: d.querySelector(".item-cab").textContent.replace(/\s+/g, " ").trim(),
        falta: (d.querySelector(".alivio-falta") || {}).textContent || "",
        largura: barra ? barra.style.width : "" };
    });
  };
  return { helpers: ["espera", "texto", "preenche", "envia", "botaoDe", "previaDe", "pilhasDe"]
    .filter(function (n) { return window[n]; }).length };
}

async function dirigirCadastros(marcas) {
  var r = {};
  window.confirm = function () { return true; };
  window.prompt = function () { return marcas.novoNome; };

  /* auto-responder para o pedir() que substituiu prompt/confirm */
  window.__autoDialogo = { valor: true };
  (function () {
    var dlg = document.getElementById("dlg");
    if (!dlg) return;
    new MutationObserver(function () {
      if (dlg.hidden || !window.__autoDialogo) return;
      var valor = window.__autoDialogo.valor;
      var campoBox = document.getElementById("dlg-campo-box");
      var campo = document.getElementById("dlg-campo");
      if (campoBox && !campoBox.hidden && campo && typeof valor === "string") {
        campo.value = valor;
      }
      var opcoes = document.getElementById("dlg-opcoes");
      if (opcoes && !opcoes.hidden && typeof valor === "string") {
        var radios = [].slice.call(opcoes.querySelectorAll("input[type=radio]"));
        var match = radios.filter(function (r) { return r.value === valor; })[0];
        if (match) {
          match.checked = true;
          match.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          var outra = radios.filter(function (r) { return r.value === "__outra"; })[0];
          if (outra) {
            outra.checked = true;
            outra.dispatchEvent(new Event("change", { bubbles: true }));
            var outraIn = document.getElementById("dlg-outra-in");
            if (outraIn) outraIn.value = valor;
          }
        }
      }
      setTimeout(function () {
        if (dlg.hidden) return;
        var ok = document.getElementById("dlg-ok");
        if (ok && !ok.hidden) ok.click();
      }, 0);
    }).observe(dlg, { attributes: true, attributeFilter: ["hidden"] });
  })();

  preenche("turma-nome", marcas.turma);
  preenche("turma-ano", "1º ano M");
  envia("form-turma");
  r.turma = await espera(function () {
    var t = window.__gaba.mb.turmas[0];
    return t && document.getElementById("lista-turmas").textContent.indexOf(marcas.turma) >= 0
      ? { nome: t.nome, ano: t.ano, id: t.id } : null;
  }).catch(function () { return null; });
  r.opcoesTurma = [].slice.call(document.querySelectorAll("#aluno-turma-select option")).map(function (o) {
    return { value: o.value, label: o.textContent };
  });

  if (r.turma) {
    document.getElementById("aluno-turma-select").value = String(r.turma.id);
    preenche("aluno-nome", marcas.aluno1);
    preenche("aluno-numero", "7");
    envia("form-aluno");
    r.aluno1 = await espera(function () {
      var a = window.__gaba.mb.alunos[0];
      return a && document.getElementById("lista-turmas").textContent.indexOf(marcas.aluno1) >= 0
        ? { nome: a.nome, numero: a.numero, id: a.id } : null;
    }).catch(function () { return null; });

    document.getElementById("aluno-turma-select").value = String(r.turma.id);
    preenche("aluno-nome", marcas.alunoDuplicado);
    preenche("aluno-numero", "7");
    envia("form-aluno");
    r.dupStatus = await espera(function () {
      return /esse número/.test(texto("app-status")) ? texto("app-status") : null;
    }, 6000).catch(function () { return texto("app-status"); });
    r.alunosDepoisDoDuplicado = window.__gaba.mb.alunos.length;

    document.getElementById("aluno-turma-select").value = String(r.turma.id);
    preenche("aluno-nome", marcas.aluno2);
    preenche("aluno-numero", "8");
    envia("form-aluno");
    r.aluno2 = await espera(function () {
      var a = window.__gaba.mb.alunos[1];
      return a ? { nome: a.nome, numero: a.numero, id: a.id } : null;
    }).catch(function () { return null; });

    r.roster = [].slice.call(document.querySelectorAll("#lista-turmas .linha-aluno")).map(function (l) {
      return l.textContent.replace(/\s+/g, " ").trim();
    });

    window.__autoDialogo.valor = marcas.novoNome;
    botaoDe("#lista-turmas", "renomear-turma").click();
    r.renomeada = await espera(function () {
      var t = window.__gaba.mb.turmas[0];
      return t && t.nome === marcas.novoNome ? { nome: t.nome, id: t.id } : null;
    }, 6000).catch(function () { return null; });

    window.__autoDialogo.valor = true;
    var apagar = botaoDe("#lista-turmas", "apagar-aluno");
    var idApagado = apagar.dataset.id;
    apagar.click();
    r.apagouAluno = await espera(function () {
      var a = window.__gaba.mb.alunos[0];
      return window.__gaba.mb.alunos.length === 1 && a ? { nome: a.nome, numero: a.numero, id: a.id } : null;
    }, 6000).catch(function () { return null; });
    r.idApagado = idApagado;
    r.statusApagar = texto("app-status");
  }

  preenche("prova-titulo", marcas.prova);
  preenche("prova-disciplina", "Matemática");
  preenche("prova-qtd", "12");
  window.gerarCamposGabarito();
  r.selects = document.querySelectorAll("#gabarito-inputs .gab-q").length;
  var gab = document.querySelectorAll("#gabarito-inputs .gab-q");
  for (var i = 0; i < gab.length; i++) gab[i].value = ["A", "B", "C", "D", "E"][i % 5];
  envia("form-prova");
  r.provaSalva = await espera(function () {
    return window.__gaba.mb.provas.length ? window.__gaba.mb.provas[0] : null;
  }).catch(function () { return null; });
  var posted = window.__gaba.reqs.filter(function (q) {
    return q.metodo === "POST" && /\/provas/.test(q.url);
  })[0];
  r.provaUrl = posted ? posted.url : "";
  r.provaPayload = posted ? JSON.parse(posted.body) : null;
  r.provaCols = r.provaPayload ? Object.keys(r.provaPayload) : [];
  r.provaNaTela = document.getElementById("lista-provas").textContent.indexOf(marcas.prova) >= 0;
  r.provaStatus = texto("app-status");
  await espera(function () { return texto("dash-provas-count") === "1"; }, 4000).catch(function () { return null; });
  r.painel = ["dash-turmas-count", "dash-alunos-count", "dash-provas-count", "dash-correcoes-count"].map(texto);
  r.pilhas = pilhasDe();
  return r;
}

async function dirigirDocumento(cfg) {
  var r = {};
  var buf = await (await fetch(cfg.sampleUrl)).arrayBuffer();
  var file = new File([buf], "UIcrudprova.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
  await GabaCaderno.importarDocx(file);
  var local = GabaCaderno.estado.provasLocais[0];
  if (!local) { r.erro = "o .docx nao virou prova"; return r; }
  r.idLocal = String(local.id);
  r.questoes = (local.questoes || []).length;
  r.cadStatus = texto("prova-status");

  var aviso = document.getElementById("cad-avisos");
  var p0 = GabaCaderno.problemasDaProva(local);
  var esperados = (p0.semGabarito.length ? 1 : 0) + (p0.gabaritoFora.length ? 1 : 0) +
    (p0.semAlternativas.length ? 1 : 0) + (local.avisos || []).length;
  r.problemas = { semGabarito: p0.semGabarito.length, semAlternativas: p0.semAlternativas.length,
    gabaritoFora: p0.gabaritoFora.length, avisosDoWord: (local.avisos || []).length };
  r.avisosEsperados = esperados;
  r.avisosVisiveis = Boolean(aviso) && !aviso.hidden;
  r.avisos = [].slice.call(document.querySelectorAll("#cad-avisos li"))
    .map(function (li) { return li.textContent.replace(/\s+/g, " ").trim(); });
  r.linhasEditor = document.querySelectorAll("#cad-questoes .q-rev[data-q]").length;
  r.nota = texto("cad-nota-prova");

  var linha1 = document.querySelector('#cad-questoes .q-rev[data-q="1"]');
  r.q1Antes = String((local.questoes[0] || {}).gabarito || "");
  if (linha1) {
    var peso = linha1.querySelector('[data-campo="peso"]');
    var desc = linha1.querySelector('[data-campo="descritor"]');
    var bncc = linha1.querySelector('[data-campo="habilidade_bncc"]');
    var gab = linha1.querySelector('[data-campo="gabarito"]');
    peso.value = "3";
    peso.dispatchEvent(new Event("change", { bubbles: true }));
    desc.value = "D4 - resolução de problema";
    desc.dispatchEvent(new Event("change", { bubbles: true }));
    bncc.value = "EF03MA04";
    bncc.dispatchEvent(new Event("change", { bubbles: true }));
    r.letras = [].slice.call(gab.options).map(function (o) { return o.value; });
    gab.value = r.letras.indexOf("B") >= 0 ? "B" : (r.letras[1] || "");
    gab.dispatchEvent(new Event("change", { bubbles: true }));
  }
  r.q1 = {
    peso: (local.questoes[0] || {}).peso,
    descritor: (local.questoes[0] || {}).descritor,
    bncc: (local.questoes[0] || {}).habilidade_bncc,
    gabarito: (local.questoes[0] || {}).gabarito
  };
  r.notaDepois = texto("cad-nota-prova");
  r.linha1Ruim = Boolean(linha1 && linha1.classList.contains("ruim"));

  await new Promise(function (res) { setTimeout(res, 900); });
  var doDisco = await GabaSync.listarProvas();
  var copia = doDisco.filter(function (p) { return String(p.id) === r.idLocal; })[0];
  r.noDisco = copia ? { peso: (copia.questoes[0] || {}).peso, descritor: (copia.questoes[0] || {}).descritor } : null;

  GabaCaderno.estado.provasLocais = [];
  var deVolta = await GabaCaderno.carregarProvasLocais();
  /* o objeto vivo passa a ser a cópia que veio do armazenamento do aparelho */
  local = deVolta.filter(function (p) { return String(p.id) === r.idLocal; })[0] || local;
  r.recarga = {
    quantidade: deVolta.length,
    peso: deVolta.length ? (deVolta[0].questoes[0] || {}).peso : null,
    descritor: deVolta.length ? (deVolta[0].questoes[0] || {}).descritor : null
  };
  await GabaCaderno.carregarListas();
  r.editorDepoisDaRecarga = document.querySelectorAll('#cad-questoes .q-rev[data-q="1"] [data-campo="peso"]')
    .length ? document.querySelector('#cad-questoes .q-rev[data-q="1"] [data-campo="peso"]').value : "";

  await GabaApp.carregarTudo();
  r.antes = {
    linhas: document.querySelectorAll("#lista-provas .item-lista").length,
    soAparelho: document.querySelectorAll("#lista-provas .item-lista.so-aparelho").length,
    texto: (document.querySelector("#lista-provas .item-lista.so-aparelho") || {}).textContent || ""
  };
  r.antes.texto = r.antes.texto.replace(/\s+/g, " ").trim();
  var b = botaoDe("#lista-provas", "salvar-prova-no-banco", r.idLocal);
  b.click();
  r.depois = await espera(function () {
    var noBanco = window.__gaba.mb.provas.filter(function (p) {
      return String(p.id) === String(local.id);
    })[0];
    return noBanco ? noBanco : null;
  }, 20000).catch(function () { return null; });
  r.telas = {
    linhas: document.querySelectorAll("#lista-provas .item-lista").length,
    soAparelho: document.querySelectorAll("#lista-provas .item-lista.so-aparelho").length
  };
  r.status = texto("app-status");
  r.eUuidDepois = GabaDB.eUuid(String(local.id));
  r.idNoBanco = String(local.id);
  var sobrou = (await GabaSync.listarProvas()).filter(function (p) { return String(p.id) === r.idLocal; });
  r.copiaLocalDepoisDePromover = sobrou.length;
  return r;
}

/* a prova ja esta no banco: revisar peso e descritor na aba Cadernos e devolver para la */
async function dirigirRevisao(marcos) {
  var r = {};
  var sel = document.getElementById("cad-prova");
  var alvo = GabaCaderno.estado.provasSupabase.filter(function (p) {
    return String(p.id) === String(marcos.idNoBanco);
  })[0];
  if (!alvo) return { erro: "a prova promovida nao apareceu no seletor de cadernos" };
  sel.value = String(alvo.id);
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(function (res) { setTimeout(res, 500); });
  r.editorAberto = document.querySelectorAll("#cad-questoes .q-rev[data-q]").length;
  r.botaoEscondido = document.getElementById("cad-salvar-prova").hidden;
  var peso = document.querySelector('#cad-questoes .q-rev[data-q="3"] [data-campo="peso"]');
  var bncc = document.querySelector('#cad-questoes .q-rev[data-q="3"] [data-campo="habilidade_bncc"]');
  if (!peso || !bncc) return { erro: "faltam os campos da questao 3" };
  peso.value = "5";
  peso.dispatchEvent(new Event("change", { bubbles: true }));
  bncc.value = "EF07LP22";
  bncc.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(function (res) { setTimeout(res, 250); });
  r.botaoApareceu = !document.getElementById("cad-salvar-prova").hidden;
  document.getElementById("cad-salvar-prova").click();
  var linha = await espera(function () {
    var p = window.__gaba.mb.provas.filter(function (x) { return String(x.id) === String(alvo.id); })[0];
    return p && Number((p.pesos || [])[2]) === 5 ? p : null;
  }, 15000).catch(function () { return null; });
  r.pesoNoBanco = linha ? Number((linha.pesos || [])[2]) : null;
  r.bnccNoBanco = linha ? ((linha.descritores || [])[2] || {}).habilidade_bncc : null;
  r.gabaritoNoBanco = linha ? (linha.gabarito || []).length : null;
  r.botaoDepois = document.getElementById("cad-salvar-prova").hidden;
  r.status = texto("revisao-status");
  r.nota = texto("cad-nota-prova");
  return r;
}

async function dirigirAbas() {
  var r = {};
  var b = botaoDe("#lista-provas", "prova-no-caderno");
  r.provaId = String(b.dataset.id);
  b.click();
  await new Promise(function (res) { setTimeout(res, 1500); });
  r.abaAtiva = [].slice.call(document.querySelectorAll(".tab-content.active")).map(function (el) { return el.id; });
  r.botaoAtivo = (document.querySelector(".tabs-bastidor .tab-btn.active") || {}).textContent || "";
  r.grupoAtivo = (document.querySelector(".tabs-polegar .tab-btn.active") || {}).textContent || "";
  r.cadProva = String((document.getElementById("cad-prova") || {}).value || "");
  r.provasNoCaderno = [].slice.call(document.querySelectorAll("#cad-prova option")).map(function (o) {
    return o.textContent.replace(/\s+/g, " ").trim();
  });
  var l = botaoDe("#lista-provas", "prova-no-leitor", r.provaId);
  l.click();
  await new Promise(function (res) { setTimeout(res, 1500); });
  r.abaLeitor = [].slice.call(document.querySelectorAll(".tab-content.active")).map(function (el) { return el.id; });
  r.scanProva = String((document.getElementById("scan-prova") || {}).value || "");
  r.statusLeitor = texto("scan-status");
  return r;
}

async function dirigirFila(marcas) {
  var r = {};
  var prova = window.__gaba.mb.provas.filter(function (p) { return p.titulo === marcas.prova; })[0];
  var turma = window.__gaba.mb.turmas[0];
  if (!prova) { r.erro = "a prova do formulario sumiu do banco"; return r; }
  var leitura = {
    id: GabaSync.uuid(),
    prova_id: prova.id,
    turma_id: turma ? turma.id : null,
    aluno_nome: "ANA DO TESTE",
    aluno_numero: 7,
    versao: 1,
    codigo: "TESTE1",
    qr_texto: "GABA1|" + prova.id + "|N:7|7|1|TESTE1",
    engine: "teste",
    respostas: ["A", "B", "C"],
    acertos: 2,
    total_questoes: 3,
    nota: 6.7,
    created_at: new Date("2026-10-21T09:00:00.000Z").toISOString()
  };
  r.id = leitura.id;
  await GabaSync.enqueue(leitura);
  await GabaApp.carregarTudo();
  var tabela = document.getElementById("tabela-relatorios");
  r.comAparelho = tabela.querySelectorAll(".so-aparelho-tag").length;
  r.linhaAntes = [].slice.call(tabela.querySelectorAll("tr")).map(function (t) {
    return t.textContent.replace(/\s+/g, " ").trim();
  }).filter(function (t) { return /ANA DO TESTE/.test(t); })[0] || "";
  r.painelAntes = texto("dash-correcoes-count");
  document.getElementById("nota-sincronizar").click();
  r.sincronizada = await espera(function () {
    return window.__gaba.mb.correcoes.length === 1 ? window.__gaba.mb.correcoes[0] : null;
  }, 12000).catch(function () { return null; });
  r.filaRestante = (await GabaSync.listPending()).length;
  await espera(function () {
    return !document.querySelector("#tabela-relatorios .so-aparelho-tag") &&
      /ANA DO TESTE/.test(document.getElementById("tabela-relatorios").textContent);
  }, 8000).catch(function () { return null; });
  var tabela2 = document.getElementById("tabela-relatorios");
  r.aparelhoDepois = tabela2.querySelectorAll(".so-aparelho-tag").length;
  r.linhaDepois = [].slice.call(tabela2.querySelectorAll("tr")).map(function (t) {
    return t.textContent.replace(/\s+/g, " ").trim();
  }).filter(function (t) { return /ANA DO TESTE/.test(t); })[0] || "";
  r.status = texto("app-status");
  r.painelDepois = texto("dash-correcoes-count");
  r.pilhaDepois = pilhasDe();
  return r;
}

async function dirigirLista(marcos) {
  var r = {};
  var campo = document.getElementById("imp-texto");
  var ver = document.getElementById("imp-ver");
  var salvar = document.getElementById("imp-salvar");
  var seletor = document.getElementById("imp-turma");

  r.antesDeVer = previaDe();

  campo.value = marcos.tsv;
  ver.click();
  r.ver = await espera(function () { return previaDe().linhas.length ? previaDe() : null; })
    .catch(function () { return previaDe(); });

  seletor.value = "";
  salvar.click();
  r.semTurma = previaDe().status;

  window.__gaba.semTipo = true;
  seletor.value = String(marcos.turmaId);
  var antes = window.__gaba.mb.alunos.length;
  salvar.click();
  /* copia os valores: as linhas do banco falso continuam vivas e mudam depois */
  r.dupAvisos = await espera(function () {
    return window.__gaba.mb.alunos.length >= antes + 2
      ? window.__gaba.mb.alunos.slice(antes).map(function (a) {
          return { numero: a.numero, nome: a.nome, temTipo: "tipo" in a, email: a.email_responsavel };
        })
      : null;
  }, 15000).catch(function () { return null; });
  r.pedidosLote = window.__gaba.reqs.filter(function (q) {
    return q.metodo === "POST" && /on_conflict=turma_id/.test(q.url);
  }).length;
  r.fallback = previaDe();
  window.__gaba.semTipo = false;

  var antesReimportar = window.__gaba.mb.alunos.length;
  campo.value = marcos.renomeado;
  ver.click();
  await espera(function () { return previaDe().linhas.length === 2; }, 8000).catch(function () { return null; });
  salvar.click();
  r.quantidadeDepoisReimportar = await espera(function () {
    var a = window.__gaba.mb.alunos.filter(function (x) { return Number(x.numero) === 60; })[0];
    return a && a.nome === marcos.nomeNovo ? window.__gaba.mb.alunos.length : null;
  }, 15000).catch(function () { return window.__gaba.mb.alunos.length; });
  r.antesReimportar = antesReimportar;
  var seisenta = window.__gaba.mb.alunos.filter(function (x) { return Number(x.numero) === 60; })[0] || null;
  r.aluno60 = seisenta ? { nome: seisenta.nome, tipo: seisenta.tipo, email: seisenta.email_responsavel } : null;

  var buf = await (await fetch(marcos.xlsxUrl)).arrayBuffer();
  var file = new File([buf], "chamada-excel.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  var dt = new DataTransfer();
  dt.items.add(file);
  var entrada = document.getElementById("imp-arquivo");
  entrada.files = dt.files;
  entrada.dispatchEvent(new Event("change", { bubbles: true }));
  r.xlsx = await espera(function () { return previaDe().linhas.length === 45 ? previaDe() : null; }, 20000)
    .catch(function () { return previaDe(); });

  seletor.value = String(marcos.turmaId);
  salvar.click();
  r.comChamada = await espera(function () {
    return window.__gaba.mb.alunos.length >= 47
      ? window.__gaba.mb.alunos.filter(function (x) { return Number(x.numero) === 1; })[0] : null;
  }, 20000).catch(function () { return null; });
  r.fim = previaDe();

  var pedidos = window.__gaba.reqs.filter(function (q) {
    return q.metodo === "POST" && /\/alunos\?/.test(q.url);
  });
  r.ultimoLote = pedidos.length ? pedidos[pedidos.length - 1] : null;
  r.tamanhoLote = r.ultimoLote ? JSON.parse(r.ultimoLote.body).length : 0;
  r.painel = document.getElementById("dash-alunos-count").textContent;
  return r;
}

/* escolas: a coluna que separa turmas de unidades diferentes e o filtro do topo que
   decide o que aparece em qualquer lista do app */
async function dirigirEscolas(marcos) {
  var r = {};
  var SERRA = "EEFM DA SERRA (teste)";
  var ANHANGUERA = "EM ANHANGUERA (teste)";
  r.procura = { turmaSerra: marcos.turmaSerra, turmaAnhanguera: marcos.turmaAnhanguera,
    turmaAnalise: marcos.turmaAnalise };
  var sel = document.getElementById("filtro-escola");
  var box = document.getElementById("escola-filtro-box");

  function tela() {
    return {
      linhas: [].slice.call(document.querySelectorAll("#lista-turmas .item-cab strong"))
        .map(function (s) { return s.textContent; }),
      escolaNaLinha: [].slice.call(document.querySelectorAll("#lista-turmas .item-cab > span:not(.item-acoes)"))
        .map(function (s) { return s.textContent.replace(/\s+/g, " ").trim(); })
        .filter(function (s) { return /\(teste\)|\(sem escola\)/.test(s); }),
      turmas: document.getElementById("dash-turmas-count").textContent,
      alunos: document.getElementById("dash-alunos-count").textContent,
      pilhas: pilhasDe().map(function (p) { return p.turma; }),
      seletorAluno: [].slice.call(document.querySelectorAll("#aluno-turma-select option"))
        .map(function (o) { return o.textContent.replace(/\s+/g, " ").trim(); }),
      seletorAnalise: [].slice.call(document.querySelectorAll("#ab-turma option"))
        .map(function (o) { return o.textContent.replace(/\s+/g, " ").trim(); }),
      filtro: sel.value,
      escondido: box.hidden
    };
  }

  function opcoesFiltro() {
    return { escondido: box.hidden, valor: sel.value,
      opcoes: [].slice.call(sel.options).map(function (o) {
        return { valor: o.value, texto: o.textContent.replace(/\s+/g, " ").trim() };
      }),
      datalist: [].slice.call(document.querySelectorAll("#lista-escolas option")).map(function (o) { return o.value; }) };
  }

  r.noInicio = opcoesFiltro();

  /* 1. a escola de uma turma ja cadastrada entra pelo botao da propria linha */
  var primeira = window.__gaba.mb.turmas.filter(function (t) { return t.nome === marcos.renomeada; })[0];
  if (!primeira) { r.parouAqui = { motivo: "a turma renomeada nao esta mais no banco" }; return r; }
  window.prompt = function () { return SERRA; };
  window.confirm = function () { return true; };
  window.__autoDialogo.valor = SERRA;
  botaoDe("#lista-turmas", "escola-turma", primeira.id).click();
  r.peloBotao = await espera(function () {
    return String(primeira.escola) === SERRA && tela().turmas ? SERRA : null;
  }, 8000).catch(function () { return primeira.escola; });

  /* 2. a escola digitada no formulario vai ao banco do jeito que o professor escreveu */
  preenche("turma-nome", marcos.turmaSerra);
  preenche("turma-ano", "9º ano");
  preenche("turma-escola", "  eefm   da serra (teste)  ");
  envia("form-turma");
  var daSerra = await espera(function () {
    return window.__gaba.mb.turmas.filter(function (t) { return t.nome === marcos.turmaSerra; })[0] || null;
  }, 8000).catch(function () { return null; });
  r.payloadTurma = (window.__gaba.reqs.filter(function (q) {
    return q.metodo === "POST" && /\/turmas/.test(q.url);
  }).pop() || {}).body;
  r.escolaNoBanco = daSerra ? daSerra.escola : null;

  preenche("turma-nome", marcos.turmaAnhanguera);
  preenche("turma-ano", "1ª série EM");
  preenche("turma-escola", ANHANGUERA);
  envia("form-turma");
  var daAnhang = await espera(function () {
    var t = window.__gaba.mb.turmas.filter(function (x) { return x.nome === marcos.turmaAnhanguera; })[0];
    return t && String(t.escola) === ANHANGUERA ? t : null;
  }, 8000).catch(function () { return null; });
  r.turmasNoBanco = window.__gaba.mb.turmas.map(function (t) { return t.nome + " | " + (t.escola || "(sem escola)"); });
  if (!daSerra || !daAnhang) {
    r.parouAqui = { daSerra: Boolean(daSerra), daAnhang: Boolean(daAnhang), status: texto("app-status") };
    return r;
  }
  r.duasEscolas = opcoesFiltro();
  r.todasAsTurmas = tela();

  /* 3. o filtro do topo vale para a lista, o painel, os seletores e o caderno */
  sel.value = SERRA;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  r.soSerra = await espera(function () {
    var t = tela();
    return t.linhas.indexOf(marcos.turmaSerra) >= 0 && t.linhas.indexOf(marcos.turmaAnhanguera) < 0 ? t : null;
  }, 8000).catch(tela);
  r.chaveGuardada = localStorage.getItem("gaba_escola_filtro");

  sel.value = ANHANGUERA;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  r.soAnhanguera = await espera(function () {
    var t = tela();
    return t.turmas === "1" && t.alunos === "0" ? t : null;
  }, 8000).catch(tela);

  sel.value = GabaEscolas.SEM_ESCOLA;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  r.soSemEscola = await espera(function () {
    var t = tela();
    return t.linhas.join("|") === marcos.turmaAnalise ? t : null;
  }, 8000).catch(tela);

  /* 4. a ultima turma da escola filtrada muda de escola: o filtro se desliga sozinho */
  sel.value = ANHANGUERA;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  await espera(function () { return tela().turmas === "1"; }, 8000).catch(function () { return null; });
  window.__autoDialogo.valor = SERRA;
  botaoDe("#lista-turmas", "escola-turma", daAnhang.id).click();
  r.seDesligou = await espera(function () {
    var t = tela();
    return t.filtro === "" && t.linhas.length >= 4 ? t : null;
  }, 8000).catch(tela);
  r.filtroDepois = { guardado: localStorage.getItem("gaba_escola_filtro"), escondido: box.hidden };

  /* 5. o caderno pega a escola da turma, mas nunca por cima do que foi digitado */
  await GabaCaderno.carregarListas();
  var campoEscola = document.getElementById("cad-escola");
  var selTurma = document.getElementById("cad-turma");
  selTurma.value = String(daSerra.id);
  selTurma.dispatchEvent(new Event("change", { bubbles: true }));
  var herdada = await espera(function () {
    return GabaEscolas.normalizar(String(campoEscola.value)) === GabaEscolas.normalizar(daSerra.escola)
      ? campoEscola.value : null;
  }, 8000).catch(function () { return campoEscola.value; });
  r.herdouEscola = herdada;

  campoEscola.value = "COLÉGIO DIGITADO À MÃO";
  campoEscola.dispatchEvent(new Event("change", { bubbles: true }));
  selTurma.value = String(primeira.id);
  selTurma.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(function (res) { setTimeout(res, 400); });
  r.manteveDigitado = campoEscola.value;

  selTurma.value = String(marcos.idAnalise);
  selTurma.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(function (res) { setTimeout(res, 400); });
  r.digitadoSemTurmaComEscola = campoEscola.value;

  /* 6. a folha impressa leva a escola que estava na caixa */
  var cfg = JSON.parse(localStorage.getItem("gaba_caderno_cfg") || "{}");
  r.cfgEscola = cfg.escola;
  r.cfgAuto = cfg.escolaAuto;
  return r;
}

/* análise de item na aba Notas: folhas embaralhadas têm que contar na ordem da prova base */
async function dirigirAnalise(marcos) {
  var V = window.GabaVersoes;
  var r = { ids: [] };
  var prova = window.__gaba.mb.provas.filter(function (p) {
    return String(p.id) === String(marcos.idNoBanco);
  })[0];
  if (!prova) return { erro: "a prova revisada do .docx nao esta mais no banco falso" };
  var total = (prova.questoes || []).length;
  r.total = total;
  var gab = (prova.gabarito || []).map(function (g) { return String(g || "").toUpperCase().charAt(0); });
  var turma = window.__gaba.mb.turmas[0];
  var outra = { id: "00000000-0000-4000-8000-0000000000aa", nome: "2º M B (teste)", ano: "2º ano M",
    created_at: new Date().toISOString() };
  window.__gaba.mb.turmas.push(outra);

  /* 8 folhas: os primeiros acertam as N primeiras questoes da base; nas erradas
     marcam a letra que, naquele caderno, corresponde a alternativa B da base */
  var acertariam = [10, 9, 8, 7, 4, 3, 2, 1];
  var batch = V.batch(prova, acertariam.map(function (a, i) {
    return { id: "an" + i, numero: 900 + i, nome: "ANALISADO " + i, tipo: (i % 4) + 1 };
  }), { modo: "turma", numTipos: 4, turma_id: turma.id, prova_id: prova.id, salt: "analise",
    embaralharAlternativas: true });

  var folhas = batch.itens.map(function (it, idx) {
    var versao = it.versao;
    var respostas = [];
    for (var q = 0; q < versao.total; q++) {
      var banco = versao.ordem[q];
      var posB = (versao.altMap[q] || []).indexOf(1);
      respostas[q] = banco < acertariam[idx] ? versao.gabarito[q] : (posB >= 0 ? "ABCDE".charAt(posB) : "B");
    }
    var notas = V.corrigir(prova, versao, respostas);
    var registro = {
      id: GabaSync.uuid(), prova_id: prova.id, turma_id: idx < 6 ? turma.id : outra.id,
      aluno_numero: 900 + idx, aluno_nome: "ANALISADO " + idx, versao: versao.versao,
      codigo: versao.codigo, engine: "teste-analise",
      qr_texto: "GABA1|" + prova.id + "|N:" + (900 + idx) + "|" + (900 + idx) + "|" +
        versao.versao + "|" + versao.codigo,
      respostas: respostas, respostas_banco: notas.respostas_banco, acertos: notas.acertos,
      branco: notas.branco, total_questoes: notas.total, nota: notas.nota,
      created_at: new Date(Date.UTC(2026, 9, 21, 10, idx)).toISOString()
    };
    r.ids.push(registro.id);
    return registro;
  });

  r.mudouLetra = folhas.some(function (f) {
    return String(f.respostas) !== String(f.respostas_banco);
  });
  r.outraTurmaId = outra.id;

  var esperado = [];
  for (var j = 0; j < total; j++) esperado.push({ acertos: 0, branco: 0, B: 0 });
  folhas.forEach(function (f) {
    (f.respostas_banco || []).forEach(function (letra, k) {
      if (!letra) { esperado[k].branco += 1; return; }
      if (letra === gab[k]) esperado[k].acertos += 1;
      else if (letra === "B") esperado[k].B += 1;
    });
  });
  r.esperado = esperado;
  r.gabaritoBase = gab;
  r.notas = folhas.map(function (f) { return f.nota; });

  for (var i = 0; i < folhas.length; i++) await GabaSync.saveLocalResult(folhas[i]);
  await GabaApp.carregarTudo();

  var sel = document.getElementById("ab-prova");
  sel.value = String(prova.id);
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  window.switchAnalise("ab-questao");

  function linhaDaTabela(tr) {
    var c = [].slice.call(tr.cells).map(function (td) { return td.textContent.replace(/\s+/g, " ").trim(); });
    return {
      q: tr.dataset.q, gab: c[1], acertos: c[3], pc: c[4], branco: c[5], disc: c[6],
      ped: c[8], flags: [].slice.call(tr.querySelectorAll(".ana-chip")).map(function (x) { return x.textContent; }),
      distr: [].slice.call(tr.querySelectorAll(".ana-distr")).map(function (d) {
        return { letra: d.textContent.trim().charAt(0),
          qtd: Number((d.querySelector("b") || {}).textContent || 0), forte: d.classList.contains("forte"),
          titulo: d.title };
      }),
      sinalizada: tr.classList.contains("sinalizada")
    };
  }

  r.tabela = await espera(function () {
    var trs = document.querySelectorAll("#ana-itens tbody tr");
    return trs.length === total ? [].slice.call(trs).map(linhaDaTabela) : null;
  }, 12000).catch(function () { return []; });

  r.cartoes = [].slice.call(document.querySelectorAll("#ana-resumo .ana-card")).map(function (c) {
    return { valor: (c.querySelector("h3") || {}).textContent || "",
      rotulo: (c.querySelector("p") || {}).textContent || "",
      detalhe: (c.querySelector(".ana-detalhe") || {}).textContent || "" };
  });
  r.avisos = [].slice.call(document.querySelectorAll("#ana-resumo .ana-avisos li"))
    .map(function (li) { return li.textContent.replace(/\s+/g, " ").trim(); });
  r.status = texto("ana-status");
  r.seletorProvas = [].slice.call(document.querySelectorAll("#ab-prova option"))
    .map(function (o) { return o.textContent.replace(/\s+/g, " ").trim(); });
  r.seletorTurmas = [].slice.call(document.querySelectorAll("#ab-turma option"))
    .map(function (o) { return o.textContent.replace(/\s+/g, " ").trim(); });
  r.seloAparelho = document.querySelectorAll("#tabela-relatorios .so-aparelho-tag").length;

  var revisar = document.getElementById("ana-revisar");
  revisar.checked = true;
  revisar.dispatchEvent(new Event("change", { bubbles: true }));
  r.somenteRevisar = document.querySelectorAll("#ana-itens tbody tr").length;
  r.todasSinalizadas = [].slice.call(document.querySelectorAll("#ana-itens tbody tr")).every(function (tr) {
    return tr.classList.contains("sinalizada");
  });
  revisar.checked = false;
  revisar.dispatchEvent(new Event("change", { bubbles: true }));

  var ordenar = document.getElementById("ana-ordenar");
  ordenar.value = "acerto";
  ordenar.dispatchEvent(new Event("change", { bubbles: true }));
  r.primeiraPorAcerto = (document.querySelector("#ana-itens tbody tr") || {}).dataset
    ? document.querySelector("#ana-itens tbody tr").dataset.q : "";
  r.primeiraCelula = ((document.querySelector("#ana-itens tbody tr td:nth-child(4)") || {}).textContent || "").trim();
  ordenar.value = "numero";
  ordenar.dispatchEvent(new Event("change", { bubbles: true }));

  var selTurma = document.getElementById("ab-turma");
  selTurma.value = String(outra.id);
  selTurma.dispatchEvent(new Event("change", { bubbles: true }));
  r.statusSoTurma = texto("ana-status");
  r.cartoesSoTurma = [].slice.call(document.querySelectorAll("#ana-resumo .ana-card h3"))
    .map(function (h) { return h.textContent; });
  selTurma.value = "";
  selTurma.dispatchEvent(new Event("change", { bubbles: true }));

  document.getElementById("ana-csv").click();
  r.csv = GabaApp.analise.csv(GabaApp.analise.itens());
  r.statusCsv = texto("app-status");
  r.csvLinhas = r.csv.replace(/^\ufeff/, "").trim().split(/\r\n/).length;
  r.csvCabecalho = r.csv.replace(/^\ufeff/, "").split(/\r\n/)[0];
  r.csvColunas = r.csv.replace(/^\ufeff/, "").split(/\r\n/)[1].split(";").length;
  return r;
}

function colherErros() {
  return { erros: window.__erros || [], abasAtivas: document.querySelectorAll(".tab-content.active").length };
}

function sondarVazamento(idLocal) {
  return window.__gaba.reqs.filter(function (q) {
    return String(q.url).indexOf(idLocal) >= 0 || String(q.body || "").indexOf(idLocal) >= 0;
  }).map(function (q) { return q.metodo + " " + q.url; });
}

async function apagarLeituraDeTeste(ids) {
  var db = await new Promise(function (resolve, reject) {
    var req = indexedDB.open("gaba-omr", 2);
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
  var tx = db.transaction(["pending", "results"], "readwrite");
  [].concat(ids || []).forEach(function (id) {
    tx.objectStore("pending").delete(id);
    tx.objectStore("results").delete(id);
  });
  await new Promise(function (resolve, reject) {
    tx.oncomplete = resolve;
    tx.onerror = function () { reject(tx.error); };
  });
  return { fila: await GabaSync.countPending(), leituras: (await GabaSync.listResults()).length };
}

function restaurar() {
  var g = window.__gaba;
  var r = {};
  window.fetch = g.fetchOriginal;
  localStorage.removeItem("gaba_escola_filtro");
  Object.keys(localStorage).filter(function (k) {
    return /^sb-.*-auth-token$/.test(k);
  }).forEach(function (k) { localStorage.removeItem(k); });
  Object.keys(g.antes).forEach(function (k) {
    if (g.antes[k] === null) localStorage.removeItem(k);
    else localStorage.setItem(k, g.antes[k]);
  });
  GabaDB.client = null;
  r.configurado = GabaDB.isConfigured();
  r.url = localStorage.getItem("gaba_supabase_url");
  r.key = localStorage.getItem("gaba_supabase_key");
  r.anon = localStorage.getItem("gaba_supabase_anon_key");
  r.escolaFiltro = localStorage.getItem("gaba_escola_filtro");
  r.escolasRegistro = localStorage.getItem("gaba_escolas_registro");
  r.tokenParado = Object.keys(localStorage).filter(function (k) {
    return /^sb-.*-auth-token$/.test(k);
  }).length;
  r.stubRestante = window.fetch.toString().indexOf("__gaba") >= 0;
  r.podas = Object.keys(g.mb).map(function (k) { return k + "=" + g.mb[k].length; });
  r.reqs = g.reqs.length;
  return r;
}

/* ---------- assercoes ---------- */

var falhas = 0;

function check(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (detalhe !== undefined && !cond ? "  ->  " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas += 1;
}

function mesmoTexto(a, b) {
  return String(a == null ? "" : a).trim().replace(/\s+/g, " ").toUpperCase() ===
    String(b == null ? "" : b).trim().replace(/\s+/g, " ").toUpperCase();
}

var ESCOLA_SERRA = "EEFM DA SERRA (teste)";
var ESCOLA_ANHANGUERA = "EM ANHANGUERA (teste)";

/* o degrau novo: a escola nasce do formulario propria, antes de qualquer turma dela */
async function dirigirEscada(marcos) {
  var r = {};
  var NOVA = marcos.escolaNova;
  var TURMA = marcos.turmaNova;
  var Fantasma = marcos.escolaFantasma;

  function cards() {
    return [].slice.call(document.querySelectorAll("#lista-escolas-cad .item-lista")).map(function (d) {
      return {
        nome: (d.querySelector(".item-cab strong") || {}).textContent || "",
        span: [].slice.call(d.querySelectorAll(".item-cab > span:not(.item-acoes)"))
          .map(function (s) { return s.textContent.replace(/\s+/g, " ").trim(); }),
        acoes: [].slice.call(d.querySelectorAll("[data-acao]")).map(function (b) { return b.dataset.acao; })
      };
    });
  }
  function cardOf(nome) {
    return cards().filter(function (c) { return GabaEscolas.chave(c.nome) === GabaEscolas.chave(nome); })[0] || null;
  }
  function topo() {
    var sel = document.getElementById("filtro-escola");
    return {
      valor: sel.value, escondido: document.getElementById("escola-filtro-box").hidden,
      opcoes: [].slice.call(sel.options).map(function (o) { return o.textContent.replace(/\s+/g, " ").trim(); }),
      datalist: [].slice.call(document.querySelectorAll("#lista-escolas option")).map(function (o) { return o.value; })
    };
  }
  function noBanco(nome) {
    return window.__gaba.mb.escolas.filter(function (e) {
      return GabaEscolas.chave(e.nome) === GabaEscolas.chave(nome);
    });
  }

  r.antescard = cards().length;
  r.antesTope = topo();

  /* 1. criar a escola: a grafia chega aparada e ela entra em todo lugar sem ter turma */
  preenche("escola-nome", "  " + NOVA.replace(/ /g, "   ") + "  ");
  envia("form-escola");
  r.criada = await espera(function () { return cardOf(NOVA); }, 8000).catch(function () { return null; });
  r.noBanco = noBanco(NOVA).length;
  r.topoDepois = await espera(function () {
    var t = topo();
    return t.datalist.some(function (n) { return GabaEscolas.chave(n) === GabaEscolas.chave(NOVA); }) ? t : null;
  }, 8000).catch(topo);
  r.filtroJa = topo().valor;
  r.escolaPreenchida = document.getElementById("turma-escola").value;
  r.registro = localStorage.getItem("gaba_escolas_registro");

  /* 2. o mesmo nome de novo nao vira uma segunda escola */
  preenche("escola-nome", NOVA.toUpperCase());
  envia("form-escola");
  r.repetida = await espera(function () {
    return /já está no cadastro/.test(texto("app-status")) ? texto("app-status") : null;
  }, 8000).catch(function () { return texto("app-status"); });
  r.linhasDaEscola = noBanco(NOVA).length;
  r.cartoesDaEscola = cards().filter(function (c) {
    return GabaEscolas.chave(c.nome) === GabaEscolas.chave(NOVA);
  }).length;

  /* 3. a turma criada logo embaixo herda a escola que esta na tela */
  preenche("turma-nome", TURMA);
  preenche("turma-ano", "5º ano");
  envia("form-turma");
  r.turma = await espera(function () {
    var t = window.__gaba.mb.turmas.filter(function (x) { return x.nome === TURMA; })[0];
    return t && GabaEscolas.chave(t.escola) === GabaEscolas.chave(NOVA) ? t : null;
  }, 8000).catch(function () { return null; });
  r.cardComTurma = await espera(function () {
    var c = cardOf(NOVA);
    return c && /1 turma\b/.test(c.span.join(" ")) ? c : null;
  }, 8000).catch(function () { return cardOf(NOVA); });

  /* 4. "adicionar turma" em outra escola muda o filtro e escreve a escola no formulario */
  var serra = cardOf(marcos.serra);
  r.serraAchada = Boolean(serra);
  r.serraAcoes = serra ? serra.acoes : null;
  if (serra) {
    botaoDe("#lista-escolas-cad", "turma-aqui", serra.nome).click();
    r.mudouPara = await espera(function () {
      return GabaEscolas.chave(topo().valor) === GabaEscolas.chave(serra.nome) ? topo() : null;
    }, 8000).catch(topo);
    r.campoEscola = document.getElementById("turma-escola").value;
    r.soSerra = [].slice.call(document.querySelectorAll("#lista-turmas .item-cab strong"))
      .map(function (s) { return s.textContent; });
  }

  /* 5. ver so esta / ver todas alternam o filtro pelo proprio cartao */
  if (r.serraAchada) {
    botaoDe("#lista-escolas-cad", "escola-filtrar", cardOf(marcos.serra).nome).click();
    r.verTodas = await espera(function () {
      return topo().valor === "" ? topo() : null;
    }, 8000).catch(topo);
  }

  /* 6. escola criada por engado: sair do cadastro tira do banco e do aparelho juntos */
  preenche("escola-nome", Fantasma);
  envia("form-escola");
  var fantasma = await espera(function () {
    return noBanco(Fantasma).length && cardOf(Fantasma) ? cardOf(Fantasma) : null;
  }, 8000).catch(function () { return null; });
  r.fantasmaCriado = Boolean(fantasma);
  r.fantasmaFiltrando = topo().valor;
  window.confirm = function () { return true; };
  window.__autoDialogo.valor = true;
  botaoDe("#lista-escolas-cad", "apagar-escola", Fantasma).click();
  r.fantasmaDepois = await espera(function () {
    return !cardOf(Fantasma) && !noBanco(Fantasma).length ? { cards: cards().length, filtro: topo().valor } : null;
  }, 8000).catch(function () { return { sobrou: noBanco(Fantasma).length, carta: Boolean(cardOf(Fantasma)) }; });

  /* o que o banco tem, o aparelho herda: a escola criada continua no cadastro */
  r.cadastroFinal = cards();
  r.registroFinal = localStorage.getItem("gaba_escolas_registro");
  GabaEscolas.setFiltro("");
  return r;
}

/* a planilha da escola: uma aba por turma, sem o nome da escola em lugar nenhum */
async function dirigirImportarTurmas(marcos) {
  var r = {};
  var ESCOLA = marcos.escola;

  function xlsxDeTeste(abas) {
    var enc = new TextEncoder();
    function x(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
    var arquivos = {
      "xl/workbook.xml": '<workbook xmlns:r="r"><sheets>' + abas.map(function (a, i) {
        return '<sheet name="' + x(a.nome) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join("") + "</sheets></workbook>",
      "xl/_rels/workbook.xml.rels": "<Relationships>" + abas.map(function (a, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join("") + "</Relationships>"
    };
    abas.forEach(function (a, i) {
      arquivos["xl/worksheets/sheet" + (i + 1) + ".xml"] = "<worksheet><sheetData>" + a.linhas.map(function (l) {
        return "<row>" + l.map(function (v) { return '<c t="inlineStr"><is><t>' + x(v) + "</t></is></c>"; }).join("") + "</row>";
      }).join("") + "</sheetData></worksheet>";
    });
    var tabela = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      tabela[n] = c >>> 0;
    }
    function crc(b) {
      var c = 0xFFFFFFFF;
      for (var i = 0; i < b.length; i++) c = tabela[(c ^ b[i]) & 255] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }
    var partes = [], central = [], off = 0, nomes = Object.keys(arquivos);
    nomes.forEach(function (nome) {
      var nb = enc.encode(nome), dados = enc.encode(arquivos[nome]), soma = crc(dados);
      var loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
      loc.setUint32(14, soma, true); loc.setUint32(18, dados.length, true); loc.setUint32(22, dados.length, true);
      loc.setUint16(26, nb.length, true);
      partes.push(new Uint8Array(loc.buffer), nb, dados);
      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, soma, true); cen.setUint32(20, dados.length, true); cen.setUint32(24, dados.length, true);
      cen.setUint16(28, nb.length, true); cen.setUint32(42, off, true);
      central.push(new Uint8Array(cen.buffer), nb);
      off += 30 + nb.length + dados.length;
    });
    var tamanho = central.reduce(function (s, p) { return s + p.length; }, 0);
    var fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, nomes.length, true); fim.setUint16(10, nomes.length, true);
    fim.setUint32(12, tamanho, true); fim.setUint32(16, off, true);
    return new File(partes.concat(central, [new Uint8Array(fim.buffer)]), "chamada-da-escola.xlsx",
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function mandar(arquivo) {
    var dt = new DataTransfer();
    dt.items.add(arquivo);
    var entrada = document.getElementById("impt-arquivo");
    entrada.files = dt.files;
    entrada.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function painel() {
    var box = document.getElementById("impt-painel");
    var salvar = document.getElementById("impt-salvar");
    return {
      aberto: !box.hidden,
      titulo: ((box.querySelector(".impt-titulo") || {}).textContent || "").replace(/\s+/g, " ").trim(),
      resumo: ((box.querySelector(".imp-resumo") || {}).textContent || "").replace(/\s+/g, " ").trim(),
      avisos: [].slice.call(box.querySelectorAll(".imp-problemas li")).map(function (li) { return li.textContent; }),
      linhas: [].slice.call(box.querySelectorAll(".impt-tabela tbody tr")).map(function (tr) {
        return { nome: tr.querySelector(".impt-nome").value, alunos: tr.querySelector(".impt-num").textContent,
          selo: tr.querySelector(".badge").textContent, marcada: tr.querySelector("[data-impt]").checked };
      }),
      ano: (document.getElementById("impt-ano") || {}).value,
      comAlunos: Boolean(document.getElementById("impt-alunos") && document.getElementById("impt-alunos").checked),
      salvar: salvar ? { texto: salvar.textContent, desligado: salvar.disabled } : null,
      outro: Boolean(document.getElementById("impt-outro")),
      status: texto("impt-status")
    };
  }
  function cartao() {
    return [].slice.call(document.querySelectorAll("#lista-escolas-cad .item-lista")).map(function (d) {
      return { nome: d.querySelector(".item-cab strong").textContent,
        texto: d.querySelector(".item-cab").textContent.replace(/\s+/g, " "),
        acoes: [].slice.call(d.querySelectorAll("[data-acao]")).map(function (b) { return b.dataset.acao; }) };
    }).filter(function (c) { return GabaEscolas.chave(c.nome) === GabaEscolas.chave(ESCOLA); })[0] || null;
  }

  r.cartaoAntes = cartao();
  var turmasAntes = window.__gaba.mb.turmas.length;
  botaoDe("#lista-escolas-cad", "importar-turmas", cartao().nome).click();
  mandar(xlsxDeTeste([
    { nome: "6º A (teste)", linhas: [["1", "ALFA BRAVO TESTE", ""], ["2", "CHARLIE DELTA TESTE", "TRANSFERIDO"],
      ["3", "ECO FOXTROT TESTE", ""]] },
    { nome: marcos.turmaExistente, linhas: [["Nº", "Nome"], ["1", "GOLF HOTEL TESTE"], ["2", "INDIA JULIETT TESTE"]] },
    { nome: "Resumo", linhas: [["Total", "5"]] }
  ]));
  r.lido = await espera(function () { var p = painel(); return p.linhas.length === 2 ? p : null; }, 15000)
    .catch(painel);
  r.bancoAntesDeSalvar = window.__gaba.mb.turmas.length - turmasAntes;

  var todas = document.getElementById("impt-todas");
  todas.click();
  r.nenhuma = painel().salvar;
  todas.click();
  r.todasDeNovo = painel().salvar;

  var nome0 = document.querySelector('[data-impt-nome="0"]');
  nome0.value = "6º Ano A (teste)";
  nome0.dispatchEvent(new Event("input", { bubbles: true }));
  var nome1 = document.querySelector('[data-impt-nome="1"]');
  nome1.value = "6º ano a (TESTE)";
  nome1.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("impt-salvar").click();
  r.nomeRepetido = painel().status;
  r.seloRenomeado = painel().linhas[1].selo;
  nome1.value = marcos.turmaExistente;
  nome1.dispatchEvent(new Event("input", { bubbles: true }));

  document.getElementById("impt-salvar").click();
  r.salvo = await espera(function () {
    var p = painel();
    return /Pronto/.test(p.status) ? p : null;
  }, 15000).catch(painel);
  var nova = window.__gaba.mb.turmas.filter(function (t) { return t.nome === "6º Ano A (teste)"; });
  var existentes = window.__gaba.mb.turmas.filter(function (t) { return t.nome === marcos.turmaExistente; });
  function alunosDe(t) {
    return t ? window.__gaba.mb.alunos.filter(function (a) { return String(a.turma_id) === String(t.id); })
      .map(function (a) { return a.numero + ":" + a.nome; }).sort() : [];
  }
  r.nova = nova.map(function (t) { return { escola: t.escola, ano: t.ano }; });
  r.alunosDaNova = alunosDe(nova[0]);
  r.existentes = existentes.length;
  r.alunosDaExistente = alunosDe(existentes[0]);
  r.cartaoDepois = await espera(function () {
    var c = cartao();
    return c && /2 turmas/.test(c.texto) ? c : null;
  }, 8000).catch(cartao);
  r.filtro = GabaEscolas.filtro();

  document.getElementById("impt-cancelar").click();
  r.fechado = painel().aberto;

  /* arquivo sem turma nenhuma: o painel explica e oferece outro arquivo */
  botaoDe("#lista-escolas-cad", "importar-turmas", cartao().nome).click();
  mandar(new File(["isto nao e uma lista\n"], "anotacoes.csv", { type: "text/csv" }));
  r.vazio = await espera(function () { var p = painel(); return p.outro ? p : null; }, 8000).catch(painel);
  document.getElementById("impt-cancelar").click();

  var alternativa = [].slice.call(document.querySelectorAll('#lista-escolas-cad [data-acao="importar-turmas"]'))
    .filter(function (b) { return GabaEscolas.chave(b.dataset.id) !== GabaEscolas.chave(ESCOLA); })[0];
  var leXlsx = GabaPlanilha.leXlsx;
  var liberar;
  var trava = new Promise(function (res) { liberar = res; });
  try {
    GabaPlanilha.leXlsx = async function (buf) { await trava; return leXlsx(buf); };
    botaoDe("#lista-escolas-cad", "importar-turmas", cartao().nome).click();
    mandar(xlsxDeTeste([{ nome: "Leitura original (teste)", linhas: [["Nº", "Nome"], ["1", "ALFA TESTE"]] }]));
    await espera(function () { return /Lendo/.test(painel().status); }, 8000);
    alternativa.click();
    r.leituraBloqueada = /Espere a importação/.test(texto("app-status"));
    mandar(new File(["Turma\nNão deve entrar\n"], "outro.csv", { type: "text/csv" }));
    liberar();
    r.leituraOriginal = await espera(function () {
      var p = painel(); return p.linhas.length === 1 ? p : null;
    }, 8000).catch(painel);
  } finally {
    liberar();
    GabaPlanilha.leXlsx = leXlsx;
  }
  document.getElementById("impt-cancelar").click();

  var salvarTurma = GabaDB.salvarTurma;
  var salvarAlunos = GabaDB.salvarAlunosEmLote;
  var listarTurmas = GabaDB.listTurmas;
  var chamadas = 0;
  var lotes = 0;
  try {
    botaoDe("#lista-escolas-cad", "importar-turmas", cartao().nome).click();
    mandar(new File(["Turma;Nº;Nome\n8º A (retry teste);1;ALFA TESTE\n8º B (retry teste);1;BRAVO TESTE\n"],
      "retry.csv", { type: "text/csv" }));
    await espera(function () { return painel().linhas.length === 2; }, 8000);
    document.getElementById("impt-ano").value = "2027";
    document.getElementById("impt-alunos").click();
    GabaDB.salvarTurma = async function (dados) {
      chamadas++;
      if (chamadas === 2) throw new Error("Falha simulada na segunda turma");
      return salvarTurma(dados);
    };
    GabaDB.salvarAlunosEmLote = async function () { lotes++; throw new Error("Os alunos estavam desmarcados"); };
    GabaDB.listTurmas = async function () { throw new Error("Recarga simulada sem rede"); };
    document.getElementById("impt-salvar").click();
    r.camposTravados = [].slice.call(document.querySelectorAll("#impt-painel input, #impt-painel button"))
      .every(function (el) { return el.disabled; });
    alternativa.click();
    r.salvamentoBloqueado = /Espere a importação/.test(texto("app-status"));
    r.retryEscolhas = await espera(function () {
      var p = painel(); return /Falha simulada na segunda turma/.test(p.status) ? p : null;
    }, 8000).catch(painel);
    GabaDB.salvarTurma = salvarTurma;
    GabaDB.listTurmas = listarTurmas;
    document.getElementById("impt-salvar").click();
    await espera(function () { return /Pronto/.test(painel().status); }, 8000);
    r.retryLotes = lotes;
    r.retryTurmas = window.__gaba.mb.turmas.filter(function (t) { return /retry teste/.test(t.nome); })
      .map(function (t) { return { nome: t.nome, ano: t.ano, escola: t.escola }; });
  } finally {
    GabaDB.salvarTurma = salvarTurma;
    GabaDB.salvarAlunosEmLote = salvarAlunos;
    GabaDB.listTurmas = listarTurmas;
  }
  document.getElementById("impt-cancelar").click();

  try {
    botaoDe("#lista-escolas-cad", "importar-turmas", cartao().nome).click();
    mandar(new File(["Turma;Nº;Nome\n9º A (retry alunos teste);1;ALFA RETRY TESTE\n"], "retry-alunos.csv", { type: "text/csv" }));
    await espera(function () { return painel().linhas.length === 1; }, 8000);
    GabaDB.salvarAlunosEmLote = async function () { throw new Error("Lote simulado sem rede"); };
    GabaDB.listTurmas = async function () { throw new Error("Recarga simulada sem rede"); };
    document.getElementById("impt-salvar").click();
    await espera(function () { return /Lote simulado sem rede/.test(painel().status); }, 8000);
    GabaDB.salvarAlunosEmLote = salvarAlunos;
    GabaDB.listTurmas = listarTurmas;
    document.getElementById("impt-salvar").click();
    await espera(function () { return /Pronto/.test(painel().status); }, 8000);
    var turmaRetry = window.__gaba.mb.turmas.filter(function (t) { return /retry alunos teste/.test(t.nome); });
    r.retryDepoisDeCriar = { quantidade: turmaRetry.length, alunos: alunosDe(turmaRetry[0]) };
  } finally {
    GabaDB.salvarAlunosEmLote = salvarAlunos;
    GabaDB.listTurmas = listarTurmas;
  }
  document.getElementById("impt-cancelar").click();

  GabaEscolas.setFiltro("");
  await GabaApp.carregarTudo();
  return r;
}

async function dirigirDicas() {
  var r = {};
  var box = document.getElementById("gaba-dica");
  var tab = document.querySelector('.tabs-polegar [data-tab="dashboard"]');
  var outro = document.querySelector('.tabs-polegar [data-tab="relatorios"]');
  function aberta() { return box && !box.hidden; }
  function pausar(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function pointer(el, tipo, touch, x) {
    el.dispatchEvent(new PointerEvent(tipo, { bubbles: true, cancelable: true, pointerId: 5,
      pointerType: touch ? "touch" : "mouse", isPrimary: true, clientX: x || 50, clientY: 100 }));
  }
  window.switchTab("turmas");
  r.carregou = Boolean(box && box.getAttribute("role") === "tooltip");
  r.semNativo = !document.getElementById("status-conexao").hasAttribute("title") &&
    !document.querySelector('[data-tab="config"]').hasAttribute("title");
  tab.setAttribute("aria-describedby", "app-status");
  pointer(tab, "pointerover", false);
  await pausar(120);
  r.naoImediato = !aberta();
  await espera(aberta, 3000);
  r.mouse = { titulo: box.querySelector("strong").textContent, descricao: tab.getAttribute("aria-describedby"),
    texto: box.querySelector("p").textContent };
  pointer(tab, "pointerout", false);
  await pausar(200);
  r.saiu = !aberta() && tab.getAttribute("aria-describedby") === "app-status";

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  tab.focus();
  r.teclado = aberta();
  tab.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  r.esc = !aberta();
  tab.blur();

  pointer(tab, "pointerdown", true);
  await espera(aberta, 3000);
  r.segurar = { abriu: aberta(), titulo: box.querySelector("strong").textContent };
  var menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  tab.dispatchEvent(menu);
  r.semMenu = menu.defaultPrevented;
  pointer(tab, "pointerup", true);
  tab.click();
  r.semCliqueLongo = !document.getElementById("tab-dashboard").classList.contains("active") && aberta();

  pointer(outro, "pointerdown", true);
  r.proximoFecha = !aberta();
  await pausar(80);
  pointer(outro, "pointerup", true);
  outro.click();
  await pausar(600);
  r.toqueCurto = document.getElementById("tab-relatorios").classList.contains("active") && !aberta();

  pointer(tab, "pointerdown", true);
  pointer(tab, "pointermove", true, 65);
  await pausar(650);
  r.arrastar = !aberta();
  pointer(tab, "pointerup", true);
  pointer(tab, "pointerdown", true);
  pointer(tab, "pointercancel", true);
  await pausar(650);
  r.cancelar = !aberta();

  var segmento = document.querySelector('[data-sub="ab-descritor"]');
  pointer(segmento, "pointerover", false);
  await espera(aberta, 3000);
  r.segmento = box.querySelector("strong").textContent;
  document.dispatchEvent(new Event("scroll"));
  r.rolar = !aberta();

  window.switchTab("turmas");
  var dinamico = document.querySelector('#lista-escolas-cad [data-acao="importar-turmas"]');
  pointer(dinamico, "pointerover", false);
  await espera(aberta, 3000);
  r.dinamico = box.querySelector("strong").textContent;
  window.dispatchEvent(new Event("beforeprint"));
  r.imprimir = !aberta();

  pointer(tab, "pointerover", false);
  await espera(aberta, 3000);
  await pausar(5500);
  r.permanece = aberta();
  tab.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  tab.removeAttribute("aria-describedby");
  return r;
}

/* o login do professor: a conexao nao e pedida de novo e a sessao acorda com o app */
async function dirigirLogin(marcos) {
  var r = {};
  var NOME = marcos.nome;
  var EMAIL = marcos.email;
  var SENHA = marcos.senha;

  function tela() {
    return {
      conexaoAberta: !document.getElementById("form-config").hidden,
      guardadoVisivel: !document.getElementById("cfg-salva").hidden,
      guardadoTexto: texto("cfg-salva"),
      trocarVisivel: !document.getElementById("btn-trocar-credencial").hidden,
      loginVisivel: !document.getElementById("form-login").hidden,
      contaVisivel: !document.getElementById("form-conta").hidden,
      criarVisivel: !document.getElementById("btn-nova-conta").hidden,
      logado: !document.getElementById("professor-logado").hidden,
      nome: texto("logado-nome"),
      email: texto("logado-email"),
      status: texto("app-status"),
      badge: texto("status-conexao"),
      tokens: Object.keys(localStorage).filter(function (k) { return /^sb-.*-auth-token$/.test(k); }).length
    };
  }

  /* a conta de setup ainda esta dentro: sair primeiro, para a historia comecar do zero */
  document.getElementById("btn-sair").click();
  await espera(function () { return window.GabaApp.estado.professor ? null : true; }, 9000);

  r.telaInicial = tela();

  /* 1. senha errada: o aviso e em portugues de professor, nao de programador */
  preenche("login-email", EMAIL);
  preenche("login-senha", "senha-errada-9");
  envia("form-login");
  r.negado = await espera(function () {
    return /E-mail ou senha não batem/.test(texto("app-status")) ? texto("app-status") : null;
  }, 9000).catch(function () { return texto("app-status"); });
  r.negadoLogado = tela().logado;

  /* 2. criar a conta pelo botao da aba e entrar nela */
  document.getElementById("btn-nova-conta").click();
  r.contaAberta = tela().contaVisivel;
  preenche("conta-nome", NOME);
  preenche("conta-email", EMAIL);
  preenche("conta-senha", SENHA);
  envia("form-conta");
  r.criada = await espera(function () { return tela().logado ? tela() : null; }, 12000).catch(tela);
  r.professorNoBanco = window.__gaba.mb.professores.map(function (p) { return p.nome + " <" + p.email + ">"; });
  r.guardadoNoAparelho = {
    id: localStorage.getItem("gaba_professor_id"),
    nome: localStorage.getItem("gaba_professor_nome"),
    email: localStorage.getItem("gaba_professor_email")
  };
  r.depoisDeEntrar = tela();

  /* 3. a sessao sobrevive a um aparelho que acorda do zero: cliente recriado, so o storage fica */
  GabaDB.client = null;
  var deVolta = await GabaDB.usuario();
  r.acordouLogado = deVolta ? { email: deVolta.email, nome: deVolta.nome } : null;
  r.tokensNoStorage = Object.keys(localStorage).filter(function (k) {
    return /^sb-.*-auth-token$/.test(k);
  }).length;

  /* 4. trocar a conexao e o unico momento em que se digita url e chave de novo */
  document.getElementById("btn-trocar-credencial").click();
  r.conexaoAbertaAoPedir = tela().conexaoAberta;
  document.getElementById("cfg-url").value = marcos.url;
  document.getElementById("cfg-key").value = marcos.key;
  envia("form-config");
  r.conexaoFecha = await espera(function () {
    return document.getElementById("form-config").hidden === true &&
      !document.getElementById("cfg-salva").hidden ? tela() : null;
  }, 9000).catch(tela);

  /* 5. sair: some o professor, continua sobrando a conexao do banco */
  document.getElementById("btn-sair").click();
  r.saiu = await espera(function () {
    var t = tela();
    return !t.logado && t.loginVisivel && t.guardadoVisivel ? t : null;
  }, 9000).catch(tela);
  return r;
}

async function dirigirSelo(marcos) {
  var r = {};
  var botao = document.getElementById("status-conexao");
  var painel = document.getElementById("selo-painel");
  function vis(id) { return !document.getElementById(id).hidden; }
  function tela() {
    return {
      aberto: !painel.hidden, expandido: botao.getAttribute("aria-expanded"),
      login: vis("selo-login"), dentro: vis("selo-dentro"), semBanco: vis("selo-sem-banco"),
      erro: vis("selo-erro") ? texto("selo-erro") : "",
      nome: texto("selo-nome"), email: texto("selo-quem-email"), badge: texto("status-conexao"),
      foco: document.activeElement ? document.activeElement.id : "",
      logado: Boolean(window.GabaApp.estado.professor)
    };
  }

  r.tag = botao.tagName;
  botao.click();
  r.aberto = tela();
  document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  r.foraFecha = tela();
  botao.click();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  r.escFecha = tela();

  botao.click();
  preenche("selo-email", marcos.email);
  preenche("selo-senha", "senha-errada-9");
  envia("selo-login");
  r.negado = await espera(function () { var t = tela(); return t.erro ? t : null; }, 9000).catch(tela);

  preenche("selo-senha", marcos.senha);
  envia("selo-login");
  r.entrou = await espera(function () {
    var t = tela();
    return t.logado && !t.aberto && t.badge === "Ana" ? t : null;
  }, 12000).catch(tela);

  botao.click();
  r.abertoDentro = tela();
  document.getElementById("selo-sair").click();
  r.saiu = await espera(function () {
    var t = tela();
    return !t.logado && t.badge === "Entrar" ? t : null;
  }, 9000).catch(tela);

  /* aparelho sem banco nenhum: a janelinha nao oferece login que nao tem para onde ir */
  GabaDB.saveConfig("", "");
  await window.GabaApp.carregarTudo();
  botao.click();
  r.semBanco = tela();
  document.getElementById("selo-ir-ajustes").click();
  r.foiAjustes = { aba: document.getElementById("tab-config").classList.contains("active"), aberto: !painel.hidden };
  GabaDB.saveConfig(marcos.url, marcos.key);
  await window.GabaApp.carregarTudo();
  window.switchTab("dashboard");
  r.final = tela();
  return r;
}

async function sondarCaderno() {
  var inicio = window.__gaba.reqs.length;
  var estado = GabaCaderno.estado;
  var locaisAntes = estado.provasLocais.map(function (p) { return p.id; });
  await GabaCaderno.carregarListas();
  return {
    pedidos: window.__gaba.reqs.slice(inicio).filter(function (r) {
      return new URL(r.url).pathname.indexOf("/rest/v1/") === 0;
    }).map(function (r) { return new URL(r.url).pathname; }),
    turmas: estado.turmas.length,
    provasBanco: estado.provasSupabase.length,
    locaisAntes: locaisAntes,
    locaisDepois: estado.provasLocais.map(function (p) { return p.id; })
  };
}

function enderecosColados() {
  var chave = "gaba_supabase_url";
  var antes = localStorage.getItem(chave);
  var key = GabaDB.readConfig().key;
  var r = {};
  GabaDB.saveConfig("  https://abcdefgh.supabase.co/rest/v1/  ", key);
  r.restV1 = localStorage.getItem(chave);
  GabaDB.saveConfig("abcdefgh.supabase.co", key);
  r.semEsquema = localStorage.getItem(chave);
  localStorage.setItem(chave, "https://abcdefgh.supabase.co/rest/v1");
  r.jaGuardado = GabaDB.readConfig().url;
  if (antes === null) localStorage.removeItem(chave);
  else localStorage.setItem(chave, antes);
  GabaDB.client = null;
  r.devolvida = localStorage.getItem(chave) === antes && GabaDB.readConfig().key === key;
  return r;
}

function conferirEscolas(es) {
  if (es.parouAqui) return;
  check("o topo so oferece 'todas' e '(sem escola)' enquanto nenhuma turma tem escola",
    es.noInicio.opcoes.length === 2 && es.noInicio.opcoes[0].valor === "" &&
    /\(sem escola\) · 2 turmas$/.test(es.noInicio.opcoes[1].texto), es.noInicio);
  check("o botao da linha escreve a escola na turma do banco", es.peloBotao === ESCOLA_SERRA, es.peloBotao);
  check("o formulario leva a escola no insert da turma",
    es.payloadTurma && JSON.parse(es.payloadTurma).escola === "eefm   da serra (teste)", es.payloadTurma);
  check("o banco guarda a escola aparada, sem inventar grafia",
    es.escolaNoBanco === "eefm   da serra (teste)", es.escolaNoBanco);
  check("a escola digitada com outra caixa e outros espacos nao vira uma segunda escola",
    es.duasEscolas.datalist.length === 2 &&
    es.duasEscolas.datalist.indexOf(ESCOLA_SERRA) >= 0 && es.duasEscolas.datalist.indexOf(ESCOLA_ANHANGUERA) >= 0,
    es.duasEscolas.datalist);
  check("o filtro do topo conta as turmas de cada escola",
    es.duasEscolas.opcoes.length === 4 && es.duasEscolas.opcoes[1].valor === ESCOLA_SERRA &&
    /· 2 turmas$/.test(es.duasEscolas.opcoes[1].texto) &&
    /· 1 turma$/.test(es.duasEscolas.opcoes[3].texto) && es.duasEscolas.escondido === false,
    es.duasEscolas.opcoes);
  check("sem filtro cada linha mostra a propria escola",
    es.todasAsTurmas.escolaNaLinha.length === 4 && es.todasAsTurmas.turmas === "4" &&
    es.todasAsTurmas.escolaNaLinha.filter(function (s) { return /serra/i.test(s); }).length === 2,
    es.todasAsTurmas);
  check("o filtro deixa na tela so a escola escolhida",
    es.soSerra.linhas.length === 2 && es.soSerra.linhas.indexOf(es.procura.turmaSerra) >= 0 &&
    es.soSerra.linhas.indexOf(es.procura.turmaAnhanguera) < 0 && es.soSerra.turmas === "2",
    es.soSerra);
  check("o filtro escolhido fica neste aparelho", es.chaveGuardada === ESCOLA_SERRA, es.chaveGuardada);
  check("com o filtro ligado a linha nao repete a escola que ja esta na barra de cima",
    es.soSerra.escolaNaLinha.length === 0, es.soSerra.escolaNaLinha);
  check("o painel conta so a escola filtrada",
    es.soAnhanguera.turmas === "1" && es.soAnhanguera.alunos === "0", es.soAnhanguera);
  check("as pilhas do alívio seguem o filtro da escola",
    es.todasAsTurmas.pilhas.length === 4 && es.soSerra.pilhas.length === 2 &&
    es.soAnhanguera.pilhas.join("|") === es.soAnhanguera.linhas.join("|"),
    [es.todasAsTurmas.pilhas, es.soSerra.pilhas, es.soAnhanguera]);
  check("os seletores de turma so oferecem a escola filtrada",
    es.soAnhanguera.seletorAluno.join("|") === "Selecione a turma...|" + es.procura.turmaAnhanguera &&
    es.soAnhanguera.seletorAnalise.join("|") === "Todas as turmas|" + es.procura.turmaAnhanguera,
    es.soAnhanguera);
  check("(sem escola) mostra justamente as turmas ainda sem unidade",
    es.soSemEscola.linhas.join("|") === es.procura.turmaAnalise, es.soSemEscola);
  check("a ultima turma da escola filtrada muda de escola e o filtro se desliga sozinho",
    es.seDesligou.filtro === "" && es.seDesligou.linhas.length === 4 &&
    es.filtroDepois.guardado === null, [es.seDesligou, es.filtroDepois]);
  check("o caderno pega a escola da turma escolhida",
    es.herdouEscola === "eefm da serra (teste)", es.herdouEscola);
  check("a caixa digitada pelo professor nao e pisada por outra turma",
    es.manteveDigitado === "COLÉGIO DIGITADO À MÃO" &&
    es.digitadoSemTurmaComEscola === "COLÉGIO DIGITADO À MÃO",
    [es.manteveDigitado, es.digitadoSemTurmaComEscola]);
  check("a escola do caderno fica no aparelho com a marca de onde veio",
    es.cfgEscola === "COLÉGIO DIGITADO À MÃO" && es.cfgAuto === "eefm da serra (teste)",
    [es.cfgEscola, es.cfgAuto]);
}

var MARCAS = { turma: "1º M A (teste)", aluno1: "ANA DA SILVA", aluno2: "BIDU",
  alunoDuplicado: "ANA COPIA", novoNome: "1º M A (renomeada)", prova: "Bimestral teste UI" };

var CABECALHO_LISTA = "Nº\tNome do Estudante\tTipo de Prova\tMatrícula\tResponsável\tE-mail\tTelefone\r\n";
var LISTA = {
  nomeNovo: "ANA RENOMEADA PELA PLANILHA",
  tsv: CABECALHO_LISTA +
    "60\tANA DA CHAMADA\tTipo 4\t209900001\tRutélia Antunes\tRESPONSAVEL60@EXEMPLO.TEST\t(27) 90000-0060\r\n" +
    "61\tBIDU DO TESTE\tTipo 5\t209900002\tGenivaldo Rocha\tsem arroba\t27 9 90000-0061\r\n" +
    "60\tREPETIDO NA CHAMADA\t\t\t\t\t\r\n" +
    "TOTAL\t45 alunos\t\t\t\t\t\r\n",
  renomeado: CABECALHO_LISTA +
    "60\tANA RENOMEADA PELA PLANILHA\tTipo 4\t209900001\tRutélia Antunes\tresponsavel60@exemplo.test\t(27) 90000-0060\r\n" +
    "61\tBIDU DO TESTE\tTipo 5\t209900002\tGenivaldo Rocha\tbidu@exemplo.com\t27 9 90000-0061\r\n"
};

(async function principal() {
  var probe = await fetch(BASE + "/index.html").catch(function () { return null; });
  if (!probe || !probe.ok) {
    console.error("o servidor local nao respondeu em " + BASE + " - rode: node tests/serve.js");
    process.exit(2);
  }

  var chrome = await hud.abrirChrome(BASE + "/index.html");
  var c;
  try {
    c = hud.cliente(await hud.conectar("/index.html", chrome.porta));
    await c.espera("typeof GabaDB !== 'undefined' && typeof GabaApp !== 'undefined' && " +
      "/Sem conexão com o banco|Nenhuma/.test(document.getElementById('lista-turmas').textContent)", 60000);

    console.log("\n== sem credenciais ==");
    var inicio = await c.naPagina(vigiarErros, []);
    var h = await c.naPagina(montarHelpers, []);
    check("os auxiliares de página foram montados", h.helpers === 7, h);
    check("todos os modulos carregaram", inicio.modulosFaltando.length === 0, inicio.modulosFaltando);
    check("o selo diz que é só neste aparelho",
      inicio.badge === "Só neste aparelho" && /badge-off/.test(inicio.classe), inicio);
    check("a lista de turmas explica o motivo", /Sem conexão com o banco/.test(inicio.turmasVazias), inicio.turmasVazias);

    console.log("\n== a conexão que vem dentro do pacote ==");
    var pacote = await c.naPagina(function () {
      var guardado = {
        credencial: window.GabaCredencial,
        url: localStorage.getItem("gaba_supabase_url"),
        key: localStorage.getItem("gaba_supabase_key"),
        anon: localStorage.getItem("gaba_supabase_anon_key"),
        off: localStorage.getItem("gaba_supabase_desligada")
      };
      window.GabaCredencial = { url: "https://pacote.supabase.co", key: "chave-do-pacote" };
      var r = { comecou: GabaDB.readConfig() };
      /* o aparelho digitou nada: a dupla do pacote conecta sozinho, sem tela de credencial */
      r.limpa = GabaDB.usarCredencialDoPacote() === undefined && GabaDB.readConfig();
      r.configurado = GabaDB.isConfigured();
      /* digitou as duas caixas vazias: este aparelho para de subir, mas o pacote existe */
      GabaDB.saveConfig("", "");
      r.desligado = GabaDB.readConfig();
      r.saiDoPacote = GabaDB.temCredencialDoPacote();
      GabaDB.usarCredencialDoPacote();
      r.religado = GabaDB.readConfig();
      /* e o que o professor digita vale mais que o pacote */
      GabaDB.saveConfig("https://digitado.supabase.co", "chave-digitada");
      r.digitada = GabaDB.readConfig();
      ["gaba_supabase_url", "gaba_supabase_key", "gaba_supabase_anon_key", "gaba_supabase_desligada"]
        .forEach(function (k) { localStorage.removeItem(k); });
      window.GabaCredencial = guardado.credencial;
      return r;
    }, []);
    check("sem nada digitado o aparelho abre conectado pela dupla do pacote",
      pacote.limpa.url === "https://pacote.supabase.co" && pacote.limpa.key === "chave-do-pacote" &&
      pacote.limpa.doPacote === true && pacote.configurado === true, pacote);
    check("caixas vazias desligam a subida só neste aparelho, sem apagar a do pacote",
      pacote.desligado.url === "" && pacote.desligado.doPacote === false && pacote.saiDoPacote === true,
      pacote.desligado);
    check("o botao do pacote religa o aparelho",
      pacote.religado.url === "https://pacote.supabase.co" && pacote.religado.doPacote === true, pacote.religado);
    check("o que o professor digita tem prioridade sobre a dupla do pacote",
      pacote.digitada.url === "https://digitado.supabase.co" && pacote.digitada.doPacote === false,
      pacote.digitada);

    await c.naPagina(instalarFake, [{ url: "https://fake.local.supabase.co", key: "chave-falsa-para-teste" }]);
    await c.naPagina(function () { return GabaApp.carregarTudo().then(function () { return "carregado"; }); }, []);
    var semLogin = await c.naPagina(function () {
      return { badge: document.getElementById("status-conexao").textContent,
        classe: document.getElementById("status-conexao").className,
        turmas: document.getElementById("lista-turmas").textContent.trim().slice(0, 80) };
    }, []);
    check("com a conexão do pacote mas sem sessão o selo pede entrada",
      semLogin.badge === "Entrar" && /badge-off/.test(semLogin.classe) &&
      /Entre com o seu e-mail/.test(semLogin.turmas), semLogin);
    var cadSemLogin = await c.naPagina(sondarCaderno, []);
    check("o Caderno nao consulta turmas nem provas antes de entrar",
      cadSemLogin.pedidos.length === 0 && cadSemLogin.turmas === 0 && cadSemLogin.provasBanco === 0,
      cadSemLogin);

    /* o resto da tela fala com o banco, e o banco falso agora so atende logado:
       a conta de setup entra antes de qualquer cadastro */
    await c.naPagina(function (m) {
      window.__gaba.auth.usuarios.push({
        id: "aaaaaaaa-bbbb-4ccc-8ddd-00000000000f", email: m.email, senha: m.senha,
        nome: m.nome, criado: new Date().toISOString(), confirmado: true
      });
      return GabaDB.entrar(m.email, m.senha).then(function () {
        return GabaApp.carregarTudo().then(function () { return "dentro"; });
      });
    }, [{ email: "setup@example.test", senha: "gaba-setup-1", nome: "Setup (teste)" }]);
    var conectado = await c.naPagina(function () {
      var b = document.getElementById("status-conexao");
      return { badge: b.textContent, classe: b.className, rotulo: b.getAttribute("aria-label") };
    }, []);
    check("com credenciais e login o selo mostra o primeiro nome do professor",
      conectado.badge === "Setup" && /badge-on/.test(conectado.classe) &&
      conectado.rotulo === "Conectado como Setup (teste)", conectado);
    var cadLogado = await c.naPagina(sondarCaderno, []);
    check("depois de entrar o Caderno consulta turmas e provas normalmente",
      cadLogado.pedidos.indexOf("/rest/v1/turmas") >= 0 && cadLogado.pedidos.indexOf("/rest/v1/provas") >= 0,
      cadLogado);

    console.log("\n== turmas e alunos ==");
    var r = await c.naPagina(dirigirCadastros, [MARCAS]);
    check("o formulário criou a turma no banco", r.turma && r.turma.nome === MARCAS.turma, r.turma);
    check("a turma entrou no seletor de aluno",
      r.opcoesTurma && r.opcoesTurma.length === 2 && r.opcoesTurma[1].label === MARCAS.turma, r.opcoesTurma);
    check("a ANA apareceu na lista com o nº 7", r.aluno1 && String(r.aluno1.numero) === "7", r.aluno1);
    check("número repetido recebe o aviso em português",
      /Já existe um registro com esse número/.test(r.dupStatus || ""), r.dupStatus);
    check("o cadastro duplicado não chegou no banco", r.alunosDepoisDoDuplicado === 1, r.alunosDepoisDoDuplicado);
    check("o segundo aluno entrou", r.aluno2 && r.aluno2.nome === MARCAS.aluno2, r.aluno2);
    check("o details mostra os dois alunos", r.roster && r.roster.length === 2, r.roster);
    check("renomear gravou no banco", r.renomeada && r.renomeada.nome === MARCAS.novoNome, r.renomeada);
    check("apagar tirou justamente o aluno clicado",
      r.apagouAluno && String(r.apagouAluno.id) !== String(r.idApagado) && /apagado/.test(r.statusApagar || ""),
      [r.apagouAluno, r.idApagado, r.statusApagar]);

    console.log("\n== prova criada pelo formulário ==");
    check("os 12 campos de gabarito foram montados", r.selects === 12, r.selects);
    check("a prova foi para o banco", r.provaSalva && r.provaSalva.titulo === MARCAS.prova, r.provaSalva);
    check("o insert leva as 18 colunas da migração", r.provaCols.length === 18, r.provaCols);
    check("gabarito, pesos e questões alinhados por questão",
      r.provaPayload && r.provaPayload.gabarito.length === 12 && r.provaPayload.pesos.length === 12 &&
      r.provaPayload.questoes.length === 12 && r.provaPayload.questoes[4].gabarito === "E",
      r.provaPayload && [r.provaPayload.gabarito.join(""), r.provaPayload.questoes[4].gabarito]);
    check("os descritores saem vazios mas presentes", r.provaPayload &&
      r.provaPayload.descritores.length === 12 && r.provaPayload.descritores[0].habilidade_bncc === "",
      r.provaPayload && r.provaPayload.descritores[0]);
    check("a tela confirmou a prova salva", r.provaNaTela && /salva/.test(r.provaStatus), [r.provaNaTela, r.provaStatus]);
    check("o painel conta 1 turma, 1 aluno e 1 prova", r.painel.join("|") === "1|1|1|0", r.painel);
    check("a pilha da turma cobra a folha que ainda não foi lida",
      r.pilhas.length === 1 && r.pilhas[0].turma === (r.renomeada ? r.renomeada.nome : MARCAS.turma) &&
      /1 aluno · 0 folhas lidas/.test(r.pilhas[0].texto || "") &&
      r.pilhas[0].falta === "faltam 1" && r.pilhas[0].largura === "0%", r.pilhas);

    console.log("\n== prova vinda de .docx ==");
    var d = await c.naPagina(dirigirDocumento, [{ sampleUrl: BASE + "/_sample.docx" }]);
    check("o .docx virou prova neste aparelho", /^docx-/.test(d.idLocal || "") && d.questoes > 0, d);
    check("o editor abre com uma linha por questão do Word",
      d.linhasEditor === d.questoes, [d.linhasEditor, d.questoes]);
    check("a revisão lista os avisos do Word e o que falta no gabarito",
      d.avisosVisiveis === true && d.avisos.length === d.avisosEsperados, [d.avisos, d.avisosEsperados, d.problemas]);
    check("mudar o peso e o descritor entra na questão escolhida",
      Number(d.q1.peso) === 3 && d.q1.gabarito === "B" && /D4/.test(d.q1.descritor || "") &&
      d.q1.bncc === "EF03MA04", d.q1);
    check("a nota máxima acompanha os pesos editados",
      new RegExp((d.questoes + 2).toFixed(1).replace(".", ",") + " pontos").test(d.notaDepois || ""),
      [d.nota, d.notaDepois, d.questoes]);
    check("a questão revisada sai da marcação de problema", d.linha1Ruim === false, [d.q1, d.problemas]);
    check("a prova editada fica no aparelho sem precisar do banco",
      d.noDisco && Number(d.noDisco.peso) === 3 && /D4/.test(d.noDisco.descritor || ""), d.noDisco);
    check("fechar e reabrir a página devolve a prova com os pesos revisados",
      d.recarga && d.recarga.quantidade >= 1 && Number(d.recarga.peso) === 3 &&
      /D4/.test(d.recarga.descritor || "") && String(d.editorDepoisDaRecarga) === "3",
      [d.recarga, d.editorDepoisDaRecarga]);
    check("antes de salvar a linha se marca como do aparelho",
      d.antes && d.antes.soAparelho === 1 && /salvar no banco/i.test(d.antes.texto), d.antes);
    check("salvar no banco trocou o id local pelo uuid", d.eUuidDepois === true, d.idLocal);
    check("o peso, o gabarito e o descritor revisados chegaram ao banco",
      d.depois && Number((d.depois.pesos || [])[0]) === 3 && (d.depois.gabarito || [])[0] === "B" &&
      (d.depois.descritores || [])[0] && (d.depois.descritores[0] || {}).descritor === "D4 - resolução de problema" &&
      ((d.depois.questoes || [])[0] || {}).habilidade_bncc === "EF03MA04",
      d.depois && [d.depois.pesos, d.depois.gabarito, d.depois.descritores, (d.depois.questoes || [])[0]]);
    check("promovida ao banco, a cópia do aparelho é apagada em vez de duplicar a prova",
      d.copiaLocalDepoisDePromover === 0, d.copiaLocalDepoisDePromover);
    check("a prova apareceu uma única vez e sem a marca de aparelho",
      d.telas && d.telas.soAparelho === 0 && d.telas.linhas === d.antes.linhas, [d.antes, d.telas]);
    var vazou = await c.naPagina(sondarVazamento, [d.idLocal]);
    check("o id local do .docx nunca foi enviado ao banco", vazou.length === 0, [vazou, d.cadStatus, d.status]);

    console.log("\n== abrir a prova nas outras abas ==");
    var a = await c.naPagina(dirigirAbas, []);
    check("o botão cadernos troca para a aba Cadernos",
      a.abaAtiva.join() === "tab-caderno" && /Cadernos/.test(a.botaoAtivo), [a.abaAtiva, a.botaoAtivo]);
    check("com o caderno aberto o polegar continua aceso no Bastidor",
      /Bastidor/.test(a.grupoAtivo), a.grupoAtivo);
    check("a prova escolhida entrou no seletor de cadernos", a.cadProva === a.provaId, [a.cadProva, a.provaId]);
    check("o seletor de cadernos lista a prova do banco",
      (a.provasNoCaderno || []).some(function (t) { return /UIcrudprova|Bimestral teste/.test(t); }), a.provasNoCaderno);
    check("o botão 'ler folhas' troca para a aba Leitor", a.abaLeitor.join() === "tab-scanner", a.abaLeitor);
    check("a prova escolhida entrou no seletor do leitor", a.scanProva === a.provaId, [a.scanProva, a.provaId]);

    console.log("\n== revisar peso e descritor de uma prova do banco ==");
    var rv = await c.naPagina(dirigirRevisao, [{ idNoBanco: d.idNoBanco }]);
    check("a prova promovida abre o editor de questões na revisão",
      rv.editorAberto > 0 && rv.botaoEscondido === true, rv);
    check("editar acende o botão de salvar a revisão", rv.botaoApareceu === true, rv);
    check("a revisão volta ao banco com o peso e a habilidade BNCC novos",
      rv.pesoNoBanco === 5 && rv.bnccNoBanco === "EF07LP22" && rv.gabaritoNoBanco === rv.editorAberto, rv);
    check("depois de salvar o botão se apaga e a nota máxima é refeita",
      rv.botaoDepois === true && new RegExp((d.questoes + 6).toFixed(1).replace(".", ",") + " pontos")
        .test(rv.nota || "") && /salva|prova/.test(rv.status || ""),
      [rv.botaoDepois, rv.nota, rv.status, d.questoes]);

    console.log("\n== folha lida no aparelho subindo para o banco ==");
    var s = await c.naPagina(dirigirFila, [MARCAS]);
    check("a leitura nova apareceu com o selo 'aparelho'", s.comAparelho === 1, s);
    check("a linha mostra aluna, nota e acertos",
      /ANA DO TESTE/.test(s.linhaAntes || "") && /6,7/.test(s.linhaAntes || "") && /2\/3/.test(s.linhaAntes || ""),
      s.linhaAntes);
    check("o botão subiu a folha e esvaziou a fila",
      s.sincronizada && s.sincronizada.aluno_nome === "ANA DO TESTE" && s.filaRestante === 0, s);
    check("depois de subir, o selo 'aparelho' sumiu",
      s.aparelhoDepois === 0 && /ANA DO TESTE/.test(s.linhaDepois || ""), [s.aparelhoDepois, s.linhaDepois]);
    check("o painel passou a contar a correção",
      s.painelAntes === "1" && s.painelDepois === "1", [s.painelAntes, s.painelDepois]);
    check("a folha lida zera a pilha da turma",
      s.pilhaDepois.length === 1 && /1 aluno · 1 folha lida/.test(s.pilhaDepois[0].texto || "") &&
      s.pilhaDepois[0].falta === "pilha zerada" && s.pilhaDepois[0].largura === "100%", s.pilhaDepois);
    check("o QR da folha chegou inteiro ao banco",
      s.sincronizada && /^GABA1\|/.test(s.sincronizada.qr_payload || "") && s.sincronizada.acertos === 2 &&
      String(s.sincronizada.prova_id) === String(r.provaSalva.id), s.sincronizada);

    console.log("\n== análise de item e distratores na aba Notas ==");
    var an = await c.naPagina(dirigirAnalise, [{ idNoBanco: d.idNoBanco }]);
    var piorAcerto = an.esperado.reduce(function (m, e, k) {
      return e.acertos < an.esperado[m].acertos ? k : m;
    }, 0);
    var mediaEsperada = (an.notas.reduce(function (a, b) { return a + b; }, 0) / an.notas.length)
      .toFixed(2).replace(".", ",");
    check("as folhas embaralhadas chegaram com letras diferentes das da base", an.mudouLetra === true, an.tabela);
    check("a análise monta uma linha por questão da prova", an.tabela.length === an.total,
      [an.tabela.length, an.total, an.status]);
    check("acerto, gabarito e branco de cada questão batem com a conta feita à mão na ordem da base",
      an.tabela.every(function (l, k) {
        return l.acertos === an.esperado[k].acertos + "/" + an.notas.length &&
          l.gab === (an.gabaritoBase[k] || "—") && l.branco === String(an.esperado[k].branco);
      }), [an.tabela.slice(0, 3), an.esperado.slice(0, 3), an.gabaritoBase]);
    check("as marcas de cada distrator aparecem por letra",
      an.tabela.every(function (l, k) {
        var b = l.distr.filter(function (d) { return d.letra === "B"; })[0];
        return an.gabaritoBase[k] === "B" || (b && b.qtd === an.esperado[k].B);
      }), an.tabela.map(function (l, k) { return [l.q, l.distr, an.esperado[k]]; }));
    check("o texto da alternativa do Word chega no distrator",
      an.tabela.some(function (l) { return l.distr.some(function (d) { return d.titulo.length > 3; }); }),
      an.tabela[0] && an.tabela[0].distr);
    check("o distrator que vence o gabarito sai destacado",
      an.tabela.some(function (l, k) {
        return l.distr.some(function (d) { return d.forte && an.esperado[k].B > an.esperado[k].acertos; });
      }), an.tabela.map(function (l) { return [l.q, l.distr.filter(function (d) { return d.forte; })]; }));
    check("descritor e habilidade BNCC revisados aparecem na análise",
      /D4/.test(an.tabela[0].ped || "") && /EF07LP22/.test(an.tabela[2].ped || ""),
      [an.tabela[0].ped, an.tabela[2].ped]);
    check("com 8 folhas todas as questões recebem discriminação",
      an.tabela.every(function (l) { return l.disc !== "–"; }), an.tabela.map(function (l) { return l.disc; }));
    check("os cartões resumem folhas, média e questões",
      an.cartoes[0].valor === "8" && an.cartoes[0].rotulo === "Folhas lidas" &&
      an.cartoes[1].valor === mediaEsperada && an.cartoes[2].valor === String(an.total),
      [an.cartoes, mediaEsperada, an.notas]);
    check("a discriminação média é mostrada com vírgula decimal",
      /,/.test(an.cartoes[4].valor + an.cartoes[4].detalhe), an.cartoes[4]);
    check("a lista de avisos agrupa os itens por problema", an.avisos.length >= 1, an.avisos);
    check("as folhas que ainda só estão no aparelho entram na conta",
      /8 folhas /.test(an.status || "") && an.seloAparelho >= 8, [an.status, an.seloAparelho]);
    check("o seletor de provas não oferece de novo o que já virou banco",
      an.seletorProvas.join(" ").indexOf("neste aparelho") < 0 && an.seletorProvas.length === 3,
      an.seletorProvas);
    check("marcar 'só as questões a revisar' encurta a tabela",
      an.somenteRevisar > 0 && an.somenteRevisar < an.total && an.todasSinalizadas === true,
      [an.somenteRevisar, an.total, an.todasSinalizadas]);
    check("ordenar por 'menos acertos' põe a questão mais difícil primeiro",
      an.primeiraPorAcerto === String(piorAcerto + 1) &&
      an.primeiraCelula === an.esperado[piorAcerto].acertos + "/" + an.notas.length,
      [an.primeiraPorAcerto, piorAcerto + 1, an.primeiraCelula, an.esperado[piorAcerto].acertos]);
    check("filtrar por turma refaz a conta só com as folhas daquela turma",
      /2 folhas /.test(an.statusSoTurma || "") && an.cartoesSoTurma[0] === "2",
      [an.statusSoTurma, an.cartoesSoTurma]);
    check("o CSV traz uma linha por questão com as 17 colunas",
      an.csvLinhas === an.total + 1 && an.csvColunas === 17 &&
      /Distrator mais forte/.test(an.csvCabecalho) && /\d,\d/.test(an.csv),
      [an.csvLinhas, an.csvColunas, an.csvCabecalho, an.csv.split(/\r\n/)[1]]);
    check("o botão de baixar responde em português", /CSV da análise gerado/.test(an.statusCsv || ""), an.statusCsv);

    console.log("\n== importar a lista de chamada em lote ==");
    var li = await c.naPagina(dirigirLista, [Object.assign({
      turmaId: r.turma.id, xlsxUrl: BASE + "/_chamada.xlsx"
    }, LISTA)]);
    check("antes de ler a lista o botao de salvar esta travado",
      li.antesDeVer.salvarPreso === true && li.antesDeVer.linhas.length === 0, li.antesDeVer);
    check("o texto colado virou dois alunos na previa",
      li.ver.linhas.length === 2 && li.ver.linhas[0][1] === "ANA DA CHAMADA", li.ver.linhas);
    check("numero, tipo, matricula e telefone sairam nas colunas certas",
      li.ver.linhas[0][0] === "60" && li.ver.linhas[0][2] === "209900001" &&
      li.ver.linhas[0][3] === "4" && li.ver.linhas[0][6] === "(27) 90000-0060", li.ver.linhas[0]);
    check("o e-mail da planilha entrou em minusculo",
      li.ver.linhas[0][5] === "responsavel60@exemplo.test", li.ver.linhas[0]);
    check("a linha TOTAL foi contada como ignorada, nao como aluna",
      /1 linha ignorada/.test(li.ver.resumo) && !li.ver.linhas.some(function (l) { return /45 alunos/.test(l[1]); }),
      [li.ver.resumo, li.ver.linhas]);
    check("os dois avisos apareceram na previa",
      li.ver.problemas.some(function (p) { return /se repete/.test(p); }) &&
      li.ver.problemas.some(function (p) { return /inválido/.test(p); }),
      li.ver.problemas);
    check("sem turma o salvamento explica em vez de gravar", /Escolha a turma/.test(li.semTurma || ""), li.semTurma);
    check("a lista colada chegou ao banco com o numero da escola",
      li.dupAvisos && li.dupAvisos.length === 2 && Number(li.dupAvisos[0].numero) === 60 &&
      li.dupAvisos[0].email === "responsavel60@exemplo.test", li.dupAvisos);
    check("sem a coluna tipo o lote e recusado, tentado de novo e explicado",
      li.pedidosLote === 2 && li.dupAvisos && li.dupAvisos.length === 2 &&
      li.dupAvisos.every(function (a) { return a.temTipo === false; }) &&
      li.fallback.problemas.some(function (p) { return /coluna "tipo"/.test(p); }),
      [li.pedidosLote, li.dupAvisos, li.fallback.problemas]);
    check("reimportar a mesma lista corrige o aluno em vez de duplicar",
      li.quantidadeDepoisReimportar === li.antesReimportar && li.aluno60 &&
      li.aluno60.nome === LISTA.nomeNovo && Number(li.aluno60.tipo) === 4,
      [li.antesReimportar, li.quantidadeDepoisReimportar, li.aluno60]);
    check("o .xlsx da escola mostrou a aba certa com os 45 alunos",
      li.xlsx && li.xlsx.linhas.length === 45 && /Lan/.test(li.xlsx.resumo),
      li.xlsx && [li.xlsx.linhas.length, li.xlsx.resumo]);
    check("o tipo de caderno de cada aluno veio da planilha",
      li.xlsx.linhas[0][3] === "1" && li.xlsx.linhas[1][3] === "2" && li.xlsx.linhas[9][3] === "10",
      [li.xlsx.linhas[0], li.xlsx.linhas[9]]);
    check("os 45 alunos subiram em um so pedido de upsert",
      li.tamanhoLote === 45 && /on_conflict=turma_id(%2C|,)numero/.test((li.ultimoLote || {}).url || ""),
      [li.tamanhoLote, li.ultimoLote && li.ultimoLote.url]);
    check("o aluno 1 do banco e o da chamada, com o tipo 1",
      li.comChamada && Number(li.comChamada.tipo) === 1 &&
      li.xlsx.linhas.some(function (l) { return l.some(function (celula) { return mesmoTexto(celula, li.comChamada.nome); }); }),
      [Number(li.comChamada && li.comChamada.numero), Number(li.comChamada && li.comChamada.tipo), li.xlsx.linhas.length]);
    check("a turma ficou com 47 alunos e o painel mostrou isso",
      li.painel === "47" && /45 alunos salvos/.test(li.fim.status || ""), [li.painel, li.fim.status]);

    console.log("\n== turmas de escolas diferentes ==");
    var ESC = { renomeada: MARCAS.novoNome, turmaSerra: "Turma da Serra (teste)",
      turmaAnhanguera: "Turma do Anhanguera (teste)", turmaAnalise: "2º M B (teste)",
      idAnalise: an.outraTurmaId };
    var es = await c.naPagina(dirigirEscolas, [ESC]);
    check("as turmas novas de escola chegaram ao banco", !es.parouAqui, [es.parouAqui, es.turmasNoBanco]);
    conferirEscolas(es);

    console.log("\n== a escola nasce antes da turma ==");
    var ESCADA = { escolaNova: "EEEM DO CAMPO (teste)", turmaNova: "Turma do Campo (teste)",
      escolaFantasma: "EEEM FANTASMA (teste)", serra: ESCOLA_SERRA };
    var esc = await c.naPagina(dirigirEscada, [ESCADA]);
    var mesmaEscola = function (a, b) { return String(a).replace(/\s+/g, " ").trim().toUpperCase() ===
      String(b).replace(/\s+/g, " ").trim().toUpperCase(); };
    check("a escola criada aparece no cadastro mesmo sem turma nenhuma",
      esc.criada && mesmaEscola(esc.criada.nome, ESCADA.escolaNova) &&
      /ainda sem turma/.test(esc.criada.span.join(" ")) &&
      esc.criada.acoes.indexOf("apagar-escola") >= 0, esc.criada);
    check("criar a escola grava a linha no banco", esc.noBanco === 1, esc.noBanco);
    check("a escola sem turma entra no seletor do topo e no autocompletar",
      esc.topoDepois && esc.topoDepois.datalist.some(function (n) { return mesmaEscola(n, ESCADA.escolaNova); }) &&
      esc.topoDepois.opcoes.some(function (t) { return /DO CAMPO/.test(t) && /ainda sem turma/.test(t); }),
      esc.topoDepois);
    check("criar a escola ja liga o filtro nela",
      esc.filtroJa && mesmaEscola(esc.filtroJa, ESCADA.escolaNova), esc.filtroJa);
    check("o formulario de turma cai preenchido com a escola recem-criada",
      mesmaEscola(esc.escolaPreenchida, ESCADA.escolaNova), esc.escolaPreenchida);
    check("o nome chega aparado ao cadastro do aparelho",
      esc.registro && esc.registro.indexOf(ESCADA.escolaNova) >= 0, esc.registro);
    check("digitar o mesmo nome de outra caixa nao cria uma segunda escola",
      esc.cartoesDaEscola === 1 && esc.linhasDaEscola === 1 && /já está no cadastro/.test(esc.repetida || ""),
      [esc.cartoesDaEscola, esc.linhasDaEscola, esc.repetida]);
    check("a turma do degrau seguinte herda a escola que esta na tela",
      esc.turma && mesmaEscola(esc.turma.escola, ESCADA.escolaNova), [esc.turma, esc.turma && esc.turma.escola]);
    check("a escola sai de 'ainda sem turma' para uma turma na mesma tela",
      esc.cardComTurma && /1 turma/.test(esc.cardComTurma.span.join(" ")), esc.cardComTurma);
    check("'adicionar turma' em outra escola muda o filtro e o campo de escola",
      esc.serraAchada && esc.mudouPara && mesmaEscola(esc.campoEscola, ESCOLA_SERRA) &&
      !esc.mudouPara.escondido, [esc.campoEscola, esc.mudouPara]);
    check("a escola que so existe por causa de uma turma nao oferece 'tirar do cadastro'",
      esc.serraAchada && esc.serraAcoes.indexOf("turma-aqui") >= 0 &&
      esc.serraAcoes.indexOf("apagar-escola") < 0, esc.serraAcoes);
    check("o botao do cartao devolve a tela para todas as escolas",
      esc.verTodas && esc.verTodas.valor === "", esc.verTodas);
    check("tirar do cadastro apaga a linha do banco e o nome do aparelho",
      esc.fantasmaCriado && esc.fantasmaDepois && esc.fantasmaDepois.cards !== undefined &&
      esc.fantasmaDepois.filtro === "", [esc.fantasmaCriado, esc.fantasmaDepois]);
    check("a escola que ficou no banco volta para o cadastro do aparelho",
      esc.registroFinal && esc.registroFinal.indexOf(ESCADA.escolaNova) >= 0 &&
      !/FANTASMA/.test(esc.registroFinal), esc.registroFinal);

    console.log("\n== as turmas da escola chegam num arquivo so ==");
    var it = await c.naPagina(dirigirImportarTurmas, [{ escola: ESCADA.escolaNova, turmaExistente: ESCADA.turmaNova }]);
    check("o cartao da escola oferece 'Importar turmas'",
      it.cartaoAntes && it.cartaoAntes.acoes.indexOf("importar-turmas") >= 0, it.cartaoAntes);
    check("cada aba com alunos vira uma turma; a aba sem lista fica de fora com aviso",
      it.lido.aberto && it.lido.linhas.length === 2 && it.lido.linhas[0].nome === "6º A (teste)" &&
      it.lido.linhas[1].nome === ESCADA.turmaNova &&
      it.lido.avisos.some(function (a) { return /"Resumo" não tem lista de alunos/.test(a); }), it.lido);
    check("o painel diz para qual escola vai, quantos alunos e o ano de hoje",
      /DO CAMPO/.test(it.lido.titulo) && /2 turmas/.test(it.lido.resumo) && /4 alunos/.test(it.lido.resumo) &&
      it.lido.ano === String(new Date().getFullYear()) && it.lido.comAlunos, it.lido);
    check("o transferido fica de fora e o painel conta",
      it.lido.linhas[0].alunos === "2" &&
      it.lido.avisos.some(function (a) { return /1 aluno marcado como transferido/.test(a); }), it.lido);
    check("a turma que ja existe na escola vem marcada, a outra como nova",
      it.lido.linhas[0].selo === "nova" && it.lido.linhas[1].selo === "já existe", it.lido.linhas);
    check("ler o arquivo nao grava nada antes do professor salvar", it.bancoAntesDeSalvar === 0, it.bancoAntesDeSalvar);
    check("desmarcar todas desliga o botao, marcar de novo conta as turmas",
      it.nenhuma.desligado && /Marque/.test(it.nenhuma.texto) && !it.todasDeNovo.desligado &&
      it.todasDeNovo.texto === "Salvar 2 turmas", [it.nenhuma, it.todasDeNovo]);
    check("dois nomes iguais depois de editar sao barrados antes de ir ao banco",
      /Duas turmas ficaram com o nome/.test(it.nomeRepetido) && it.seloRenomeado === "nova", [it.nomeRepetido, it.seloRenomeado]);
    check("a turma nova nasce na escola, com o nome corrigido e o ano",
      it.nova.length === 1 && mesmaEscola(it.nova[0].escola, ESCADA.escolaNova) &&
      it.nova[0].ano === String(new Date().getFullYear()), it.nova);
    check("os alunos entram na turma nova, sem o transferido",
      it.alunosDaNova.join("|") === "1:ALFA BRAVO TESTE|3:ECO FOXTROT TESTE", it.alunosDaNova);
    check("a turma que ja existia nao duplica e recebe os alunos",
      it.existentes === 1 && it.alunosDaExistente.join("|") === "1:GOLF HOTEL TESTE|2:INDIA JULIETT TESTE",
      [it.existentes, it.alunosDaExistente]);
    check("o resumo conta a nova, a que ja existia e os alunos salvos",
      /1 turma nova, 1 já existia/.test(it.salvo.resumo) && /4 alunos salvos/.test(it.salvo.resumo), it.salvo);
    check("o cartao passa a 2 turmas e o topo fica na escola",
      it.cartaoDepois && /2 turmas/.test(it.cartaoDepois.texto) && mesmaEscola(it.filtro, ESCADA.escolaNova),
      [it.cartaoDepois, it.filtro]);
    check("Fechar some com o painel", it.fechado === false, it.fechado);
    check("arquivo sem turmas explica o formato e oferece outro arquivo",
      it.vazio.outro && /uma aba por turma/.test(it.vazio.status), it.vazio);
    check("trocar escola ou arquivo durante a leitura nao mistura duas importacoes",
      it.leituraBloqueada && /DO CAMPO/.test(it.leituraOriginal.titulo) &&
      it.leituraOriginal.linhas[0].nome === "Leitura original (teste)", [it.leituraBloqueada, it.leituraOriginal]);
    check("salvar trava os campos e impede outra importacao simultanea",
      it.camposTravados && it.salvamentoBloqueado, [it.camposTravados, it.salvamentoBloqueado]);
    check("falha parcial preserva o ano e a escolha de nao trazer alunos",
      it.retryEscolhas.ano === "2027" && !it.retryEscolhas.comAlunos, it.retryEscolhas);
    check("retry sem recarga bem-sucedida nao duplica turmas nem importa alunos desmarcados",
      it.retryTurmas.length === 2 && it.retryTurmas.every(function (t) {
        return t.ano === "2027" && mesmaEscola(t.escola, ESCADA.escolaNova);
      }) && it.retryLotes === 0, [it.retryTurmas, it.retryLotes]);
    check("falha no lote de alunos depois de criar a turma reaproveita o id no retry",
      it.retryDepoisDeCriar.quantidade === 1 && it.retryDepoisDeCriar.alunos.join("|") === "1:ALFA RETRY TESTE",
      it.retryDepoisDeCriar);

    console.log("\n== o professor entra com e-mail e senha ==");
    var LG = { nome: "Profa. Ana (teste)", email: "ana.teste@example.test", senha: "gaba-teste-1",
      url: "https://fake.local.supabase.co", key: "chave-falsa-para-teste" };
    var lg = await c.naPagina(dirigirLogin, [LG]);
    check("com a conexao guardada a aba nao pede url e chave de novo",
      lg.telaInicial.conexaoAberta === false && lg.telaInicial.guardadoVisivel &&
      lg.telaInicial.trocarVisivel && lg.telaInicial.loginVisivel, lg.telaInicial);
    check("o endereco salvo aparece escrito na aba",
      /fake\.local\.supabase\.co/.test(lg.telaInicial.guardadoTexto || ""), lg.telaInicial.guardadoTexto);
    check("senha errada vira frase de professor, nao de programador",
      /E-mail ou senha não batem/.test(lg.negado || "") && lg.negadoLogado === false,
      [lg.negado, lg.negadoLogado]);
    check("o botao abre o formulario de conta nova", lg.contaAberta === true, lg.contaAberta);
    check("criar a conta ja deixa o professor dentro",
      lg.criada && lg.criada.logado && /Ana \(teste\)/.test(lg.criada.nome || "") &&
      lg.criada.email === LG.email, lg.criada);
    check("a linha do professor chega ao banco pelo e-mail",
      (lg.professorNoBanco || []).some(function (p) { return p.indexOf(LG.email) >= 0; }), lg.professorNoBanco);
    check("o aparelho lembra quem esta dentro",
      lg.guardadoNoAparelho.email === LG.email && /Ana/.test(lg.guardadoNoAparelho.nome || ""),
      lg.guardadoNoAparelho);
    check("o login do professor sumiu com o formulario de entrar",
      lg.depoisDeEntrar && lg.depoisDeEntrar.loginVisivel === false &&
      lg.depoisDeEntrar.criarVisivel === false, lg.depoisDeEntrar);
    check("a sessao fica no aparelho e sobrevive a um cliente desmontado",
      lg.tokensNoStorage >= 1 && lg.acordouLogado && lg.acordouLogado.email === LG.email,
      [lg.tokensNoStorage, lg.acordouLogado]);
    check("pedir para trocar a conexao reabre os dois campos",
      lg.conexaoAbertaAoPedir === true, lg.conexaoAbertaAoPedir);
    check("salvar a conexao fecha a caixa e mantem o professor dentro",
      lg.conexaoFecha && lg.conexaoFecha.conexaoAberta === false && lg.conexaoFecha.logado === true,
      lg.conexaoFecha);
    check("sair tira o professor mas deixa a conexao do banco",
      lg.saiu && lg.saiu.logado === false && lg.saiu.loginVisivel === true &&
      lg.saiu.guardadoVisivel === true && lg.saiu.conexaoAberta === false, lg.saiu);
    check("sem login o selo pede entrada, nao diz que esta conectado",
      lg.telaInicial.badge === "Entrar" && lg.saiu && lg.saiu.badge === "Entrar",
      [lg.telaInicial.badge, lg.saiu && lg.saiu.badge]);
    check("entrar devolve o selo de conectado, com o nome",
      lg.depoisDeEntrar && lg.depoisDeEntrar.badge === "Ana", lg.depoisDeEntrar);

    console.log("\n== o selo do topo abre o login ali mesmo ==");
    var sl = await c.naPagina(dirigirSelo, [LG]);
    check("o selo e um botao", sl.tag === "BUTTON", sl.tag);
    check("tocar no selo abre a janelinha com e-mail e senha, cursor no e-mail",
      sl.aberto.aberto && sl.aberto.expandido === "true" && sl.aberto.login && !sl.aberto.dentro &&
      !sl.aberto.semBanco && sl.aberto.foco === "selo-email", sl.aberto);
    check("tocar fora fecha a janelinha", !sl.foraFecha.aberto && sl.foraFecha.expandido === "false", sl.foraFecha);
    check("Esc fecha a janelinha", !sl.escFecha.aberto, sl.escFecha);
    check("senha errada aparece dentro da janelinha, que continua aberta",
      /E-mail ou senha não batem/.test(sl.negado.erro) && sl.negado.aberto && !sl.negado.logado, sl.negado);
    check("entrar pela janelinha deixa o professor dentro e fecha a janelinha",
      sl.entrou.logado && !sl.entrou.aberto && sl.entrou.badge === "Ana", sl.entrou);
    check("dentro, a janelinha mostra quem e e o botao Sair",
      sl.abertoDentro.dentro && !sl.abertoDentro.login && /Ana \(teste\)/.test(sl.abertoDentro.nome) &&
      sl.abertoDentro.email === LG.email, sl.abertoDentro);
    check("Sair pela janelinha volta o selo para Entrar",
      !sl.saiu.logado && sl.saiu.badge === "Entrar" && !sl.saiu.aberto, sl.saiu);
    check("sem banco no aparelho a janelinha manda para Ajustes em vez de pedir senha",
      sl.semBanco.semBanco && !sl.semBanco.login && sl.semBanco.badge === "Só neste aparelho" &&
      sl.foiAjustes.aba && !sl.foiAjustes.aberto, [sl.semBanco, sl.foiAjustes]);
    check("a conexao volta e o selo pede entrada de novo", sl.final.badge === "Entrar", sl.final);
    var cadSaiu = await c.naPagina(sondarCaderno, []);
    check("depois de sair o Caderno nao consulta o banco nem mantem suas listas",
      cadSaiu.pedidos.length === 0 && cadSaiu.turmas === 0 && cadSaiu.provasBanco === 0, cadSaiu);
    check("sair nao remove as provas locais do Caderno",
      JSON.stringify(cadSaiu.locaisAntes) === JSON.stringify(cadSaiu.locaisDepois), cadSaiu);

    console.log("\n== o endereco colado do painel vira so a raiz do projeto ==");
    var en = await c.naPagina(enderecosColados, []);
    check("com /rest/v1 no fim, o app guarda so a raiz",
      en.restV1 === "https://abcdefgh.supabase.co", en);
    check("sem https:// na frente, o app completa", en.semEsquema === "https://abcdefgh.supabase.co", en);
    check("um endereco que ja estava errado no aparelho se conserta ao ler",
      en.jaGuardado === "https://abcdefgh.supabase.co", en);
    check("a conexao de teste volta intacta", en.devolvida, en);

    console.log("\n== nada quebrou nem ficou para trás ==");
    console.log("\n== dicas com mouse, teclado e toque ==");
    var dc = await c.naPagina(dirigirDicas, []);
    check("o balao carrega com semantica de tooltip e sem title duplicado", dc.carregou && dc.semNativo, dc);
    check("mouse espera antes de mostrar a explicacao da aba",
      dc.naoImediato && dc.mouse.titulo === "Central de alívio" && /folhas/.test(dc.mouse.texto), dc.mouse);
    check("aria-describedby preserva a descricao anterior e limpa so a dica",
      dc.mouse.descricao === "app-status gaba-dica" && dc.saiu, [dc.mouse.descricao, dc.saiu]);
    check("teclado mostra a dica e Esc fecha", dc.teclado && dc.esc, [dc.teclado, dc.esc]);
    check("segurar o toque explica sem mudar de aba nem abrir o menu do Android",
      dc.segurar.abriu && dc.semMenu && dc.semCliqueLongo, [dc.segurar, dc.semMenu, dc.semCliqueLongo]);
    check("o proximo toque fecha a dica, e um toque curto ainda abre a aba",
      dc.proximoFecha && dc.toqueCurto, [dc.proximoFecha, dc.toqueCurto]);
    check("arrastar ou cancelar o toque nao abre dica atrasada", dc.arrastar && dc.cancelar, dc);
    check("os segmentos da Analise e botoes dinamicos recebem dicas",
      dc.segmento === "Por descritor" && dc.dinamico === "Importar turmas", [dc.segmento, dc.dinamico]);
    check("rolar e imprimir fecham a dica; manter o mouse permite ler sem prazo",
      dc.rolar && dc.imprimir && dc.permanece, dc);

    await c.chama("Emulation.setDeviceMetricsOverride", { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
    await c.chama("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    var toqueDica = await c.naPagina(function () {
      window.switchTab("dashboard");
      window.scrollTo(0, 0);
      var b = document.querySelector('.tabs-polegar [data-tab="scanner"]').getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, []);
    await c.chama("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [toqueDica] });
    await hud.sleep(650);
    await c.chama("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    var longoReal = await c.naPagina(function () {
      var b = document.getElementById("gaba-dica"), r = b.getBoundingClientRect();
      return !b.hidden && document.getElementById("tab-dashboard").classList.contains("active") &&
        r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    }, []);
    check("gesto real do Chrome mostra a dica sem mudar de aba e cabe em 390px", longoReal, longoReal);
    await c.chama("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [toqueDica] });
    await c.chama("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    var curtoReal = await c.naPagina(function () {
      return document.getElementById("tab-scanner").classList.contains("active") && document.getElementById("gaba-dica").hidden;
    }, []);
    check("toque curto real continua abrindo a aba", curtoReal, curtoReal);
    await c.chama("Emulation.setTouchEmulationEnabled", { enabled: false });
    await c.chama("Emulation.setDeviceMetricsOverride", { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
    await c.naPagina(function () {
      return new Promise(function (res) { requestAnimationFrame(function () { requestAnimationFrame(function () { res(true); }); }); });
    }, []);
    var mouseDica = await c.naPagina(function () {
      var r = document.querySelector('.tabs-polegar [data-tab="relatorios"]').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, []);
    await c.chama("Input.dispatchMouseEvent", { type: "mouseMoved", x: mouseDica.x, y: mouseDica.y });
    await c.espera("!document.getElementById('gaba-dica').hidden", 3000);
    var centroBalao = await c.naPagina(function () {
      var r = document.getElementById("gaba-dica").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, []);
    await c.chama("Input.dispatchMouseEvent", { type: "mouseMoved", x: centroBalao.x, y: centroBalao.y });
    await hud.sleep(400);
    var podeLer = await c.naPagina(function () { return !document.getElementById("gaba-dica").hidden; }, []);
    check("mover o mouse para dentro do balao mantem a explicacao visivel", podeLer, [mouseDica, centroBalao]);
    await c.chama("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await c.chama("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });

    var e = await c.naPagina(colherErros, []);
    check("nenhum erro de javascript na página", e.erros.length === 0, e.erros);
    check("exatamente uma aba aberta", e.abasAtivas === 1, e.abasAtivas);
    var limpo = await c.naPagina(apagarLeituraDeTeste, [[s.id].concat(an.ids || [])]);
    check("a leitura de teste não deixou rastro no aparelho",
      limpo.leituras === 0 && limpo.fila === 0, limpo);
    var fim = await c.naPagina(restaurar, []);
    check("credenciais e fetch voltam exatamente ao que eram",
      fim.configurado === false && (fim.url === null || fim.url === "") &&
      (fim.key === null || fim.key === "") && fim.escolaFiltro === null && fim.stubRestante === false, fim);
    console.log("\n  banco falso ao encerrar: " + fim.podas.join(" ") + " (" + fim.reqs + " pedidos)");
  } catch (err) {
    check("a página não lançou erro", false, String(err && err.stack ? err.stack : err));
  } finally {
    await hud.fecharChrome(chrome);
  }

  console.log(falhas ? "\n" + falhas + " check(s) falharam." : "\ntela, cadastros e sincronia pela UI: tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch(function (err) {
  console.error("erro no harness: " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
