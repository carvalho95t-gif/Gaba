/* O extrator de matriz de referencia (js/matrizParser.js) e o catalogo que ele deixa no app
   (js/descritoresMatriz.js). Os casos de tabela sao desenhados a mao, com a geometria do papel:
   aqui ninguem precisa dos PDFs nem de servidor. Roda so no node:
   node tests/matriz.test.js */
"use strict";

require("../js/matrizParser.js");
require("../js/descritoresMatriz.js");
var G = globalThis.GabaMatriz;
var D = globalThis.GabaDescritores;

var falhas = 0;
function check(nome, cond, detalhe) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (detalhe !== undefined && !cond ? "  ->  " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas += 1;
}

/* ---------- as paginas de mentira, na geometria do papel ---------- */

function pedaco(x, fim, texto) { return { x: x, fim: fim, texto: texto }; }

function linha(y, tamanho, partes) {
  return {
    x: partes[0].x, y: y, tamanho: tamanho,
    texto: partes.map(function (p) { return p.texto; }).join(" "), partes: partes
  };
}

function pdfDasPaginas(linhas) {
  return { paginas: linhas.length, linhas: linhas };
}

var ORIGEM = { matriz: "PAEBES", disciplina: "", arquivo: "sintetico.pdf", fonte: "sintetico.pdf" };

function dePáginas(paginas, origem) {
  return G.descritoresDoPdf(pdfDasPaginas(paginas), origem || ORIGEM);
}

function colunaDeCodigo(x, codigo) { return pedaco(x, x + 26, codigo); }
function colunaDeTexto(x, fim, texto) { return pedaco(x, fim, texto); }

(async function principal() {
  /* --- 1. o codigo no MEIO da linha: a primeira frase chega antes dele no papel --- */
  var meiaLinha = dePáginas([[
    linha(500, 10, [pedaco(20, 150, "MATRIZ DE REFERÊNCIA - 5º ANO")]),
    linha(440, 9, [colunaDeTexto(140, 380, "Relacionar elementos sonoros das palavras")]),
    linha(433, 9, [colunaDeCodigo(60, "D01"), colunaDeTexto(140, 420, "com sua representação escrita")])
  ]]);
  var um = meiaLinha.registros;
  check("uma faixa com o código no meio rende um descritor", um.length === 1, um.length);
  check("o código sai limpo da célula", um[0] && um[0].codigo === "D01", um[0] && um[0].codigo);
  check("a tarja lateral entrega o ano, mesmo fora da tabela", um[0] && um[0].ano === "5º ano EF", um[0] && um[0].ano);
  check("a frase de cima e a de baixo viram uma coisa só, na ordem do papel",
    um[0] && um[0].descricao === "Relacionar elementos sonoros das palavras com sua representação escrita",
    um[0] && um[0].descricao);

  /* --- 2. a vizinha de baixo nao rouba a continuacao --- */
  var duas = dePáginas([[
    linha(500, 10, [pedaco(20, 150, "MATRIZ DE REFERÊNCIA - 9º ANO")]),
    linha(440, 9, [colunaDeTexto(140, 300, "Identificar a ideia central do texto")]),
    linha(433, 9, [colunaDeCodigo(60, "D01_P"), colunaDeTexto(140, 260, "e sua relação com o título")]),
    linha(408, 9, [colunaDeTexto(140, 250, "Localizar informação explícita")]),
    linha(400, 9, [colunaDeCodigo(60, "D02_P")])
  ]]);
  check("dois códigos na página são dois descritores", duas.registros.length === 2, duas.registros.length);
  check("a continuação fica na faixa do próprio código",
    duas.registros[0].descricao === "Identificar a ideia central do texto e sua relação com o título",
    duas.registros[0].descricao);
  check("a linha de baixo começa no próprio texto, sem herdar o de cima",
    duas.registros[1].descricao === "Localizar informação explícita", duas.registros[1].descricao);
  check("o sufixo do código resolve a disciplina da linha",
    duas.registros[1].disciplina === "Língua Portuguesa", duas.registros[1].disciplina);

  /* --- 3. descricao curta tambem e descricao --- */
  var curta = dePáginas([[
    linha(433, 9, [colunaDeCodigo(60, "D02"), colunaDeTexto(140, 200, "Ler palavras.")])
  ]]);
  check("uma frase de duas palavras ainda é a habilidade do descritor",
    curta.registros.length === 1 && curta.registros[0].descricao === "Ler palavras.", curta.registros);

  /* --- 4. duas matrizes impressas uma sobre a outra: ninguem recebe chute --- */
  var colado = dePáginas([[
    linha(433, 9, [pedaco(60, 140, "D121_MD032_P"), colunaDeTexto(140, 320, "Reconhecer círculo e circunferência")])
  ]]);
  check("os dois códigos colados viram dois registros", colado.registros.length === 2, colado.registros.length);
  check("o primeiro da célula colada fica marcado e sem texto",
    colado.registros[0].codigo === "D121_M" && colado.registros[0].duvida ===
    "dois codigos colados na mesma celula" && colado.registros[0].descricao === "",
    colado.registros[0]);
  check("o último da célula colada também: a frase não é de ninguém",
    colado.registros[1].codigo === "D032_P" && colado.registros[1].duvida ===
    "dois codigos colados na mesma celula" && colado.registros[1].descricao === "",
    colado.registros[1]);
  check("a página contada como duvidosa bate com os dois códigos", colado.duvidosos === 2, colado.duvidosos);

  /* --- 5. o sufixo do código manda na disciplina, contra a tarja --- */
  var sufixo = dePáginas([[
    linha(500, 10, [pedaco(20, 200, "MATRIZ DE REFERÊNCIA - MATEMÁTICA")]),
    linha(433, 9, [colunaDeCodigo(60, "D007_G"), colunaDeTexto(140, 300, "Identificar objetos e lugares")])
  ]]);
  check("o _G diz que é Geografia, mesmo numa página que se anuncia Matemática",
    sufixo.registros[0].disciplina === "Ciências Humanas" && sufixo.registros[0].componente === "Geografia",
    { disciplina: sufixo.registros[0].disciplina, componente: sufixo.registros[0].componente });

  /* --- 6. rodapé e tarja de página não são habilidade de ninguém --- */
  var rodape = dePáginas([[
    linha(433, 9, [colunaDeCodigo(60, "D01_P"), colunaDeTexto(140, 300, "Localizar informação explícita")]),
    linha(40, 8, [colunaDeTexto(140, 300, "Matrizes de Referência PAEBES")]),
    linha(30, 8, [colunaDeTexto(140, 180, "Página 3")])
  ]]);
  check("o rodapé da tabela não entra na descrição",
    rodape.registros.length === 1 && rodape.registros[0].descricao === "Localizar informação explícita",
    rodape.registros);

  /* --- 7. a coluna da observação, centralizada, não elege coluna --- */
  var duasColunas = dePáginas([[
    linha(500, 10, [pedaco(20, 150, "MATRIZ DE REFERÊNCIA - 2º ANO")]),
    linha(433, 9, [colunaDeCodigo(60, "D05"), colunaDeTexto(140, 320, "Ler números naturais"),
      pedaco(420, 500, "Inclui a ordem crescente")]),
    linha(400, 9, [colunaDeCodigo(60, "D06"), colunaDeTexto(140, 320, "Comparar números naturais"),
      pedaco(435, 500, "Com apoio da reta")])
  ]]);
  check("a observação à direita não se mistura com a habilidade",
    duasColunas.registros[0].descricao === "Ler números naturais", duasColunas.registros[0].descricao);
  check("cada linha fica com a sua observação só dela",
    duasColunas.registros[1].descricao === "Comparar números naturais", duasColunas.registros[1].descricao);

  /* --- 8. o ano pega carona nas páginas seguintes, até a próxima tarja --- */
  var duasPaginas = dePáginas([
    [linha(500, 10, [pedaco(20, 150, "MATRIZ DE REFERÊNCIA - 5º ANO")]),
     linha(433, 9, [colunaDeCodigo(60, "D01_M"), colunaDeTexto(140, 300, "Executar adição")])],
    [linha(433, 9, [colunaDeCodigo(60, "D02_M"), colunaDeTexto(140, 300, "Executar subtração")])],
    [linha(500, 10, [pedaco(20, 150, "MATRIZ DE REFERÊNCIA - 9º ANO")]),
     linha(433, 9, [colunaDeCodigo(60, "D03_M"), colunaDeTexto(140, 300, "Resolver problemas")])]
  ]);
  check("a página sem tarja continua no ano da anterior",
    duasPaginas.registros[1].ano === "5º ano EF", duasPaginas.registros[1].ano);
  check("a tarja nova muda o ano dali para frente",
    duasPaginas.registros[2].ano === "9º ano EF", duasPaginas.registros[2].ano);
  check("a capa do arquivo ensina a disciplina quando a tarja não diz",
    dePáginas([[linha(433, 9, [colunaDeCodigo(60, "D01_M"), colunaDeTexto(140, 300, "Executar adição")])]],
      { matriz: "PAEBES", disciplina: "Matemática", arquivo: "x.pdf", fonte: "x.pdf" })
      .registros[0].disciplina === "Matemática");

  /* --- 9. deduplicar: o mesmo descritor em dois arquivos, um deles na página ruim --- */
  var duplicado = G.deduplicar([
    { matriz: "PAEBES", disciplina: "Língua Portuguesa", ano: "9º ano EF", codigo: "D032_P",
      descricao: "", duvida: "dois codigos colados na mesma celula", banda: "", componente: "",
      fonte: "mat-pbad.pdf" },
    { matriz: "PAEBES", disciplina: "Língua Portuguesa", ano: "9º ano EF", codigo: "D032_P",
      descricao: "Identificar o conflito gerador de uma narrativa.", banda: "", componente: "",
      fonte: "lp-ok.pdf" }
  ]);
  check("o mesmo descritor lido duas vezes vira uma linha só", duplicado.length === 1, duplicado.length);
  check("a ocorrência limpa devolve o texto à linha duvidosa",
    duplicado[0].descricao === "Identificar o conflito gerador de uma narrativa." && duplicado[0].duvida === "",
    duplicado[0]);
  check("as duas origens ficam registradas na mesma linha",
    duplicado[0].fontes.length === 2, duplicado[0].fontes);

  /* --- 10. o catalogo que ficou no app --- */
  var catalogo = D.todos();
  check("o catálogo embutido tem os descritores todos", catalogo.length > 400 && D.total === catalogo.length,
    { total: D.total, lidos: catalogo.length });
  var codigoRuim = catalogo.filter(function (r) { return !/^D\d{1,3}(_[A-Z])?$/.test(r.codigo); });
  check("todo código tem o formato oficial (D + número, sufixo quando houver)", codigoRuim.length === 0,
    codigoRuim.slice(0, 4));
  var chaves = {};
  var repetidas = catalogo.filter(function (r) {
    var k = [r.matriz, r.disciplina, r.ano, r.codigo].join("|");
    if (chaves[k]) return true;
    chaves[k] = 1;
    return false;
  });
  check("matriz + disciplina + ano + código não se repete", repetidas.length === 0, repetidas.slice(0, 4));
  check("toda linha tem disciplina e ano",
    catalogo.every(function (r) { return !!r.disciplina && !!r.ano && !!r.anoChave; }));
  check("a chave de ano do catálogo bate com a do extrator",
    catalogo.every(function (r) { return r.anoChave === D.chaveDeAno(r.ano); }));
  var sufixoTrocado = catalogo.filter(function (r) {
    var m = r.codigo.split("_")[1];
    var esperado = { P: "Língua Portuguesa", M: "Matemática", H: "Ciências Humanas", G: "Ciências Humanas",
      C: "Ciências da Natureza", N: "Ciências da Natureza" }[m];
    return !!esperado && r.disciplina !== esperado;
  });
  check("o sufixo do código nunca briga com a disciplina da linha", sufixoTrocado.length === 0,
    sufixoTrocado.slice(0, 4).map(function (r) { return r.codigo + " " + r.disciplina; }));
  var comCodigoNoTexto = catalogo.filter(function (r) { return /^D\d/.test(r.descricao); });
  check("nenhum código vazou para dentro da habilidade", comCodigoNoTexto.length === 0,
    comCodigoNoTexto.slice(0, 4).map(function (r) { return r.codigo + ": " + r.descricao.slice(0, 40); }));
  check("nenhuma habilidade vem com espaço sobrando ou em branco",
    catalogo.every(function (r) { return r.descricao === "" || (!/\s{2,}/.test(r.descricao) && r.descricao === r.descricao.trim()); }));
  var semTexto = catalogo.filter(function (r) { return !r.descricao; });
  check("as linhas sem habilidade são as da página com as duas matrizes sobrepostas (9º ano)",
    semTexto.every(function (r) { return /9º/.test(r.ano); }),
    { quantas: semTexto.length, grupos: semTexto.map(function (r) { return r.codigo; }) });
  check("o filtro por disciplina e ano devolve uma lista menor que o catálogo",
    D.filtrar({ disciplina: "Matemática", ano: "9º ano EF" }).length < catalogo.length &&
    D.filtrar({ disciplina: "Matemática", ano: "9º ano EF" }).length > 20,
    D.filtrar({ disciplina: "Matemática", ano: "9º ano EF" }).length);
  check("a busca ignora acento e caixa",
    D.filtrar({ busca: "CÍRCULO" }).length > 0 &&
    D.filtrar({ busca: "CÍRCULO" }).every(function (r) { return D.despido(r.descricao).indexOf("circulo") >= 0; }));
  check("uma disciplina que não existe no catálogo não inventa linha",
    D.filtrar({ disciplina: "Educação Física" }).length === 0);
  check("o mesmo código em mais de uma matriz aparece inteiro em porCodigo",
    D.porCodigo("d002_m").length >= 2);
  check("o catálogo se expande igualzinho duas vezes (nada é recriado a cada consulta)",
    D.todos() === D.todos());

  console.log("\n" + catalogo.length + " descritores no app | " + semTexto.length + " sem habilidade");
  console.log(falhas ? "\n" + falhas + " FALHAS" : "matriz: tudo certo");
  process.exit(falhas ? 1 : 0);
})();
