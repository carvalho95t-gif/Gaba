/* A aba Cadernos de verdade: cabecalho configuravel, duas colunas, encaixe automatico do corpo e
   persistencia no aparelho. Precisa do servidor local: node tests/serve.js -> node tests/ui-cadernos.js [porta] */
"use strict";

var hud = require("./hudChrome");

var porta = Number(process.argv[2] || 8789);
var BASE = "http://127.0.0.1:" + porta;
var falhas = 0;

function check(nome, cond, extra) {
  console.log((cond ? "ok   " : "FALHA ") + nome + (extra ? " — " + JSON.stringify(extra) : ""));
  if (!cond) falhas++;
}

async function dirigir() {
  var buf = await (await fetch("/_sample.docx")).arrayBuffer();
  await GabaCaderno.importarDocx(new File([buf], "PROVA_UI.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }));
  var prova = GabaCaderno.estado.provasLocais[0];
  document.getElementById("cad-prova").value = String(prova.id);
  document.getElementById("cad-modo").value = "turma";
  document.getElementById("cad-tipos").value = String((prova.tipos || []).length || 4);
  document.getElementById("cad-alt").checked = true;
  document.getElementById("cad-salt").value = "";
  document.getElementById("cad-modelo").value = "ama";
  document.getElementById("cad-colunas").value = "2";
  document.getElementById("cad-rede").value = "SECRETARIA DE TESTE";
  document.getElementById("cad-escola").value = "EEFM DA UI";
  document.getElementById("cad-professor").value = "Prof. Teste";
  document.getElementById("cad-ano").value = "9o ano EF";
  document.getElementById("cad-bimestre").value = "3o bimestre";
  document.getElementById("cad-data").value = "22/10/2026";
  document.getElementById("cad-instrucoes").value = "Marque so uma alternativa.\nNao destaque a folha.";
  document.getElementById("cad-por-pagina").value = "30";
  document.getElementById("cad-por-pagina").dispatchEvent(new Event("change"));
  var ret = await GabaCaderno.gerarLote();
  var cfg = JSON.parse(localStorage.getItem("gaba_caderno_cfg"));
  return {
    status: document.getElementById("cad-status").textContent.replace(/\s+/g, " "),
    avisos: [].slice.call(document.querySelectorAll("#cad-avisos li")).map(function (li) { return li.textContent; }),
    cfg: cfg,
    porPaginaNoCampo: document.getElementById("cad-por-pagina").value,
    folhas: ret.folhas,
    cadernos: ret.batch.itens.length,
    brancas: document.querySelectorAll("#print-root .folha-branco").length,
    temResposta: /folha-a4 folha-resposta/.test(document.getElementById("print-root").innerHTML)
  };
}

async function lerCampos() {
  function v(id) { var el = document.getElementById(id); return el ? el.value : null; }
  return {
    modelo: v("cad-modelo"), colunas: v("cad-colunas"), rede: v("cad-rede"), escola: v("cad-escola"),
    professor: v("cad-professor"), ano: v("cad-ano"), bimestre: v("cad-bimestre"), data: v("cad-data"),
    instrucoes: v("cad-instrucoes"), porPagina: v("cad-por-pagina"), branco: document.getElementById("cad-branco").checked
  };
}

(async function principal() {
  var chrome = await hud.abrirChrome(BASE + "/index.html");
  var c = hud.cliente(await hud.conectar("/index.html", chrome.porta));
  await c.espera("typeof GabaCaderno !== 'undefined' && typeof GabaApp !== 'undefined'", 60000);
  await c.naPagina(function () {
    window.__erros = [];
    window.addEventListener("error", function (e) { window.__erros.push(String((e && e.message) || e)); });
    window.addEventListener("unhandledrejection", function (ev) {
      window.__erros.push("rejeicao: " + String((ev && ev.reason && ev.reason.message) || ev && ev.reason));
    });
    return "vigiando";
  }, []);
  var r = await c.naPagina(dirigir, []);
  console.log("status: " + r.status);
  if (r.avisos.length) console.log("avisos: " + r.avisos.join(" | "));

  check("o status diz quantas colunas sairam no papel", /2 coluna/.test(r.status), r.status);
  check("o status avisa das folhas em branco do fim", /em branco/.test(r.status), r.status);
  check("a previa comeca com a folha de respostas", r.temResposta === true);
  check("o encaixe automatico derrubou as 30 questoes por pagina",
    Number(r.cfg.questoesPorPagina) < 30 && Number(r.porPaginaNoCampo) === Number(r.cfg.questoesPorPagina),
    { cfg: r.cfg.questoesPorPagina, campo: r.porPaginaNoCampo });
  check("o cabecalho digitado ficou no aparelho",
    r.cfg.rede === "SECRETARIA DE TESTE" && r.cfg.escola === "EEFM DA UI" && r.cfg.ano === "9o ano EF" &&
    r.cfg.professor === "Prof. Teste" && r.cfg.modelo === "ama", r.cfg);
  check("cada caderno termina com exatamente uma folha em branco",
    r.cadernos > 0 && r.brancas === r.cadernos, { cadernos: r.cadernos, brancas: r.brancas });
  check("as instrucoes do professor ganham do texto do modelo",
    /Marque so uma alternativa/.test(r.cfg.instrucoes || ""), r.cfg.instrucoes);

  var erros = await c.naPagina(function () { return window.__erros || []; }, []);
  check("nenhum erro de javascript ao gerar o lote", erros.length === 0, erros);

  /* o papel obedece outro CSS: aqui se pega o que so aparece na impressao */
  await c.chama("Emulation.setEmulatedMedia", { media: "print" });
  var noPapel = await c.naPagina(function () {
    var raiz = document.getElementById("print-root");
    var cs = getComputedStyle(raiz);
    var topo = raiz.getBoundingClientRect().top;
    var mm = function (px) { return Math.round(px / 96 * 25.4 * 10) / 10; };
    var folhas = [].slice.call(raiz.querySelectorAll("article.folha-a4"));
    var deslocadas = [], semCab = [], semPe = [];
    folhas.forEach(function (a, i) {
      var r = a.getBoundingClientRect();
      if (Math.abs(mm(r.top - topo) - i * 297) > 0.6) deslocadas.push(i + ":" + mm(r.top - topo));
      if (/folha-branco/.test(a.className)) return;
      var cab = a.querySelector(".folha-cabecalho"), pe = a.querySelector(".folha-rodape");
      if (!cab || getComputedStyle(cab).display === "none" || !cab.getBoundingClientRect().height) semCab.push(i);
      if (!pe || getComputedStyle(pe).display === "none" || !pe.getBoundingClientRect().height) semPe.push(i);
    });
    var folha = raiz.querySelector(".folha-resposta");
    var cab = folha.querySelector(".folha-cabecalho");
    var limites = folha.getBoundingClientRect();
    /* o QR e as quatro marcas sao o que o leitor mede: nada pintado pode encostar neles,
       encostados ou nao, e nenhuma marca pode cair na faixa que a impressora corta */
    var zonas = [].slice.call(folha.querySelectorAll(".folha-qr, .fiducial")).map(function (el) {
      return {
        nome: el.classList.contains("fiducial") ? "marca " + el.className.replace(/fiducial fid-?/, "") : "qr",
        el: el, r: el.getBoundingClientRect(), marca: el.classList.contains("fiducial")
      };
    });
    var pinta = function (el) {
      if (el.tagName === "IMG") return true;
      var st = getComputedStyle(el);
      return ["Top", "Right", "Bottom", "Left"].some(function (lado) {
        return parseFloat(st["border" + lado + "Width"]) > 0 && st["border" + lado + "Style"] !== "none";
      }) || st.backgroundImage !== "none" || (st.backgroundColor && st.backgroundColor !== "rgba(0, 0, 0, 0)");
    };
    var encosta = [], folgaZona = {}, foraBorda = [];
    zonas.forEach(function (z) {
      var menor = -1;
      [].slice.call(folha.querySelectorAll("*")).forEach(function (el) {
        if (el === z.el || z.el.contains(el) || el.contains(z.el)) return;
        var r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || !pinta(el)) return;
        var st = getComputedStyle(el);
        var envolve = r.left <= z.r.left && r.right >= z.r.right && r.top <= z.r.top && r.bottom >= z.r.bottom;
        if (envolve) {
          /* a moldura do cartao fecha em volta das marcas: o que conta e o branco entre a marca
             e a linha, por dentro; um fundo pintado embaixo da marca encosta de qualquer jeito */
          var cheio = st.backgroundImage !== "none" || (st.backgroundColor && st.backgroundColor !== "rgba(0, 0, 0, 0)");
          var vao = mm(Math.min(z.r.left - r.left - parseFloat(st.borderLeftWidth), r.right - z.r.right - parseFloat(st.borderRightWidth),
            z.r.top - r.top - parseFloat(st.borderTopWidth), r.bottom - z.r.bottom - parseFloat(st.borderBottomWidth)));
          if (cheio || vao < 1) encosta.push(z.nome + " dentro de " + el.className + " a " + vao + "mm da linha");
          return;
        }
        var dx = Math.max(0, Math.max(r.left - z.r.right, z.r.left - r.right));
        var dy = Math.max(0, Math.max(r.top - z.r.bottom, z.r.top - r.bottom));
        var gap = mm(Math.sqrt(dx * dx + dy * dy));
        if (!dx && !dy) { encosta.push(z.nome + " x " + el.className); return; }
        /* a grade de bolhas tem a propria guarda de fundo no layout, nao entra como vizinho */
        if (el.closest(".folha-cartao")) return;
        if (menor < 0 || gap < menor) menor = gap;
      });
      folgaZona[z.nome] = menor;
      if (z.marca) {
        var b = Math.min(mm(z.r.left - limites.left), mm(limites.right - z.r.right),
          mm(z.r.top - limites.top), mm(limites.bottom - z.r.bottom));
        if (b < 10) foraBorda.push(z.nome + ":" + b + "mm");
      }
    });
    var qrZona = zonas.filter(function (z) { return z.nome === "qr"; })[0];
    return { folhas: folhas.length, fundo: cs.backgroundColor, padding: cs.paddingTop,
      encosta: encosta.slice(0, 4), folgaZona: folgaZona, foraBorda: foraBorda,
      folgaQr: cab && qrZona ? mm(cab.getBoundingClientRect().left - qrZona.r.right) : -1,
      deslocadas: deslocadas.slice(0, 4), semCab: semCab.slice(0, 4), semPe: semPe.slice(0, 4) };
  }, []);
  await c.chama("Emulation.setEmulatedMedia", { media: "" });
  check("no papel cada folha cai exatamente numa pagina A4",
    noPapel.deslocadas.length === 0, noPapel.deslocadas);
  check("no papel a folha mantem cabecalho e rodape de identificacao",
    noPapel.semCab.length === 0 && noPapel.semPe.length === 0, noPapel);
  check("no papel a previa nao pinta fundo cinza nem empurra as folhas",
    noPapel.fundo === "rgb(255, 255, 255)" && noPapel.padding === "0px", noPapel);
  check("no papel nenhuma linha ou faixa passa por cima do QR ou das marcas de leitura",
    noPapel.encosta.length === 0, noPapel.encosta);
  check("no papel as quatro marcas de leitura ficam a 10mm da borda da folha",
    noPapel.foraBorda.length === 0, noPapel.foraBorda);
  var folgasZona = Object.keys(noPapel.folgaZona || {}).map(function (k) { return noPapel.folgaZona[k]; })
    .filter(function (v) { return v >= 0; });
  check("no papel todo vizinho pintado deixa folga em torno das zonas de leitura",
    folgasZona.length === 5 && Math.min.apply(null, folgasZona) >= 3.5, noPapel.folgaZona);
  check("no papel o cabecalho deixa folga de silencio ate o QR",
    noPapel.folgaQr >= 4, noPapel.folgaQr);

  await c.chama("Page.navigate", { url: BASE + "/index.html" });
  await c.espera("typeof GabaCaderno !== 'undefined' && document.getElementById('cad-modelo').options.length > 1", 60000);
  var deVolta = await c.naPagina(lerCampos, []);
  check("depois de recarregar a aba traz o modelo e as colunas de volta",
    deVolta.modelo === "ama" && deVolta.colunas === "2", deVolta);
  check("depois de recarregar a aba traz o cabecalho digitado de volta",
    deVolta.rede === "SECRETARIA DE TESTE" && deVolta.escola === "EEFM DA UI" && deVolta.ano === "9o ano EF" &&
    deVolta.bimestre === "3o bimestre" && deVolta.data === "22/10/2026" &&
    /Marque so uma alternativa/.test(deVolta.instrucoes), deVolta);
  check("depois de recarregar a aba mantem o encaixe e a pagina em branco",
    Number(deVolta.porPagina) === Number(r.cfg.questoesPorPagina) && deVolta.branco === true, deVolta);

  await c.naPagina(function () {
    localStorage.removeItem("gaba_caderno_cfg");
    localStorage.removeItem("gaba_lote_impresso");
    localStorage.removeItem("gaba_ultimo_lote");
    return "limpo";
  }, []);
  c.fecha();
  await hud.fecharChrome(chrome);
  console.log(falhas ? "\n" + falhas + " FALHAS" : "\naba de cadernos: tudo certo");
  process.exit(falhas ? 1 : 0);
})().catch(function (err) {
  console.error("erro no harness: " + (err && err.stack ? err.stack : err));
  process.exit(2);
});
