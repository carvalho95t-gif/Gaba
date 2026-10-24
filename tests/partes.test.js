/* Parte (disciplina) na importação e escala de proficiência. Rode: node tests/partes.test.js */
"use strict";

var path = require("path");
var J = function (n) { return require(path.join(__dirname, "..", "js", n)); };

var D = J("docxParser.js");
var P = J("proficiencia.js");

var falhas = 0;
function check(nome, cond, extra) {
  console.log((cond ? "ok   " : "FALHA ") + nome + (extra !== undefined ? " — " + JSON.stringify(extra) : ""));
  if (!cond) falhas++;
}

/* --------------------------- o cabeçalho da parte no texto do .docx/.doc/PDF */
var cabecalhos = {
  "PARTE I": "Parte I",
  "PARTE I – MATEMÁTICA": "Matemática",
  "1ª PARTE - LÍNGUA PORTUGUESA": "Língua portuguesa",
  "BLOCO 2: HISTÓRIA": "História",
  "ÁREA: CIÊNCIAS DA NATUREZA E SUAS TECNOLOGIAS": "Ciências da natureza e suas tecnologias",
  "SESSÃO 3 – GEOGRAFIA": "Geografia",
  "PARTE 2": "Parte 2",
  "BLOCO A": "Bloco A",
  "Módulo: Química": "Química"
};
Object.keys(cabecalhos).forEach(function (linha) {
  check("cabeçalho lido: " + linha, D.parteDaLinha(linha) === cabecalhos[linha], D.parteDaLinha(linha));
});

var naoSaoCabecalho = [
  "Área de preservação permanente fica no artigo 5º",
  "PARTE DO CORPO QUE A GENTE MOVEMOS",
  "1. PARTE DO CONTRATO SOCIAL",
  "Questão 12",
  "PROVA DE MATEMÁTICA E PORTUGUÊS",
  "bloco de questões sobre o semiárido",
  "MATEMÁTICA"
];
naoSaoCabecalho.forEach(function (linha) {
  check("texto de questão não vira parte: " + linha.slice(0, 28), D.parteDaLinha(linha) === "", D.parteDaLinha(linha));
});

/* --------------------------- a prova de duas partes montada pelo parser */
var amostra = [
  "AVALIAÇÃO MENSAL DE MATEMÁTICA E LÍNGUA PORTUGUESA",
  "2ª série - turma 1",
  "",
  "PARTE I – LÍNGUA PORTUGUESA",
  "Questão 1. Leia o texto para responder.",
  "A) primeira", "B) segunda", "C) terceira", "D) quarta",
  "Questão 2. Qual é a ideia central do texto?",
  "A) uma", "B) duas", "C) três", "D) quatro",
  "",
  "PARTE II – MATEMÁTICA",
  "Questão 3. Quanto é 2 + 2?",
  "A) 3", "B) 4", "C) 5", "D) 6",
  "",
  "GABARITO OFICIAL DESTA PROVA",
  "1 - B   2 - C   3 - B"
].join("\n");

var parsed = D.parsePlain(amostra);
var prova = D.toProva(parsed, "AMOSTRA");
check("as três questões foram lidas", prova.quantidade_questoes === 3, prova.quantidade_questoes);
check("cada questão sabe de que parte é",
  prova.questoes.map(function (q) { return q.parte; }).join(",") ===
    "Língua portuguesa,Língua portuguesa,Matemática",
  prova.questoes.map(function (q) { return q.parte; }));
check("o enunciado da questão não é engolido pelo cabeçalho",
  prova.questoes[2].comando.indexOf("2 + 2") >= 0 && prova.questoes[2].alternativas.length === 4,
  [prova.questoes[2].comando, prova.questoes[2].alternativas.length]);
check("o gabarito impresso depois da última questão entra na prova",
  prova.gabarito.join("") === "BCB" &&
  prova.questoes.map(function (q) { return q.gabarito; }).join("") === "BCB",
  [prova.gabarito, prova.questoes.map(function (q) { return q.gabarito; })]);

var citou = D.toProva(D.parsePlain([
  "AVALIAÇÃO DE MATEMÁTICA",
  "Questão 1. Quanto é 1 + 1?", "A) 1", "B) 2", "C) 3", "D) 4",
  "Observe o gabarito oficial da prova antes de marcar a questão 2.",
  "Questão 2. Quanto é 1 + 2?", "A) 1", "B) 2", "C) 3", "D) 4"
].join("\n")), "CITOU O GABARITO");
check("a questão que só cita a palavra gabarito não fecha antes da hora",
  citou.quantidade_questoes === 2 && citou.questoes[0].comando.indexOf("gabarito oficial") >= 0,
  [citou.quantidade_questoes, citou.questoes[0].comando]);

var semParte = D.toProva(D.parsePlain([
  "AVALIAÇÃO DE MATEMÁTICA", "Questão 1. Quanto é 1 + 1?", "A) 1", "B) 2", "C) 3", "D) 4"
].join("\n")), "SEM PARTE");
check("prova sem cabeçalho de parte deixa o campo vazio",
  semParte.questoes[0].parte === "", semParte.questoes[0]);

/* --------------------------- escala de proficiência */
check("os cortes padrão cobrem a nota de 0 a 10",
  P.cortes().map(function (c) { return c.nivel; }).join(",") ===
    "Insuficiente,Básico,Intermediário,Avançado" && P.cortes()[0].min === 0,
  P.cortes());
check("a nota exatamente no corte entra no nível dele",
  P.rotulo(4) === "Básico" && P.rotulo(3.9) === "Insuficiente" && P.rotulo(8) === "Avançado",
  [P.rotulo(4), P.rotulo(3.9), P.rotulo(8)]);
check("nota nenhuma não vira nível",
  P.rotulo("") === "" && P.rotulo(null) === "" && P.rotulo(undefined) === "",
  [P.rotulo(""), P.rotulo(null), P.rotulo(undefined)]);

var dist = P.distribuicao([1, 2, 4.5, 6.5, 9, 10]);
check("a distribuição conta as folhas em cada nível",
  dist.map(function (d) { return d.quantidade; }).join(",") === "2,1,1,2" && dist[0].proporcao === 0.333,
  dist.map(function (d) { return d.quantidade + "/" + d.proporcao; }));
check("a faixa legenda o nível do jeito que o professor lê",
  P.faixa(dist[0]) === "até 3,9" && P.faixa(dist[2]) === "6 a 7,9" && P.faixa(dist[3]) === "8 ou mais",
  dist.map(P.faixa));

var editados = P.salvar([
  { nivel: "Abaixo do básico", min: 0 }, { nivel: "Básico", min: 5 }, { nivel: "Avançado", min: 7 }
]);
check("cortes editados valem para todas as telas",
  editados.length === 3 && P.rotulo(6) === "Básico" && P.rotulo(4.9) === "Abaixo do básico",
  [P.cortes().length, P.rotulo(6), P.rotulo(4.9)]);
check("a tabela é ordenada e começa em zero mesmo digitada fora de ordem",
  P.normalizar([{ nivel: "Z", min: 9 }, { nivel: "A", min: 3 }])[0].min === 0 &&
  P.normalizar([{ nivel: "Z", min: 9 }, { nivel: "A", min: 3 }])[1].nivel === "Z",
  P.normalizar([{ nivel: "Z", min: 9 }, { nivel: "A", min: 3 }]));
P.limpar();
check("voltar ao padrão derruba os cortes salvos", P.rotulo(6) === "Intermediário", P.rotulo(6));

/* --------------------------- a parte sobrevive ao modelo do painel amigável */
var B = J("analiseBasica.js");
var modelo = B.montarPainel({
  id: "p1", titulo: "Duas partes",
  questoes: [
    { numero: 1, parte: "Platão", alternativas: [{ letra: "A", texto: "x" }] },
    { numero: 2, parte: "Aristóteles", alternativas: [{ letra: "A", texto: "x" }] }
  ]
}, [], [], [], [], []);
check("o painel amigável preserva a parte de cada questão",
  modelo.prova.questoes.map(function (q) { return q.parte; }).join(",") === "Platão,Aristóteles",
  modelo.prova.questoes);

/* --------------------------- nota e discriminação dentro de cada parte */
var A = J("analise.js");
var provaPartes = { id: "pp", questoes: [
  { numero: 1, parte: "A", gabarito: "B", peso: 1, alternativas: [{ letra: "A" }, { letra: "B" }] },
  { numero: 2, parte: "A", gabarito: "B", peso: 1, alternativas: [{ letra: "A" }, { letra: "B" }] },
  { numero: 3, parte: "B", gabarito: "C", peso: 1, alternativas: [{ letra: "B" }, { letra: "C" }] }
] };
var folhasPartes = [
  { prova_id: "pp", nota: 10, respostas: ["B", "B", "C"] },
  { prova_id: "pp", nota: 3.3, respostas: ["B", "A", "B"] }
];
check("a prova de duas partes é reconhecida na ordem",
  A.partesDaProva(provaPartes).join(",") === "A,B", A.partesDaProva(provaPartes));
check("a nota dentro da parte ignora as questões das outras partes",
  A.notaNaParte(provaPartes, folhasPartes[1], "A") === 5 &&
  A.notaNaParte(provaPartes, folhasPartes[1], "B") === 0,
  [A.notaNaParte(provaPartes, folhasPartes[1], "A"), A.notaNaParte(provaPartes, folhasPartes[1], "B")]);
var agregado = A.resumo(provaPartes, folhasPartes);
check("o resumo traz uma linha por parte com a média das notas da parte",
  agregado.porParte.map(function (p) { return p.parte + "=" + p.media; }).join(",") === "A=7.5,B=5",
  agregado.porParte);
check("sem partes informadas a análise cai no grupo único",
  A.partesDaProva({ questoes: [{ numero: 1 }] }).join(",") === "Geral",
  A.partesDaProva({ questoes: [{ numero: 1 }] }));

/* --------------------------- o cabeçalho lido do arquivo .docx, não do texto solto */
var AM = require(path.join(__dirname, "docxAmostra.js"));

(async function docxDeVerdade() {
  var bruto = AM.amostraDuasPartes();
  var parsed = await D.parseDocx(bruto.buffer);
  var prova = D.toProva(parsed, "DUAS PARTES EM DOCX");
  var partes = prova.questoes.map(function (q) { return q.parte; });

  check("o .docx com cabeçalhos virou as quatro questões", prova.quantidade_questoes === 4,
    [prova.quantidade_questoes, partes]);
  check("o cabeçalho dividido em runs do Word ainda é uma parte", partes[0] === "Língua portuguesa",
    partes[0]);
  check("cada parte do .docx vale até o próximo cabeçalho", partes.join(",") ===
    "Língua portuguesa,Língua portuguesa,Matemática,Ciências da natureza", partes);
  check("o cabeçalho com tab depois de ÁREA também é lido", partes[3] === "Ciências da natureza", partes[3]);
  check("nenhuma questão foi criada a partir do cabeçalho",
    prova.questoes.every(function (q) { return q.parte !== "Parte I – língua portuguesa"; }), partes);
  check("o gabarito impresso no fim do .docx fecha as questões", prova.gabarito.join("") === "BCBC",
    prova.gabarito);
})().then(function () {
  console.log(falhas ? "\n" + falhas + " check(s) falharam." : "\npartes e níveis: tudo certo");
  process.exit(falhas ? 1 : 0);
});
