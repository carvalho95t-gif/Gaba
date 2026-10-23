/* Gaba — scanner contínuo: câmera -> omrWorker -> versão -> nota, sem botões no meio do lote */
/* global GabaVersoes, GabaQR, GabaDB, GabaSync */
(function (global) {
  "use strict";

  var LARGURA_FRAME = 1280;
  var FPS_ALVO = 8;
  var LEITURAS_IGUAIS = 2;
  var PAUSA_APOS_LER = 1800;

  var estado = {
    provas: [],
    worker: null,
    engine: "parado",
    stream: null,
    rodando: false,
    pendente: false,
    requestId: 0,
    ultimaChave: null,
    repetidas: 0,
    lidaHaPouco: 0,
    lidos: {},
    resultados: [],
    versoes: {},
    porAluno: {},
    recipe: null,
    fonte: "",
    turmaId: null,
    prova: null,
    alunos: [],
    sensibilidade: 1,
    totalQuestoes: 10,
    alternativas: 5,
    fps: 0,
    audio: null
  };

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function status(msg, classe) {
    var el = $("scan-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "cad-status" + (classe ? " " + classe : "");
  }

  function opcoesProva() {
    var sel = $("scan-prova");
    var id = sel && sel.value;
    var lista = estado.provas || [];
    for (var i = 0; i < lista.length; i++) {
      if (String(lista[i].id) === id) return lista[i];
    }
    return lista[0] || null;
  }

  function indexar(itens, receita, fonte) {
    var QR = global.GabaQR;
    var porCodigo = {};
    var porAluno = {};
    (itens || []).forEach(function (it) {
      if (!it || !it.versao) return;
      porCodigo[it.versao.codigo] = it.versao;
      var ref = QR.idAluno(it.aluno);
      if (ref) porAluno[ref] = it;
    });
    estado.versoes = porCodigo;
    estado.porAluno = porAluno;
    estado.recipe = receita;
    estado.fonte = fonte;
  }

  function montarIndice() {
    var prova = estado.prova;
    if (!prova) return Promise.resolve();
    var V = global.GabaVersoes;
    var C = global.GabaCaderno;
    var lote = C && C.loteImpresso ? C.loteImpresso(prova.id) : null;
    if (lote) {
      if ((prova.questoes || []).length !== (lote.questoes || []).length) {
        estado.prova = prova = C.provaDoLote();
      }
      estado.alunos = lote.itens.map(function (it) { return it.aluno; });
      estado.totalQuestoes = lote.totalQuestoes || (lote.questoes || []).length;
      estado.alternativas = lote.alternativas || 5;
      indexar(lote.itens, {
        modo: lote.modo, numTipos: lote.numTipos, turma_id: lote.turma_id || null,
        salt: lote.salt || undefined, embaralharAlternativas: !!lote.embaralharAlternativas
      }, "lote impresso em " + String(lote.em || "").slice(0, 10));
      return Promise.resolve();
    }
    var op = C && C.opcoes ? C.opcoes() : {};
    var modo = op.modo || prova.modo || "fixa";
    var numTipos = Math.max(1, op.numTipos || prova.num_tipos || 1);
    var turmaId = estado.turmaId || prova.turma_id || null;
    var receita = {
      modo: modo, numTipos: numTipos, turma_id: turmaId,
      salt: op.salt || prova.salt || undefined,
      embaralharAlternativas: op.embaralharAlternativas !== undefined
        ? !!op.embaralharAlternativas : prova.embaralhar_alternativas !== false
    };
    if (!(prova.questoes || []).length && global.GabaDB && GabaDB.isConfigured() && GabaDB.listProvaVersoes) {
      /* outro aparelho imprimiu esta prova: as versoes vindas do banco tem a chave de cada aluno */
      return GabaDB.listProvaVersoes(prova.id).then(function (itens) {
        if (!itens || !itens.length) {
          indexar([], receita, "prova do banco sem versoes impressas");
          return;
        }
        estado.alunos = itens.map(function (it) { return it.aluno; });
        estado.totalQuestoes = (itens[0].versao && itens[0].versao.total) || (prova.quantidade_questoes || 0);
        estado.alternativas = prova.alternativas || 5;
        indexar(itens, {
          modo: prova.modo || modo, numTipos: prova.num_tipos || numTipos,
          turma_id: prova.turma_id || turmaId, salt: prova.salt || undefined,
          embaralharAlternativas: prova.embaralhar_alternativas !== false
        }, "versoes do banco (lote " + String(itens[0].lote_id || "?") + ")");
      }).catch(function (err) {
        status("Nao deu para ler as versoes do banco: " + (err && err.message ? err.message : err), "erro");
        indexar([], receita, "banco indisponivel");
      });
    }
    var batch = V.batch(prova, estado.alunos, {
      modo: modo,
      numTipos: numTipos,
      prova_id: prova.id,
      turma_id: turmaId,
      salt: receita.salt,
      embaralharAlternativas: receita.embaralharAlternativas
    });
    estado.totalQuestoes = (prova.questoes || []).length || prova.quantidade_questoes || 0;
    estado.alternativas = ((prova.questoes || [])[0] || {}).alternativas
      ? ((prova.questoes || [])[0].alternativas || []).length : (prova.alternativas || 5);
    indexar(batch.itens, receita, "reconstruido das configuracoes da aba Caderno");
    return Promise.resolve();
  }

  function beep(freq, ms) {
    if (!(($("scan-beep") || {}).checked)) return;
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      estado.audio = estado.audio || new Ctx();
      var ctx = estado.audio;
      if (ctx.state === "suspended") ctx.resume();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + ms / 1000 + 0.02);
    } catch (err) {
      /* som e feedback, nao essencial */
    }
  }

  function worker() {
    if (estado.worker) return estado.worker;
    var w = new Worker("js/omrWorker.js");
    w.onmessage = function (event) {
      var msg = event.data || {};
      if (msg.type === "ready") {
        estado.engine = msg.engine;
        status("Motor " + msg.engine + " pronto. Aponte a folha e nao precisa apertar nada.");
      } else if (msg.type === "pong") {
        status("Motor: opencv=" + (msg.cvReady ? "ok" : "carregando") + ", layout=" + (msg.layout ? "ok" : "faltando") +
          ", qr=" + (msg.qr ? "ok" : "faltando"));
      } else if (msg.type === "engine-error") {
        status("Erro no motor OMR: " + msg.error, "erro");
      } else if (msg.type === "result") {
        estado.pendente = false;
        if (msg.requestId === estado.requestId) tratar(msg);
      }
    };
    w.onerror = function (e) {
      estado.pendente = false;
      status("Falha no worker: " + (e && e.message ? e.message : "erro"), "erro");
    };
    estado.worker = w;
    w.postMessage({ type: "ping" });
    return w;
  }

  function chaveDo(result) {
    var qr = result.qr_texto || "";
    return qr + "#" + (result.answers || []).join("");
  }

  function tratar(result) {
    var agora = Date.now();
    desenharOverlay(result.corners);
    var alvo = $("scan-alvo");
    if (alvo) alvo.textContent = (result.totalLidas || 0) + " bolhas, corte " +
      Math.round((result.corte || 0) * 100) + "%";

    if (!result.ok || !result.qr || !result.qr.ok) {
      estado.repetidas = 0;
      estado.ultimaChave = null;
      if (!result.ok) status(result.message || "Folha nao encontrada.");
      return;
    }
    if (agora - estado.lidaHaPouco < PAUSA_APOS_LER) return;

    var chave = chaveDo(result);
    if (chave === estado.ultimaChave) {
      estado.repetidas += 1;
    } else {
      estado.ultimaChave = chave;
      estado.repetidas = 1;
    }
    if (estado.repetidas < LEITURAS_IGUAIS) {
      status("Lendo... confirme a marca (" + estado.repetidas + "/" + LEITURAS_IGUAIS + ").");
      return;
    }

    var payload = result.qr_texto;
    if (estado.lidos[payload]) {
      estado.lidaHaPouco = agora;
      beep(320, 90);
      status("Essa folha ja foi lida (" + (estado.lidos[payload].nome || "") + ").");
      return;
    }
    aceitar(result, payload, agora);
  }

  function rejeitar(payload, agora, msg) {
    estado.lidos[payload] = { nome: "rejeitada", em: agora };
    estado.lidaHaPouco = agora;
    estado.repetidas = 0;
    estado.ultimaChave = null;
    beep(220, 220);
    status(msg, "erro");
  }

  function aceitar(result, payload, agora) {
    var V = global.GabaVersoes;
    var QR = global.GabaQR;
    var meta = result.qr;
    var prova = estado.prova;
    var aluno = QR.resolve(meta, estado.alunos);
    if (!aluno) {
      rejeitar(payload, agora, "Folha de fora desta prova (codigo " + (meta.codigo || "?") +
        ", aluno " + (meta.aluno_id || meta.aluno_matricula || meta.aluno_numero || "?") + ").");
      return;
    }
    var ref = QR.idAluno(aluno);
    var item = estado.porAluno[ref];
    var versao = item ? item.versao : null;
    if (versao && meta.codigo && String(meta.codigo) !== String(versao.codigo)) {
      rejeitar(payload, agora, "Folha de outra impressao: codigo " + meta.codigo + " nao bate com o lote (" + versao.codigo + ").");
      return;
    }
    if (!versao) {
      if (!(prova.questoes || []).length) {
        rejeitar(payload, agora, "Falta o gabarito desta versao no aparelho. Abra a aba Caderno e faca a previa do lote.");
        return;
      }
      var r = estado.recipe || {};
      versao = V.build(prova, {
        modo: r.modo || prova.modo || "fixa",
        tipo: meta.versao || 1,
        aluno_id: ref,
        turma_id: r.turma_id || aluno.turma_id || null,
        salt: r.salt,
        embaralharAlternativas: r.embaralharAlternativas
      });
    }
    var notas = V.corrigir(prova, versao, result.answers);
    var registro = {
      prova_id: prova.id,
      aluno_id: aluno.id || null,
      aluno_nome: aluno.nome || "",
      aluno_numero: aluno.numero || null,
      turma_id: aluno.turma_id || null,
      versao: versao.versao,
      codigo: versao.codigo,
      qr_texto: payload,
      respostas: result.answers,
      respostas_banco: notas.respostas_banco,
      acertos: notas.acertos,
      branco: notas.branco,
      confusao: result.confusao || [],
      total_questoes: notas.total,
      nota: notas.nota,
      engine: result.engine,
      created_at: new Date().toISOString()
    };
    estado.lidos[payload] = { nome: aluno.nome, nota: notas.nota, em: agora };
    estado.resultados.push(registro);
    estado.lidaHaPouco = agora;
    estado.repetidas = 0;
    estado.ultimaChave = null;
    beep(result.confusao && result.confusao.length ? 660 : 980, result.confusao && result.confusao.length ? 260 : 110);
    mostrar(registro, result);
    salvar(registro);
  }

  function mostrar(r, result) {
    var box = $("scan-ultimas");
    if (!box) return;
    var duvida = (r.confusao || []).length;
    var linha = document.createElement("div");
    linha.className = "scan-item" + (duvida ? " duvida" : "");
    linha.innerHTML = "<strong>" + esc(String(r.aluno_numero || "-")) + "</strong> " +
      "<span>" + esc(r.aluno_nome || r.aluno_id || "") + "</span>" +
      "<span>tipo " + esc(String(r.versao)) + " / " + esc(String(r.codigo || "")) + "</span>" +
      "<span><b>" + r.acertos + "</b>/" + r.total_questoes + " = " + Number(r.nota).toFixed(1) + "</span>" +
      "<span>" + (duvida ? "revisar: " + r.confusao.join(", ") : (result.confidence ? "confianca " + Math.round(result.confidence * 100) + "%" : "")) + "</span>";
    box.insertBefore(linha, box.firstChild);
    while (box.children.length > 40) box.removeChild(box.lastChild);
    var total = $("scan-total");
    var dup = $("scan-duvida");
    if (total) total.textContent = String(estado.resultados.length);
    if (dup) dup.textContent = String(estado.resultados.filter(function (x) { return (x.confusao || []).length; }).length);
    status("Leu " + (r.aluno_nome || r.aluno_numero || "") + ": " + r.acertos + "/" + r.total_questoes +
      " (nota " + Number(r.nota).toFixed(1) + "). Pode virar a folha.");
  }

  function salvar(registro) {
    if (!global.GabaSync) return;
    GabaSync.enqueue(registro).then(function () {
      return GabaSync.flush();
    }).then(function (f) {
      var fila = $("scan-fila");
      return GabaSync.countPending().then(function (n) {
        if (fila) fila.textContent = String(n);
        if (f && f.reason === "unauthenticated") status("Salvo no aparelho: entre na aba Ajustes para isso subir para o banco.", "erro");
        else if (f && f.failed) status("Salvo no aparelho; " + f.failed + " nao subiu para o banco.", "erro");
      });
    }).catch(function (err) {
      status("Nao conseguiu salvar: " + (err && err.message ? err.message : err), "erro");
    });
  }

  function desenharOverlay(corners) {
    var video = $("scan-video");
    var cv = $("scan-overlay");
    if (!video || !cv) return;
    var w = video.clientWidth;
    var h = video.clientHeight;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    var ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    if (!corners) return;
    var sx = w / (video.videoWidth || w);
    var sy = h / (video.videoHeight || h);
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    corners.forEach(function (p, i) {
      var x = p.x * sx;
      var y = p.y * sy;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  var canvas = null;
  function enviarFrame() {
    var video = $("scan-video");
    if (!video || video.readyState < 2) return;
    var escala = Math.min(1, LARGURA_FRAME / video.videoWidth);
    var w = Math.round(video.videoWidth * escala);
    var h = Math.round(video.videoHeight * escala);
    canvas = canvas || document.createElement("canvas");
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    var data = ctx.getImageData(0, 0, w, h);
    estado.pendente = true;
    estado.requestId += 1;
    worker().postMessage({
      type: "process",
      buffer: data.data.buffer,
      width: w,
      height: h,
      requestId: estado.requestId,
      options: {
        sensibilidade: estado.sensibilidade,
        totalQuestoes: estado.totalQuestoes,
        alternativas: estado.alternativas
      }
    }, [data.data.buffer]);
  }

  var ultimoFrame = 0;
  function laco() {
    if (!estado.rodando) return;
    var agora = Date.now();
    if (!estado.pendente && agora - ultimoFrame > 1000 / FPS_ALVO) {
      ultimoFrame = agora;
      try { enviarFrame(); } catch (err) { status("Frame falhou: " + (err.message || err), "erro"); }
    }
    global.requestAnimationFrame(laco);
  }

  async function iniciar() {
    var prova = opcoesProva();
    if (!prova) { status("Escolha a prova antes de ligar a camera.", "erro"); return; }
    estado.prova = prova;
    await carregarAlunos();
    await montarIndice();
    if (!estado.totalQuestoes || !Object.keys(estado.porAluno).length) {
      status("Nao deu para montar as versoes desta prova (" + (estado.fonte || "sem indice") +
        "). Abra a aba Caderno, importe o documento e faca a previa do lote primeiro.", "erro");
      return;
    }
    try {
      estado.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false
      });
    } catch (err) {
      status("A camera nao abriu: " + (err && err.message ? err.message : err) +
        " (o navegador so libera camera em HTTPS ou localhost).", "erro");
      return;
    }
    var video = $("scan-video");
    video.srcObject = estado.stream;
    await video.play();
    estado.rodando = true;
    worker();
    var b1 = $("scan-iniciar");
    var b2 = $("scan-parar");
    if (b1) b1.disabled = true;
    if (b2) b2.disabled = false;
    status("Procurando folha... " + estado.totalQuestoes + " questoes, " +
      Object.keys(estado.versoes).length + " versao(oes) e " + estado.alunos.length +
      " aluno(s) (" + estado.fonte + ").");
    global.requestAnimationFrame(laco);
  }

  function parar() {
    estado.rodando = false;
    if (estado.stream) {
      estado.stream.getTracks().forEach(function (t) { t.stop(); });
      estado.stream = null;
    }
    var video = $("scan-video");
    if (video) video.srcObject = null;
    var b1 = $("scan-iniciar");
    var b2 = $("scan-parar");
    if (b1) b1.disabled = false;
    if (b2) b2.disabled = true;
    status("Parado. As folhas continuam salvas neste aparelho.");
  }

  async function carregarAlunos() {
    var sel = $("scan-turma");
    var turmaId = (sel && sel.value) || null;
    estado.turmaId = turmaId;
    if (estado.prova && estado.prova.__impresso) return estado.alunos;
    if (global.GabaDB && GabaDB.isConfigured()) {
      estado.alunos = await GabaDB.listAlunos(turmaId);
    } else {
      estado.alunos = (estado.prova && estado.prova.alunos) || [];
    }
    return estado.alunos;
  }

  async function preencherListas(provasLocais) {
    var C = global.GabaCaderno;
    var provas = (provasLocais || []).slice();
    var loteProva = C && C.provaDoLote ? C.provaDoLote() : null;
    if (loteProva && !provas.some(function (p) { return String(p.id) === loteProva.id; })) {
      provas.unshift(loteProva);
    }
    var turmas = [];
    if (global.GabaDB && GabaDB.isConfigured()) {
      try {
        var todas = await GabaDB.listTurmas();
        turmas = global.GabaEscolas ? GabaEscolas.visiveis(todas) : todas;
        provas = provas.concat(await GabaDB.listProvas());
      } catch (err) {
        status("Supabase indisponivel: " + (err.message || err), "erro");
      }
    }
    estado.provas = provas;
    var selP = $("scan-prova");
    if (selP) {
      selP.innerHTML = provas.map(function (p, i) {
        var qtd = (p.questoes || []).length || p.quantidade_questoes || 0;
        return '<option value="' + String(p.id).replace(/"/g, "&quot;") + '">' +
          String(p.titulo || "Prova " + (i + 1)).replace(/</g, "&lt;") +
          " — " + qtd + " questoes" + (p.__impresso ? " (lote impresso)" : "") + "</option>";
      }).join("") || '<option value="">sem prova</option>';
    }
    var selT = $("scan-turma");
    if (selT) {
      selT.innerHTML = '<option value="">Todas</option>' + turmas.map(function (t) {
        return '<option value="' + t.id + '">' + String(t.nome || t.id) + "</option>";
      }).join("");
    }
    estado.prova = opcoesProva();
    if (estado.prova) {
      await carregarAlunos();
      await montarIndice();
    }
    status(provas.length + " prova(s) e " + estado.alunos.length + " aluno(s) carregados" +
      (estado.fonte ? " — versoes pelo " + estado.fonte : "") + ".");
  }

  function init() {
    var b1 = $("scan-iniciar");
    var b2 = $("scan-parar");
    var limpar = $("scan-limpar");
    var sens = $("scan-sens");
    if (b1) b1.addEventListener("click", function () { iniciar().catch(function (e) { status(String(e.message || e), "erro"); }); });
    if (b2) b2.addEventListener("click", parar);
    if (limpar) limpar.addEventListener("click", function () {
      estado.lidos = {};
      estado.lidaHaPouco = 0;
      estado.repetidas = 0;
      estado.ultimaChave = null;
      status("Lista de lidos zerada: a mesma folha pode ser relida.");
    });
    if (sens) sens.addEventListener("input", function () {
      estado.sensibilidade = Number(sens.value) || 1;
      var out = $("scan-sens-valor");
      if (out) out.textContent = estado.sensibilidade.toFixed(1);
    });
    var sel = $("scan-prova");
    if (sel) sel.addEventListener("change", function () {
      estado.prova = opcoesProva();
      carregarAlunos().then(montarIndice);
    });
    var selT = $("scan-turma");
    if (selT) selT.addEventListener("change", function () {
      carregarAlunos().then(montarIndice);
    });
    if (global.GabaSync && GabaSync.onPendingChange) {
      GabaSync.onPendingChange(function (n) {
        var fila = $("scan-fila");
        if (fila) fila.textContent = String(n);
      });
    }
    status("Escolha a prova e ligue a camera.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.GabaScanner = {
    estado: estado,
    iniciar: iniciar,
    parar: parar,
    tratar: tratar,
    enviarFrame: enviarFrame,
    montarIndice: montarIndice,
    preencherListas: preencherListas,
    aoAbrir: function () { preencherListas(GabaCaderno && GabaCaderno.estado ? GabaCaderno.estado.provasLocais : []).catch(function () {}); }
  };
})(typeof window !== "undefined" ? window : globalThis);
