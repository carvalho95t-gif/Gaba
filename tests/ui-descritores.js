/* O seletor de descritor da aba Cadernos, no browser de verdade: a caixa da questao abre a lista
   do catalogo embutido, filtra pela disciplina e pelo ano do cabecalho, busca pela habilidade e
   preenche codigo e texto juntos — e continua aceitando texto livre.
   Precisa do servidor local: node tests/serve.js -> node tests/ui-descritores.js [porta] */
"use strict";

var hud = require("./hudChrome");

var porta = Number(process.argv[2] || 8789);
var BASE = "http://127.0.0.1:" + porta;
var falhas = 0;

function check(nome, cond, extra) {
  console.log((cond ? "ok   " : "FALHA ") + nome + (extra ? " — " + JSON.stringify(extra) : ""));
  if (!cond) falhas++;
}

(async function principal() {
  var chrome = await hud.abrirChrome(BASE + "/index.html");
  var c = hud.cliente(await hud.conectar("/index.html", chrome.porta));
  await c.espera("typeof GabaCaderno !== 'undefined' && typeof GabaDescritores !== 'undefined'", 60000);
  await c.naPagina(function () {
    window.__erros = [];
    window.addEventListener("error", function (e) { window.__erros.push(String((e && e.message) || e)); });
    window.addEventListener("unhandledrejection", function (ev) {
      window.__erros.push("rejeicao: " + String((ev && ev.reason && ev.reason.message) || ev && ev.reason));
    });
    return "vigiando";
  }, []);

  var montado = await c.naPagina(async function () {
    var buf = await (await fetch("/_sample.docx")).arrayBuffer();
    await GabaCaderno.importarDocx(new File([buf], "PROVA_DESC.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }));
    var prova = GabaCaderno.estado.provasLocais[0];
    var sel = document.getElementById("cad-prova");
    sel.value = String(prova.id);
    document.getElementById("cad-disciplina").value = "Matemática";
    document.getElementById("cad-ano").value = "9º ano EF";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      questoes: (prova.questoes || []).length,
      linhas: document.querySelectorAll("#cad-questoes .q-rev[data-q]").length,
      catalogo: GabaDescritores.total,
      embutido: GabaDescritores.todos().filter(function (r) { return r.descricao; }).length
    };
  }, []);
  check("a prova de exemplo desenhou uma linha por questão",
    montado.linhas === montado.questoes && montado.linhas > 0, montado);
  check("o catálogo das matrizes vem embutido no app", montado.catalogo > 400 && montado.embutido > 400, montado);

  var aberto = await c.naPagina(function () {
    var el = document.querySelector('#cad-questoes .q-rev[data-q="1"] .q-desc');
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    var sel = GabaCaderno.seletorDeDescritor;
    var caixa = document.getElementById("q-pick");
    var itens = sel.itens();
    var distintas = itens.map(function (r) { return r.disciplina; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var anos = itens.map(function (r) { return r.anoChave; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    return {
      aberto: sel.aberto(),
      expandida: el.getAttribute("aria-expanded"),
      visiveis: caixa ? caixa.querySelectorAll(".q-pick-item").length : 0,
      rodape: caixa && caixa.querySelector(".q-pick-foot") ? caixa.querySelector(".q-pick-foot").textContent : "",
      total: itens.length,
      disciplinas: distintas,
      anos: anos,
      primeira: itens.length ? { codigo: itens[0].codigo, texto: itens[0].descricao.slice(0, 40) } : null
    };
  }, []);
  check("a caixa de descritor abre a lista do catálogo sozinha",
    aberto.aberto === true && aberto.visiveis > 0 && aberto.expandida === "true", aberto);
  check("a lista vem filtrada pela disciplina do caderno",
    aberto.disciplinas.length === 1 && aberto.disciplinas[0] === "Matemática", aberto.disciplinas);
  check("a lista vem filtrada pelo ano do caderno", aberto.anos.length === 1 && aberto.anos[0] === "9:EF", aberto.anos);
  check("a lista mostra só as 60 primeiras linhas e avisa do resto",
    aberto.visiveis === Math.min(aberto.total, 60) && aberto.total > 60,
    { visiveis: aberto.visiveis, total: aberto.total });
  check("o rodapé diz o filtro e o tamanho do catálogo", /Matem/.test(aberto.rodape) && /9/.test(aberto.rodape), aberto.rodape);

  var buscado = await c.naPagina(function () {
    var el = document.querySelector('#cad-questoes .q-rev[data-q="1"] .q-desc');
    var sel = GabaCaderno.seletorDeDescritor;
    el.value = "circunferência";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    var itens = sel.itens();
    return {
      total: itens.length,
      todasComACura: itens.every(function (r) { return GabaDescritores.despido(r.descricao).indexOf("circunferencia") >= 0; }),
      codigos: itens.map(function (r) { return r.codigo; }),
      ativo: sel.ativo()
    };
  }, []);
  check("buscar por uma palavra da habilidade enxuga a lista",
    buscado.total > 0 && buscado.total < aberto.total, buscado);
  check("a busca casa acento: \"circunferência\" acha o que o PDF escreveu sem acento também",
    buscado.todasComACura, buscado.codigos);
  check("a busca mantém a primeira linha ativa para o Enter", buscado.ativo === 0, buscado);

  var escolhido = await c.naPagina(function () {
    var sel = GabaCaderno.seletorDeDescritor;
    var linha = document.querySelector('#cad-questoes .q-rev[data-q="1"]');
    var alvo = sel.itens()[sel.ativo()];
    sel.mover(1);
    var outro = sel.itens()[sel.ativo()];
    sel.escolher(sel.ativo());
    var prova = GabaCaderno.estado.provasLocais[0];
    var q = prova.questoes[0];
    return {
      alvo: { codigo: outro.codigo, texto: outro.descricao },
      naCaixa: linha.querySelector(".q-desc").value,
      naHabilidade: linha.querySelector(".q-bncc").value,
      naProva: { descritor: q.descritor, habilidade: q.habilidade_bncc },
      fechado: sel.aberto() === false,
      sumiu: document.getElementById("q-pick").hidden,
      status: document.getElementById("cad-status").textContent.replace(/\s+/g, " ")
    };
  }, []);
  check("escolher uma linha preenche o código na caixa da questão",
    escolhido.naCaixa === escolhido.alvo.codigo && escolhido.naProva.descritor === escolhido.alvo.codigo, escolhido);
  check("escolher uma linha preenche a habilidade do catálogo no campo BNCC",
    escolhido.naHabilidade === escolhido.alvo.texto && escolhido.naProva.habilidade === escolhido.alvo.texto,
    { esperado: escolhido.alvo.texto, veio: escolhido.naHabilidade });
  check("a escolha fecha a lista e conta o que fez",
    escolhido.fechado && escolhido.sumiu && /descritor/.test(escolhido.status), escolhido.status);

  var reaberto = await c.naPagina(function () {
    var sel = GabaCaderno.seletorDeDescritor;
    var el = document.querySelector('#cad-questoes .q-rev[data-q="1"] .q-desc');
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    var comCodigoNaCaixa = sel.itens().length;
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    var foraFechou = sel.aberto() === false;
    sel.abrir(el);
    var reaberta = sel.itens().length;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    var ativoAposSeta = sel.ativo();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return {
      /* o código que já está na caixa não vale como busca: a lista volta cheia */
      comCodigoNaCaixa: comCodigoNaCaixa, reaberta: reaberta, foraFechou: foraFechou,
      ativoAposSeta: ativoAposSeta, fechouNoEscape: sel.aberto() === false
    };
  }, []);
  check("reabrir com o código escolhido mostra a lista inteira, não uma linha só",
    reaberto.comCodigoNaCaixa === reaberto.reaberta && reaberto.reaberta > 60, reaberto);
  check("um clique fora fecha a lista", reaberto.foraFechou, reaberto);
  check("a seta de baixo desce na lista", reaberto.ativoAposSeta >= 1, reaberto);
  check("Escape fecha a lista", reaberto.fechouNoEscape, reaberto);

  var livre = await c.naPagina(function () {
    var linha = document.querySelector('#cad-questoes .q-rev[data-q="2"]');
    var el = linha.querySelector(".q-desc");
    el.value = "T001_INVENTADO";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    var q = GabaCaderno.estado.provasLocais[0].questoes[1];
    return { naProva: q.descritor, habilidade: q.habilidade_bncc };
  }, []);
  check("a caixa continua aceitando um código que não está no catálogo",
    livre.naProva === "T001_INVENTADO", livre);

  var semAno = await c.naPagina(function () {
    document.getElementById("cad-ano").value = "6º ano";
    var sel = GabaCaderno.seletorDeDescritor;
    var el = document.querySelector('#cad-questoes .q-rev[data-q="3"] .q-desc');
    el.value = "";
    sel.abrir(el);
    var itens = sel.itens();
    var doNono = itens.filter(function (r) { return r.anoChave === "9:EF"; }).length;
    sel.fechar();
    document.getElementById("cad-ano").value = "9º ano EF";
    return { total: itens.length, doNono: doNono, disciplinas: itens.map(function (r) { return r.disciplina; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }) };
  }, []);
  check("um ano sem matriz própria não deixa o seletor vazio: mostra a disciplina toda",
    semAno.total > 200 && semAno.doNono > 0 && semAno.disciplinas.length === 1, semAno);

  var erros = await c.naPagina(function () { return window.__erros || []; }, []);
  check("nenhum erro de javascript no seletor", erros.length === 0, erros);

  await c.naPagina(function () {
    localStorage.removeItem("gaba_caderno_cfg");
    localStorage.removeItem("gaba_lote_impresso");
    localStorage.removeItem("gaba_ultimo_lote");
    return "limpo";
  }, []);
  c.fecha();
  await hud.fecharChrome(chrome);
  console.log(falhas ? "\n" + falhas + " FALHAS" : "\nseletor de descritor: tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch(function (err) {
  console.error("erro no harness: " + (err && err.stack ? err.stack : err));
  process.exit(2);
});
