/* Ajuda do Gaba — a busca do guia contra perguntas de professor de verdade.
   node tests/ajuda.test.js */
"use strict";

require("../js/guiaUso.js");
require("../js/ajudaBusca.js");

var ARTIGOS = globalThis.GabaGuia.catalogo();
var TELAS = globalThis.GabaGuia.telas();
var B = globalThis.GabaBusca;

var falhas = 0;
function ok(cond, nome, detalhe) {
  if (!cond) falhas += 1;
  console.log((cond ? "  ok   " : "  FALHA ") + nome +
    (!cond && detalhe !== undefined ? "  ->  " + JSON.stringify(detalhe) : ""));
}

function ids(r) { return r.resultados.map(function (x) { return x.id; }); }
function placar(r) {
  return r.resultados.map(function (x) {
    return x.id + " (" + x.score.toFixed(1) + ", cob " + x.cobertura.toFixed(2) + ")";
  }).join(" | ") || "nenhum";
}

console.log("\n== telas do app ==");
var TELAS_APP = ["geral", "dashboard", "scanner", "relatorios", "turmas", "provas", "caderno", "config", "ajuda"];
ok(TELAS_APP.every(function (t) { return Boolean(TELAS[t]); }), "todas as telas do app têm rótulo", Object.keys(TELAS));
ok(Object.keys(TELAS).length === TELAS_APP.length, "nenhuma tela do modelo sobrou", Object.keys(TELAS));
var comTela = B.buscar(ARTIGOS, "como corrigir as folhas", { tela: "scanner" });
ok(ids(comTela)[0] === "ler-folhas", "a tela atual entra no desempate", placar(comTela));

console.log("\n== integridade do guia ==");
var vistos = {};
ARTIGOS.forEach(function (a) {
  ok(!vistos[a.id], "id único: " + a.id);
  vistos[a.id] = true;
  ok(Boolean(TELAS[a.tela]), "tela conhecida em " + a.id + ": " + a.tela);
  ok((a.perguntas || []).length >= 2, a.id + " tem pelo menos 2 perguntas de exemplo");
  ok((a.passos || []).length >= 2, a.id + " tem passos");
  (a.veja || []).forEach(function (v) {
    ok(ARTIGOS.some(function (x) { return x.id === v; }), "veja existe: " + a.id + " -> " + v);
  });
});

console.log("\n== toda pergunta de exemplo acha o próprio artigo no top 3 ==");
ARTIGOS.forEach(function (a) {
  (a.perguntas || []).forEach(function (q) {
    var r = B.buscar(ARTIGOS, q);
    var pos = ids(r).slice(0, 3).indexOf(a.id);
    ok(pos >= 0, "[" + q + "] -> " + a.id + (pos < 0 ? " (veio: " + placar(r) + ")" : ""));
  });
});

console.log("\n== perguntas soltas ==");
var CASOS = [
  /* começo e conta */
  { q: "nao sei por onde comecar", top: "comecar" },
  { q: "primeiros passos", top: "comecar" },
  { q: "como faco login", top: "entrar" },
  { q: "nao consigo entrar", top: "entrar" },
  { q: "minha senha nao funciona", top: "entrar" },
  { q: "o gaba pede senha toda hora", top: "entrar" },
  { q: "esqueci a senha", top: "entrar" },
  { q: "nao tenho conta", top: "conta" },
  { q: "como criar conta de professor", top: "conta" },
  { q: "preciso de convite para usar", top: "conta" },

  /* internet e instalação */
  { q: "funciona sem internet", top: "sem-internet" },
  { q: "a escola nao tem wifi", top: "sem-internet" },
  { q: "o que acontece se cair a rede", top: "sem-internet" },
  { q: "as folhas nao subiram para o banco", contem: ["sem-internet", "ver-notas"] },
  { q: "fila offline", top: "sem-internet" },
  { q: "como instalar no celular", top: "instalar" },
  { q: "colocar na tela inicial", top: "instalar" },
  { q: "funciona no iphone", top: "instalar" },
  { q: "da para instalar como aplicativo", top: "instalar" },

  /* escola, turma, aluno */
  { q: "como cadastro a escola", top: "escola" },
  { q: "a escola nao aparece no seletor", contem: ["escola", "filtro-escola"] },
  { q: "minhas turmas desapareceram", top: "filtro-escola" },
  { q: "trocar de escola", top: "filtro-escola" },
  { q: "como crio uma turma", top: "turma" },
  { q: "cadastrar turma nova", top: "turma" },
  { q: "ano e periodo da turma", top: "turma" },
  { q: "como adiciono um aluno", top: "aluno" },
  { q: "numero de chamada", top: "aluno" },
  { q: "aluno que chegou depois", top: "aluno" },
  { q: "importar lista do excel", top: "importar-lista" },
  { q: "colar as celulas da planilha", top: "importar-lista" },
  { q: "a planilha nao foi reconhecida", contem: ["importar-lista"] },
  { q: "importar xlsx da escola", top: "importar-lista" },
  { q: "apagar uma turma", top: "apagar" },
  { q: "excluir aluno errado", top: "apagar" },
  { q: "como removo uma prova", top: "apagar" },
  { q: "desfazer exclusao", top: "apagar" },

  /* prova e caderno */
  { q: "como salvo so o gabarito", top: "prova-gabarito" },
  { q: "criar prova sem questoes", top: "prova-gabarito" },
  { q: "quantas questoes pode ter", top: "prova-gabarito" },
  { q: "como importo a prova do word", top: "importar-documento" },
  { q: "ler o pdf da prova", top: "importar-documento" },
  { q: "trazer o docx pro gaba", top: "importar-documento" },
  { q: "mudar o peso da questao", top: "revisar-questoes" },
  { q: "colocar descritor na questao", top: "revisar-questoes" },
  { q: "o gabarito veio errado", contem: ["revisar-questoes", "importar-documento"] },
  { q: "questao sem gabarito", top: "revisar-questoes" },
  { q: "como embaralhar as questoes", top: "embaralhar" },
  { q: "evitar cola na prova", top: "embaralhar" },
  { q: "embaralhar as alternativas", top: "embaralhar" },
  { q: "tipos de caderno diferentes", top: "embaralhar" },
  { q: "mudar o cabecalho da prova", top: "modelo-cabecalho" },
  { q: "modelo enem", top: "modelo-cabecalho" },
  { q: "duas colunas", top: "modelo-cabecalho" },
  { q: "nome da escola impresso", contem: ["modelo-cabecalho"] },
  { q: "como imprimo os cadernos", top: "imprimir" },
  { q: "margem nenhuma na impressora", top: "imprimir" },
  { q: "imprimir frente e verso", top: "imprimir" },
  { q: "a questao foi cortada", top: "cortado" },
  { q: "nao deixa imprimir", contem: ["cortado", "imprimir"] },
  { q: "texto saiu cortado no papel", top: "cortado" },
  { q: "reimprimir a prova", top: "reimprimir" },
  { q: "as folhas antigas ainda valem", top: "reimprimir" },
  { q: "aluno novo depois da impressao", top: "reimprimir" },

  /* leitor */
  { q: "como uso o leitor", top: "ler-folhas" },
  { q: "corrigir com a camera", top: "ler-folhas" },
  { q: "ler as folhas da turma", top: "ler-folhas" },
  { q: "a camera nao abre", top: "camera" },
  { q: "permissao de camera negada", top: "camera" },
  { q: "a folha nao e reconhecida", top: "nao-acha" },
  { q: "enquadre a folha inteira", top: "nao-acha" },
  { q: "bolhas lidas qr nao encontrado", top: "nao-acha" },
  { q: "o leitor nao acha a folha", top: "nao-acha" },
  { q: "o que e com duvida", top: "duvida" },
  { q: "revisar 3 7", top: "duvida" },
  { q: "duas marcas na mesma questao", top: "duvida" },
  { q: "prova a lapis", top: "sensibilidade" },
  { q: "marca fraca nao le", top: "sensibilidade" },
  { q: "aumentar a sensibilidade do leitor", top: "sensibilidade" },
  { q: "a folha ja foi lida", top: "reler" },
  { q: "esquecer lidas", top: "reler" },
  { q: "o leitor recusou a folha", top: "folha-recusada" },
  { q: "falta o gabarito desta versao", top: "folha-recusada" },
  { q: "folha de outra impressao", top: "folha-recusada" },

  /* notas */
  { q: "onde vejo as notas", top: "ver-notas" },
  { q: "a nota nao aparece", top: "ver-notas" },
  { q: "folha marcada como aparelho", top: "ver-notas" },
  { q: "analise de item", top: "analise-itens" },
  { q: "distrator mais forte", top: "analise-itens" },
  { q: "questoes mais dificeis", contem: ["analise-itens"] },
  { q: "exportar para excel", top: "excel" },
  { q: "baixar planilha das notas", contem: ["excel"] },
  { q: "o que e a central de alivio", top: "alivio" },
  { q: "pilhas por turma", top: "alivio" },

  /* banco, conta, ajuda */
  { q: "configurar o banco", top: "banco" },
  { q: "o que e supabase", top: "banco" },
  { q: "anon key", top: "banco" },
  { q: "rode o schema sql", top: "erro-banco" },
  { q: "o banco so atende quem entrou", top: "erro-banco" },
  { q: "salvou no aparelho mas nao subiu", contem: ["erro-banco", "sem-internet", "ver-notas"] },
  { q: "como sair da conta", top: "sair-trocar-professor" },
  { q: "outro professor usar o mesmo celular", contem: ["sair-trocar-professor"] },
  { q: "como mando uma sugestao", top: "pedir-ajuda" },
  { q: "relatar um problema", top: "pedir-ajuda" },
  { q: "os nomes dos alunos vao junto no erro", top: "privacidade-erros" },
  { q: "onde fica o relato de erro", contem: ["privacidade-erros", "pedir-ajuda"] },

  /* erros de digitação */
  { q: "como fasoo pra imprimir", contem: ["imprimir"] },
  { q: "a camara nao abre", top: "camera" },
  { q: "nao consigo inprimir o lote", contem: ["imprimir"] },
  { q: "gabaito veio errado", contem: ["revisar-questoes", "importar-documento", "prova-gabarito"] },
  { q: "como intalar no celular", top: "instalar" },
  { q: "o letor nao acha a folha", contem: ["nao-acha"] },

  /* fora do assunto: nao pode inventar */
  { q: "qual a capital da franca", nada: true },
  { q: "receita de bolo de cenoura", nada: true },
  { q: "quem ganhou o jogo ontem", nada: true },
  { q: "o que e o gaba", nada: true }
];

var top1 = 0, top3 = 0, avaliados = 0;
CASOS.forEach(function (caso) {
  var r = B.buscar(ARTIGOS, caso.q);
  var lista = ids(r);
  var primeiro = lista[0] || null;
  var rotulo = "[" + caso.q + "]";
  if (caso.nada) {
    ok(r.nivel === "nada" && lista.length === 0, rotulo + " deveria não achar nada",
      { nivel: r.nivel, veio: placar(r) });
    return;
  }
  avaliados += 1;
  var esperados = caso.top ? (Array.isArray(caso.top) ? caso.top : [caso.top]) : caso.contem;
  var pos1 = primeiro ? esperados.indexOf(primeiro) : -1;
  var pos3 = lista.slice(0, 3).some(function (id) { return esperados.indexOf(id) >= 0; });
  if (pos1 >= 0) top1 += 1;
  if (pos3) top3 += 1;
  if (caso.top) {
    ok(pos1 >= 0, rotulo + " -> 1º " + esperados.join(" ou ") +
      (pos1 < 0 ? "  (veio: " + placar(r) + ")" : ""));
  } else {
    ok(pos3, rotulo + " -> no top 3: " + esperados.join(" ou ") +
      (!pos3 ? "  (veio: " + placar(r) + ")" : ""));
  }
});

console.log("\n== desempenho ==");
var t0 = Date.now();
ARTIGOS.forEach(function (a) { B.buscar(ARTIGOS, a.perguntas[0]); });
var porConsulta = (Date.now() - t0) / ARTIGOS.length;
ok(porConsulta < 30, "média por consulta abaixo de 30 ms", { media: porConsulta.toFixed(2) + " ms" });

var pctTop1 = avaliados ? Math.round(top1 / avaliados * 100) : 0;
var pctTop3 = avaliados ? Math.round(top3 / avaliados * 100) : 0;
console.log("\n1º lugar: " + top1 + "/" + avaliados + " (" + pctTop1 + "%)");
console.log("top 3:    " + top3 + "/" + avaliados + " (" + pctTop3 + "%)");
ok(pctTop1 >= 90, "acerto do 1º lugar em pelo menos 90% das perguntas");
ok(pctTop3 >= 98, "acerto no top 3 em pelo menos 98% das perguntas");

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "tudo certo"));
process.exit(falhas ? 1 : 0);
