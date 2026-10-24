/* Ajuda do Gaba: busca no guia, dúvidas, sugestões e problemas.
   O envio usa as três tabelas insert-only do Supabase; sem rede ou sem login,
   o registro fica na fila do aparelho, no escopo da conta. */
(function (global) {
  "use strict";

  var VERSAO = "gaba-omr-v17";
  var TEXTO_MAX = 4000;
  var MSG_MAX = 8000;
  var CAPTURAS_ABERTAS = 8;
  var CAPTURAS_TOTAL = 40;
  var CAPTURAS_JANELA = 45000;

  var ARTIGOS = global.GabaGuia.catalogo();
  var TELAS = global.GabaGuia.telas();
  var ORDEM_TELAS = ["dashboard", "scanner", "relatorios", "turmas", "provas", "caderno", "config", "ajuda"];
  var CONVITE = '<p class="ajuda-convite">A resposta aparece aqui, com o passo a passo do guia.</p>';

  var estado = { duvidas: [], sugestoes: [], erros: [] };
  var escopoAnterior = { chave: "", semConta: true };
  var telaAtual = "dashboard";
  var ultimaTela = "dashboard";
  var ultimaConsulta = "";
  var ultimoResultado = null;
  var erroRelatado = "";
  var tBusca = null;
  var tToast = null;
  var iniciado = false;
  var sincronizando = false;

  function $(id) { return document.getElementById(id); }

  function esc(valor) {
    return String(valor == null ? "" : valor)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function corta(valor, limite) {
    return String(valor == null ? "" : valor).trim().slice(0, limite);
  }

  function uuid() {
    return global.GabaSync ? global.GabaSync.uuid() : "local-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function agora() { return new Date().toISOString(); }

  function quandoCurto(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    function dois(n) { return n < 10 ? "0" + n : String(n); }
    return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + " " + dois(d.getHours()) + ":" + dois(d.getMinutes());
  }

  function rotuloTela(id) { return TELAS[id] || id || ""; }

  function resumoNavegador() {
    var ua = navigator.userAgent || "";
    var navegador = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" :
      /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
    var so = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" :
      /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
    return so ? navegador + " · " + so : navegador;
  }

  /* ------------------------------------------------------------ conta e fila */

  function chave() {
    return global.GabaSync ? global.GabaSync.chaveLocal("ajuda") : "gaba-ajuda:sem-conta";
  }

  function professorAtual() {
    var p = global.GabaApp && global.GabaApp.estado && global.GabaApp.estado.professor;
    return {
      nome: corta((p && p.nome) || "", 120),
      email: corta((p && p.email) || "", 320),
      logado: Boolean(p && p.id)
    };
  }

  function bancoPronto() {
    try {
      return Boolean(global.GabaDB && GabaDB.isConfigured && GabaDB.isConfigured() && GabaDB.getClient());
    } catch (err) {
      return false;
    }
  }

  function podeEnviar() {
    return Boolean(navigator.onLine && bancoPronto() && professorAtual().logado);
  }

  function notaDeEnvio() {
    if (!bancoPronto()) return "Este aparelho não está ligado a um banco: o registro fica guardado aqui.";
    if (!professorAtual().logado) return "Sem login: fica guardado neste aparelho e sobe quando você entrar.";
    if (!navigator.onLine) return "Sem internet: fica na fila do aparelho e sobe quando a rede voltar.";
    return "Conectado: este envio vai direto para o banco.";
  }

  function normalizar(dados) {
    function lista(valor) { return Array.isArray(valor) ? valor.filter(Boolean) : []; }
    var saida = {
      duvidas: lista(dados && dados.duvidas),
      sugestoes: lista(dados && dados.sugestoes),
      erros: lista(dados && dados.erros)
    };
    saida.duvidas.forEach(function (i) { i.status = i.status === "enviado" ? "enviado" : "fila"; });
    saida.sugestoes.forEach(function (i) { i.status = i.status === "enviado" ? "enviado" : "fila"; });
    saida.erros.forEach(function (i) {
      if (!i.relatado) i.status = "";
      else i.status = i.status === "enviado" ? "enviado" : "fila";
    });
    ["duvidas", "sugestoes", "erros"].forEach(function (k) {
      saida[k].sort(function (a, b) { return String(b.criado_em || "").localeCompare(String(a.criado_em || "")); });
    });
    return saida;
  }

  function lerChave(chaveAlvo) {
    try {
      return normalizar(JSON.parse(localStorage.getItem(chaveAlvo) || "null"));
    } catch (err) {
      return { duvidas: [], sugestoes: [], erros: [] };
    }
  }

  function carregar() { estado = lerChave(chave()); }

  function salvar() {
    try { localStorage.setItem(chave(), JSON.stringify(estado)); } catch (err) { /* modo privado: fica na memória */ }
  }

  function juntar(antigo) {
    var ids = {};
    estado.duvidas.concat(estado.sugestoes, estado.erros).forEach(function (i) { if (i && i.id) ids[i.id] = true; });
    ["duvidas", "sugestoes", "erros"].forEach(function (k) {
      antigo[k].forEach(function (i) {
        if (i && i.id && !ids[i.id]) { estado[k].push(i); ids[i.id] = true; }
      });
    });
    var normalizado = normalizar(estado);
    estado = normalizado;
  }

  /* sem login o registro fica no escopo "sem-conta"; ao entrar pela primeira vez,
     ele passa para o escopo da conta para poder subir — troca entre contas não migra */
  function reiniciarConta() {
    var antiga = escopoAnterior;
    var logado = professorAtual().logado;
    var novaChave = chave();
    carregar();
    if (antiga && antiga.semConta && logado && antiga.chave && antiga.chave !== novaChave) {
      juntar(lerChave(antiga.chave));
      try { localStorage.removeItem(antiga.chave); } catch (err) { /* segue */ }
      salvar();
    }
    escopoAnterior = { chave: novaChave, semConta: !logado };
    erroRelatado = "";
    ultimaConsulta = "";
    ultimoResultado = null;
    if (!iniciado) return;
    fecharDuvida();
    $("ajuda-q").value = "";
    $("ajuda-saida").innerHTML = CONVITE;
    $("prob-texto").value = "";
    $("sug-texto").value = "";
    renderTudo();
    tentarFila();
  }

  /* ------------------------------------------------------------ nomes de alunos */

  function nomesDeAlunos() {
    var alunos = (global.GabaApp && global.GabaApp.estado && global.GabaApp.estado.alunos) || [];
    var nomes = {};
    alunos.forEach(function (a) {
      var nome = corta(a && a.nome, 120);
      if (nome.length < 6 || nome.indexOf(" ") < 0) return;
      nomes[nome] = true;
      var partes = nome.split(/\s+/);
      if (partes.length > 2) nomes[partes[0] + " " + partes[partes.length - 1]] = true;
    });
    return Object.keys(nomes).sort(function (a, b) { return b.length - a.length; });
  }

  function limparNomes(texto) {
    var saida = String(texto || "");
    nomesDeAlunos().forEach(function (nome) {
      var seguro = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      saida = saida.replace(new RegExp(seguro, "gi"), "[aluno]");
    });
    return saida;
  }

  /* ------------------------------------------------------------ gravação no banco */

  function linha(tabela, item) {
    var p = professorAtual();
    var base = {
      id: item.id,
      criado_em: item.criado_em || agora(),
      professor_nome: corta(item.professor_nome || p.nome, 120) || null,
      professor_email: corta(item.professor_email || p.email, 320) || null,
      tela: corta(item.tela || telaAtual, 40) || "ajuda"
    };
    if (tabela === "ajuda_duvidas") {
      base.texto = corta(limparNomes(item.texto), TEXTO_MAX);
      base.artigo_id = item.artigo_id ? corta(item.artigo_id, 80) : null;
    } else if (tabela === "ajuda_sugestoes") {
      base.texto = corta(limparNomes(item.texto), TEXTO_MAX);
      base.importancia = ["Seria bom", "Ajudaria muito", "Me trava hoje"].indexOf(item.importancia) >= 0 ?
        item.importancia : "Seria bom";
    } else {
      base.texto_usuario = corta(limparNomes(item.texto), TEXTO_MAX);
      base.mensagem_tecnica = corta(limparNomes(item.mensagem), MSG_MAX);
      base.navegador = corta(item.navegador || resumoNavegador(), 600);
      base.versao = corta(item.versao || VERSAO, 40);
      base.origem = item.origem === "captura" ? "captura" : "manual";
    }
    return base;
  }

  async function inserir(tabela, item) {
    var client = global.GabaDB && GabaDB.getClient ? GabaDB.getClient() : null;
    if (!client) throw new Error("Sem conexão com o banco.");
    var resposta = await client.from(tabela).insert(linha(tabela, item));
    if (resposta.error) {
      /* id de aparelho é único: se o banco já tem a linha, o reenvio terminou bem */
      if (resposta.error.code === "23505") return;
      throw resposta.error;
    }
  }

  async function enviarItem(tabela, item) {
    if (!podeEnviar()) {
      item.status = "fila";
      salvar();
      return item.status;
    }
    try {
      await inserir(tabela, item);
      item.status = "enviado";
      item.erro = "";
    } catch (err) {
      item.status = "fila";
      item.erro = corta(err && err.message ? err.message : err, 300);
    }
    salvar();
    return item.status;
  }

  async function sincronizar() {
    if (sincronizando || !iniciado || !podeEnviar()) return 0;
    sincronizando = true;
    var enviados = 0;
    var chaveInicio = chave();
    try {
      var fila = [];
      estado.duvidas.forEach(function (i) { if (i.status !== "enviado") fila.push({ tabela: "ajuda_duvidas", item: i }); });
      estado.sugestoes.forEach(function (i) { if (i.status !== "enviado") fila.push({ tabela: "ajuda_sugestoes", item: i }); });
      estado.erros.forEach(function (i) {
        if (i.relatado && i.status !== "enviado") fila.push({ tabela: "ajuda_erros", item: i });
      });
      for (var k = 0; k < fila.length; k++) {
        if (!podeEnviar() || chave() !== chaveInicio) break;
        var alvo = fila[k];
        try {
          await inserir(alvo.tabela, alvo.item);
          alvo.item.status = "enviado";
          alvo.item.erro = "";
          enviados += 1;
          salvar();
        } catch (err) {
          alvo.item.status = "fila";
          alvo.item.erro = corta(err && err.message ? err.message : err, 300);
          salvar();
          break;
        }
      }
    } finally {
      sincronizando = false;
      if (iniciado) renderTudo();
    }
    return enviados;
  }

  function tentarFila() {
    sincronizar().catch(function () { /* tenta de novo na próxima abertura */ });
  }

  /* ------------------------------------------------------------ abas */
  function mostrarAba(nome) {
    var botoes = document.querySelectorAll("[data-aba]");
    Array.prototype.forEach.call(botoes, function (b) {
      var ativo = b.getAttribute("data-aba") === nome;
      b.setAttribute("aria-selected", ativo ? "true" : "false");
      b.tabIndex = ativo ? 0 : -1;
    });
    ["duvidas", "sugestoes", "problemas"].forEach(function (n) {
      var secao = $("aba-" + n);
      if (!secao) return;
      var ativo = n === nome;
      secao.hidden = !ativo;
      secao.classList.toggle("ativo", ativo);
    });
    if (nome === "problemas") atualizarPayload();
  }

  /* ------------------------------------------------------------ busca */
  function realce(texto, consulta) {
    if (!consulta) return esc(texto);
    return global.GabaBusca.partesDestacadas(texto, consulta).map(function (parte) {
      return parte.hit ? "<mark>" + esc(parte.t) + "</mark>" : esc(parte.t);
    }).join("");
  }

  function artigoHtml(artigo, consulta, aberto) {
    var passos = (artigo.passos || []).map(function (p) { return "<li>" + realce(p, consulta) + "</li>"; }).join("");
    var notas = (artigo.notas || []).map(function (n) { return "<li>" + realce(n, consulta) + "</li>"; }).join("");
    var veja = (artigo.veja || []).map(function (id) {
      var outro = global.GabaGuia.porId(id);
      return outro ? '<button type="button" data-artigo="' + esc(outro.id) + '">' + esc(outro.titulo) + "</button>" : "";
    }).join("");
    return '<details class="ajuda-artigo"' + (aberto ? " open" : "") + ' data-artigo="' + esc(artigo.id) + '">' +
      '<summary><span class="ajuda-artigo-titulo">' + realce(artigo.titulo, consulta) + "</span>" +
      '<span class="ajuda-artigo-tela">' + esc(rotuloTela(artigo.tela)) + "</span></summary>" +
      '<div class="ajuda-artigo-corpo"><p>' + realce(artigo.resumo, consulta) + "</p>" +
      (passos ? '<h4>Passo a passo</h4><ol class="ajuda-passos">' + passos + "</ol>" : "") +
      (notas ? '<h4>Bom saber</h4><ul class="ajuda-notas">' + notas + "</ul>" : "") +
      (veja ? '<h4>Veja também</h4><div class="ajuda-veja">' + veja + "</div>" : "") +
      "</div></details>";
  }

  function resolveHtml(artigoId) {
    return '<div class="ajuda-resolve" data-resolve="' + esc(artigoId) + '">' +
      "<span>Isso resolveu a sua dúvida?</span>" +
      '<button type="button" class="btn-ghost" data-acao="resolveu-sim">Sim</button>' +
      '<button type="button" class="btn-ghost" data-acao="resolveu-nao">Não, quero mandar</button></div>';
  }

  function renderBusca(resultado, consulta) {
    var box = $("ajuda-saida");
    if (resultado.nivel === "nada") {
      box.innerHTML = '<div class="ajuda-vazio"><strong>Não achei nada no guia para “' + esc(consulta) + '”.</strong>' +
        "<p>Mande a sua dúvida: ela fica registrada com a tela, a versão e o que você tentou.</p>" +
        '<button type="button" class="btn-primary" data-acao="nao-achou">Mandar a minha dúvida</button></div>';
      return;
    }
    var html = '<p class="ajuda-nivel' + (resultado.nivel === "talvez" ? " talvez" : "") + '">' +
      (resultado.nivel === "talvez" ? "Não tenho certeza, mas pode ser" :
        (resultado.resultados.length === 1 ? "Uma resposta no guia" : resultado.resultados.length + " respostas no guia")) + "</p>";
    resultado.resultados.forEach(function (item, i) {
      html += artigoHtml(item.artigo, consulta, i === 0);
    });
    if (resultado.resultados.length) html += resolveHtml(resultado.resultados[0].artigo.id);
    box.innerHTML = html;
  }

  function buscar(consulta) {
    var q = String(consulta || "").trim();
    if (!q) {
      $("ajuda-q").focus();
      toast("Escreva a sua dúvida para buscar no guia.", "erro");
      return;
    }
    fecharDuvida();
    ultimaConsulta = q;
    ultimoResultado = global.GabaBusca.buscar(ARTIGOS, q, { tela: ultimaTela });
    renderBusca(ultimoResultado, q);
    if (window.matchMedia("(max-width: 720px)").matches) {
      setTimeout(function () {
        $("ajuda-saida").scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }

  function abrirArtigo(id) {
    var artigo = global.GabaGuia.porId(id);
    if (!artigo) return;
    var html = "";
    if (ultimaConsulta) html += '<p class="ajuda-nivel"><button type="button" class="btn-ghost pequeno" data-acao="voltar">Voltar aos resultados</button></p>';
    html += artigoHtml(artigo, "", true) + resolveHtml(artigo.id);
    $("ajuda-saida").innerHTML = html;
    $("ajuda-saida").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fecharDuvida() {
    $("duvida-form").hidden = true;
    $("duvida-confirmacao").hidden = true;
    $("duvida-texto").value = "";
    $("duvida-form").dataset.artigo = "";
  }

  function abrirFormDuvida(texto, artigoId) {
    $("duvida-form").hidden = false;
    $("duvida-form").dataset.artigo = artigoId || "";
    $("duvida-texto").value = texto || "";
    $("duvida-confirmacao").hidden = true;
    $("duvida-texto").focus();
    $("duvida-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ------------------------------------------------------------ listas */
  function seloStatus(status, erro) {
    var enviado = status === "enviado";
    return '<span class="selo-status ' + (enviado ? "enviado" : "fila") + '"' +
      (erro && !enviado ? ' title="' + esc(erro) + '"' : "") + ">" +
      (enviado ? "enviado ao banco" : "na fila do aparelho") + "</span>";
  }

  function renderSugestoes() {
    var box = $("sugestoes-lista");
    if (!box) return;
    if (!estado.sugestoes.length) {
      box.innerHTML = '<p class="ajuda-vazio-lista">Nenhuma sugestão enviada deste aparelho ainda.</p>';
      return;
    }
    box.innerHTML = estado.sugestoes.map(function (s) {
      var peso = s.importancia === "Me trava hoje" ? "peso-alto" : "";
      return '<div class="ajuda-item"><div class="ajuda-item-cab"><strong>' + esc(rotuloTela(s.tela)) + "</strong>" +
        '<span class="peso ' + peso + '">' + esc(s.importancia) + "</span>" + seloStatus(s.status, s.erro) +
        "<time>" + esc(quandoCurto(s.criado_em)) + "</time></div><p>" + esc(limparNomes(s.texto)) + "</p></div>";
    }).join("");
  }

  function renderErros() {
    var box = $("erros-lista");
    if (!box) return;
    if (!estado.erros.length) {
      box.innerHTML = '<p class="ajuda-vazio-lista">Nenhum erro capturado neste aparelho ainda.</p>';
      return;
    }
    box.innerHTML = estado.erros.map(function (e) {
      var acao = e.relatado ? "" :
        '<div class="ajuda-item-acoes"><button type="button" class="btn-ghost" data-relatar="' + esc(e.id) + '">Relatar este problema</button></div>';
      var situacao = e.relatado ? seloStatus(e.status, e.erro) : '<span class="selo-status fila">não relatado</span>';
      return '<div class="ajuda-item' + (e.id === erroRelatado ? " selecionado" : "") + '" id="captura-' + esc(e.id) + '">' +
        '<div class="ajuda-item-cab"><strong>' + esc(rotuloTela(e.tela)) + "</strong>" + situacao +
        "<time>" + esc(quandoCurto(e.criado_em)) + "</time></div>" +
        "<p><code>" + esc(limparNomes(e.mensagem || "(sem mensagem técnica)")) + "</code></p>" +
        (e.texto ? "<p>" + esc(limparNomes(e.texto)) + "</p>" : "") + acao + "</div>";
    }).join("");
  }

  function atualizarNotas() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-nota-envio]"), function (el) {
      el.textContent = notaDeEnvio();
    });
  }

  function atualizarContexto() {
    var tela = $("ajuda-contexto-tela");
    if (tela) tela.textContent = rotuloTela(ultimaTela);
    var versao = $("ajuda-versao");
    if (versao) versao.textContent = VERSAO;
  }

  function renderTudo() {
    if (!iniciado) return;
    renderSugestoes();
    renderErros();
    atualizarNotas();
    atualizarContexto();
    if ($("payload-pre")) atualizarPayload();
  }

  /* ------------------------------------------------------------ problemas */
  function capturaAlvo() {
    if (!erroRelatado) return null;
    return estado.erros.filter(function (e) { return e.id === erroRelatado && !e.relatado; })[0] || null;
  }

  function ultimaMensagem() {
    var abertos = estado.erros.filter(function (e) { return !e.relatado; });
    var alvo = abertos[0] || estado.erros[0];
    return alvo ? limparNomes(alvo.mensagem || "") : "";
  }

  function atualizarPayload() {
    var pre = $("payload-pre");
    if (!pre) return;
    var anexar = $("prob-tecnico").checked;
    var alvo = capturaAlvo();
    var dados = {
      tela: rotuloTela(alvo ? alvo.tela : ultimaTela),
      versao: VERSAO,
      navegador: resumoNavegador(),
      anexar_erros_tecnicos: anexar,
      mensagem_tecnica: anexar ? limparNomes(alvo ? alvo.mensagem : ultimaMensagem()) : "",
      texto: limparNomes($("prob-texto").value.trim()),
      nomes_de_alunos: "nenhum"
    };
    pre.textContent = JSON.stringify(dados, null, 2);
  }

  function podarCapturas() {
    var abertas = 0;
    estado.erros = estado.erros.filter(function (e) {
      if (e.relatado) return true;
      abertas += 1;
      return abertas <= CAPTURAS_ABERTAS;
    });
    if (estado.erros.length > CAPTURAS_TOTAL) estado.erros = estado.erros.slice(0, CAPTURAS_TOTAL);
  }

  function capturar(mensagem, tela) {
    var limpa = limparNomes(String(mensagem || "")).trim();
    if (!limpa || limpa === "Script error.") return;
    limpa = corta(limpa, MSG_MAX);
    var repetida = estado.erros.some(function (e) {
      return !e.relatado && e.mensagem === limpa &&
        Math.abs(Date.now() - new Date(e.criado_em).getTime()) < CAPTURAS_JANELA;
    });
    if (repetida) return;
    estado.erros.unshift({
      id: uuid(), criado_em: agora(), tela: tela || telaAtual,
      professor_nome: "", professor_email: "",
      mensagem: limpa, navegador: resumoNavegador(), versao: VERSAO,
      texto: "", status: "", relatado: false, origem: "captura"
    });
    podarCapturas();
    salvar();
    if (iniciado) { renderErros(); atualizarPayload(); }
    toast("Erro capturado. Ele está em Ajuda › Problemas.", "erro");
  }

  function instalarCaptura() {
    global.addEventListener("error", function (ev) {
      if (ev.target && ev.target !== global && ev.target.nodeType) return;
      if (!ev.message) return;
      var origem = String(ev.filename || "");
      if (/^(chrome|moz|safari|safari-web)-extension:\/\//.test(origem)) return;
      var onde = origem.split("/").pop();
      capturar(ev.message + (onde ? " (" + onde + ":" + (ev.lineno || 0) + ")" : ""), telaAtual);
    });
    global.addEventListener("unhandledrejection", function (ev) {
      var motivo = ev.reason;
      var msg = motivo && (motivo.message || motivo.reason) ? (motivo.message || motivo.reason) : String(motivo || "");
      if (!msg) return;
      capturar(msg, telaAtual);
    });
  }

  /* ------------------------------------------------------------ envios */
  async function enviarDuvida(form) {
    var texto = corta(limparNomes($("duvida-texto").value.trim()), TEXTO_MAX);
    if (!texto) {
      toast("Escreva a sua dúvida antes de enviar.", "erro");
      $("duvida-texto").focus();
      return;
    }
    var p = professorAtual();
    var item = {
      id: uuid(), criado_em: agora(), tela: ultimaTela,
      professor_nome: p.nome, professor_email: p.email,
      texto: texto, artigo_id: form.dataset.artigo || "", status: "fila"
    };
    estado.duvidas.unshift(item);
    salvar();
    var status = await enviarItem("ajuda_duvidas", item);
    renderTudo();
    $("duvida-texto").value = "";
    form.hidden = true;
    var box = $("duvida-confirmacao");
    box.hidden = false;
    box.innerHTML = "Dúvida registrada. " + seloStatus(status) +
      (status === "fila" ? " Ela sobe quando a conexão permitir." : "");
    toast(status === "enviado" ? "Dúvida enviada ao banco." : "Dúvida guardada no aparelho.", status === "enviado" ? "ok" : "");
    tentarFila();
  }

  async function enviarSugestao(form) {
    var texto = corta(limparNomes($("sug-texto").value.trim()), TEXTO_MAX);
    if (!texto) {
      toast("Conte o que você gostaria que mudasse.", "erro");
      $("sug-texto").focus();
      return;
    }
    var tela = $("sug-tela").value;
    var marcado = form.querySelector('input[name="sug-importancia"]:checked');
    var p = professorAtual();
    var item = {
      id: uuid(), criado_em: agora(), tela: tela,
      professor_nome: p.nome, professor_email: p.email,
      texto: texto, importancia: marcado ? marcado.value : "Seria bom", status: "fila"
    };
    estado.sugestoes.unshift(item);
    salvar();
    var status = await enviarItem("ajuda_sugestoes", item);
    renderTudo();
    $("sug-texto").value = "";
    $("sug-tela").value = tela;
    toast(status === "enviado" ? "Sugestão enviada ao banco." : "Sugestão guardada no aparelho.", status === "enviado" ? "ok" : "");
    tentarFila();
  }

  async function enviarProblema(form) {
    var texto = corta(limparNomes($("prob-texto").value.trim()), TEXTO_MAX);
    if (!texto) {
      toast("Conte o que aconteceu antes de enviar.", "erro");
      $("prob-texto").focus();
      return;
    }
    var anexar = $("prob-tecnico").checked;
    var alvo = anexar ? capturaAlvo() : null;
    var p = professorAtual();
    var item;
    if (alvo) {
      alvo.relatado = true;
      alvo.texto = texto;
      alvo.professor_nome = p.nome;
      alvo.professor_email = p.email;
      alvo.status = "fila";
      alvo.origem = "captura";
      item = alvo;
    } else {
      item = {
        id: uuid(), criado_em: agora(), tela: ultimaTela,
        professor_nome: p.nome, professor_email: p.email,
        mensagem: anexar ? limparNomes(ultimaMensagem()) : "",
        navegador: resumoNavegador(), versao: VERSAO,
        texto: texto, status: "fila", relatado: true, origem: "manual"
      };
      estado.erros.unshift(item);
    }
    salvar();
    var status = await enviarItem("ajuda_erros", item);
    erroRelatado = "";
    salvar();
    renderTudo();
    form.reset();
    $("prob-tecnico").checked = true;
    atualizarPayload();
    toast(status === "enviado" ? "Problema enviado ao banco." : "Problema guardado no aparelho.", status === "enviado" ? "ok" : "");
    tentarFila();
  }

  /* ------------------------------------------------------------ montagem */
  function montarSelectTela() {
    var select = $("sug-tela");
    if (!select) return;
    select.innerHTML = ORDEM_TELAS.filter(function (t) { return t !== "geral"; }).map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(rotuloTela(t)) + "</option>";
    }).join("");
    select.value = TELAS[ultimaTela] ? ultimaTela : "dashboard";
  }

  function montarIndice() {
    var grupos = {};
    ARTIGOS.forEach(function (a) { (grupos[a.tela] = grupos[a.tela] || []).push(a); });
    $("ajuda-indice-lista").innerHTML = ORDEM_TELAS.map(function (t) {
      if (!grupos[t]) return "";
      return '<div class="ajuda-indice-grupo"><h4>' + esc(rotuloTela(t)) + "</h4>" +
        grupos[t].map(function (a) {
          return '<button type="button" data-artigo="' + esc(a.id) + '">' + esc(a.titulo) + "</button>";
        }).join("") + "</div>";
    }).join("");
  }

  function toast(mensagem, tipo) {
    var el = $("ajuda-toast");
    if (!el) return;
    el.textContent = mensagem;
    el.className = "ajuda-toast" + (tipo === "erro" ? " erro" : "");
    el.hidden = false;
    clearTimeout(tToast);
    tToast = setTimeout(function () { el.hidden = true; }, 3600);
  }

  function instalarEventos() {
    $("ajuda-busca-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      buscar($("ajuda-q").value);
    });

    $("ajuda-q").addEventListener("input", function () {
      var q = this.value.trim();
      clearTimeout(tBusca);
      if (!q) {
        ultimaConsulta = "";
        ultimoResultado = null;
        $("ajuda-saida").innerHTML = CONVITE;
        return;
      }
      if (q.length < 3) return;
      tBusca = setTimeout(function () { buscar(q); }, 240);
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-exemplo]"), function (chip) {
      chip.addEventListener("click", function () {
        $("ajuda-q").value = chip.getAttribute("data-exemplo");
        buscar($("ajuda-q").value);
      });
    });

    $("ajuda-saida").addEventListener("click", function (ev) {
      var botao = ev.target.closest("button");
      if (!botao) return;
      if (botao.getAttribute("data-artigo")) {
        abrirArtigo(botao.getAttribute("data-artigo"));
        return;
      }
      var acao = botao.getAttribute("data-acao");
      if (acao === "resolveu-sim") {
        var barra = botao.closest(".ajuda-resolve");
        if (barra) barra.innerHTML = '<span class="ajuda-ok">Que bom! O guia fica aqui se precisar.</span>';
        toast("Que bom. Se precisar, o guia está aqui.", "ok");
      } else if (acao === "resolveu-nao") {
        var alvo = botao.closest(".ajuda-resolve");
        abrirFormDuvida(ultimaConsulta, alvo ? alvo.getAttribute("data-resolve") : "");
      } else if (acao === "nao-achou") {
        abrirFormDuvida(ultimaConsulta, "");
      } else if (acao === "voltar" && ultimoResultado) {
        renderBusca(ultimoResultado, ultimaConsulta);
      }
    });

    $("ajuda-indice-lista").addEventListener("click", function (ev) {
      var botao = ev.target.closest("button[data-artigo]");
      if (!botao) return;
      var detalhes = botao.closest(".ajuda-indice");
      if (detalhes) detalhes.open = false;
      abrirArtigo(botao.getAttribute("data-artigo"));
    });

    $("duvida-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      enviarDuvida(this).catch(function () { toast("Não deu para registrar agora.", "erro"); });
    });
    $("duvida-cancelar").addEventListener("click", fecharDuvida);

    $("sugestao-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      enviarSugestao(this).catch(function () { toast("Não deu para registrar agora.", "erro"); });
    });

    $("problema-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      enviarProblema(this).catch(function () { toast("Não deu para registrar agora.", "erro"); });
    });
    $("prob-texto").addEventListener("input", atualizarPayload);
    $("prob-tecnico").addEventListener("change", atualizarPayload);

    $("erros-lista").addEventListener("click", function (ev) {
      var botao = ev.target.closest("[data-relatar]");
      if (!botao) return;
      var item = estado.erros.filter(function (e) { return e.id === botao.getAttribute("data-relatar"); })[0];
      if (!item) return;
      erroRelatado = item.id;
      renderErros();
      var campo = $("prob-texto");
      campo.value = corta("No " + rotuloTela(item.tela) + " apareceu: " + limparNomes(item.mensagem) + ". ", TEXTO_MAX);
      mostrarAba("problemas");
      campo.focus();
      campo.setSelectionRange(campo.value.length, campo.value.length);
      atualizarPayload();
      $("problema-form").scrollIntoView({ behavior: "smooth", block: "center" });
      toast("Erro selecionado. Conte o que estava fazendo e envie.", "ok");
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-aba]"), function (botao) {
      botao.addEventListener("click", function () { mostrarAba(botao.getAttribute("data-aba")); });
      botao.addEventListener("keydown", function (ev) {
        var passo = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
        if (!passo) return;
        ev.preventDefault();
        var abas = ["duvidas", "sugestoes", "problemas"];
        var atual = abas.indexOf(botao.getAttribute("data-aba"));
        var proxima = (atual + passo + abas.length) % abas.length;
        mostrarAba(abas[proxima]);
        document.querySelector('[data-aba="' + abas[proxima] + '"]').focus();
      });
    });

    global.addEventListener("online", function () {
      atualizarNotas();
      tentarFila();
    });
    global.addEventListener("offline", atualizarNotas);
  }

  function montar() {
    if (iniciado) return;
    iniciado = true;
    carregar();
    escopoAnterior = { chave: chave(), semConta: !professorAtual().logado };
    montarIndice();
    montarSelectTela();
    instalarEventos();
    instalarCaptura();
    renderTudo();
    atualizarContexto();
    tentarFila();
  }

  function aoAbrir() {
    if (!iniciado) montar();
    atualizarContexto();
    var select = $("sug-tela");
    if (select) select.value = ultimaTela;
    tentarFila();
  }

  function registrarTela(tabId) {
    if (!TELAS[tabId]) return;
    telaAtual = tabId;
    if (tabId !== "ajuda") ultimaTela = tabId;
    if (iniciado) atualizarContexto();
  }

  escopoAnterior = { chave: chave(), semConta: !professorAtual().logado };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();

  global.GabaAjuda = {
    aoAbrir: aoAbrir,
    registrarTela: registrarTela,
    reiniciarConta: reiniciarConta,
    versao: VERSAO,
    pendentes: function () {
      var n = 0;
      estado.duvidas.forEach(function (i) { if (i.status !== "enviado") n += 1; });
      estado.sugestoes.forEach(function (i) { if (i.status !== "enviado") n += 1; });
      estado.erros.forEach(function (i) { if (i.relatado && i.status !== "enviado") n += 1; });
      return n;
    }
  };
})(window);
