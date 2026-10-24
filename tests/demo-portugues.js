/* Demo ponta a ponta: cria prova de Português 9º ano com 20 questões PAEBES,
   25 alunos fictícios com perfis variados, gera cadernos em PDF, simula
   correções e abre a aba de análise para exploração.

   Uso:  node tests/serve.js 8793       (em outra janela)
         node tests/demo-portugues.js 8793                            */
"use strict";

var hud = require("./hudChrome");
var path = require("path");
var fs = require("fs");

var RAIZ = path.resolve(__dirname, "..");
var porta = Number(process.argv[2] || 8793);
var BASE = "http://127.0.0.1:" + porta;
/* A Área de Trabalho real desta máquina é "OneDrive\Área de Trabalho": tem
   acento e fica fora do home. Não dá para descobri-la pelo console - o shell
   escreve no codepage OEM (CP850) e o Node lê como UTF-8, o que já abriu as
   pastas "µrea de Trabalho" e "?rea de Trabalho". reg.exe export grava um
   arquivo UTF-16LE, então os bytes chegam intactos sem tocar em codepage. */
var SAIDA = (function () {
  var os = require("os");
  var cp = require("child_process");
  try {
    var reg = path.join(os.tmpdir(), "gaba-shellfolders-" + process.pid + ".reg");
    cp.execSync('reg.exe export "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion' +
      '\\Explorer\\User Shell Folders" "' + reg + '" /y', { windowsHide: true });
    /* valores REG_EXPAND_SZ vêm como hex(2) e podem continuar na linha de baixo */
    var m = /"Desktop"=hex\(2\):([0-9a-fA-F,]+)/.exec(
      fs.readFileSync(reg, "utf16le").replace(/\\\r\n\s+/g, ""));
    fs.unlinkSync(reg);
    if (m) {
      var d = Buffer.from(m[1].replace(/,/g, ""), "hex").toString("utf16le")
        .replace(/\0+$/, "")
        .replace(/%([^%]+)%/g, function (_, n) { return process.env[n] || _; });
      if (d && fs.existsSync(d)) return path.join(d, "demo-portugues");
    }
  } catch (e) { /* cai no fallback */ }
  return path.join(process.env.USERPROFILE || os.homedir(), "OneDrive",
    "Área de Trabalho", "demo-portugues");
})();

/* ================================================================
   DADOS DA PROVA — 20 questões de Língua Portuguesa, 9º ano EF
   Cada questão cobre um descritor PAEBES distinto.
   ================================================================ */

var QUESTOES = [
  { n: 1, d: "D016_P",
    txt: "Leia.\n\n\"Receita de Bolo de Cenoura\nIngredientes: 3 cenouras médias, 4 ovos, 1 xícara de óleo…\nModo de preparo: Bata no liquidificador as cenouras, os ovos e o óleo até ficar homogêneo.\"",
    cmd: "A finalidade desse texto é",
    gab: "C",
    alt: ["narrar uma história sobre culinária.",
      "apresentar uma opinião sobre alimentação saudável.",
      "orientar o preparo de um alimento.",
      "descrever as características da cenoura.",
      "convencer o leitor a mudar seus hábitos."] },

  { n: 2, d: "D019_P",
    txt: "Texto 1 — \"O desmatamento na Amazônia cresceu 22% no último trimestre, segundo dados do INPE.\"\nTexto 2 — \"Comunidades ribeirinhas relatam que a floresta ao redor de suas aldeias está desaparecendo e que a pesca diminuiu drasticamente.\"",
    cmd: "Os dois textos tratam do mesmo tema, mas se diferenciam porque",
    gab: "B",
    alt: ["ambos usam dados estatísticos como argumento.",
      "o primeiro usa dados científicos e o segundo, relatos pessoais.",
      "o segundo nega a informação apresentada no primeiro.",
      "o primeiro é uma narrativa e o segundo, uma receita.",
      "ambos foram escritos pelo mesmo autor."] },

  { n: 3, d: "D021_P",
    txt: "O poeta Carlos Drummond de Andrade nasceu em Itabira, Minas Gerais, em 31 de outubro de 1902. Mudou-se para Belo Horizonte em 1920, onde começou a colaborar no Diário de Minas.",
    cmd: "De acordo com o texto, Drummond começou a escrever para o jornal",
    gab: "D",
    alt: ["em Itabira, sua cidade natal.",
      "em São Paulo, capital cultural do país.",
      "ainda criança, antes de 1910.",
      "em Belo Horizonte, a partir de 1920.",
      "somente depois de se aposentar."] },

  { n: 4, d: "D022_P",
    txt: "\"A plateia ficou estarrecida quando o mágico fez o elefante desaparecer diante de todos.\"",
    cmd: "No trecho acima, a palavra \"estarrecida\" pode ser substituída, sem alteração de sentido, por",
    gab: "A",
    alt: ["espantada.",
      "entediada.",
      "irritada.",
      "indiferente.",
      "envergonhada."] },

  { n: 5, d: "D023_P",
    txt: "Maria chegou à escola com os olhos vermelhos. Ao ser perguntada pela professora se estava bem, apenas balançou a cabeça e sentou em silêncio no fundo da sala.",
    cmd: "A partir da leitura do texto, pode-se inferir que Maria",
    gab: "B",
    alt: ["estava atrasada para a aula.",
      "estava triste ou havia chorado.",
      "tinha brigado com a professora.",
      "não gostava de sentar na frente.",
      "estava animada com a prova."] },

  { n: 6, d: "D024_P",
    txt: "\"Que belo serviço! O encanador trocou a torneira e agora a cozinha inteira está alagada.\"",
    cmd: "No trecho acima, a expressão \"Que belo serviço!\" revela",
    gab: "E",
    alt: ["admiração sincera pelo trabalho realizado.",
      "gratidão pelo conserto da torneira.",
      "surpresa positiva com o resultado.",
      "indiferença diante do ocorrido.",
      "ironia diante de um trabalho malfeito."] },

  { n: 7, d: "D025_P",
    txt: "Compare:\n(I) \"Não quero saber.\" \n(II) \"Não quero saber!\" \n(III) \"Não quero saber?\"",
    cmd: "A troca do ponto final pela interrogação, na frase III, produz o efeito de",
    gab: "C",
    alt: ["manter o sentido original da frase.",
      "expressar uma ordem mais enfática.",
      "transformar a afirmação em uma dúvida.",
      "reforçar a certeza do falante.",
      "indicar que o falante está gritando."] },

  { n: 8, d: "D027_P",
    txt: "O açaí é uma fruta típica da região amazônica, muito consumida no Pará. Rico em ferro e antioxidantes, ele se tornou popular em todo o Brasil, sendo vendido em praias, academias e feiras. Seu cultivo sustentável gera renda para milhares de famílias ribeirinhas.",
    cmd: "A ideia central desse texto é",
    gab: "A",
    alt: ["apresentar o açaí como fruta amazônica de importância econômica e nutricional.",
      "explicar como plantar açaí em outras regiões.",
      "contar a história de uma família ribeirinha.",
      "criticar o consumo excessivo de açaí nas praias.",
      "comparar o açaí com outras frutas tropicais."] },

  { n: 9, d: "D028_P",
    txt: "Pesquisadores da USP descobriram que determinadas espécies de formigas conseguem cultivar fungos há mais de 50 milhões de anos, muito antes de os humanos inventarem a agricultura. Essa relação simbiótica garante alimento para toda a colônia.",
    cmd: "O assunto principal desse texto é",
    gab: "D",
    alt: ["a história da agricultura humana.",
      "as pesquisas realizadas na USP.",
      "a alimentação dos seres humanos.",
      "a capacidade agrícola das formigas.",
      "a importância dos fungos na culinária."] },

  { n: 10, d: "D030_P",
    txt: "João vivia tranquilo em sua pequena vila até o dia em que uma tempestade destruiu a ponte que ligava sua casa à escola. Sem conseguir atravessar o rio, João precisou encontrar um caminho alternativo pela mata, enfrentando medo e solidão.",
    cmd: "O conflito gerador da narrativa é",
    gab: "B",
    alt: ["a vida tranquila de João na vila.",
      "a destruição da ponte pela tempestade.",
      "a existência de uma escola do outro lado do rio.",
      "o medo que João sentia da mata.",
      "a solidão de morar em uma vila pequena."] },

  { n: 11, d: "D033_P",
    txt: "Texto 1 — \"As redes sociais aproximam pessoas distantes e democratizam a informação.\"\nTexto 2 — \"O uso excessivo de redes sociais tem gerado ansiedade e isolamento entre os jovens.\"",
    cmd: "Os dois textos apresentam posições",
    gab: "C",
    alt: ["idênticas sobre o tema das redes sociais.",
      "complementares, pois tratam de temas diferentes.",
      "contrárias sobre os efeitos das redes sociais.",
      "neutras, sem emitir qualquer juízo de valor.",
      "irrelevantes para a discussão atual."] },

  { n: 12, d: "D037_P",
    txt: "\"Pedro estudou muito para a prova. Além disso, fez todos os exercícios propostos. Por isso, obteve a melhor nota da turma.\"",
    cmd: "A expressão \"Por isso\" estabelece, entre as partes do texto, uma relação de",
    gab: "A",
    alt: ["conclusão, indicando consequência do que foi dito antes.",
      "oposição, contrariando a ideia anterior.",
      "adição, somando uma informação nova.",
      "tempo, indicando quando algo ocorreu.",
      "condição, expressando uma hipótese."] },

  { n: 13, d: "D038_P",
    txt: "\"O Brasil possui mais de 200 milhões de habitantes. Na minha opinião, o país precisa investir mais em educação para garantir um futuro melhor.\"",
    cmd: "A segunda frase do texto se diferencia da primeira porque apresenta",
    gab: "D",
    alt: ["um dado geográfico verificável.",
      "uma informação extraída de pesquisa científica.",
      "um fato comprovado por censo oficial.",
      "uma opinião do autor sobre o país.",
      "uma notícia publicada em jornal."] },

  { n: 14, d: "D039_P",
    txt: "\"Embora a chuva tenha sido intensa, o evento ao ar livre aconteceu normalmente.\"",
    cmd: "A palavra \"Embora\" introduz uma ideia de",
    gab: "B",
    alt: ["causa, explicando o motivo do evento.",
      "concessão, indicando que a chuva não impediu o evento.",
      "finalidade, mostrando o objetivo do evento.",
      "tempo, indicando quando o evento ocorreu.",
      "condição, impondo um requisito."] },

  { n: 15, d: "D053_P",
    txt: "\"O vento acariciava as folhas das árvores naquela tarde de outono.\"",
    cmd: "O uso do verbo \"acariciava\" sugere que o vento era",
    gab: "E",
    alt: ["forte e destruidor.",
      "frio e cortante.",
      "barulhento e assustador.",
      "quente e abafado.",
      "suave e delicado."] },

  { n: 16, d: "D055_P",
    txt: "\"O trânsito nas grandes cidades precisa ser repensado. O número de acidentes cresce a cada ano, o tempo perdido em congestionamentos reduz a produtividade e a poluição prejudica a saúde da população.\"",
    cmd: "Os argumentos utilizados para sustentar a tese de que o trânsito precisa ser repensado são",
    gab: "A",
    alt: ["acidentes, congestionamentos e poluição.",
      "a beleza das grandes cidades.",
      "o aumento do número de carros importados.",
      "a construção de novas avenidas.",
      "a redução do preço da gasolina."] },

  { n: 17, d: "D057_P",
    txt: "[Tirinha] Quadro 1: Um homem olha para o relógio e diz: \"Ainda é cedo.\" Quadro 2: O mesmo homem, cercado por uma pilha de papéis, olha novamente para o relógio. Quadro 3: Ele diz, desesperado: \"Como já é tão tarde?!\"",
    cmd: "A tirinha produz humor porque",
    gab: "C",
    alt: ["o homem não sabe ler as horas.",
      "os relógios estão quebrados.",
      "o tempo passou rápido enquanto ele procrastinava.",
      "ele trabalhou sem parar o dia inteiro.",
      "a pilha de papéis pertence a outra pessoa."] },

  { n: 18, d: "D061_P",
    txt: "\"Devido à estiagem prolongada, os reservatórios atingiram níveis críticos e foi necessário racionar água em vários bairros da cidade.\"",
    cmd: "A relação de causa e consequência nesse texto é, respectivamente,",
    gab: "B",
    alt: ["racionamento — estiagem.",
      "estiagem — racionamento de água.",
      "reservatórios — bairros da cidade.",
      "níveis críticos — estiagem.",
      "cidade — reservatórios."] },

  { n: 19, d: "D102_P",
    txt: "\"O jogador era INCRÍVEL naquela partida — driblava, passava, MARCAVA!\"",
    cmd: "O uso de letras maiúsculas em \"INCRÍVEL\" e \"MARCAVA\" tem o efeito de",
    gab: "D",
    alt: ["indicar que as palavras estão escritas incorretamente.",
      "mostrar que o texto foi mal revisado.",
      "sinalizar que são palavras estrangeiras.",
      "enfatizar a intensidade das ações do jogador.",
      "sugerir que o narrador está sussurrando."] },

  { n: 20, d: "D103_P",
    txt: "\"Meu filho, você precisa entender que a vida não é fácil. Quando eu tinha a sua idade, trabalhava desde cedo e ainda assim encontrava tempo para estudar.\"",
    cmd: "As marcas linguísticas \"Meu filho\" e \"você\" indicam que o locutor é",
    gab: "A",
    alt: ["um pai ou uma mãe falando com o filho.",
      "um professor dando aula para a turma.",
      "um político discursando para eleitores.",
      "um jornalista escrevendo uma reportagem.",
      "um narrador contando uma fábula."] }
];

/* 25 alunos fictícios */
var ALUNOS = [
  "ANA BEATRIZ SILVA", "BRUNO OLIVEIRA SANTOS", "CAMILA RODRIGUES LIMA",
  "DANIEL FERREIRA COSTA", "EDUARDA ALMEIDA PEREIRA", "FELIPE SOUZA MARTINS",
  "GABRIELA RIBEIRO GOMES", "HENRIQUE CARVALHO NUNES", "ISABELA MENDES ARAUJO",
  "JOAO PEDRO BARBOSA", "KARLA FERNANDES DIAS", "LUCAS PINTO MOREIRA",
  "MARIA CLARA TEIXEIRA", "NICOLAS CARDOSO RAMOS", "PATRICIA VIEIRA LOPES",
  "RAFAEL CORREIA MACHADO", "SOPHIA MONTEIRO AZEVEDO", "THIAGO NASCIMENTO FREITAS",
  "VALENTINA CAMPOS DUARTE", "WILLIAM ROCHA BORGES", "YASMIN CASTRO FIGUEIREDO",
  "ARTHUR MIRANDA LEAL", "BIANCA XAVIER PRADO", "CAIO SAMPAIO CUNHA",
  "DEBORA FONSECA MELO"
].map(function (nome, i) {
  return { id: "aluno-" + (i + 1), nome: nome, numero: i + 1, matricula: "M" + (2025000 + i + 1), tipo: 0 };
});

var PERFIS = [
  "perfeito",
  "bom", "bom", "bom", "bom",
  "medio", "medio", "medio", "medio", "medio", "medio", "medio", "medio",
  "fraco", "fraco", "fraco", "fraco",
  "pessimo", "pessimo", "pessimo",
  "medio", "bom", "fraco", "medio", "bom"
];

var PROVA_ID = "demo-port-9ef-" + Date.now();
var TURMA_ID = "turma-demo-9a";
var TURMA_NOME = "9\u00ba Ano A";

/* ================================================================
   FUNÇÕES QUE RODAM DENTRO DA PÁGINA  (sem closures com o node)
   ================================================================ */

function criarProvaEGerar(dados) {
  var LETRAS = "ABCDE";
  var questoes = dados.questoes.map(function (q) {
    return {
      numero: q.n,
      enunciado: q.txt,
      comando: q.cmd,
      gabarito: q.gab,
      peso: 1,
      descritor: q.d,
      habilidade_bncc: "",
      alternativas: q.alt.map(function (texto, i) {
        return { letra: LETRAS[i], texto: texto };
      })
    };
  });

  var prova = {
    id: dados.provaId,
    titulo: "Avalia\u00e7\u00e3o de L\u00edngua Portuguesa \u2014 9\u00ba ano EF",
    disciplina: "L\u00edngua Portuguesa",
    __local: true,
    alunos: dados.alunos,
    questoes: questoes,
    gabarito: questoes.map(function (q) { return q.gabarito; }),
    pesos: questoes.map(function () { return 1; }),
    descritores: questoes.map(function (q) { return q.descritor; }),
    modo: "turma",
    num_tipos: 4,
    embaralhar_questoes: true,
    embaralhar_alternativas: true,
    alternativas: 5
  };

  GabaCaderno.estado.provasLocais.unshift(prova);

  var sel = document.getElementById("cad-prova");
  if (sel) {
    var opt = document.createElement("option");
    opt.value = prova.id;
    opt.textContent = prova.titulo + " \u2014 " + questoes.length + " quest\u00f5es (documento)";
    sel.insertBefore(opt, sel.firstChild);
    sel.value = prova.id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

  document.getElementById("cad-modo").value = "turma";
  document.getElementById("cad-tipos").value = "4";
  document.getElementById("cad-alt").checked = true;
  document.getElementById("cad-salt").value = "";
  document.getElementById("cad-modelo").value = "paebes";
  document.getElementById("cad-colunas").value = "2";
  document.getElementById("cad-rede").value = "SECRETARIA MUNICIPAL DE EDUCA\u00c7\u00c3O";
  document.getElementById("cad-escola").value = "EMEF DEMONSTRA\u00c7\u00c3O GABA";
  document.getElementById("cad-professor").value = "Prof. Demonstra\u00e7\u00e3o";
  document.getElementById("cad-ano").value = "9\u00ba ano EF";
  document.getElementById("cad-bimestre").value = "3\u00ba bimestre";
  document.getElementById("cad-data").value = "23/10/2026";
  document.getElementById("cad-instrucoes").value =
    "Marque somente uma alternativa por quest\u00e3o.\nUse caneta esferogr\u00e1fica preta ou azul.\nN\u00e3o destaque a folha de respostas.";
  document.getElementById("cad-por-pagina").value = "30";
  document.getElementById("cad-por-pagina").dispatchEvent(new Event("change"));
  var branco = document.getElementById("cad-branco");
  if (branco) branco.checked = true;
  var descr = document.getElementById("cad-descritores");
  if (descr) descr.checked = true;

  return GabaCaderno.gerarLote().then(function (r) {
    var rec = JSON.parse(localStorage.getItem("gaba_lote_impresso"));
    return {
      provaId: prova.id,
      questoes: questoes.length,
      alunos: dados.alunos.length,
      numTipos: rec.numTipos,
      folhas: r.folhas,
      itens: rec.itens.map(function (it) {
        return {
          numero: it.aluno.numero,
          nome: it.aluno.nome,
          alunoId: it.aluno.id,
          tipo: it.versao.versao,
          codigo: it.versao.codigo,
          gabarito: it.versao.gabarito.join("")
        };
      }),
      gabaritoBase: prova.gabarito.join("")
    };
  });
}

function injetarResultadosEAbrir(dados) {
  var app = GabaApp.estado;

  app.professor = { id: "demo-prof", nome: "Prof. Demonstra\u00e7\u00e3o", email: "demo@gaba.app" };

  app.turmas = [{ id: dados.turmaId, nome: dados.turmaNome, ano: "9\u00ba ano EF",
    escola: "EMEF DEMONSTRA\u00c7\u00c3O GABA" }];

  app.alunos = dados.alunos;

  app.locais = GabaCaderno.estado.provasLocais.slice();

  var prova = GabaCaderno.estado.provasLocais.filter(function (p) {
    return String(p.id) === dados.provaId;
  })[0];
  app.provas = prova ? [prova] : [];

  app.correcoes = dados.correcoes.map(function (c, i) {
    return {
      id: "corr-" + (i + 1),
      prova_id: dados.provaId,
      turma_id: dados.turmaId,
      aluno_id: c.alunoId,
      aluno_nome: c.nome,
      aluno_numero: c.numero,
      versao: c.tipo,
      codigo: c.codigo,
      qr_texto: "GABA3|" + dados.provaId + "|" + c.numero + "|" + c.tipo + "|1|" + c.codigo,
      qr_payload: "GABA3|" + dados.provaId + "|" + c.numero + "|" + c.tipo + "|1|" + c.codigo,
      engine: "demo",
      respostas: c.respostas,
      respostas_banco: c.respostas_banco,
      confusao: [],
      branco: c.branco,
      acertos: c.acertos,
      total_questoes: c.total,
      nota: c.nota,
      created_at: new Date().toISOString()
    };
  });

  app.escolas = [];
  app.momento = Date.now();

  /* desenhar o painel inteiro com os dados injetados */
  var fns = ["preencherSeletoresAnalise", "desenharAnalise",
    "desenharBasicaResumo", "desenharBasicaAluno", "desenharBasicaDescritor"];
  fns.forEach(function (nome) { if (typeof window[nome] === "function") window[nome](); });

  /* se as funcoes nao estao no global, puxar pelas entranhas */
  var sel = document.getElementById("ab-prova");
  if (sel) {
    if (!sel.querySelector("option[value]") || sel.options.length < 2) {
      /* preencher manualmente */
      sel.innerHTML = '<option value="">Todas as provas</option>';
      app.provas.concat(app.locais).forEach(function (p) {
        var o = document.createElement("option");
        o.value = String(p.id);
        o.textContent = (p.titulo || String(p.id)) + " \u2014 " + (p.questoes || []).length + " quest\u00f5es";
        sel.appendChild(o);
      });
    }
    sel.value = dados.provaId;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  var selT = document.getElementById("ab-turma");
  if (selT) {
    if (selT.options.length < 2) {
      selT.innerHTML = '<option value="">Todas as turmas</option>';
      app.turmas.forEach(function (t) {
        var o = document.createElement("option");
        o.value = String(t.id);
        o.textContent = t.nome;
        selT.appendChild(o);
      });
    }
    selT.value = dados.turmaId;
    selT.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* clicar na aba Notas (analise) */
  var tab = document.querySelector('.tab-btn[data-tab="notas"]');
  if (tab) tab.click();

  if (typeof window.switchAnalise === "function") window.switchAnalise("ab-resumo");

  var resumo = null;
  if (typeof GabaBasica !== "undefined") {
    var folhas = app.correcoes.filter(function (r) {
      return String(r.prova_id) === dados.provaId;
    });
    resumo = GabaBasica.resumoTurma(prova, folhas, dados.turmaId);
  }

  return {
    correcoes: app.correcoes.length,
    prova: dados.provaId,
    turma: dados.turmaNome,
    resumo: resumo
  };
}

function montarFolhasRespondidas(dados) {
  var prova = GabaCaderno.estado.provasLocais.filter(function (p) {
    return String(p.id) === dados.provaId;
  })[0];
  if (!prova) return "<p>Prova n\u00e3o encontrada.</p>";
  var gab = (prova.questoes || []).map(function (q) { return String(q.gabarito || "").toUpperCase(); });
  var LETRAS = ["A", "B", "C", "D", "E"];

  function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  var css = [
    "* { box-sizing:border-box; margin:0; padding:0 }",
    "body,.folhas { font-family:'Segoe UI',Arial,sans-serif; font-size:9pt; color:#222 }",
    ".folha { page-break-after:always; padding:12mm 10mm }",
    ".folha:last-child { page-break-after:auto }",
    ".cab { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5mm; border-bottom:0.4mm solid #1a56db; padding-bottom:2mm }",
    ".cab h2 { font-size:13pt; color:#1a56db; margin:0 }",
    ".cab .info { font-size:9pt; color:#555 }",
    ".nota-box { text-align:center; background:#f0f4ff; border:0.3mm solid #c3d4f7; border-radius:2mm; padding:2mm 5mm; margin-bottom:4mm; display:inline-block }",
    ".nota-box .n { font-size:22pt; font-weight:700 }",
    ".nota-box .n.alta { color:#059669 } .nota-box .n.media { color:#d97706 } .nota-box .n.baixa { color:#dc2626 }",
    ".nota-box .sub { font-size:8pt; color:#666 }",
    ".grade { border-collapse:collapse; width:100%; margin-top:3mm }",
    ".grade th { background:#f1f5f9; padding:1.5mm 2mm; font-weight:600; text-align:center; border:0.2mm solid #d1d5db; font-size:8pt }",
    ".grade td { padding:1.2mm 2mm; text-align:center; border:0.2mm solid #e5e7eb; font-size:8.5pt }",
    ".grade .qn { text-align:left; font-weight:600; width:8mm }",
    ".grade .desc { text-align:left; font-size:7.5pt; color:#666; max-width:50mm; overflow:hidden; white-space:nowrap; text-overflow:ellipsis }",
    ".bolha { display:inline-block; width:5mm; height:5mm; border-radius:50%; border:0.3mm solid #999; line-height:5mm; font-size:7pt; font-weight:600 }",
    ".bolha.marcada { background:#1e3a5f; color:#fff; border-color:#1e3a5f }",
    ".bolha.certa  { background:#059669; color:#fff; border-color:#059669 }",
    ".bolha.errada { background:#dc2626; color:#fff; border-color:#dc2626 }",
    ".bolha.branco-marcada { background:#9ca3af; color:#fff; border-color:#9ca3af }",
    ".resultado { font-size:8pt; font-weight:600 }",
    ".resultado.ok { color:#059669 } .resultado.x { color:#dc2626 } .resultado.br { color:#9ca3af }",
    ".resumo-linha { display:flex; gap:8mm; margin:3mm 0 }",
    ".resumo-linha span { font-size:9pt }",
    "@media print { .folha { padding:8mm 8mm } }"
  ].join("\n");

  var html = '<div class="folhas"><style>' + css + '</style>';

  dados.correcoes.forEach(function (c) {
    var resp = c.respostas_banco || c.respostas || [];
    var cls = c.nota >= 7 ? "alta" : c.nota >= 5 ? "media" : "baixa";

    html += '<div class="folha">';
    html += '<div class="cab"><h2>' + esc(c.nome) + '</h2>';
    html += '<span class="info">N\u00ba ' + c.numero + ' &nbsp;|&nbsp; Vers\u00e3o ' + c.tipo + ' (' + esc(c.codigo) + ')</span></div>';

    html += '<div class="nota-box"><div class="n ' + cls + '">' + c.nota.toFixed(1) + '</div>';
    html += '<div class="sub">' + c.acertos + ' acertos de ' + c.total + ' &nbsp;\u2022&nbsp; ' + c.branco + ' em branco</div></div>';

    html += '<div class="resumo-linha">';
    html += '<span>\u2705 Acertos: <strong>' + c.acertos + '</strong></span>';
    html += '<span>\u274c Erros: <strong>' + (c.total - c.acertos - c.branco) + '</strong></span>';
    html += '<span>\u2b1c Em branco: <strong>' + c.branco + '</strong></span>';
    html += '<span>Perfil: <strong>' + esc(c.perfil) + '</strong></span>';
    html += '</div>';

    html += '<table class="grade"><tr><th>Q</th>';
    LETRAS.forEach(function (l) { html += '<th>' + l + '</th>'; });
    html += '<th>Gab</th><th>Resultado</th><th>Descritor</th></tr>';

    for (var i = 0; i < gab.length; i++) {
      var r = String(resp[i] || "").toUpperCase();
      var g = gab[i];
      var correto = r === g;
      var emBranco = !r || r === "_";
      var q = prova.questoes[i] || {};

      html += '<tr><td class="qn">' + (i + 1) + '</td>';
      LETRAS.forEach(function (l) {
        var cls = "";
        if (l === r && correto) cls = "certa";
        else if (l === r && !correto && !emBranco) cls = "errada";
        else if (l === r && emBranco) cls = "branco-marcada";
        html += '<td><span class="bolha' + (l === r ? ' marcada ' + cls : '') +
          (l === g && !correto ? ' certa' : '') + '">' + l + '</span></td>';
      });
      html += '<td><strong>' + g + '</strong></td>';
      html += '<td class="resultado ' + (correto ? 'ok' : emBranco ? 'br' : 'x') + '">' +
        (correto ? '\u2714' : emBranco ? '\u2014' : '\u2718') + '</td>';
      html += '<td class="desc">' + esc(q.descritor || "") + '</td>';
      html += '</tr>';
    }
    html += '</table></div>';
  });

  html += '</div>';
  document.getElementById("print-root").innerHTML = html;
  return { ok: true, paginas: dados.correcoes.length };
}

function montarRelatorio(dados) {
  var app = GabaApp.estado;
  var prova = app.provas[0] || app.locais[0];
  if (!prova) return "<p>Prova n\u00e3o encontrada.</p>";
  var folhas = app.correcoes.filter(function (r) {
    return String(r.prova_id) === dados.provaId;
  });
  var resumo = GabaBasica.resumoTurma(prova, folhas, dados.turmaId);
  var rank = GabaBasica.ranking(prova, folhas, dados.turmaId, app.alunos);
  var descr = GabaBasica.taxaPorDescritor(prova, folhas, dados.turmaId, GabaDescritores.todos());
  var itens = typeof GabaAnalise !== "undefined" ? GabaAnalise.itens(prova, folhas) : [];

  function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function card(v, r) { return '<div class="card"><div class="valor">' + v + '</div><div class="rotulo">' + r + '</div></div>'; }
  function cor(nota) { return nota >= 7 ? "nota-alta" : nota >= 5 ? "nota-media" : "nota-baixa"; }
  function tag(st) {
    var c = st === "dominado" ? "#059669" : st === "parcial" ? "#d97706" : "#dc2626";
    return '<span style="background:' + c + '20;color:' + c + ';padding:1px 6px;border-radius:3px;font-size:8pt">' + esc(st) + '</span>';
  }

  var css = [
    "* { box-sizing:border-box; margin:0; padding:0 }",
    "body,.r { font-family:'Segoe UI',Arial,sans-serif; font-size:10pt; color:#222 }",
    ".r { padding:10mm }",
    "h1 { font-size:16pt; margin-bottom:2mm; color:#1a56db }",
    "h2 { font-size:12pt; margin-top:8mm; margin-bottom:3mm; color:#333; border-bottom:0.5mm solid #ddd; padding-bottom:1mm }",
    ".resumo { display:flex; gap:5mm; flex-wrap:wrap; margin-bottom:5mm }",
    ".card { background:#f0f4ff; border:0.3mm solid #c3d4f7; border-radius:2mm; padding:3mm 5mm; flex:1 1 30mm; text-align:center }",
    ".valor { font-size:18pt; font-weight:700; color:#1a56db }",
    ".rotulo { font-size:8pt; color:#666 }",
    "table { width:100%; border-collapse:collapse; margin-bottom:5mm; font-size:9pt }",
    "th { background:#1a56db; color:#fff; padding:1.5mm 2mm; text-align:left; font-weight:600 }",
    "td { padding:1.2mm 2mm; border-bottom:0.2mm solid #e5e7eb }",
    "tr:nth-child(even) { background:#f8f9fa }",
    ".nota-alta { color:#059669; font-weight:700 }",
    ".nota-media { color:#d97706; font-weight:600 }",
    ".nota-baixa { color:#dc2626; font-weight:700 }",
    ".barra { display:inline-block; height:3mm; border-radius:0.5mm; vertical-align:middle }",
    ".page-break { page-break-before:always }",
    "@media print { .r { padding:0 } }"
  ].join("\n");

  var h = '<div class="r"><style>' + css + '</style>';
  h += '<h1>Relat\u00f3rio de An\u00e1lise \u2014 L\u00edngua Portuguesa 9\u00ba Ano</h1>';
  h += '<p><strong>Escola:</strong> EMEF DEMONSTRA\u00c7\u00c3O GABA &nbsp;|&nbsp; ';
  h += '<strong>Turma:</strong> ' + esc(dados.turmaNome) + ' &nbsp;|&nbsp; ';
  h += '<strong>Quest\u00f5es:</strong> ' + (prova.questoes || []).length + ' &nbsp;|&nbsp; ';
  h += '<strong>Alunos:</strong> ' + resumo.alunos + '</p>';

  h += '<div class="resumo">';
  h += card(resumo.media.toFixed(1), "M\u00e9dia");
  h += card(resumo.mediana.toFixed(1), "Mediana");
  h += card(resumo.desvio.toFixed(1), "Desvio Padr\u00e3o");
  h += card(resumo.taxaAprovacao.toFixed(0) + "%", "Aprovados (\u2265 6)");
  h += card(resumo.max.toFixed(1), "Maior Nota");
  h += card(resumo.min.toFixed(1), "Menor Nota");
  h += '</div>';

  h += '<h2>Ranking dos Alunos</h2>';
  h += '<table><tr><th>#</th><th>Aluno</th><th>Nota</th><th>Acertos</th><th>Branco</th><th></th></tr>';
  rank.forEach(function (r) {
    var pct = Math.round(r.nota * 10);
    h += '<tr><td>' + r.posicao + '</td><td>' + esc(r.nome) + '</td>';
    h += '<td class="' + cor(r.nota) + '">' + r.nota.toFixed(1) + '</td>';
    h += '<td>' + r.acertos + '/' + r.total + '</td>';
    h += '<td>' + r.branco + '</td>';
    h += '<td><span class="barra" style="width:' + pct + 'mm;background:#93c5fd"></span></td></tr>';
  });
  h += '</table>';

  h += '<div class="page-break"></div>';
  h += '<h2>Desempenho por Descritor</h2>';
  h += '<table><tr><th>C\u00f3digo</th><th>Habilidade</th><th>Acerto</th><th>Status</th></tr>';
  descr.forEach(function (d) {
    h += '<tr><td><strong>' + esc(d.descritor) + '</strong></td>';
    h += '<td>' + esc((d.descricao || "").substring(0, 80)) + '</td>';
    h += '<td><span class="barra" style="width:' + Math.round(d.taxa * 0.6) + 'mm;background:' +
      (d.taxa >= 70 ? '#34d399' : d.taxa >= 40 ? '#fbbf24' : '#f87171') + '"></span> ' + d.taxa + '%</td>';
    h += '<td>' + tag(d.status) + '</td></tr>';
  });
  h += '</table>';

  if (itens.length) {
    h += '<div class="page-break"></div>';
    h += '<h2>An\u00e1lise de Item</h2>';
    h += '<table><tr><th>Q</th><th>Gab</th><th>Acerto</th><th>Disc.</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr>';
    itens.forEach(function (it) {
      h += '<tr><td>' + it.numero + '</td><td><strong>' + esc(it.gabarito) + '</strong></td>';
      h += '<td>' + Math.round(it.proporcao * 100) + '%</td>';
      h += '<td>' + (it.discriminacao !== null ? it.discriminacao.toFixed(2) : "\u2014") + '</td>';
      "ABCDE".split("").forEach(function (l) {
        var n = it.contagem[l] || 0;
        var pct = it.participantes ? Math.round(n / it.participantes * 100) : 0;
        h += '<td>' + (l === it.gabarito ? '<strong>' + pct + '%</strong>' : pct + '%') + '</td>';
      });
      h += '</tr>';
    });
    h += '</table>';
  }

  h += '<p style="margin-top:8mm;font-size:8pt;color:#999">Gerado automaticamente pelo GABA OMR em ' +
    new Date().toLocaleString("pt-BR") + '. Dados simulados para demonstra\u00e7\u00e3o.</p>';
  h += '</div>';

  document.getElementById("print-root").innerHTML = h;
  return { ok: true, alunos: resumo.alunos, media: resumo.media };
}

/* ================================================================
   HARNESS NODE
   ================================================================ */

function gerarRespostasAluno(gabarito, perfil) {
  var LETTERS = "ABCDE";
  var respostas = [];
  for (var i = 0; i < gabarito.length; i++) {
    var correta = gabarito.charAt(i);
    var ci = LETTERS.indexOf(correta);
    if (perfil === "perfeito") {
      respostas.push(correta);
    } else if (perfil === "bom") {
      respostas.push(Math.random() < 0.82 ? correta : LETTERS[(ci + 1 + Math.floor(Math.random() * 4)) % 5]);
    } else if (perfil === "medio") {
      if (Math.random() < 0.05) respostas.push("_");
      else respostas.push(Math.random() < 0.55 ? correta : LETTERS[(ci + 1 + Math.floor(Math.random() * 4)) % 5]);
    } else if (perfil === "fraco") {
      if (Math.random() < 0.1) respostas.push("_");
      else respostas.push(Math.random() < 0.28 ? correta : LETTERS[(ci + 1 + Math.floor(Math.random() * 4)) % 5]);
    } else {
      if (Math.random() < 0.2) respostas.push("_");
      else respostas.push(LETTERS[Math.floor(Math.random() * 5)]);
    }
  }
  return respostas.join("");
}

function corrigirNoNode(gabaritoBase, respostas) {
  var acertos = 0, branco = 0;
  var resBanco = [];
  for (var i = 0; i < gabaritoBase.length; i++) {
    var r = respostas.charAt(i);
    resBanco.push(r === "_" ? "" : r);
    if (r === "_") branco++;
    else if (r === gabaritoBase.charAt(i)) acertos++;
  }
  var total = gabaritoBase.length;
  var nota = Math.round(acertos / total * 100) / 10;
  return { acertos: acertos, branco: branco, total: total, nota: nota, respostas_banco: resBanco };
}

(async function principal() {
  var probe = await fetch(BASE + "/index.html").catch(function () { return null; });
  if (!probe || !probe.ok) {
    console.error("Rode primeiro:  node tests/serve.js " + porta);
    process.exit(2);
  }

  if (!fs.existsSync(SAIDA)) fs.mkdirSync(SAIDA, { recursive: true });

  console.log("Abrindo o app no Chrome...");
  var chrome = await hud.abrirChrome(BASE + "/index.html");
  var c;
  try {
    c = hud.cliente(await hud.conectar("/index.html", chrome.porta));
    await c.espera("typeof GabaCaderno !== 'undefined' && typeof GabaVersoes !== 'undefined' && typeof GabaBasica !== 'undefined'", 60000);
    console.log("  Modulos carregados.");

    /* 1. Criar a prova e gerar os cadernos */
    console.log("\n1. Criando prova de Portugues (20 questoes, 25 alunos, 4 tipos)...");
    var rec = await c.naPagina(criarProvaEGerar, [{
      provaId: PROVA_ID,
      questoes: QUESTOES,
      alunos: ALUNOS
    }]);
    console.log("   " + rec.alunos + " alunos, " + rec.questoes + " questoes, " +
      rec.numTipos + " tipos, " + rec.folhas + " folhas A4");

    /* 2. Imprimir cadernos em PDF */
    console.log("\n2. Imprimindo cadernos em PDF...");
    await hud.sleep(800);
    var pdfCad = await c.chama("Page.printToPDF", {
      landscape: false, printBackground: true, preferCSSPageSize: true,
      paperWidth: 8.27, paperHeight: 11.69,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
      displayHeaderFooter: false
    });
    var cadernoPdf = path.join(SAIDA, "cadernos-portugues.pdf");
    fs.writeFileSync(cadernoPdf, Buffer.from(pdfCad.data, "base64"));
    console.log("   Cadernos salvos: " + cadernoPdf + " (" + Math.round(fs.statSync(cadernoPdf).size / 1024) + " KB)");

    /* 3. Simular as respostas de cada aluno */
    console.log("\n3. Simulando respostas dos " + rec.alunos + " alunos...");
    var correcoes = [];
    for (var k = 0; k < rec.itens.length; k++) {
      var aluno = rec.itens[k];
      var perfil = PERFIS[k % PERFIS.length];
      var respostasStr = gerarRespostasAluno(rec.gabaritoBase, perfil);
      var corr = corrigirNoNode(rec.gabaritoBase, respostasStr);
      correcoes.push({
        alunoId: aluno.alunoId,
        nome: aluno.nome,
        numero: aluno.numero,
        tipo: aluno.tipo,
        codigo: aluno.codigo,
        perfil: perfil,
        respostas: corr.respostas_banco,
        respostas_banco: corr.respostas_banco,
        acertos: corr.acertos,
        branco: corr.branco,
        total: corr.total,
        nota: corr.nota
      });
      var pad = ("  " + (k + 1)).slice(-3);
      if (k < 5 || k === rec.itens.length - 1 || k === 12)
        console.log("   " + pad + ". " + aluno.nome.substring(0, 28).padEnd(28) +
          " nota=" + corr.nota.toFixed(1).padStart(4) + " (" + corr.acertos + "/" + corr.total + ") [" + perfil + "]");
      else if (k === 5) console.log("   ...");
    }
    var media = correcoes.reduce(function (s, c) { return s + c.nota; }, 0) / correcoes.length;
    console.log("   Media geral: " + media.toFixed(1));

    /* 4. Injetar resultados e abrir a analise */
    console.log("\n4. Injetando correcoes e abrindo a aba de analise...");
    var resultado = await c.naPagina(injetarResultadosEAbrir, [{
      provaId: PROVA_ID,
      turmaId: TURMA_ID,
      turmaNome: TURMA_NOME,
      alunos: ALUNOS,
      correcoes: correcoes
    }]);
    if (resultado.resumo) {
      console.log("   Resumo da turma:");
      console.log("     Media: " + resultado.resumo.media.toFixed(1) +
        "  Mediana: " + resultado.resumo.mediana.toFixed(1) +
        "  Desvio: " + resultado.resumo.desvio.toFixed(1));
      console.log("     Aprovados: " + resultado.resumo.aprovados + "/" + resultado.resumo.alunos +
        " (" + resultado.resumo.taxaAprovacao.toFixed(0) + "%)");
      console.log("     Faixas: " + resultado.resumo.faixaRotulos.map(function (r, i) {
        return r + "=" + resultado.resumo.faixas[i];
      }).join("  "));
    }

    /* 5. Gerar as folhas respondidas em PDF */
    console.log("\n5. Gerando folhas respondidas dos " + correcoes.length + " alunos...");
    await c.naPagina(montarFolhasRespondidas, [{
      provaId: PROVA_ID, turmaId: TURMA_ID,
      correcoes: correcoes
    }]);
    await hud.sleep(500);
    var pdfResp = await c.chama("Page.printToPDF", {
      landscape: false, printBackground: true,
      paperWidth: 8.27, paperHeight: 11.69,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
      displayHeaderFooter: false
    });
    var respondidasPdf = path.join(SAIDA, "folhas-respondidas.pdf");
    fs.writeFileSync(respondidasPdf, Buffer.from(pdfResp.data, "base64"));
    console.log("   Folhas respondidas: " + respondidasPdf + " (" + Math.round(fs.statSync(respondidasPdf).size / 1024) + " KB)");

    /* 6. Gerar o relatorio em PDF */
    console.log("\n6. Gerando relatorio de analise em PDF...");
    await c.naPagina(montarRelatorio, [{ provaId: PROVA_ID, turmaId: TURMA_ID, turmaNome: TURMA_NOME }]);
    await hud.sleep(500);
    var pdfRel = await c.chama("Page.printToPDF", {
      landscape: false, printBackground: true,
      paperWidth: 8.27, paperHeight: 11.69,
      marginTop: 0.4, marginBottom: 0.4, marginLeft: 0.4, marginRight: 0.4,
      displayHeaderFooter: false
    });
    var relatorioPdf = path.join(SAIDA, "relatorio-analise.pdf");
    fs.writeFileSync(relatorioPdf, Buffer.from(pdfRel.data, "base64"));
    console.log("   Relatorio salvo: " + relatorioPdf + " (" + Math.round(fs.statSync(relatorioPdf).size / 1024) + " KB)");

    /* 7. Voltar a aba de analise para o usuario explorar */
    console.log("\n7. Restaurando a aba de analise para exploracao...");
    await c.naPagina(injetarResultadosEAbrir, [{
      provaId: PROVA_ID,
      turmaId: TURMA_ID,
      turmaNome: TURMA_NOME,
      alunos: ALUNOS,
      correcoes: correcoes
    }]);

    console.log("\n========================================");
    console.log("  DEMO CONCLUIDO!");
    console.log("  Cadernos:    " + cadernoPdf);
    console.log("  Respondidas: " + respondidasPdf);
    console.log("  Relatorio:   " + relatorioPdf);
    console.log("  O Chrome ficou aberto na aba de analise.");
    console.log("========================================\n");

    /* nao fecha o Chrome: deixa o usuario explorar */
    await new Promise(function () {});

  } catch (err) {
    console.error("\nErro: " + (err && err.stack ? err.stack : err));
    if (c) c.fecha();
    await hud.fecharChrome(chrome);
    process.exit(1);
  }
})();
