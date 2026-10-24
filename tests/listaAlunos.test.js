/* Ler lista de chamada de verdade: .xlsx do SEDU, CSV com ; e acento, CSV em latin-1,
   texto colado do Excel e lista sem cabecalho. Roda so no node: node tests/listaAlunos.test.js */
"use strict";

var fs = require("fs");
var path = require("path");

global.GabaDocx = require("../js/docxParser.js");
require("../js/planilha.js");
require("../js/listaAlunos.js");
var GabaPlanilha = globalThis.GabaPlanilha;
var GabaLista = globalThis.GabaLista;

var FIX = path.join(__dirname, "fixtures");

function leBuffer(nome) {
  var b = fs.readFileSync(path.join(FIX, nome));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
function listaDe(arquivo) {
  var texto = GabaPlanilha.decodar(leBuffer(arquivo));
  return GabaLista.montar(GabaPlanilha.separar(texto));
}
function porNumero(lista) {
  var out = {};
  lista.forEach(function (a) { out[a.numero] = a; });
  return out;
}

var falhas = 0;
function check(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (detalhe !== undefined && !cond ? "  ->  " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas += 1;
}

(async function principal() {
  console.log("\n== pedacos soltos ==");
  check("detecta o separador de cada origem",
    GabaPlanilha.detectarSeparador("1\tANA\tA") === "\t" &&
    GabaPlanilha.detectarSeparador("1;ANA;A") === ";" &&
    GabaPlanilha.detectarSeparador("1,ANA,A") === ",");
  check("campo citado segura ponto e virgula dentro",
    GabaPlanilha.linhaParaCampos('1;"VALENTE, ANICETO";x', ";").join("|") === '1|VALENTE, ANICETO|x');
  check("Nº vira numero e texto solto vira nulo",
    GabaLista.numeroDe("Nº 7") === 7 && GabaLista.numeroDe("12") === 12 &&
    GabaLista.numeroDe("Nº") === null && GabaLista.numeroDe("ANA") === null);
  check("tipo de caderno aceito em 1..26",
    GabaLista.tipoDe("Tipo 10") === 10 && GabaLista.tipoDe("3") === 3 &&
    GabaLista.tipoDe("B") === null && GabaLista.tipoDe("Tipo 41") === null);
  check("e-mail validado sem aceito inventado",
    GabaLista.emailValido("a.b@educador.edu.es.gov.br") && !GabaLista.emailValido("sem-arroba"));

  console.log("\n== CSV do Excel (ponto e virgula, BOM, acento) ==");
  var sedu = listaDe("chamada-sedu.csv");
  var s = porNumero(sedu.alunos);
  check("quatro alunos e a linha TOTAL fora", sedu.alunos.length === 4, [sedu.alunos.length, sedu.problemas]);
  check("acento preservado", s[2] && s[2].nome === "JOSÉ TIBURCIO DAS NEVES", s[2]);
  check("campina entre aspas virou nome normal", s[3] && s[3].nome === "QUITERIA BANDEIRA DO PRADO", s[3]);
  check("e-mail gravado em minusculo", s[1] && s[1].email_responsavel === "responsavel1@exemplo.test", s[1]);
  check("telefone limpo mas legivel", s[1] && s[1].telefone_responsavel === "(27) 90000-0060", s[1]);
  check("matricula longa nao virou numero de chamada", s[1] && s[1].matricula === "209900001", s[1]);
  check("responsavel chegou", s[1] && s[1].responsavel === "Rutélia Antunes", s[1]);
  check("cabecalho encontrado na primeira linha", sedu.linhaCabecalho === 0, sedu.linhaCabecalho);
  check("linha de rodape nao virou aluno",
    !sedu.alunos.some(function (a) { return /45 alunos/.test(a.nome); }), sedu.alunos.map(function (a) { return a.nome; }));

  console.log("\n== CSV salvo em windows-1252 ==");
  var l1 = listaDe("chamada-latin1.csv");
  var d = porNumero(l1.alunos);
  check("decodificado sem virar ponto de interrogação",
    d[2] && d[2].nome === "JOSÉ TIBURCIO DAS NEVES", d[2]);
  check("coluna Tipo de Prova virou tipo", d[1] && d[1].tipo === 3, d[1]);
  check("letra solta no tipo e ignorada sem inventar tipo", d[2] && d[2].tipo === null, d[2]);
  check("cabecalho com acento foi reconhecido", l1.linhaCabecalho === 0, l1.linhaCabecalho);

  console.log("\n== CSV com virgula e coluna que nao importa ==");
  var v = listaDe("chamada-virgula.csv");
  check("dois alunos com a numeração da escola",
    v.alunos.length === 2 && v.alunos[0].numero === 11 && v.alunos[1].nome === "ODILA MACHADO PEREIRA", v.alunos);
  check("a coluna Componente foi deixada de fora",
    v.alunos.every(function (a) { return !/Matem/i.test(a.nome); }), v.alunos);

  console.log("\n== lista sem cabecalho (so numero e nome) ==");
  var sc = listaDe("chamada-sem-cabecalho.csv");
  check("ainda assim os nomes sairam na ordem",
    sc.alunos.length === 2 && /FRANCELINO|TERTULIANO/.test(sc.alunos.map(function (a) { return a.nome; }).join(" ")),
    sc.alunos);
  check("avisa que adivinhou as colunas",
    sc.problemas.some(function (p) { return /cabeçalho/.test(p); }), sc.problemas);
  check("matricula de 9 digitos ficou guardada",
    sc.alunos.every(function (a) { return /^\d{9}$/.test(a.matricula || ""); }), sc.alunos);

  console.log("\n== texto colado direto do Excel ==");
  var colado = GabaLista.montar(GabaPlanilha.separar(
    "Nº\tNome do Estudante\tTipo de Prova\r\n" +
    "1\tCIBELE TRINDADE FARIAS\tTipo 1\tA B E C D E B B A B\r\n" +
    "2\tJOSÉ TIBURCIO DAS NEVES\tTipo 2\tC B A B A E A D D C\r\n" +
    "\tSEM NUMERO QUALQUER\t\t\r\n" +
    "2\tREPETIDA AQUI\tTipo 3\r\n"
  ));
  check("tab e CRLF tratados", colado.alunos.length === 3, [colado.alunos.length, colado.problemas]);
  check("a repetida do nº 2 ficou de fora com aviso",
    !colado.alunos.some(function (a) { return a.nome === "REPETIDA AQUI"; }) &&
    colado.problemas.some(function (p) { return /se repete/.test(p); }), colado.problemas);
  check("quem veio sem numero recebeu o seguinte",
    colado.alunos.some(function (a) { return a.nome === "SEM NUMERO QUALQUER" && a.numero === 3 && a.numeroAutomatico; }),
    colado.alunos);

  console.log("\n== duplicados e lista vazia ==");
  var dup = GabaLista.montar([["Nº", "Nome"], ["4", "ANA BEATRIZ"], ["4", "ANA BEATRIZ"]]);
  check("o mesmo aluno duas vezes vira um só", dup.alunos.length === 1, dup.alunos);
  var gemeos = GabaLista.montar([["Nº", "Nome"], ["1", "ANA BEATRIZ"], ["2", "ANA BEATRIZ"], ["3", "BRUNO CARLOS"]]);
  check("homonimos com numeros diferentes sao dois alunos de verdade",
    gemeos.alunos.length === 3 && gemeos.puladas === 0 &&
    gemeos.alunos.filter(function (a) { return a.nome === "ANA BEATRIZ"; }).map(function (a) { return a.numero; }).join("|") === "1|2",
    [gemeos.alunos, gemeos.puladas]);
  var gemeosSemNumero = GabaLista.montar([["Nº", "Nome"], ["1", "ANA BEATRIZ"], ["", "ANA BEATRIZ"]]);
  check("repetido sem numero de chamada continua virando um só",
    gemeosSemNumero.alunos.length === 1 && gemeosSemNumero.puladas === 1, gemeosSemNumero.alunos);
  var gemeosMatriculados = GabaLista.montar([
    ["Nº", "Nome", "Matrícula"], ["1", "ANA BEATRIZ", "209900001"], ["2", "ANA BEATRIZ", "209900002"]]);
  check("matriculas diferentes distinguem o homônimo",
    gemeosMatriculados.alunos.length === 2 &&
    gemeosMatriculados.alunos.map(function (a) { return a.matricula; }).join("|") === "209900001|209900002",
    gemeosMatriculados.alunos);
  var vazio = GabaLista.montar([]);
  check("lista vazia avisa em vez de estourar",
    vazio.alunos.length === 0 && vazio.problemas.length > 0, vazio);

  console.log("\n== a pasta de trabalho oficial da escola ==");
  var doc = await GabaPlanilha.leXlsx(leBuffer("chamada-excel.xlsx"));
  check("as cinco abas do arquivo foram lidas", doc.abas.length === 5, doc.abas.map(function (a) { return a.nome; }));
  var itens = doc.abas.map(function (a) { return { fonte: a.nome, lista: GabaLista.montar(a.linhas) }; });
  var escolha = GabaLista.melhorDasListas(itens);
  check("a aba de lançamento é a escolhida",
    escolha && /Lan/.test(escolha.fonte), itens.map(function (i) { return i.fonte + "=" + i.lista.alunos.length; }));
  var e45 = escolha.lista;
  var porNum = porNumero(e45.alunos);
  check("os 45 alunos da chamada entraram", e45.alunos.length === 45, [e45.alunos.length, e45.problemas]);
  check("numeração 1..45 sem buraco",
    e45.alunos.every(function (a, i) { return a.numero === i + 1; }), e45.alunos.slice(0, 3));
  check("nomes reais, sem as colunas de resposta no meio",
    porNum[1].nome.length > 8 && !/\d/.test(porNum[1].nome) && porNum[45].nome.length > 8 &&
    !e45.alunos.some(function (a) { return /^Q\d/.test(a.nome); }), [porNum[1], porNum[45]]);
  check("tipo de caderno de cada aluno aproveitado",
    porNum[1].tipo === 1 && porNum[2].tipo === 2 && porNum[10].tipo === 10, [porNum[1], porNum[2], porNum[10]]);
  check("a aba de gabarito nao e confundida com lista",
    itens.filter(function (i) { return /Gabarito/.test(i.fonte); })[0].lista.linhaCabecalho < 0,
    itens.filter(function (i) { return /Gabarito/.test(i.fonte); })[0].lista.linhaCabecalho);

  console.log("\n== quem saiu da turma e o rotulo ALUNOS ==");
  var chamada = GabaLista.montar([
    ["", "ALUNOS", ""],
    ["1", "ALFA BRAVO CHARLIE", ""],
    ["2", "DELTA ECO FOXTROT", "TRANSFERIDO"],
    ["3", "GOLF HOTEL INDIA", ""],
    ["4", "JULIETT KILO LIMA", "Remanejada"]
  ]);
  check("a faixa ALUNOS nao virou aluno",
    !chamada.alunos.some(function (a) { return /^ALUNOS$/i.test(a.nome); }), chamada.alunos);
  check("transferido e remanejada ficaram de fora com aviso",
    chamada.alunos.length === 2 && chamada.saidas === 2 &&
    chamada.problemas.some(function (p) { return /2 alunos marcados como transferidos/.test(p); }),
    [chamada.alunos.map(function (a) { return a.numero; }), chamada.problemas]);
  var abandono = GabaLista.montar([
    ["Nº", "Nome do Estudante", "Situação"],
    ["1", "ALFA BRAVO CHARLIE", ""],
    ["2", "DELTA ECO FOXTROT", "DEIXOU DE FREQUENTAR A PARTIR DE 05/03"],
    ["3", "GOLF HOTEL INDIA", "Não frequenta mais"],
    ["4", "JULIETT KILO LIMA", "MATRICULADO"]
  ]);
  check("quem deixou de frequentar fica de fora e entra na conta das saídas",
    abandono.alunos.length === 2 && abandono.saidas === 2 &&
    abandono.alunos.map(function (a) { return a.nome; }).join("|") === "ALFA BRAVO CHARLIE|JULIETT KILO LIMA",
    [abandono.alunos.map(function (a) { return a.nome; }), abandono.saidas]);
  check("o aviso de saída diz tambem quem ficou sem frequência",
    abandono.problemas.some(function (p) { return /sem frequência ficaram de fora\.$/.test(p); }), abandono.problemas);
  check("o aviso de saida e um so, nao um por aluno",
    abandono.problemas.filter(function (p) { return /ficaram de fora\./.test(p); }).length === 1, abandono.problemas);
  var composta = GabaLista.montar([
    ["Nº", "Nome do Estudante", "Situação"],
    ["1", "ALFA BRAVO CHARLIE", "Ativa"],
    ["2", "DELTA ECO FOXTROT", "Vice Líder/Transferido"],
    ["3", "GOLF HOTEL INDIA", "ECHO PAPA SIERRA/Transferido"],
    ["4", "JULIETT KILO LIMA", "Remanejada a pedido"]
  ]);
  check("o marcador que vem depois da barra no fim da celula tambem conta como saida",
    composta.alunos.length === 1 && composta.saidas === 3 && composta.alunos[0].nome === "ALFA BRAVO CHARLIE",
    [composta.alunos.map(function (a) { return a.nome; }), composta.saidas]);
  var nota = GabaLista.montar([
    ["Nº", "Nome do Estudante", "Situação"],
    ["1", "ALFA BRAVO CHARLIE", "Ativa"],
    ["2", "DELTA ECO FOXTROT", "Volta depois das ferias"]
  ]);
  check("texto solto na situacao nao tira aluno da lista", nota.alunos.length === 2 && nota.saidas === 0,
    [nota.alunos.length, nota.saidas]);

  console.log("\n== turmas de uma escola num arquivo so ==");
  var pasta = GabaLista.turmasDaPasta([
    { rotulo: "6º ANO A", arquivo: "chamada.xlsx", linhas: [
      ["1", "ALFA BRAVO CHARLIE", ""], ["2", "DELTA ECO FOXTROT", "TRANSFERIDO"], ["3", "GOLF HOTEL INDIA", ""]] },
    { rotulo: "6º ANO B", arquivo: "chamada.xlsx", linhas: [
      ["1", "JULIETT KILO LIMA", ""], ["2", "MIKE NOVEMBER OSCAR", "REMANEJADO"],
      ["3", "PAPA QUEBEC ROMEO", ""], ["4", "SIERRA TANGO UNIFORM", ""]] },
    { rotulo: "Resumo", arquivo: "chamada.xlsx", linhas: [["Total de alunos", "7"]] },
    { rotulo: "Planilha4", arquivo: "chamada.xlsx", linhas: [["", ""]] }
  ]);
  check("uma aba por turma: o nome da aba vira o nome da turma",
    pasta.turmas.map(function (t) { return t.nome; }).join("|") === "6º ANO A|6º ANO B", pasta.turmas);
  check("cada turma com os seus alunos, sem quem saiu",
    pasta.turmas[0].alunos.length === 2 && pasta.turmas[1].alunos.length === 3 && pasta.saidas === 2,
    pasta.turmas.map(function (t) { return [t.alunos.length, t.saidas]; }));
  check("aba sem lista fica de fora com o nome, aba vazia some calada",
    pasta.ignoradas.join("|") === "Resumo", pasta.ignoradas);
  check("o aviso de lista sem cabecalho nao se repete em cada turma",
    pasta.turmas.every(function (t) { return !t.problemas.length; }), pasta.turmas.map(function (t) { return t.problemas; }));

  var comAbandono = GabaLista.turmasDaPasta([{ rotulo: "2ªV01-EM-MCN", arquivo: "chamada.xlsx", linhas: [
    ["Nº", "Nome do Estudante", "Situação"],
    ["1", "ALFA BRAVO CHARLIE", "DEIXOU DE FREQUENTAR"], ["2", "DELTA ECO FOXTROT", ""],
    ["3", "GOLF HOTEL INDIA", ""]
  ] }]);
  check("a turma de abandono entra com os que ficaram e o aviso só no painel de cima",
    comAbandono.turmas.length === 1 && comAbandono.saidas === 1 && comAbandono.turmas[0].saidas === 1 &&
    comAbandono.turmas[0].alunos.length === 2 && !comAbandono.turmas[0].problemas.length,
    [comAbandono.saidas, comAbandono.turmas[0].alunos.length, comAbandono.turmas[0].problemas]);
  check("o aviso de uma saida so fala no singular",
    GabaLista.avisoDeSaidas(1) === "1 aluno marcado como transferido, remanejado ou sem frequência ficou de fora." &&
    /3 alunos marcados/.test(GabaLista.avisoDeSaidas(3)), GabaLista.avisoDeSaidas(1));

  var secretaria = GabaLista.turmasDaPasta([{ rotulo: "escola.csv", arquivo: "escola.csv", linhas: [
    ["Turma", "Nº", "Nome do aluno"],
    ["7º A", "1", "ALFA UM"],
    ["", "2", "BRAVO DOIS"],
    ["7º B", "1", "CHARLIE TRES"],
    ["7º A", "3", "DELTA QUATRO"]
  ] }]);
  check("coluna Turma separa a escola inteira, com celula mesclada",
    secretaria.turmas.map(function (t) { return t.nome + "=" + t.alunos.length; }).join("|") === "7º A=3|7º B=1",
    secretaria.turmas.map(function (t) { return [t.nome, t.alunos.map(function (a) { return a.nome; })]; }));

  var soNomes = GabaLista.turmasDaPasta([{ rotulo: "turmas.csv", arquivo: "turmas.csv",
    linhas: [["Turmas"], ["6º A"], ["6º B"], ["7º A"], ["6º A"]] }]);
  check("uma coluna so com os nomes cria turmas vazias",
    soNomes.turmas.map(function (t) { return t.nome; }).join("|") === "6º A|6º B|7º A" &&
    soNomes.turmas.every(function (t) { return !t.alunos.length; }), soNomes.turmas);
  check("turma repetida no arquivo nao vira duas",
    soNomes.repetidas.join("|") === "6º A" && !soNomes.ignoradas.length, [soNomes.repetidas, soNomes.ignoradas]);

  var comTurno = GabaLista.turmasDaPasta([{ rotulo: "Planilha1", arquivo: "turmas.xlsx",
    linhas: [["Turma", "Turno"], ["8º A", "Matutino"], ["8º B", "Vespertino"]] }]);
  check("coluna Turma sem nomes de aluno tambem vira lista de turmas",
    comTurno.turmas.map(function (t) { return t.nome; }).join("|") === "8º A|8º B", comTurno.turmas);

  var csvUnico = GabaLista.turmasDaPasta([{ rotulo: "9º ANO C.csv", arquivo: "9º ANO C.csv",
    linhas: [["Nº", "Nome"], ["1", "ALFA BRAVO"], ["2", "CHARLIE DELTA"]] }]);
  var abaGenerica = GabaLista.turmasDaPasta([{ rotulo: "Planilha1", arquivo: "8º ANO B.xlsx",
    linhas: [["Nº", "Nome"], ["1", "ALFA BRAVO"]] }]);
  check("CSV e aba sem nome levam o nome do arquivo, sem extensao",
    csvUnico.turmas[0].nome === "9º ANO C" && abaGenerica.turmas[0].nome === "8º ANO B",
    [csvUnico.turmas, abaGenerica.turmas]);

  var comFaixa = GabaLista.turmasDaPasta([{ rotulo: "6º A", linhas: [
    ["Turma", "6º A"], ["Nº", "Nome"], ["1", "ALFA TESTE"], ["2", "BRAVO TESTE"]
  ] }]);
  check("a faixa Turma acima do cabecalho nao transforma numeros de chamada em turmas",
    comFaixa.turmas.length === 1 && comFaixa.turmas[0].nome === "6º A" && comFaixa.turmas[0].alunos.length === 2,
    comFaixa.turmas);
  var duasFaixas = GabaLista.turmasDaPasta([{ rotulo: "chamada", linhas: [
    ["Turma", "Todas"], ["Turma", "Nº", "Nome"], ["7º A", "1", "ALFA TESTE"], ["7º B", "1", "BRAVO TESTE"]
  ] }]);
  check("a coluna Turma do cabecalho tem prioridade sobre a faixa de titulo",
    duasFaixas.turmas.map(function (t) { return t.nome + "=" + t.alunos.length; }).join("|") === "7º A=1|7º B=1",
    duasFaixas.turmas);
  var vaziaDeSaidas = GabaLista.turmasDaPasta([{ rotulo: "8º A", linhas: [
    ["Nº", "Nome", "Situação"], ["1", "ALFA TESTE", "TRANSFERIDO"]
  ] }]);
  check("a turma continua reconhecida mesmo quando todos os alunos estao transferidos",
    vaziaDeSaidas.turmas.length === 1 && !vaziaDeSaidas.turmas[0].alunos.length && vaziaDeSaidas.saidas === 1,
    vaziaDeSaidas);

  console.log("\n== erros honestos ==");
  var naoEhXlsx = await GabaPlanilha.leXlsx(leBuffer("chamada-sedu.csv")).catch(function (err) { return { erro: err.message }; });
  check("um CSV com nome .xlsx e barrado com explicação",
    naoEhXlsx && !!naoEhXlsx.erro, naoEhXlsx);

  console.log(falhas ? "\n" + falhas + " check(s) falharam." : "\nlistas de chamada lidas: excel, csv, latin-1 e colado");
  process.exit(falhas ? 1 : 0);
})().catch(function (err) {
  console.error("erro no harness: " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
