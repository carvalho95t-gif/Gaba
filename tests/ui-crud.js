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
  var CHAVES = ["gaba_supabase_url", "gaba_supabase_key", "gaba_supabase_anon_key"];
  var antes = {};
  CHAVES.forEach(function (k) { antes[k] = localStorage.getItem(k); });
  var estado = { antes: antes, fetchOriginal: window.fetch, mb: { turmas: [], alunos: [], provas: [], correcoes: [] }, reqs: [], seq: 0 };
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
  return { helpers: ["espera", "texto", "preenche", "envia", "botaoDe", "previaDe"]
    .filter(function (n) { return window[n]; }).length };
}

async function dirigirCadastros(marcas) {
  var r = {};
  window.confirm = function () { return true; };
  window.prompt = function () { return marcas.novoNome; };

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

    botaoDe("#lista-turmas", "renomear-turma").click();
    r.renomeada = await espera(function () {
      var t = window.__gaba.mb.turmas[0];
      return t && t.nome === marcas.novoNome ? { nome: t.nome, id: t.id } : null;
    }, 6000).catch(function () { return null; });

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
  r.cadStatus = texto("cad-status");

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
  r.status = texto("cad-status");
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
  r.botaoAtivo = (document.querySelector(".tab-btn.active") || {}).textContent || "";
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
      seletorAluno: [].slice.call(document.querySelectorAll("#aluno-turma-select option"))
        .map(function (o) { return o.textContent.replace(/\s+/g, " ").trim(); }),
      seletorAnalise: [].slice.call(document.querySelectorAll("#ana-turma option"))
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

  var sel = document.getElementById("ana-prova");
  sel.value = String(prova.id);
  sel.dispatchEvent(new Event("change", { bubbles: true }));

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
  r.seletorProvas = [].slice.call(document.querySelectorAll("#ana-prova option"))
    .map(function (o) { return o.textContent.replace(/\s+/g, " ").trim(); });
  r.seletorTurmas = [].slice.call(document.querySelectorAll("#ana-turma option"))
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

  var selTurma = document.getElementById("ana-turma");
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

function conferirEscolas(es) {
  if (es.parouAqui) return;
  check("o topo so oferece 'todas' e '(sem escola)' enquanto nenhuma turma tem escola",
    es.noInicio.opcoes.length === 2 && es.noInicio.opcoes[0].valor === "" &&
    /\(sem escola\) · 2 turma\(s\)$/.test(es.noInicio.opcoes[1].texto), es.noInicio);
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
    /· 2 turma\(s\)/.test(es.duasEscolas.opcoes[1].texto) &&
    /· 1 turma\(s\)/.test(es.duasEscolas.opcoes[3].texto) && es.duasEscolas.escondido === false,
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
  check("os seletores de turma so oferecem a escola filtrada",
    es.soAnhanguera.seletorAluno.join("|") === "Selecione a Turma...|" + es.procura.turmaAnhanguera &&
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
      "/credenciais|Nenhuma/.test(document.getElementById('lista-turmas').textContent)", 60000);

    console.log("\n== sem credenciais ==");
    var inicio = await c.naPagina(vigiarErros, []);
    var h = await c.naPagina(montarHelpers, []);
    check("os auxiliares de página foram montados", h.helpers === 6, h);
    check("todos os modulos carregaram", inicio.modulosFaltando.length === 0, inicio.modulosFaltando);
    check("o selo diz que é só neste aparelho",
      inicio.badge === "Só neste aparelho" && /badge-off/.test(inicio.classe), inicio);
    check("a lista de turmas explica o motivo", /Sem credenciais/.test(inicio.turmasVazias), inicio.turmasVazias);

    await c.naPagina(instalarFake, [{ url: "https://fake.local.supabase.co", key: "chave-falsa-para-teste" }]);
    await c.naPagina(function () { return GabaApp.carregarTudo().then(function () { return "carregado"; }); }, []);
    var conectado = await c.naPagina(function () {
      return { badge: document.getElementById("status-conexao").textContent,
        classe: document.getElementById("status-conexao").className };
    }, []);
    check("com credenciais o selo vira Conectado",
      conectado.badge === "Supabase Conectado" && /badge-on/.test(conectado.classe), conectado);

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
      d.antes && d.antes.soAparelho === 1 && /salvar no banco/.test(d.antes.texto), d.antes);
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
    check("a prova escolhida entrou no seletor de cadernos", a.cadProva === a.provaId, [a.cadProva, a.provaId]);
    check("o seletor de cadernos lista a prova do banco",
      (a.provasNoCaderno || []).some(function (t) { return /UIcrudprova|Bimestral teste/.test(t); }), a.provasNoCaderno);
    check("o botão 'ler folhas' troca para a aba Leitor", a.abaLeitor.join() === "tab-scanner", a.abaLeitor);
    check("a prova escolhida entrou no seletor do leitor", a.scanProva === a.provaId, [a.scanProva, a.provaId]);

    console.log("\n== revisar peso e descritor de uma prova do banco ==");
    var rv = await c.naPagina(dirigirRevisao, [{ idNoBanco: d.idNoBanco }]);
    check("a prova promovida abre o editor de questões na aba Cadernos",
      rv.editorAberto > 0 && rv.botaoEscondido === true, rv);
    check("editar acende o botão de salvar a revisão", rv.botaoApareceu === true, rv);
    check("a revisão volta ao banco com o peso e a habilidade BNCC novos",
      rv.pesoNoBanco === 5 && rv.bnccNoBanco === "EF07LP22" && rv.gabaritoNoBanco === rv.editorAberto, rv);
    check("depois de salvar o botão se apaga e a nota máxima é refeita",
      rv.botaoDepois === true && new RegExp((d.questoes + 6).toFixed(1).replace(".", ",") + " pontos")
        .test(rv.nota || "") && /salva no banco/.test(rv.status || ""),
      [rv.botaoDepois, rv.nota, rv.status, d.questoes]);

    console.log("\n== folha lida no aparelho subindo para o banco ==");
    var s = await c.naPagina(dirigirFila, [MARCAS]);
    check("a leitura nova apareceu com o selo 'aparelho'", s.comAparelho === 1, s);
    check("a linha mostra aluna, nota e acertos",
      /ANA DO TESTE/.test(s.linhaAntes || "") && /6\.7/.test(s.linhaAntes || "") && /2\/3/.test(s.linhaAntes || ""),
      s.linhaAntes);
    check("o botão subiu a folha e esvaziou a fila",
      s.sincronizada && s.sincronizada.aluno_nome === "ANA DO TESTE" && s.filaRestante === 0, s);
    check("depois de subir, o selo 'aparelho' sumiu",
      s.aparelhoDepois === 0 && /ANA DO TESTE/.test(s.linhaDepois || ""), [s.aparelhoDepois, s.linhaDepois]);
    check("o painel passou a contar a correção",
      s.painelAntes === "1" && s.painelDepois === "1", [s.painelAntes, s.painelDepois]);
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
      /8 folha\(s\)/.test(an.status || "") && an.seloAparelho >= 8, [an.status, an.seloAparelho]);
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
      /2 folha\(s\)/.test(an.statusSoTurma || "") && an.cartoesSoTurma[0] === "2",
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
      /1 linha\(s\) ignoradas/.test(li.ver.resumo) && !li.ver.linhas.some(function (l) { return /45 alunos/.test(l[1]); }),
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
      li.painel === "47" && /45 aluno\(s\) salvos/.test(li.fim.status || ""), [li.painel, li.fim.status]);

    console.log("\n== turmas de escolas diferentes ==");
    var ESC = { renomeada: MARCAS.novoNome, turmaSerra: "Turma da Serra (teste)",
      turmaAnhanguera: "Turma do Anhanguera (teste)", turmaAnalise: "2º M B (teste)",
      idAnalise: an.outraTurmaId };
    var es = await c.naPagina(dirigirEscolas, [ESC]);
    check("as turmas novas de escola chegaram ao banco", !es.parouAqui, [es.parouAqui, es.turmasNoBanco]);
    conferirEscolas(es);

    console.log("\n== nada quebrou nem ficou para trás ==");
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
