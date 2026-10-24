/* Ajuda no app de verdade: a quinta aba, a busca no guia, a fila local das três
   tabelas insert-only e a captura de erros — inclusive no celular de 390px.
   Precisa do servidor local: node tests/serve.js -> node tests/ui-ajuda.js [porta] */
"use strict";

var hud = require("./hudChrome");
var fs = require("fs");
var os = require("os");
var path = require("path");

var porta = Number(process.argv[2] || 8791);
var BASE = "http://127.0.0.1:" + porta;
var falhas = 0;

/* A versão mora no sw.js. Comparar com o arquivo de verdade pega payload e app
   desalinhados sem deixar aqui um número que precisa ser retocado a cada release. */
var CACHE_SW = (fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8")
  .match(/const CACHE\s*=\s*"([^"]+)"/) || [])[1] || "";

function check(nome, cond, extra) {
  console.log((cond ? "ok   " : "FALHA ") + nome +
    (extra !== undefined ? " — " + JSON.stringify(extra) : ""));
  if (!cond) falhas += 1;
}

(async function principal() {
  var chrome = await hud.abrirChrome(BASE + "/index.html");
  var c = hud.cliente(await hud.conectar("/index.html", chrome.porta));

  await c.espera("typeof GabaAjuda !== 'undefined' && typeof GabaGuia !== 'undefined' && " +
    "typeof GabaSync !== 'undefined' && typeof GabaApp !== 'undefined'", 60000);
  await c.espera("document.querySelectorAll('#ajuda-indice-lista button').length > 20", 30000);

  var montada = await c.naPagina(function () {
    window.__errosAjuda = [];
    window.addEventListener("error", function (ev) {
      var m = String((ev && ev.message) || ev);
      if (/falha de teste/i.test(m)) return;
      window.__errosAjuda.push(m);
    });
    window.addEventListener("unhandledrejection", function (ev) {
      var m = String((ev && ev.reason && ev.reason.message) || (ev && ev.reason));
      if (/falha de teste/i.test(m)) return;
      window.__errosAjuda.push("rejeicao: " + m);
    });
    var botao = document.querySelector('.tab-btn[data-tab="ajuda"]');
    var primeiro = document.querySelector("#ajuda-indice-lista button");
    return {
      abas: document.querySelectorAll(".tabs-polegar .tab-btn").length,
      rotulo: botao && botao.textContent.trim(),
      indice: document.querySelectorAll("#ajuda-indice-lista button").length,
      primeiro: primeiro && primeiro.textContent,
      artigoTela: GabaGuia.catalogo().every(function (a) { return Boolean(GabaGuia.telas()[a.tela]); }),
      versao: GabaAjuda.versao
    };
  }, []);
  check("a quinta aba Ajuda existe na navegação", montada.abas === 5 && montada.rotulo === "Ajuda", montada);
  check("o guia entrou inteiro no app, com as telas reais",
    montada.indice > 30 && montada.artigoTela === true, montada);
  check("a versão do payload é a mesma do service worker", montada.versao === CACHE_SW && Boolean(CACHE_SW), montada.versao);

  var contexto = await c.naPagina(function () {
    switchTab("scanner");
    document.querySelector('.tab-btn[data-tab="ajuda"]').click();
    var sugestao = document.getElementById("sug-tela");
    return {
      ativa: document.getElementById("tab-ajuda").classList.contains("active"),
      contexto: document.getElementById("ajuda-contexto-tela").textContent,
      versao: document.getElementById("ajuda-versao").textContent,
      duvidas: !document.getElementById("aba-duvidas").hidden,
      sugestoes: !document.getElementById("aba-sugestoes").hidden,
      problemas: !document.getElementById("aba-problemas").hidden,
      telaSugestao: sugestao && sugestao.value
    };
  }, []);
  check("a aba Ajuda abre pelo switchTab como as outras",
    contexto.ativa === true && contexto.duvidas === true &&
    contexto.sugestoes === false && contexto.problemas === false, contexto);
  check("o cabeçalho lembra a última tela usada", contexto.contexto === "Leitor" && contexto.versao === CACHE_SW, contexto);
  check("o formulário de sugestão já vem na última tela usada", contexto.telaSugestao === "scanner", contexto);

  var busca = await c.naPagina(function () {
    var q = document.getElementById("ajuda-q");
    q.value = "a folha nao e reconhecida";
    document.getElementById("ajuda-busca-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    var saida = document.getElementById("ajuda-saida");
    var primeiro = saida.querySelector("details.ajuda-artigo");
    return {
      artigo: primeiro && primeiro.getAttribute("data-artigo"),
      aberto: primeiro && primeiro.open,
      destaques: saida.querySelectorAll("mark").length,
      nivel: (saida.querySelector(".ajuda-nivel") || {}).textContent || "",
      contexto: document.getElementById("ajuda-contexto-tela").textContent
    };
  }, []);
  check("a busca acha a folha não reconhecida e já abre o artigo",
    busca.artigo === "nao-acha" && busca.aberto === true, busca);
  check("a busca destaca o que casou e mantém a tela como contexto",
    busca.destaques > 0 && busca.contexto === "Leitor", busca);

  await c.chama("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await hud.sleep(300);
  var layout = await c.naPagina(function () {
    var nav = document.querySelector(".tabs-polegar");
    var botoes = Array.prototype.map.call(nav.querySelectorAll(".tab-btn"), function (b) {
      var r = b.getBoundingClientRect();
      return { tab: b.getAttribute("data-tab"), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
    });
    var tops = botoes.map(function (b) { return b.top; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var form = document.getElementById("ajuda-busca-form");
    var tab = document.getElementById("tab-ajuda");
    var seg = document.querySelector(".segmento-ajuda").getBoundingClientRect();
    return {
      botoes: botoes,
      linhas: tops.length,
      cincoVisiveis: botoes.length === 5 && botoes.every(function (b) { return b.w > 30 && b.h > 0; }),
      navegacaoCabe: nav.scrollWidth <= nav.clientWidth + 1,
      direcaoBusca: getComputedStyle(form).flexDirection,
      ajudaCabe: tab.scrollWidth <= 391 && seg.width <= 391,
      largura: window.innerWidth
    };
  }, []);
  check("no celular as cinco abas cabem numa linha só",
    layout.largura === 390 && layout.cincoVisiveis && layout.linhas === 1 && layout.navegacaoCabe, layout.botoes);
  check("no celular a busca empilha e a tela não vaza",
    layout.direcaoBusca === "column" && layout.ajudaCabe, layout);

  var print = await c.chama("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  var destino = path.join(os.tmpdir(), "gaba-ajuda-390.png");
  fs.writeFileSync(destino, Buffer.from(print.data, "base64"));
  console.log("     print: " + destino);
  await c.chama("Emulation.clearDeviceMetricsOverride");
  await hud.sleep(250);

  var duvida = await c.naPagina(async function () {
    GabaApp.estado.alunos = GabaApp.estado.alunos || [];
    GabaApp.estado.alunos.push({ nome: "Maria Clara Souza" });
    document.querySelector('#ajuda-saida [data-acao="resolveu-nao"]').click();
    var form = document.getElementById("duvida-form");
    var campo = document.getElementById("duvida-texto");
    var preenchido = { aberto: !form.hidden, artigo: form.dataset.artigo, texto: campo.value };
    campo.value = "A aluna Maria Clara Souza não conseguiu usar o leitor.";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    var limite = Date.now() + 5000;
    while (document.getElementById("duvida-confirmacao").hidden && Date.now() < limite) {
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    var chave = GabaSync.chaveLocal("ajuda");
    return {
      preenchido: preenchido,
      confirmacao: document.getElementById("duvida-confirmacao").textContent,
      chave: chave,
      dados: JSON.parse(localStorage.getItem(chave) || "null"),
      pendentes: GabaAjuda.pendentes()
    };
  }, []);

  var d = duvida.dados && duvida.dados.duvidas[0];
  check("“Não, quero mandar” abre a dúvida com o artigo e a pergunta",
    duvida.preenchido.aberto === true && duvida.preenchido.artigo === "nao-acha" &&
    duvida.preenchido.texto === "a folha nao e reconhecida", duvida.preenchido);
  check("a dúvida fica na fila do aparelho com a tela e o artigo",
    Boolean(d) && d.status === "fila" && d.tela === "scanner" && d.artigo_id === "nao-acha" &&
    duvida.pendentes === 1, d);
  check("o nome de aluno é trocado por [aluno] antes de gravar",
    Boolean(d) && d.texto === "A aluna [aluno] não conseguiu usar o leitor." &&
    JSON.stringify(duvida.dados).indexOf("Maria Clara Souza") < 0, d && d.texto);
  check("sem login a dúvida fica no escopo sem-conta",
    duvida.chave.indexOf("sem-conta") >= 0 && /registrada/i.test(duvida.confirmacao), { chave: duvida.chave, confirmacao: duvida.confirmacao });

  var sugestao = await c.naPagina(async function () {
    document.querySelector('[data-aba="sugestoes"]').click();
    var form = document.getElementById("sugestao-form");
    document.getElementById("sug-texto").value = "Queria trocar a letra da questão duvidosa sem abrir o caderno.";
    form.querySelector('input[name="sug-importancia"][value="Me trava hoje"]').checked = true;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    var limite = Date.now() + 5000;
    while (!document.querySelector("#sugestoes-lista .ajuda-item") && Date.now() < limite) {
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    var dados = JSON.parse(localStorage.getItem(GabaSync.chaveLocal("ajuda")) || "null");
    return {
      tela: document.getElementById("sug-tela").value,
      item: dados.sugestoes[0],
      lista: document.querySelectorAll("#sugestoes-lista .ajuda-item").length,
      painel: !document.getElementById("aba-sugestoes").hidden && document.getElementById("aba-duvidas").hidden,
      pendentes: GabaAjuda.pendentes()
    };
  }, []);
  check("a sugestão grava a tela escolhida e o peso",
    Boolean(sugestao.item) && sugestao.tela === "scanner" && sugestao.item.tela === "scanner" &&
    sugestao.item.importancia === "Me trava hoje" && sugestao.item.status === "fila", sugestao.item);
  check("a sugestão aparece na lista e conta na fila",
    sugestao.lista === 1 && sugestao.painel === true && sugestao.pendentes === 2, sugestao);

  var captura = await c.naPagina(async function () {
    function dispara(msg) {
      window.dispatchEvent(new ErrorEvent("error", {
        message: msg,
        error: new Error(msg),
        filename: location.origin + "/js/uiScanner.js",
        lineno: 88
      }));
    }
    dispara("Falha de teste: câmera não abriu para Maria Clara Souza");
    var limite = Date.now() + 5000;
    while (!document.querySelector("#erros-lista .ajuda-item") && Date.now() < limite) {
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    dispara("Falha de teste: câmera não abriu para Maria Clara Souza");
    await new Promise(function (r) { setTimeout(r, 250); });
    var dados = JSON.parse(localStorage.getItem(GabaSync.chaveLocal("ajuda")) || "null");
    return {
      itens: document.querySelectorAll("#erros-lista .ajuda-item").length,
      erros: dados.erros,
      lista: document.getElementById("erros-lista").textContent,
      pendentes: GabaAjuda.pendentes()
    };
  }, []);
  check("o erro de javascript é capturado sozinho e não duplica",
    captura.itens === 1 && captura.erros.length === 1, captura.erros);
  check("a captura também limpa o nome de aluno",
    captura.erros[0].mensagem.indexOf("[aluno]") >= 0 &&
    JSON.stringify(captura.erros).indexOf("Maria Clara Souza") < 0, captura.erros[0].mensagem);
  check("a pilha de execução vem junto na captura e também sai limpa",
    /at /.test(captura.erros[0].pilha || "") &&
    (captura.erros[0].pilha || "").indexOf("Maria Clara Souza") < 0 &&
    (captura.erros[0].pilha || "").indexOf("[aluno]") >= 0, captura.erros[0].pilha);
  check("o erro fica como não relatado e não entra na fila",
    captura.erros[0].relatado === false && captura.erros[0].status === "" &&
    /não relatado/.test(captura.lista) && captura.pendentes === 2, captura.lista);

  var relato = await c.naPagina(async function () {
    document.querySelector('[data-aba="problemas"]').click();
    document.querySelector("#erros-lista [data-relatar]").click();
    var form = document.getElementById("problema-form");
    var campo = document.getElementById("prob-texto");
    var antes = {
      texto: campo.value,
      tecnico: document.getElementById("prob-tecnico").checked,
      payload: document.getElementById("payload-pre").textContent,
      aba: !document.getElementById("aba-problemas").hidden
    };
    campo.value = "A câmera não abriu durante a chamada.";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    var limite = Date.now() + 5000;
    while (Date.now() < limite && document.querySelector("#erros-lista [data-relatar]")) {
      await new Promise(function (r) { setTimeout(r, 50); });
    }
    var chave = GabaSync.chaveLocal("ajuda");
    var dados = JSON.parse(localStorage.getItem(chave) || "null");
    return {
      antes: antes,
      item: dados && dados.erros[0],
      brutoTemNome: (localStorage.getItem(chave) || "").indexOf("Maria Clara Souza") >= 0,
      botaoRestou: Boolean(document.querySelector("#erros-lista [data-relatar]")),
      pendentes: GabaAjuda.pendentes()
    };
  }, []);
  check("“Relatar este problema” preenche a descrição e o payload sem o nome",
    relato.antes.aba === true && relato.antes.tecnico === true &&
    relato.antes.texto.indexOf("[aluno]") >= 0 && relato.antes.texto.indexOf("Maria") < 0 &&
    relato.antes.payload.indexOf("[aluno]") >= 0 && relato.antes.payload.indexOf("Maria") < 0 &&
    /"assinatura": "fnv1-[0-9a-f]{8}"/.test(relato.antes.payload),
    relato.antes);
  check("o relato marca o erro como enviado para a fila, com a descrição",
    Boolean(relato.item) && relato.item.relatado === true && relato.item.status === "fila" &&
    relato.item.texto === "A câmera não abriu durante a chamada." && relato.item.origem === "captura", relato.item);
  check("depois de relatar, o erro não oferece relatar de novo e entra na fila",
    relato.botaoRestou === false && relato.pendentes === 3 && relato.brutoTemNome === false, relato);

  var migracao = await c.naPagina(function () {
    var chaveAntiga = GabaSync.chaveLocal("ajuda");
    var antes = JSON.parse(localStorage.getItem(chaveAntiga) || "null");
    GabaApp.estado.professor = {
      id: "11111111-1111-4111-8111-111111111111",
      nome: "Prof Teste",
      email: "prof@teste.br"
    };
    GabaSync.definirConta({ id: "11111111-1111-4111-8111-111111111111" });
    GabaAjuda.reiniciarConta();
    var chaveNova = GabaSync.chaveLocal("ajuda");
    var depois = JSON.parse(localStorage.getItem(chaveNova) || "null");
    return {
      chaveAntiga: chaveAntiga,
      chaveNova: chaveNova,
      antigaSumiu: localStorage.getItem(chaveAntiga) === null,
      antes: { d: antes.duvidas.length, s: antes.sugestoes.length, e: antes.erros.length },
      depois: depois && { d: depois.duvidas.length, s: depois.sugestoes.length, e: depois.erros.length },
      mesmos: Boolean(depois) && JSON.stringify(antes.duvidas.map(function (i) { return i.id; })) ===
        JSON.stringify(depois.duvidas.map(function (i) { return i.id; })),
      pendentes: GabaAjuda.pendentes()
    };
  }, []);
  check("ao entrar na conta, a fila sem-conta migra uma vez e some do escopo antigo",
    migracao.chaveAntiga !== migracao.chaveNova && migracao.antigaSumiu === true &&
    migracao.depois.d === 1 && migracao.depois.s === 1 && migracao.depois.e === 1 &&
    migracao.mesmos === true && migracao.pendentes === 3, migracao);

  var envio = await c.naPagina(async function () {
    window.__gabaDBOriginal = { isConfigured: GabaDB.isConfigured, getClient: GabaDB.getClient };
    window.__enviados = [];
    window.__erroFake = null;
    GabaDB.isConfigured = function () { return true; };
    GabaDB.getClient = function () {
      return {
        from: function (tabela) {
          return {
            insert: function (linha) {
              window.__enviados.push({ tabela: tabela, linha: linha });
              return Promise.resolve({ error: window.__erroFake });
            }
          };
        }
      };
    };

    document.querySelector('[data-aba="sugestoes"]').click();
    var form = document.getElementById("sugestao-form");
    document.getElementById("sug-texto").value = "A Maria Clara Souza pediu para avisar o aluno automaticamente.";
    form.querySelector('input[name="sug-importancia"][value="Ajudaria muito"]').checked = true;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    var limite = Date.now() + 8000;
    while ((GabaAjuda.pendentes() > 0 || document.querySelectorAll("#sugestoes-lista .ajuda-item").length < 2) &&
      Date.now() < limite) {
      await new Promise(function (r) { setTimeout(r, 60); });
    }
    var dados = JSON.parse(localStorage.getItem(GabaSync.chaveLocal("ajuda")) || "null");
    return {
      enviados: window.__enviados,
      pendentes: GabaAjuda.pendentes(),
      status: dados.sugestoes.map(function (s) { return s.status; }),
      lista: document.querySelectorAll("#sugestoes-lista .ajuda-item").length
    };
  }, []);
  var porTabela = {};
  envio.enviados.forEach(function (e) { porTabela[e.tabela] = (porTabela[e.tabela] || 0) + 1; });
  check("com login e banco, o envio vai direto para a tabela certa",
    porTabela.ajuda_duvidas === 1 && porTabela.ajuda_sugestoes === 2 && porTabela.ajuda_erros === 1, porTabela);
  check("a fila inteira sobe e as sugestões ficam como enviadas",
    envio.pendentes === 0 && envio.status.every(function (s) { return s === "enviado"; }) && envio.lista === 2, envio);
  var nova = envio.enviados.filter(function (e) {
    return e.tabela === "ajuda_sugestoes" && e.linha.importancia === "Ajudaria muito";
  })[0];
  check("a linha leva a conta, a tela, o peso e o texto sem nome de aluno",
    Boolean(nova) && nova.linha.professor_nome === "Prof Teste" &&
    nova.linha.professor_email === "prof@teste.br" && nova.linha.tela === "scanner" &&
    nova.linha.importancia === "Ajudaria muito" && nova.linha.texto.indexOf("[aluno]") >= 0 &&
    nova.linha.texto.indexOf("Maria Clara Souza") < 0 &&
    nova.linha.id && nova.linha.criado_em && nova.linha.dono === undefined, nova && nova.linha);
  var erroEnviado = envio.enviados.filter(function (e) { return e.tabela === "ajuda_erros"; })[0];
  check("o erro relatado sobe com o texto do professor e a mensagem técnica",
    Boolean(erroEnviado) && erroEnviado.linha.texto_usuario === "A câmera não abriu durante a chamada." &&
    erroEnviado.linha.mensagem_tecnica.indexOf("[aluno]") >= 0 &&
    erroEnviado.linha.origem === "captura" && erroEnviado.linha.versao === CACHE_SW &&
    /^fnv1-[0-9a-f]{8}$/.test(erroEnviado.linha.assinatura || ""),
    erroEnviado && erroEnviado.linha);
  check("a pilha capturada sobe dentro da mensagem técnica, já sem o nome",
    Boolean(erroEnviado) && /at /.test(erroEnviado.linha.mensagem_tecnica) &&
    erroEnviado.linha.mensagem_tecnica.indexOf("Maria Clara Souza") < 0,
    erroEnviado && erroEnviado.linha.mensagem_tecnica.slice(0, 160));

  var idempotente = await c.naPagina(async function () {
    window.__erroFake = { code: "23505", message: "duplicate key value violates unique constraint" };
    var chave = GabaSync.chaveLocal("ajuda");
    var dados = JSON.parse(localStorage.getItem(chave));
    var alvo = dados.sugestoes[0];
    alvo.status = "fila";
    localStorage.setItem(chave, JSON.stringify(dados));
    var antes = window.__enviados.length;
    GabaAjuda.reiniciarConta();
    GabaAjuda.aoAbrir();
    var limite = Date.now() + 5000;
    while (GabaAjuda.pendentes() > 0 && Date.now() < limite) {
      await new Promise(function (r) { setTimeout(r, 60); });
    }
    var final = JSON.parse(localStorage.getItem(chave)).sugestoes.filter(function (s) { return s.id === alvo.id; })[0];
    return {
      tentativas: window.__enviados.length - antes,
      pendentes: GabaAjuda.pendentes(),
      status: final.status,
      erro: final.erro || ""
    };
  }, []);
  check("reenvio com 23505 é tratado como já enviado, não como falha",
    idempotente.tentativas === 1 && idempotente.pendentes === 0 &&
    idempotente.status === "enviado" && idempotente.erro === "", idempotente);

  var falha = await c.naPagina(async function () {
    window.__erroFake = { code: "42501", message: "permission denied for table ajuda_duvidas" };
    var chave = GabaSync.chaveLocal("ajuda");
    var dados = JSON.parse(localStorage.getItem(chave));
    var alvo = dados.duvidas[0];
    alvo.status = "fila";
    localStorage.setItem(chave, JSON.stringify(dados));
    GabaAjuda.reiniciarConta();
    GabaAjuda.aoAbrir();
    var limite = Date.now() + 5000;
    while (Date.now() < limite) {
      var atual = JSON.parse(localStorage.getItem(chave)).duvidas[0];
      if (atual.erro) break;
      await new Promise(function (r) { setTimeout(r, 60); });
    }
    var parada = JSON.parse(localStorage.getItem(chave)).duvidas[0];
    var resultado = { status: parada.status, erro: parada.erro || "", pendentes: GabaAjuda.pendentes() };
    window.__erroFake = null;
    GabaAjuda.aoAbrir();
    var limite2 = Date.now() + 5000;
    while (GabaAjuda.pendentes() > 0 && Date.now() < limite2) {
      await new Promise(function (r) { setTimeout(r, 60); });
    }
    var depois = JSON.parse(localStorage.getItem(chave)).duvidas[0];
    resultado.depois = { pendentes: GabaAjuda.pendentes(), status: depois.status, erro: depois.erro || "" };
    return resultado;
  }, []);
  check("falha de verdade mantém na fila com o motivo",
    falha.status === "fila" && /permission denied/.test(falha.erro) && falha.pendentes === 1, falha);
  check("quando o banco volta, a fila tenta de novo e esvazia",
    falha.depois.pendentes === 0 && falha.depois.status === "enviado" && falha.depois.erro === "", falha.depois);

  /* o filtro ampliado e o funil de aviso() entram no fim da sequência: antes
     disso eles mudariam qual captura o botão "Relatar" pega logo acima */
  var filtro = await c.naPagina(function () {
    var antes = document.querySelectorAll("#erros-lista .ajuda-item").length;
    var pendentesAntes = GabaAjuda.pendentes();
    GabaApp.estado.alunos = (GabaApp.estado.alunos || []).concat([{
      nome: "Joana Pereira Lima", matricula: "12345678",
      responsavel: "Sebastião Lima Ferreira",
      email_responsavel: "sebastiao.lima@exemplo.br",
      telefone_responsavel: "27 99988-7766"
    }, {
      nome: "Pedro Henrique Alves", responsavel: "Marlene"
    }, {
      /* placeholder de importacao: se virasse token, apagaria "nao" de meia mensagem */
      nome: "Lucas Ribeiro Nunes", responsavel: "Não informado"
    }]);
    GabaApp.estado.turmas = (GabaApp.estado.turmas || []).concat([{ nome: "Turma 801 Norte" }]);
    GabaApp.estado.escolas = (GabaApp.estado.escolas || []).concat([{ nome: "Escola Estadual Modelo" }]);
    var casos = [
      "Falha ao salvar a ficha de Joana Pereira Lima",
      "Matrícula 12345678 não encontrada no banco",
      "Sem telefone do responsável: 27 99988-7766",
      "E-mail sebastiao.lima@exemplo.br recusado",
      "Turma 801 Norte travou o cadastro na Escola Estadual Modelo",
      "Nenhuma turma selecionada no cadastro da escola",
      "A prova tem 95 questões e o caderno suporta até 90",
      "Recado para Marlene não chegou",
      "Ainda não foi informado o motivo da falha"
    ].map(function (texto) {
      var r = GabaAjuda.varredura(texto);
      return { limpo: r.limpo, trocas: r.trocas };
    });
    /* o funil de aviso() registra o erro que o professor já viu, sem toast por cima */
    GabaApp.aviso("Falha de teste no funil: leitura de Joana Pereira Lima presa", "erro");
    var dados = JSON.parse(localStorage.getItem(GabaSync.chaveLocal("ajuda")) || "null");
    var novo = dados.erros[0];
    return {
      casos: casos, antes: antes,
      itens: document.querySelectorAll("#erros-lista .ajuda-item").length,
      pendentesAntes: pendentesAntes, pendentes: GabaAjuda.pendentes(),
      funil: novo && { mensagem: novo.mensagem, relatado: novo.relatado, origem: novo.origem },
      bruto: JSON.stringify(dados.erros).indexOf("Joana") >= 0
    };
  }, []);
  check("o filtro pega primeiro nome, matrícula, telefone e e-mail do responsável",
    filtro.casos.slice(0, 4).every(function (r) {
      return !/Joana|Pereira|Lima|Sebasti|12345678|99988|7766|sebastiao/i.test(r.limpo) && r.trocas > 0;
    }), filtro.casos.slice(0, 4));
  check("turma e escola saem por inteiro, sem rasurar a palavra comum da mensagem",
    filtro.casos[4].limpo.indexOf("801 Norte") < 0 &&
    filtro.casos[4].limpo.indexOf("Estadual Modelo") < 0 &&
    filtro.casos[4].trocas === 2 &&
    filtro.casos[5].limpo === "Nenhuma turma selecionada no cadastro da escola" &&
    filtro.casos[5].trocas === 0, filtro.casos.slice(4, 6));
  check("número de questão não é dado de aluno e continua na mensagem",
    filtro.casos[6].limpo === "A prova tem 95 questões e o caderno suporta até 90" &&
    filtro.casos[6].trocas === 0, filtro.casos[6]);
  check("responsavel cadastrado so com o primeiro nome tambem sai da mensagem",
    filtro.casos[7].limpo === "Recado para [aluno] não chegou" &&
    filtro.casos[7].trocas === 1, filtro.casos[7]);
  check("palavra do placeholder importado não vira marcador de nome",
    filtro.casos[8].limpo === "Ainda não foi informado o motivo da falha" &&
    filtro.casos[8].trocas === 0, filtro.casos[8]);
  check("o aviso de erro do app entra na lista, sem segundo toast e sem subir sozinho",
    filtro.itens === filtro.antes + 1 && Boolean(filtro.funil) &&
    filtro.funil.relatado === false && filtro.funil.origem === "captura" &&
    filtro.pendentes === filtro.pendentesAntes && filtro.bruto === false, filtro);

  /* agrupamento por assinatura: aritmética sobre texto já filtrado, não mexe em estado */
  var assinaturas = await c.naPagina(function () {
    function s(m, tela) { return GabaAjuda.assinaturaDe(m, tela, "gaba-omr-v1"); }
    return {
      quarenta: s("Leitor travou com 42 questões", "scanner"),
      quarentaCinco: s("Leitor travou com 45 questões", "scanner"),
      comLinha: s("Leitor travou com 42 questões (uiScanner.js:88)", "scanner"),
      outraTela: s("Leitor travou com 42 questões", "dashboard"),
      outroBug: s("QR da folha 7 não decodifica", "scanner"),
      comNome: s("Leitor travou na ficha de Joana Pereira Lima", "scanner"),
      formato: /^fnv1-[0-9a-f]{8}$/.test(s("x", "scanner"))
    };
  }, []);
  check("o mesmo número escrito de um jeito diferente continua no mesmo grupo",
    assinaturas.quarenta === assinaturas.quarentaCinco &&
    assinaturas.quarenta === assinaturas.comLinha &&
    assinaturas.quarenta !== assinaturas.outroBug, assinaturas);
  check("o mesmo texto em outra tela não vira o mesmo grupo",
    assinaturas.outraTela !== assinaturas.quarenta, assinaturas);
  check("o que viaja é o resumo, nunca a mensagem com o nome",
    assinaturas.formato === true && assinaturas.comNome.length === 13 &&
    assinaturas.comNome !== assinaturas.quarenta, assinaturas);

  await c.naPagina(function () {
    if (window.__gabaDBOriginal) {
      GabaDB.isConfigured = window.__gabaDBOriginal.isConfigured;
      GabaDB.getClient = window.__gabaDBOriginal.getClient;
    }
    GabaApp.estado.professor = null;
    GabaSync.definirConta(null);
    GabaAjuda.reiniciarConta();
    localStorage.removeItem(GabaSync.chaveLocal("ajuda"));
    return true;
  }, []);

  var erros = await c.naPagina(function () { return window.__errosAjuda || []; }, []);
  check("nenhum erro de javascript fora dos simulados", erros.length === 0, erros);

  c.fecha();
  await hud.fecharChrome(chrome);
  console.log(falhas ? "\n" + falhas + " FALHAS" : "\nAjuda: tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch(function (err) {
  console.error("erro no harness: " + (err && err.stack ? err.stack : err));
  process.exit(2);
});
