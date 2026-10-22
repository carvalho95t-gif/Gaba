/* Análise de item e distratores. Rode: node tests/analise.test.js */
"use strict";

var path = require("path");
var J = function (n) { return require(path.join(__dirname, "..", "js", n)); };

J("versoes.js");
var A = J("analise.js");
var V = global.GabaVersoes;

var falhas = 0;
function check(nome, cond, extra) {
  console.log((cond ? "ok   " : "FALHA ") + nome + (extra !== undefined ? " — " + JSON.stringify(extra) : ""));
  if (!cond) falhas++;
}

function prova(total) {
  var qs = [];
  for (var i = 0; i < total; i++) {
    qs.push({
      numero: i + 1,
      enunciado: "Questão " + (i + 1),
      alternativas: ["A", "B", "C", "D"].map(function (l) { return { letra: l, texto: "alt " + l }; }),
      gabarito: "A",
      peso: 1,
      descritor: i % 2 ? "D1" : "D2",
      habilidade_bncc: i % 2 ? "EF09LP04" : ""
    });
  }
  return { id: "prv", titulo: "Prova", questoes: qs, gabarito: qs.map(function () { return "A"; }),
    alternativas: 4, quantidade_questoes: total, modo: "turma", embaralhar_questoes: true,
    embaralhar_alternativas: true };
}

/* folhas embaralhadas de verdade: cada aluno responde na ordem do caderno e o motor devolve na do banco */
function folhasEmbaralhadas(p, quantos, acertosPorAluno) {
  var alunos = [];
  for (var i = 0; i < quantos; i++) alunos.push({ id: "a" + i, nome: "ALUNO " + i, numero: i + 1 });
  var batch = V.batch(p, alunos, { modo: "turma", numTipos: 4, turma_id: "t1", prova_id: p.id,
    embaralharAlternativas: true });
  return batch.itens.map(function (item, idx) {
    var versao = item.versao;
    var respostas = [];
    for (var q = 0; q < versao.total; q++) {
      /* acerta as primeiras acertosPorAluno[idx] questões da ordem do banco; nas outras
         marca a letra que, naquele caderno, corresponde à alternativa B da base */
      var banco = versao.ordem[q];
      var certa = banco < acertosPorAluno[idx];
      var posB = (versao.altMap[q] || []).indexOf(1);
      respostas[q] = certa ? versao.gabarito[q] : (posB >= 0 ? "ABCDE".charAt(posB) : "B");
    }
    var notas = V.corrigir(p, versao, respostas);
    return { prova_id: p.id, aluno_id: "a" + idx, aluno_nome: "ALUNO " + idx, nota: notas.nota,
      acertos: notas.acertos, total_questoes: notas.total, respostas: notas.respostas_banco };
  });
}

var p = prova(6);
var folhas = folhasEmbaralhadas(p, 8, [6, 5, 4, 3, 2, 1, 0, 0]);
var lista = A.itens(p, folhas);

check("uma linha por questão da prova base", lista.length === 6, lista.length);
check("o gabarito da base vale apesar do caderno embaralhado",
  lista.every(function (it) { return it.gabarito === "A"; }), lista.map(function (i) { return i.gabarito; }));
check("quem acertou pela versão conta na questão certa da base",
  lista[0].acertos === 6 && lista[4].acertos === 2 && lista[5].acertos === 1,
  lista.map(function (i) { return i.acertos; }));
check("o distrator B leva quase todas as erradas da questão 6",
  lista[5].distratores.filter(function (d) { return d.letra === "B"; })[0].quantidade === 7,
  lista[5].distratores);
check("os distratores não listam a letra do gabarito",
  lista[0].distratores.every(function (d) { return d.letra !== "A"; }) && lista[0].distratores.length === 3,
  lista[0].distratores.map(function (d) { return d.letra; }));
check("a proporção de acerto vem dos acertos sobre a turma",
  lista[0].proporcao === 0.75 && lista[5].proporcao === 0.125, [lista[0].proporcao, lista[5].proporcao]);
check("a discriminação separa os 25% de cima dos 25% de baixo",
  lista[0].discriminacao === 1 && lista[5].discriminacao === 0.5,
  [lista[0].discriminacao, lista[5].discriminacao]);
check("o texto da alternativa chega junto para ler o distrator na tela",
  lista[0].distratores[0].texto === "alt B", lista[0].distratores[0]);

var s = A.resumo(p, folhas);
check("o resumo conta os 8 alunos e as 6 questões", s.alunos === 8 && s.itens === 6, s);
check("a questão 6 entra na lista de revisar como muito difícil",
  s.dificeis.indexOf(6) >= 0 && s.distratores.indexOf(6) >= 0, [s.dificeis, s.distratores]);
check("a média da turma é a média das notas lidas", s.media > 0 && s.media < 10, s.media);

/* item ruim de verdade: os melhores erram mais que os piores e o distrator vence o gabarito */
var p2 = prova(4);
var armadas = [
  ["A", "B", "A", "A"], ["A", "B", "A", "A"], ["A", "B", "A", "A"], ["A", "B", "A", "A"],
  ["B", "A", "B", "B"], ["B", "A", "B", "B"], ["B", "A", "B", "B"], ["B", "A", "B", "B"],
  ["B", "B", "B", "B"], ["B", "B", "B", "B"]
];
var notas2 = armadas.map(function (r, i) { return V.corrigir(p2, { total: 4, ordem: [0, 1, 2, 3],
  inverte: [0, 1, 2, 3], altMap: [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]],
  gabarito: ["A", "A", "A", "A"] }, r); });
var folhas2 = armadas.map(function (r, i) {
  return { prova_id: p2.id, nota: i < 4 ? 10 : (i < 8 ? 0 : 5), total_questoes: 4,
    respostas: notas2[i].respostas_banco };
});
var l2 = A.itens(p2, folhas2);
check("o item que inverte a turma é marcado como discriminação negativa",
  l2[1].discriminacao === -1 && l2[1].bandeiras.indexOf("discriminacao-negativa") >= 0, l2[1]);
check("a questão 2 tem o distrator mais forte que o gabarito",
  l2[1].bandeiras.indexOf("distrator-mais-forte") >= 0 && l2[1].distratorMaisForte === "B" &&
  l2[1].acertos === 4 && l2[1].contagem.B === 6, l2[1]);

/* prova sem gabarito e com poucos alunos */
var p3 = prova(3);
p3.questoes[0].gabarito = "";
var poucas = [{ prova_id: p3.id, nota: 5, total_questoes: 3, respostas: ["", "A", "C"] }];
var l3 = A.itens(p3, poucas);
check("questão sem gabarito aparece marcada", l3[0].bandeiras.indexOf("sem-gabarito") >= 0, l3[0].bandeiras);
check("com um aluno só a discriminação não é inventada",
  l3[1].discriminacao === null && l3[1].bandeiras.indexOf("poucos-alunos") >= 0, l3[1]);
check("resposta em branco conta, mas não vira distrator",
  l3[0].branco === 1 && l3[0].participantes === 1 && l3[0].distratores.every(function (d) { return d.quantidade === 0; }),
  l3[0]);

/* folhas de outra prova não entram na conta */
var mistas = folhas.concat([{ prova_id: "outra", nota: 10, total_questoes: 6, respostas: ["A", "A", "A", "A", "A", "A"] }]);
check("a folha de outra prova fica fora da análise", A.itens(p, mistas)[0].acertos === lista[0].acertos,
  A.itens(p, mistas)[0].acertos);

check("o rótulo da bandeira vem em português", /quase ninguém acertou/.test(A.rotuloBandeira("muito-dificil")));

/* a folha que ainda só está no aparelho traz "respostas" na ordem do caderno impresso:
   a análise tem que usar respostas_banco, senão conta acerto onde não houve */
var p4 = prova(3);
var cad = V.batch(p4, [{ id: "a1", nome: "UM", numero: 1 }], { modo: "turma", numTipos: 4,
  turma_id: "t1", prova_id: p4.id, salt: "aparelho", embaralharAlternativas: true }).itens[0].versao;
var noCaderno = [];
for (var pos = 0; pos < cad.total; pos++) noCaderno.push(cad.gabarito[pos]);
var corrigida = V.corrigir(p4, cad, noCaderno);
var doAparelho = [{ prova_id: p4.id, nota: 10, total_questoes: 3, respostas: noCaderno,
  respostas_banco: corrigida.respostas_banco }];
var l4 = A.itens(p4, doAparelho);
check("as letras do caderno diferem das da base (o teste seria inútil se não)",
  String(noCaderno) !== String(corrigida.respostas_banco), [noCaderno, corrigida.respostas_banco]);
check("a folha do aparelho entra na análise pela ordem da base",
  l4.length === 3 && l4.every(function (it) { return it.acertos === 1 && it.branco === 0; }),
  l4.map(function (it) { return it.acertos; }));

console.log(falhas ? "\n" + falhas + " check(s) falharam." : "\nanálise de item e distratores: tudo certo");
process.exit(falhas ? 1 : 0);
