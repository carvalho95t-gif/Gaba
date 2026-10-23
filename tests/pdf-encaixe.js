/* Confere o papel de verdade: monta um lote, imprime em PDF com flags fixas e le o PDF de volta.
   Di dois o que a previa na tela nao pode dizer: se o numero de folhas bate com o numero de
   paginas e se toda linha que existe na previa existe no arquivo impresso.
   Uso: node tests/serve.js 8791   (em outra janela)   ->   node tests/pdf-encaixe.js 8791 [alunos] [colunas] [estress] [foto]
   "estress" troca a prova exemplo pelo pior conteudo possivel: rede e escola de nome enorme,
   seis instrucoes, aluna de nome composto, descritor, nove alternativas longas, URL e codigo sem
   espaco. "foto" salva tests/encaixe-capa.png para julgar a letra compactada. */
"use strict";

var hud = require("./hudChrome");
var fs = require("fs");
var path = require("path");

var RAIZ = path.resolve(__dirname, "..");
var porta = Number(process.argv[2] || 8791);
var BASE = "http://127.0.0.1:" + porta;
var N_ALUNOS = Math.max(1, Number(process.argv[3] || 3));
var COLUNAS = Number(process.argv[4] || 2) === 1 ? 1 : 2;
var ESTRESS = String(process.argv[5] || "") === "estress";
var FOTO = process.argv.indexOf("foto") >= 0;
var SAIDA = path.join(RAIZ, "tests", "encaixe" + (ESTRESS ? "-estress" : "") + "-" + COLUNAS + "col.pdf");
var FOTINHO = path.join(RAIZ, "tests", "encaixe-capa.png");

require(path.join(RAIZ, "js", "pdfParser.js"));

/* ===== roda dentro da pagina ===== */

async function preparar(sampleUrl, n, colunas, estress) {
  /* o pior cabecalho que uma escola publica digitaria de verdade: rede com tres niveis, escola
     que nao cabe numa linha, professor com nome composto e serie por extenso. e o pior corpo:
     alternativa que troca de linha, token que a hifenizacao nao quebra e um enunciado maior que a
     coluna inteira. sem isso o verificador so conhece a prova exemplo, que sempre coube. tudo
     mora dentro desta funcao: da pagina, so esta funcao e enxergada. */
  var cab = estress ? {
    rede: "SECRETARIA DA EDUCACAO DO ESTADO DO CEARA - SUPERINTENDENCIA DA AREA DE FORTALEZA - " +
      "6a COORDENADORIA REGIONAL DE DESENVOLVIMENTO DA EDUCACAO",
    escola: "ESCOLA DE EDUCACAO BASICA PROFESSOR ANISIO TEIXEIRA DE MENEZES E SILVA CHAGAS",
    titulo: "Avaliacao bimestral de recuperacao paralela e conselho de classe",
    disciplina: "Lingua Portuguesa, Literatura e Producao de Texto",
    professor: "Professora Doutora Maria Fernanda Albuquerque Cavalcante de Oliveira e Souza",
    ano: "2o ano do Ensino Medio integrado a Educacao Profissional de Nivel Tecnico em Analise " +
      "e Desenvolvimento de Sistemas",
    bimestre: "3o bimestre letivo de 2026",
    data: "22/10/2026",
    instrucoes: "Leia cada questao com atencao antes de marcar e use apenas caneta azul ou preta.\n" +
      "Marque uma unica alternativa por questao; duas marcas na mesma bolinha anulam a questao.\n" +
      "Nao rasure o cartao de respostas e nao use corretivo: a leitura e feita por maquina.\n" +
      "O tempo total desta avaliacao e de quatro horas, ja incluido o tempo de preenchimento.\n" +
      "So sera permitido sair da sala com o caderno de questoes apos trinta minutos do inicio.\n" +
      "Qualquer tentativa de consulta ou comunicacao entre estudantes anula a avaliacao dos dois."
  } : {
    rede: "SECRETARIA MUNICIPAL DE EDUCACAO", escola: "EEFM DEMONSTRACAO GABA",
    professor: "Prof. Demonstracao", ano: "2a serie EM", bimestre: "3o bimestre",
    data: "22/10/2026", titulo: "", disciplina: "", instrucoes: ""
  };
  var tokenSemEspaco = "https://www.educacao.ce.gov.br/portal/avaliacoes/diario-oficial-do-estado-" +
    "anexo-iii-retificacao-da-portaria-numero-1478-de-2026";
  var buf = await (await fetch(sampleUrl)).arrayBuffer();
  var file = new File([buf], "ENCAIXE.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
  await GabaCaderno.importarDocx(file);
  var prova = GabaCaderno.estado.provasLocais[0];
  if (!prova) throw new Error("a prova nao importou pelo caminho do app");
  document.getElementById("cad-prova").value = String(prova.id);
  document.getElementById("cad-modo").value = "fixa";
  document.getElementById("cad-tipos").value = "1";
  document.getElementById("cad-alt").checked = false;
  document.getElementById("cad-salt").value = "";
  document.getElementById("cad-colunas").value = String(colunas);
  document.getElementById("cad-rede").value = cab.rede;
  document.getElementById("cad-escola").value = cab.escola;
  document.getElementById("cad-professor").value = cab.professor;
  document.getElementById("cad-ano").value = cab.ano;
  document.getElementById("cad-bimestre").value = cab.bimestre;
  document.getElementById("cad-data").value = cab.data;
  if (estress) {
    document.getElementById("cad-titulo").value = cab.titulo;
    document.getElementById("cad-disciplina").value = cab.disciplina;
    document.getElementById("cad-instrucoes").value = cab.instrucoes;
    document.getElementById("cad-descritores").checked = true;
    var textoGrosso = new Array(24).join("palavra-longa-de-teste que enche a coluna e empurra o resto ");
    var altLongas = "ABCDEFGHII".split("").map(function (l, k) {
      return { letra: l, texto: "Alternativa " + l + " com texto comprido o bastante para trocar de linha " +
        "dentro da coluna e ainda ganhar uma segunda linha em algumas larguras (" + (k + 1) + ")." };
    });
    (prova.questoes = prova.questoes || []).push({
      numero: prova.questoes.length + 1,
      descritor: "(E3) Identificar, em um texto lido, a intertextualidade entre duas tradicoes discursivas.",
      enunciado: "Considere o documento oficial disponivel em " + tokenSemEspaco +
        " e responda ao comando a seguir. " + textoGrosso,
      comando: "Transcreva sem alterar o codigo TRN2026MATRICULAUNIFICADADOESTADODOCEARASECRETARIADE" +
        "EDUCACAO1975ANEXOIII e depois assinale a alternativa que explica o procedimento previsto no anexo.",
      alternativas: altLongas,
      gabarito: "A"
    });
    if (prova.gabarito && prova.gabarito.length) prova.gabarito.push("A");
    prova.quantidade_questoes = prova.questoes.length;
  }
  var alunos = [];
  for (var i = 1; i <= n; i++) {
    alunos.push({
      id: String(i), numero: i,
      /* nome de mentirinha, comprido de proposito para apertar a linha do cabecalho — de
         proposito sem cara de aluno real, porque este arquivo vai para o repositorio */
      nome: estress ? "ALUNA DE TESTE NOME COMPOSTO EXTENSO DA SILVA E SOUZA REZENDE " + i :
        "ALUNO DE TESTE " + (i < 10 ? "0" : "") + i,
      matricula: estress ? "2026" + (i < 10 ? "00" : "0") + i + "-SEC-EDUCACAO-BA" + (i < 10 ? "0" : "") + i : "",
      turma: "TURMA ENCAIXE"
    });
  }
  GabaCaderno.estado.alunos = alunos;
  var r = await GabaCaderno.gerarLote();
  var root = document.getElementById("print-root");
  var SELETORES = ".folha-rotulo, .folha-desc, .folha-enunciado, .folha-comando, .folha-alt li, " +
    ".folha-cabecalho p, .folha-instrucoes p, .folha-hint, .folha-rodape";
  var mmPx = function (px) { return Math.round(px * 25.4 / 96 * 10) / 10; };
  var folhas = [].slice.call(root.querySelectorAll("article.folha-a4")).map(function (a) {
    var area = a.querySelector(".folha-area");
    var cab = a.querySelector(".folha-cabecalho");
    return {
      tipo: a.className.replace("folha-a4", "").trim(),
      versao: a.getAttribute("data-versao") || "",
      aluno: a.getAttribute("data-aluno") || "",
      /* geometria guarda o diagnostico: quando falta texto no papel, e estas tres medidas que
         dizem se foi a coluna que estourou ou a pagina inteira que passou de 297 mm */
      geo: {
        pagina: mmPx(a.scrollHeight) + "/" + mmPx(a.clientHeight),
        area: area ? mmPx(area.scrollHeight) + "/" + mmPx(area.clientHeight) : "-",
        cabecalho: cab ? mmPx(cab.getBoundingClientRect().height) : "-"
      },
      linhas: [].slice.call(a.querySelectorAll(SELETORES)).map(function (el) {
        return (el.textContent || "").replace(/\s+/g, " ").trim();
      }).filter(function (t) { return t.length > 1; })
    };
  });
  /* diagnostico do que o gate ainda nao vigia: as caixas de tamanho fixo do papel (cabecalho da
     folha de respostas, instrucoes da capa, rodape) tem max-height + overflow hidden e cortam o
     proprio texto sem passar por nenhuma .folha-area */
  var caixas = [];
  [].slice.call(root.querySelectorAll(".folha-a4")).forEach(function (folha, fi) {
    var rotulo = folha.className.replace("folha-a4", "").trim();
    [].slice.call(folha.querySelectorAll(".folha-cabecalho, .folha-instrucoes, .folha-rodape, .folha-resultado"))
      .forEach(function (caixa) {
        var sobra = mmPx(caixa.scrollHeight - caixa.clientHeight);
        if (sobra > 0.6) {
          caixas.push("folha " + (fi + 1) + " (" + rotulo + "): ." + caixa.className +
            " corta " + sobra.toFixed(1) + " mm do proprio texto");
        }
      });
  });
  /* quanto o cabecalho da folha de respostas ainda tem de chao ate a primeira bolha: se a caixa
     tem max-height menor que a folga, ela se corta sozinha e compactar a fonte e tratar sintoma */
  var folga = null;
  var capa = root.querySelector(".folha-resposta");
  if (capa) {
    var caixaCab = capa.querySelector(".folha-cabecalho");
    var bolhas = [].slice.call(capa.querySelectorAll(".folha-q"));
    if (caixaCab && bolhas.length) {
      var topoFolha = capa.getBoundingClientRect().top;
      var rr = caixaCab.getBoundingClientRect();
      var primeira = Math.min.apply(null, bolhas.map(function (b) { return b.getBoundingClientRect().top; }));
      folga = {
        caixa: mmPx(rr.height).toFixed(1),
        precisaria: mmPx(caixaCab.scrollHeight * (rr.height / Math.max(1, caixaCab.clientHeight))).toFixed(1),
        fundo: mmPx(rr.bottom - topoFolha).toFixed(1),
        bolha: mmPx(primeira - topoFolha).toFixed(1),
        corpo: (parseFloat(getComputedStyle(caixaCab).getPropertyValue("--cab")) || 1)
      };
    }
  }
  return {
    questoes: (prova.questoes || []).length,
    cadernos: r.batch.itens.length,
    folhasDoApp: r.folhas,
    medido: r.porPagina,
    cortes: GabaCaderno.estado.cortes,
    caixas: caixas,
    folga: folga,
    compactou: GabaCaderno.estado.compactou || 0,
    degraus: [].slice.call(root.querySelectorAll(".folha-compacta-1, .folha-compacta-2, .folha-compacta-3"))
      .map(function (caixa) {
        var classe = caixa.className.match(/folha-compacta-(\d)/)[1];
        var alvo = caixa.querySelector("p") || caixa;
        return {
          caixa: caixa.className.replace(/ ?folha-compacta-\d/, "").trim(),
          degrau: Number(classe),
          corpo: (parseFloat(getComputedStyle(alvo).fontSize) * 72 / 96).toFixed(1) + "pt"
        };
      }),
    folhas: folhas
  };
}

/* o gate so vale se ele denuncia um corte de verdade: encolhemos a coluna e conferimos que ele
   grita, e que volta ao silencio quando a coluna volta ao tamanho medido */
function provocarCorte(mm) {
  var root = document.getElementById("print-root");
  var areas = [].slice.call(root.querySelectorAll(".folha-questoes .folha-area"));
  areas.forEach(function (a) {
    a.style.height = mm + "mm";
    a.style.flex = "0 0 " + mm + "mm";
  });
  var gritou = GabaFolha.conferirEncaixe(root).length;
  areas.forEach(function (a) { a.style.height = ""; a.style.flex = ""; });

  /* o vazamento lateral e a outra metade: um <p> de bloco nunca alarga o proprio retangulo,
     entao a palavra que nao cabe passaria por cima da margem sem o rect denunciar nada.
     proibimos a quebra da linha mais longa do corpo e esperamos a denuncia pelo scrollWidth. */
  var candidatas = [].slice.call(root.querySelectorAll(".folha-questoes .folha-enunciado, .folha-questoes .folha-comando"));
  var linha = candidatas.sort(function (a, b) {
    return (b.textContent || "").length - (a.textContent || "").length;
  })[0] || null;
  var vazou = 0;
  var lateral = 0;
  if (linha) {
    linha.style.whiteSpace = "nowrap";
    vazou = linha.scrollWidth - linha.clientWidth;
    lateral = GabaFolha.conferirEncaixe(root).filter(function (t) {
      return t.indexOf("borda direita") >= 0;
    }).length;
    linha.style.whiteSpace = "";
  }

  return { areas: areas.length, gritou: gritou, lateral: lateral, temLinha: !!linha,
    vazouMm: Math.round(vazou * 25.4 / 96 * 10) / 10,
    calou: GabaFolha.conferirEncaixe(root).length };
}

/* o numero diz se o cabecalho compactado bate com a primeira bolha; a foto e o que deixa o
   gente julgar se ainda da para ler. sem a foto, letra de 6 pt passaria por "encaixe perfeito". */
function quadradoDaCapa() {
  var capa = document.querySelector("#print-root .folha-resposta");
  if (!capa) return null;
  capa.scrollIntoView({ block: "start" });
  var r = capa.getBoundingClientRect();
  var cab = capa.querySelector(".folha-cabecalho").getBoundingClientRect();
  return {
    x: Math.round(r.left), y: Math.round(r.top),
    width: Math.round(r.width), height: Math.round(Math.min(r.height, 170)),
    fundoDoCabecalho: Math.round(cab.bottom - r.top),
    degrau: (capa.querySelector(".folha-cabecalho").className.match(/folha-compacta-(\d)/) || [, "0"])[1]
  };
}

/* ===== roda no node ===== */

/* acento e espaco nao existem no papel: o Chrome imprime o texto em glifos posicionados um a
   um ("A V ALIA CA O") e a hifenizacao acrescenta traco. dobrar os dois lados e comparar
   subsequencia e o unico teste que nao quebra por causa disso. */
function dobrar(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sequenciaDoCaderno(folhas) {
  var grupos = {}, ordem = [];
  folhas.forEach(function (f) {
    var k = f.aluno + "|" + f.versao;
    if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
    grupos[k].push(f.tipo);
  });
  return ordem.map(function (k) { return grupos[k]; });
}

function mediaCaixas(pdfBytes) {
  var txt = pdfBytes.toString("latin1");
  var re = /\/MediaBox\s*\[\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s*\]/g;
  var m, vistos = {};
  while ((m = re.exec(txt))) vistos[m[3] + "x" + m[4]] = (vistos[m[3] + "x" + m[4]] || 0) + 1;
  return vistos;
}

(async function principal() {
  var probe = await fetch(BASE + "/index.html").catch(function () { return null; });
  if (!probe || !probe.ok) { console.error("rode primeiro: node tests/serve.js " + porta); process.exit(2); }

  console.log("Abrindo o app no Chrome (" + N_ALUNOS + " aluno(s), " + COLUNAS + " coluna(s)" +
    (ESTRESS ? ", cabecalho e corpo sob estresse" : "") + ")...");
  var chrome = await hud.abrirChrome(BASE + "/index.html");
  var falhas = [];
  var c;
  try {
    c = hud.cliente(await hud.conectar("/index.html", chrome.porta));
    await c.espera("typeof GabaCaderno !== 'undefined' && typeof GabaFolha !== 'undefined' && " +
      "typeof GabaFolha.conferirEncaixe === 'function'", 60000);

    var previa = await c.naPagina(preparar, [BASE + "/_sample.docx", N_ALUNOS, COLUNAS, ESTRESS]);
    console.log("  " + previa.questoes + " questoes, " + previa.cadernos + " caderno(s), " +
      previa.folhas.length + " folhas na previa, ate " + previa.medido + " por pagina");

    /* 1. o gate do app: o que o navegador desenhou cabe na coluna? */
    if (previa.cortes.length) {
      console.log("  CORTE NO DOM (" + previa.cortes.length + "):");
      previa.cortes.slice(0, 12).forEach(function (t) { console.log("    - " + t); });
      falhas.push(previa.cortes.length + " corte(s) medidos no DOM antes de imprimir");
    } else {
      console.log("  gate do DOM: nenhuma linha passa da coluna");
    }

    /* 1b. o que o app fez sozinho para caber: degraus de compactacao das caixas fixas */
    if (previa.degraus.length) {
      var piorDegrau = previa.degraus.reduce(function (a, d) { return Math.max(a, d.degrau); }, 0);
      console.log("  app compactou " + previa.compactou + " caixa(s) [degrau max " + piorDegrau + "]: " +
        previa.degraus.map(function (d) { return "." + d.caixa + " -> " + d.corpo; }).join(", "));
      if (previa.compactou !== previa.degraus.length) {
        falhas.push("o app dice ter compactado " + previa.compactou + " caixa(s) mas ha " +
          previa.degraus.length + " marcada(s)");
      }
    } else {
      console.log("  nenhuma caixa precisou de compactacao");
    }
    if (previa.folga) {
      console.log("  cabecalho da capa: caixa de " + previa.folga.caixa + " mm para um texto de " +
        previa.folga.precisaria + " mm; ela termina em " + previa.folga.fundo +
        " mm e a primeira bolha comeca em " + previa.folga.bolha + " mm");
    }

    /* 1c. as caixas fixas do papel cortam o proprio texto sem o gate ficar sabendo? */
    if (previa.caixas.length) {
      console.log("  CAIXA DE PAPEL CORTANDO O PROPRIO TEXTO (" + previa.caixas.length + "):");
      previa.caixas.slice(0, 8).forEach(function (t) { console.log("    - " + t); });
      falhas.push(previa.caixas.length + " caixa(s) de cabecalho/instrucoes/rodape cortam o proprio texto");
    } else {
      console.log("  cabecalho, instrucoes e rodape cabem nas suas caixas");
    }

    /* 1d. o gate denuncia um corte plantado de proposito? */
    var prova = await c.naPagina(provocarCorte, [40]);
    console.log("  gate com coluna de 40mm: " + prova.gritou + " denuncia(s) em " + prova.areas +
      " area(s); linha sem quebra vazou " + prova.vazouMm + " mm e o gate viu " + prova.lateral +
      " ; de volta ao tamanho medido: " + prova.calou);
    if (prova.vazouMm > 1 && prova.lateral < 1) {
      falhas.push("a linha vazou " + prova.vazouMm + " mm pela direita e o gate nao denunciou nada");
    }
    if (prova.areas && prova.gritou < prova.areas) {
      falhas.push("o gate nao denunciou todas as " + prova.areas + " areas cortadas (denunciou " + prova.gritou + ")");
    }
    if (prova.calou !== 0) {
      falhas.push("o gate continua acusando corte depois de desfazer (" + prova.calou + "): denuncia falsa");
    }

    /* 1e. a foto da capa, quando pedida */
    if (FOTO) {
      var q = await c.naPagina(quadradoDaCapa);
      if (q) {
        var shot = await c.chama("Page.captureScreenshot", {
          clip: { x: q.x, y: q.y, width: q.width, height: q.height, scale: 1.6 },
          captureBeyondViewport: true
        });
        fs.writeFileSync(FOTINHO, Buffer.from(shot.data, "base64"));
        console.log("  foto da capa (degrau " + q.degrau + ", cabecalho ate " + q.fundoDoCabecalho +
          " mm) em " + FOTINHO + " (" + fs.statSync(FOTINHO).size + " bytes)");
      }
    }

    /* 2. o PDF de verdade */
    console.log("Imprimindo em PDF com as flags fixas...");
    var pdf = await c.chama("Page.printToPDF", {
      landscape: false,
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
      displayHeaderFooter: false
    });
    var bytes = Buffer.from(pdf.data, "base64");
    fs.writeFileSync(SAIDA, bytes);
    console.log("  salvo em " + SAIDA + " (" + bytes.length + " bytes)");

    var lido = await globalThis.GabaPdf.parsePdf(new Uint8Array(bytes));
    var paginas = lido.porPagina || [];
    console.log("  PDF lido de volta: " + paginas.length + " pagina(s), " + lido.texto.length + " caracteres" +
      ((lido.avisos || []).length ? " | avisos: " + lido.avisos.join(" / ") : ""));

    /* 2a. geometria do papel */
    var caixas = mediaCaixas(bytes);
    var chaves = Object.keys(caixas);
    console.log("  MediaBox: " + chaves.join(", "));
    if (chaves.length !== 1) falhas.push("o PDF tem tamanhos de pagina diferentes: " + chaves.join(", "));
    else {
      var dim = chaves[0].split("x").map(Number);
      var mm = dim.map(function (pt) { return pt * 25.4 / 72; });
      if (Math.abs(mm[0] - 210) > 1 || Math.abs(mm[1] - 297) > 1) {
        falhas.push("a pagina nao e A4: " + mm[0].toFixed(1) + " x " + mm[1].toFixed(1) + " mm");
      } else {
        console.log("  pagina = " + mm[0].toFixed(1) + " x " + mm[1].toFixed(1) + " mm (A4)");
      }
    }

    /* 2b. uma folha por pagina, na ordem */
    if (paginas.length !== previa.folhas.length) {
      falhas.push("o PDF tem " + paginas.length + " pagina(s) para " + previa.folhas.length +
        " folha(s) da previa: " + (paginas.length > previa.folhas.length
          ? "sobrou pagina (quebra que estourou)" : "faltou pagina (folhas colaram)"));
    } else {
      console.log("  paginas do PDF = folhas da previa (" + paginas.length + ")");
    }

    /* 2c. cada linha da previa existe na pagina correspondente */
    var perdidas = [];
    var comparaveis = Math.min(paginas.length, previa.folhas.length);
    for (var k = 0; k < comparaveis; k++) {
      var papel = dobrar(paginas[k]);
      previa.folhas[k].linhas.forEach(function (linha) {
        var d = dobrar(linha);
        if (d.length < 3) return;
        if (papel.indexOf(d) < 0) perdidas.push("folha " + (k + 1) + " (" + previa.folhas[k].tipo + "): \"" +
          linha.substring(0, 64) + "\"");
      });
    }
    if (perdidas.length) {
      console.log("  TEXTO PERDIDO NO PAPEL (" + perdidas.length + " linha(s)):");
      perdidas.slice(0, 12).forEach(function (t) { console.log("    - " + t); });
      var culpada = previa.folhas.reduce(function (a, f, i) {
        return a || (perdidas.some(function (p) { return p.indexOf("folha " + (i + 1) + " (") === 0; }) ? f : null);
      }, null);
      if (culpada) {
        console.log("    geometria da primeira folha com perda: pagina " + culpada.geo.pagina +
          " mm, area " + culpada.geo.area + " mm, cabecalho " + culpada.geo.cabecalho + " mm");
        /* e a pergunta que separa os dois defeitos: o texto foi cortado ou a pagina do PDF nao e a
           folha que estamos comparando? se ele aparece inteiro em outra pagina, e ordem. */
        var kCulpada = previa.folhas.indexOf(culpada);
        var melhor = { acertos: 0, pagina: -1 };
        paginas.forEach(function (pg, j) {
          var pap = dobrar(pg);
          var acertos = culpada.linhas.filter(function (l) {
            var d = dobrar(l);
            return d.length >= 3 && pap.indexOf(d) >= 0;
          }).length;
          if (acertos > melhor.acertos) melhor = { acertos: acertos, pagina: j + 1 };
        });
        console.log("    a folha " + (kCulpada + 1) + " tem " + culpada.linhas.length + " linha(s); " +
          "a pagina do PDF que mais bate com ela e a " + melhor.pagina + " (" + melhor.acertos +
          " linha(s) encontradas)");
        if (melhor.pagina !== kCulpada + 1 && melhor.acertos === culpada.linhas.length) {
          falhas.push("as paginas do PDF nao estao na ordem das folhas da previa: a folha " +
            (kCulpada + 1) + " saiu na pagina " + melhor.pagina);
        }
      }
      falhas.push(perdidas.length + " linha(s) da previa nao aparecem na pagina correspondente do PDF");
    } else {
      console.log("  todo o texto da previa saiu na pagina correspondente do PDF");
    }

    /* 2d. o formato do caderno: resposta no topo, corpo, exatamente uma branca no fim */
    var cadernos = sequenciaDoCaderno(previa.folhas);
    cadernos.forEach(function (seq) {
      var corpo = seq.filter(function (t) { return t.indexOf("folha-questoes") >= 0; }).length;
      var brancos = seq.filter(function (t) { return t.indexOf("folha-branco") >= 0; }).length;
      var meio = seq.slice(1, seq.length - brancos);
      if (seq[0].indexOf("folha-resposta") < 0 || corpo < 1 || brancos !== 1 ||
        seq[seq.length - 1].indexOf("folha-branco") < 0 ||
        meio.some(function (t) { return t.indexOf("folha-questoes") < 0; })) {
        falhas.push("sequencia do caderno fora do padrao: " + seq.join(" > "));
      }
    });
    console.log("  cada um dos " + cadernos.length + " caderno(s): " + cadernos[0][0] + " > " +
      cadernos[0].filter(function (t) { return t.indexOf("folha-questoes") >= 0; }).length +
      " x folha-questoes > " + cadernos[0][cadernos[0].length - 1]);
  } finally {
    if (c) c.fecha();
    await hud.fecharChrome(chrome);
  }

  console.log("");
  if (falhas.length) {
    console.log("FALHA (" + falhas.length + "):");
    falhas.forEach(function (f) { console.log("  x " + f); });
    process.exit(1);
  }
  console.log("OK: encaixe conferido no DOM e no PDF impresso.");
})().catch(function (err) {
  console.error("erro: " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
