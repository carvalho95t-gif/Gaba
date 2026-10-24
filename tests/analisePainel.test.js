/* Agregação do painel de aprendizagem. Rode: node tests/analisePainel.test.js */
"use strict";

var path = require("path");
var B = require(path.join(__dirname, "..", "js", "analiseBasica.js"));
var falhas = 0;
function check(nome, cond, extra) {
  console.log((cond ? "ok   " : "FALHA ") + nome + (extra === undefined ? "" : " — " + JSON.stringify(extra)));
  if (!cond) falhas++;
}
function prova() {
  return { id: 7, titulo: "<img src=x onerror=global.pwned=1>", gabarito: ["A", "B", "", "D"], questoes: [
    { numero: 1, enunciado: "<script>global.pwned=1</script>", alternativas: [{ letra: "A", texto: "<b>A</b>" }, { letra: "B", texto: "B" }], descritor: "D1" },
    { numero: 2, alternativas: [{ letra: "A", texto: "A" }, { letra: "B", texto: "B" }], descritor: "D1" },
    { numero: 3, alternativas: [{ letra: "A", texto: "A" }, { letra: "C", texto: "C" }], gabarito: "", descritor: "D2" },
    { numero: 4, alternativas: [{ letra: "D", texto: "D" }, { letra: "Z", texto: "inválida" }], descritor: "" }
  ] };
}

var correcoes = [
  { id: "velha", prova_id: 7, aluno_id: 1, turma_id: 10, nota: 9, respostas: ["A", "B", "C", "D"], codigo: "V1", confusao: [1], qr_texto: "qr-antigo", created_at: "2026-01-01T00:00:00Z" },
  { id: "empate1", prova_id: "7", aluno_id: "1", turma_id: "10", nota: 4, respostas: ["B", "A", "C", "D"], respostas_banco: ["A", "B", "Z", "D"], codigo: "V1", confusao: [2], qr_texto: "qr-novo", created_at: "2026-02-01T00:00:00Z" },
  { id: "empate2", prova_id: 7, aluno_id: 1, turma_id: 10, nota: 0, respostas: ["B", "A", "C", "D"], respostas_banco: ["A", "B", "Z", "D"], codigo: "V1", confusao: [2], qr_texto: "qr-novo", created_at: "2026-02-01T00:00:00Z" },
  { id: "local-mesma", prova_id: 7, aluno_id: 1, turma_id: 10, nota: 0, respostas_banco: ["A", "B", "Z", "D"], codigo: "V1", confusao: [4], qr_texto: "qr-novo", created_at: "2026-02-01T00:00:00Z" },
  { prova_id: 7, turma_id: 10, aluno_numero: 900, aluno_nome: "Legado A", nota: null, respostas: ["B", "B", "", "D"], codigo: "SEM-MAPA", confusao: [1], created_at: "2026-03-01T00:00:00Z" },
  { prova_id: 7, turma_id: 20, aluno_numero: 900, aluno_nome: "Legado B", nota: 8, respostas: ["A", "A", "C", "D"], created_at: "2026-03-01T00:00:00Z" },
  { prova_id: 7, turma_id: 20, aluno_nome: "Órfão", nota: 6, respostas: ["A", "B", "", "X"], created_at: "2026-03-02T00:00:00Z" },
  { prova_id: "outra", aluno_id: 2, turma_id: 10, nota: 10, respostas: ["A", "B", "C", "D"], created_at: "2026-04-01T00:00:00Z" }
];
var modelo = B.montarPainel(prova(), correcoes,
  [{ id: 10, nome: "T1" }, { id: 20, nome: "T2" }],
  [{ id: 1, nome: "Roster Um", numero: 1, matricula: 0, turma_id: 10 },
   { id: 2, nome: "Sem Leitura", numero: 2, turma_id: 10 },
   { id: 3, nome: "Roster Legado", numero: 900, turma_id: 10 }],
  [{ codigo: "V1", ordem: [2, 0, 3, 1] }],
  [{ codigo: "D1", descricao: "Descrição segura" }, { codigo: "D9", descricao: "não usada" }]);

check("IDs de prova, turma e aluno são strings", modelo.prova.id === "7" && modelo.turmas[0].id === "10" && modelo.alunos.every(function (a) { return typeof a.id === "string" && typeof a.turma_id === "string"; }));
check("texto potencialmente XSS permanece dado, sem execução", global.pwned === undefined && modelo.prova.titulo.indexOf("onerror") >= 0 && modelo.prova.questoes[0].enunciado.indexOf("script") >= 0);
check("catálogo é filtrado para descritores usados", modelo.descricoes.D1 === "Descrição segura" && !Object.prototype.hasOwnProperty.call(modelo.descricoes, "D9"), modelo.descricoes);
check("letras inválidas não viram alternativa; gabarito usa fallback da prova", modelo.prova.questoes[3].alternativas.length === 1 && modelo.prova.questoes[0].gabarito === "A");
var um = modelo.alunos.filter(function (a) { return a.id === "1"; })[0];
check("roster prevalece na identificação", um.nome === "Roster Um" && um.matricula === "0", um);
check("dedupe usa a mais recente e, em empate, a última", um.correcao.nota === 0, um.correcao);
check("respostas_banco prevalece sobre respostas locais", String(um.correcao.respostas) === "A,B,Z,D", um.correcao.respostas);
check("confusão só agrega leitura com mesmo QR, código e data", String(um.correcao.confusao.sort()) === "2,4" && um.correcao.confusao.indexOf(1) < 0, um.correcao.confusao);
check("ordem da versão mapeia confusão 1-based para base 0-based", String(um.correcao.revisarBase.sort()) === "0,1", um.correcao.revisarBase);
var legado = modelo.alunos.filter(function (a) { return a.id === "3"; })[0];
check("registro sem aluno_id associa por turma e número", legado && legado.correcao && legado.nome === "Roster Legado" && legado.correcao.nota === null, legado);
check("mapa de versão ausente não inventa revisarBase", legado.correcao.confusao.length === 1 && legado.correcao.revisarBase.length === 0, legado.correcao);
check("número igual em outra turma não mistura alunos", modelo.alunos.some(function (a) { return a.turma_id === "20" && a.numero === 900 && a.nome === "Legado B"; }));
check("correção sem aluno cadastrado aparece", modelo.alunos.some(function (a) { return a.turma_id === "20" && a.nome === "Órfão" && a.correcao; }));
check("correção de outra prova é filtrada", modelo.alunos.filter(function (a) { return a.id === "2"; })[0].correcao === null);

var t1 = B.analisarPainel(modelo, 10);
var t2 = B.analisarPainel(modelo, "20");
check("duas turmas são separadas", t1.alunos.length === 3 && t2.alunos.length === 2, [t1.alunos.length, t2.alunos.length]);
check("roster sem leitura não vira zero nem falta", t1.semLeitura === 1 && t1.corrigidos.length === 2 && t1.notas.length === 1 && t1.notas[0] === 0 && t1.media === 0, t1);
check("nota null não entra nas faixas; nota zero entra", String(t1.faixas) === "1,0,0,0,0", t1.faixas);
check("resposta inválida conta em outras", t1.itens[2].outras === 1 && t1.itens[2].branco === 1, t1.itens[2]);
check("taxas de item permanecem exatas", t1.itens[0].taxa === 50 && t2.itens[1].taxa === 50, [t1.itens[0].taxa, t2.itens[1].taxa]);
var d1 = t1.descritores.filter(function (d) { return d.codigo === "D1"; })[0];
var d2 = t1.descritores.filter(function (d) { return d.codigo === "D2"; })[0];
var sem = t1.descritores.filter(function (d) { return d.codigo === "__sem_descritor__"; })[0];
check("habilidade com dois itens soma os denominadores", d1.questoes.length === 2 && d1.acertos === 3 && d1.total === 4 && d1.taxa === 75, d1);
check("item sem gabarito não entra no denominador", d2.questoes.length === 1 && d2.total === 0 && d2.taxa === null, d2);
check("sem descritor é agrupado sem status de domínio", sem && sem.questoes.length === 1 && !("status" in sem), sem);
var doisSemGab = B.analisarPainel(B.montarPainel({ id: "sg", questoes: [
  { descritor: "H", alternativas: [{ letra: "A", texto: "A" }] },
  { descritor: "H", alternativas: [{ letra: "B", texto: "B" }] }
] }, [{ prova_id: "sg", aluno_id: "a", respostas: ["A", "B"], nota: null }], [], [], [], []), "").descritores[0];
check("habilidade com dois itens sem gabarito continua sem taxa", doisSemGab.questoes.length === 2 && doisSemGab.total === 0 && doisSemGab.taxa === null, doisSemGab);

var especiais = { id: "esp", gabarito: ["A", "B"], questoes: [
  { descritor: "__proto__" }, { descritor: "constructor" }
] };
var perfilEspecial = B.perfilAluno(especiais, { respostas: ["A", "B"] });
var taxasEspeciais = B.taxaPorDescritor(especiais,
  [{ prova_id: "esp", aluno_id: "x", respostas: ["A", "B"] }], "", []);
var rankingEspecial = B.ranking(especiais, [
  { prova_id: "esp", aluno_id: "__proto__", respostas: ["A", "B"] },
  { prova_id: "esp", aluno_id: "constructor", respostas: ["A", "B"] }
], "", []);
check("chaves especiais permanecem dados sem alterar protótipos",
  perfilEspecial.length === 2 && taxasEspeciais.length === 2 && rankingEspecial.length === 2 &&
  Object.prototype.total === undefined && Object.prototype.acertos === undefined,
  [perfilEspecial, taxasEspeciais, rankingEspecial]);

var mesclado = B.montarPainel({ id: "m", gabarito: ["A"], questoes: [
  { numero: 1, alternativas: [{ letra: "A", texto: "A" }, { letra: "B", texto: "B" }] }
] }, [
  { prova_id: "m", aluno_id: "a", turma_id: "t", aluno_nome: "Nome OCR", nota: 10,
    respostas_banco: ["A"], codigo: "C", qr_texto: "qr", created_at: "2026-05-01T00:00:00Z" },
  { prova_id: "m", turma_id: "t", aluno_nome: "Nome OCR", nota: null, respostas_banco: [], respostas: ["B"],
    codigo: "C", qr_texto: "qr", confusao: [1], created_at: "2026-05-01T00:00:00Z" }
], [{ id: "t", nome: "Turma" }], [{ id: "a", turma_id: "t", nome: "Nome Cadastro" }],
[{ codigo: "C", ordem: [0] }], []);
check("alias da correção explícita une a cópia local ao roster",
  mesclado.alunos.length === 1 && mesclado.alunos[0].id === "a" && mesclado.alunos[0].nome === "Nome Cadastro",
  mesclado.alunos);
check("cópias da mesma leitura preservam nota e respostas-base válidas",
  mesclado.alunos[0].correcao.nota === 10 && String(mesclado.alunos[0].correcao.respostas) === "A" &&
  String(mesclado.alunos[0].correcao.confusao) === "1" && String(mesclado.alunos[0].correcao.revisarBase) === "0",
  mesclado.alunos[0].correcao);

var baseVazia = B.analisarPainel(B.montarPainel({ id: "bv", gabarito: ["A"], questoes: [
  { alternativas: [{ letra: "A", texto: "A" }] }
] }, [{ prova_id: "bv", aluno_id: "a", nota: 10, respostas_banco: [], respostas: ["A"] }], [], [], [], []), "");
check("respostas_banco vazia recua para respostas preenchidas",
  baseVazia.corrigidos.length === 1 && baseVazia.itens[0].participantes === 1 && baseVazia.itens[0].acertos === 1,
  baseVazia.itens[0]);

var vazio = B.montarPainel({ id: "v", questoes: [] }, [], [], [], [], []);
var av = B.analisarPainel(vazio, "");
check("painel vazio preserva null para média", av.alunos.length === 0 && av.corrigidos.length === 0 && av.media === null && av.itens.length === 0, av);

console.log(falhas ? "\n" + falhas + " check(s) falharam." : "\npainel de aprendizagem: tudo certo");
process.exit(falhas ? 1 : 0);
