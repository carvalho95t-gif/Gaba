/* Gaba — os descritores oficiais das matrizes de referência, embutidos no app para o professor
   escolher a habilidade de cada questão sem depender de rede nem do banco.

   GERADO POR tests/gerar-descritores.js — NÃO EDITE À MÃO. Quem mexe aqui perde o ajuste na
   próxima regeneração: o que muda é o extrator (js/matrizParser.js) e aí o arquivo volta inteiro.

   NOTICE — conteúdo de documento público
   Extraído das matrizes de referência publicadas pela SEDU-ES para o PAEBES/PAEBES Alfa e para
   as matrizes AMA (1ª e 2ª edições):
     · Descritores Língua Portuguesa Paebes 2026 1.1.pdf — 13 páginas
     · MATRIZES DE REFERÊNCIA AMA 2026.pdf — 11 páginas
     · MATRIZES DE REFERÊNCIA MT - AMA 2 2026-2.pdf — 10 páginas
     · Matriz referência Ciências Humanas Paebes-PaebesAlfa 2026_9EF_3EM.pdf — 16 páginas
     · Matriz referência Matemática Paebes-PaebesAlfa 2026_2EF_5EF_9EF_3EM.pdf — 22 páginas
   O texto das habilidades é o dos documentos oficiais; a linha de cada descritor é montada pela
   geometria do papel (o código é desenhado no meio da célula e a habilidade na coluna ao lado),
   porque a ordem de leitura do PDF troca linhas vizinhas.

   413 descritores, dos quais 6 chegaram sem habilidade: nessas páginas do
   9º ano o PDF imprime duas matrizes uma sobre a outra e não há como saber de quem é cada frase.
   Ficam pelo código, com descricao vazia, para o seletor não mostrar chute:
     · PAEBES / Ciências Humanas / 9º ano EF / D032_H (dois codigos colados na mesma celula)
     · PAEBES / Ciências Humanas / 9º ano EF / D040_H (dois codigos colados na mesma celula)
     · PAEBES / Ciências Humanas / 9º ano EF / D041_H (dois codigos colados na mesma celula)
     · PAEBES / Língua Portuguesa / 9º ano EF / D032_P (dois codigos colados na mesma celula)
     · PAEBES / Matemática / 9º ano EF / D035_M (dois codigos colados na mesma celula)
     · PAEBES / Matemática / 9º ano EF / D060_M (dois codigos colados na mesma celula)

   Regenerar:  node tests/gerar-descritores.js [pasta com os PDFs]
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaDescritores = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* [matriz, codigo, disciplina, componente, ano, banda, descricao, chave do ano, pagina do PDF] */
  var CAMPOS = ["matriz", "codigo", "disciplina", "componente", "ano", "banda", "descricao", "anoChave", "pagina"];
  var LINHAS = [
    ["AMA 1ª edição", "D016_P", "Língua Portuguesa", "", "1ª série EM", "", "Identificar a finalidade de textos de diferentes gêneros.", "1:EM", 9],
    ["AMA 1ª edição", "D033_P", "Língua Portuguesa", "", "1ª série EM", "", "Reconhecer posições distintas relativas ao mesmo fato ou mesmo tema.", "1:EM", 9],
    ["AMA 1ª edição", "D037_P", "Língua Portuguesa", "", "1ª série EM", "", "Reconhecer as relações entre partes de um texto, identificando os recursos coesivos que contribuem para a sua continuidade.", "1:EM", 9],
    ["AMA 1ª edição", "D102_P", "Língua Portuguesa", "", "1ª série EM", "", "Reconhecer o efeito de sentido decorrente da exploração de recursos ortográficos e/ou morfossintáticos", "1:EM", 9],
    ["AMA 1ª edição", "D103_P", "Língua Portuguesa", "", "1ª série EM", "", "Identificar as marcas linguísticas que evidenciam o locutor e o interlocutor de um texto.", "1:EM", 9],
    ["AMA 1ª edição", "D023_P", "Língua Portuguesa", "", "2ª série EM", "", "Inferir informações em textos.", "2:EM", 10],
    ["AMA 1ª edição", "D030_P", "Língua Portuguesa", "", "2ª série EM", "", "Reconhecer os elementos que compõem uma narrativa e o conflito gerador.", "2:EM", 10],
    ["AMA 1ª edição", "D032_P", "Língua Portuguesa", "", "2ª série EM", "", "Identificar a tese de um texto.", "2:EM", 10],
    ["AMA 1ª edição", "D038_P", "Língua Portuguesa", "", "2ª série EM", "", "Distinguir um fato da opinião.", "2:EM", 10],
    ["AMA 1ª edição", "D061_P", "Língua Portuguesa", "", "2ª série EM", "", "Estabelecer relação causa/consequência entre partes e elementos do texto.", "2:EM", 10],
    ["AMA 1ª edição", "D016_P", "Língua Portuguesa", "", "3ª série EM", "", "Identificar a finalidade de textos de diferentes gêneros.", "3:EM", 11],
    ["AMA 1ª edição", "D019_P", "Língua Portuguesa", "", "3ª série EM", "", "Reconhecer formas de tratar uma informação na comparação de textos que tratam do mesmo tema.", "3:EM", 11],
    ["AMA 1ª edição", "D023_P", "Língua Portuguesa", "", "3ª série EM", "", "Inferir informações em textos.", "3:EM", 11],
    ["AMA 1ª edição", "D033_P", "Língua Portuguesa", "", "3ª série EM", "", "Reconhecer posições distintas relativas ao mesmo fato ou mesmo tema.", "3:EM", 11],
    ["AMA 1ª edição", "D057_P", "Língua Portuguesa", "", "3ª série EM", "", "Interpretar textos que articulam elementos verbais e não verbais.", "3:EM", 11],
    ["AMA 1ª edição", "D016_P", "Língua Portuguesa", "", "4º ano EF", "", "Identificar a finalidade de textos de diferentes gêneros.", "4:EF", 4],
    ["AMA 1ª edição", "D021_P", "Língua Portuguesa", "", "4º ano EF", "", "Localizar informação explícita.", "4:EF", 4],
    ["AMA 1ª edição", "D022_P", "Língua Portuguesa", "", "4º ano EF", "", "Inferir o sentido de palavra ou expressão a partir do contexto.", "4:EF", 4],
    ["AMA 1ª edição", "D023_P", "Língua Portuguesa", "", "4º ano EF", "", "Inferir informações em textos.", "4:EF", 4],
    ["AMA 1ª edição", "D025_P", "Língua Portuguesa", "", "4º ano EF", "", "Reconhecer efeitos de sentido decorrentes do uso ou função da pontuação e de outras notações.", "4:EF", 4],
    ["AMA 1ª edição", "D037_P", "Língua Portuguesa", "", "4º ano EF", "", "Reconhecer as relações entre partes de um texto, identificando os recursos coesivos que contribuem para a sua continuidade.", "4:EF", 4],
    ["AMA 1ª edição", "D016_P", "Língua Portuguesa", "", "5º ano EF", "", "Identificar a finalidade de textos de diferentes gêneros.", "5:EF", 5],
    ["AMA 1ª edição", "D021_P", "Língua Portuguesa", "", "5º ano EF", "", "Localizar informação explícita.", "5:EF", 5],
    ["AMA 1ª edição", "D022_P", "Língua Portuguesa", "", "5º ano EF", "", "Inferir o sentido de palavra ou expressão a partir do contexto.", "5:EF", 5],
    ["AMA 1ª edição", "D023_P", "Língua Portuguesa", "", "5º ano EF", "", "Inferir informações em textos.", "5:EF", 5],
    ["AMA 1ª edição", "D024_P", "Língua Portuguesa", "", "5º ano EF", "", "Reconhecer efeito de humor ou de ironia em um texto.", "5:EF", 5],
    ["AMA 1ª edição", "D030_P", "Língua Portuguesa", "", "5º ano EF", "", "Reconhecer os elementos que compõem uma narrativa e o conflito gerador.", "5:EF", 5],
    ["AMA 1ª edição", "D057_P", "Língua Portuguesa", "", "5º ano EF", "", "Interpretar textos que articulam elementos verbais e não verbais.", "5:EF", 5],
    ["AMA 1ª edição", "D016_P", "Língua Portuguesa", "", "8º ano EF", "", "Identificar a finalidade de textos de diferentes gêneros.", "8:EF", 6],
    ["AMA 1ª edição", "D019_P", "Língua Portuguesa", "", "8º ano EF", "", "Reconhecer diferentes formas de tratar uma informação na comparação de textos que tratam do mesmo tema.", "8:EF", 6],
    ["AMA 1ª edição", "D025_P", "Língua Portuguesa", "", "8º ano EF", "", "Reconhecer efeitos de sentido decorrentes do uso ou função da pontuação e de outras notações.", "8:EF", 6],
    ["AMA 1ª edição", "D027_P", "Língua Portuguesa", "", "8º ano EF", "", "Distinguir ideias centrais de secundárias ou tópicos e subtópicos em um dado gênero textual.", "8:EF", 6],
    ["AMA 1ª edição", "D032_P", "Língua Portuguesa", "", "8º ano EF", "", "Identificar a tese de um texto.", "8:EF", 6],
    ["AMA 1ª edição", "D038_P", "Língua Portuguesa", "", "8º ano EF", "", "Distinguir um fato da opinião.", "8:EF", 6],
    ["AMA 1ª edição", "D055_P", "Língua Portuguesa", "", "8º ano EF", "", "Estabelecer relação entre a tese e os argumentos oferecidos para sustentá-la.", "8:EF", 6],
    ["AMA 1ª edição", "D057_P", "Língua Portuguesa", "", "8º ano EF", "", "Interpretar textos que articulam elementos verbais e não verbais.", "8:EF", 6],
    ["AMA 1ª edição", "D019_P", "Língua Portuguesa", "", "9º ano EF", "", "Reconhecer formas de tratar uma informação na comparação de textos que tratam do mesmo tema.", "9:EF", 7],
    ["AMA 1ª edição", "D025_P", "Língua Portuguesa", "", "9º ano EF", "", "Reconhecer efeitos de sentido decorrentes do uso ou função da pontuação e de outras notações.", "9:EF", 7],
    ["AMA 1ª edição", "D027_P", "Língua Portuguesa", "", "9º ano EF", "", "Distinguir ideias centrais de secundárias ou tópicos e subtópicos em um dado gênero textual.", "9:EF", 7],
    ["AMA 1ª edição", "D032_P", "Língua Portuguesa", "", "9º ano EF", "", "Identificar a tese de um texto.", "9:EF", 7],
    ["AMA 1ª edição", "D033_P", "Língua Portuguesa", "", "9º ano EF", "", "Reconhecer posições distintas relativas ao mesmo fato ou mesmo tema.", "9:EF", 7],
    ["AMA 1ª edição", "D038_P", "Língua Portuguesa", "", "9º ano EF", "", "Distinguir um fato da opinião.", "9:EF", 7],
    ["AMA 1ª edição", "D039_P", "Língua Portuguesa", "", "9º ano EF", "", "Reconhecer o sentido das relações lógico-discursivas em um texto.", "9:EF", 7],
    ["AMA 1ª edição", "D055_P", "Língua Portuguesa", "", "9º ano EF", "", "Estabelecer relação entre a tese e os argumentos oferecidos para sustentá-la.", "9:EF", 7],
    ["AMA 1ª edição", "D061_P", "Língua Portuguesa", "", "9º ano EF", "", "Estabelecer relação causa/consequência entre partes e elementos do texto.", "9:EF", 7],
    ["AMA 1ª edição", "D102_P", "Língua Portuguesa", "", "9º ano EF", "", "Reconhecer o efeito de sentido decorrente da exploração de recursos ortográficos e/ou morfossintáticos.", "9:EF", 7],
    ["AMA 1ª edição", "D009_M", "Matemática", "", "1ª série EM", "", "Corresponder pontos da reta numérica a números racionais.", "1:EM", 9],
    ["AMA 1ª edição", "D033_M", "Matemática", "", "1ª série EM", "", "Identificar a localização de números irracionais na reta numérica.", "1:EM", 9],
    ["AMA 1ª edição", "D039_M", "Matemática", "", "1ª série EM", "", "Utilizar proporcionalidade entre duas grandezas na resolução de problema.", "1:EM", 9],
    ["AMA 1ª edição", "D074_M", "Matemática", "", "2ª série EM", "", "Corresponder as representações algébrica e gráfica de uma função exponencial.", "2:EM", 10],
    ["AMA 1ª edição", "D088_M", "Matemática", "", "2ª série EM", "", "Utilizar função exponencial a resolução de problemas.", "2:EM", 10],
    ["AMA 1ª edição", "D097_M", "Matemática", "", "2ª série EM", "", "Utilizar propriedades de progressões geométricas na resolução de problemas.", "2:EM", 10],
    ["AMA 1ª edição", "D042_M", "Matemática", "", "3ª série EM", "", "Utilizar o princípio multiplicativo de contagem na resolução de problema.", "3:EM", 11],
    ["AMA 1ª edição", "D065_M", "Matemática", "", "3ª série EM", "", "Resolver problema envolvendo noções de probabilidade.", "3:EM", 11],
    ["AMA 1ª edição", "D003_M", "Matemática", "", "4º ano EF", "", "Executar adição ou subtração com números naturais.", "4:EF", 4],
    ["AMA 1ª edição", "D004_M", "Matemática", "", "4º ano EF", "", "Executar multiplicação ou divisão com números naturais.", "4:EF", 4],
    ["AMA 1ª edição", "D005_M", "Matemática", "", "4º ano EF", "", "Identificar composições ou decomposições de números naturais.", "4:EF", 4],
    ["AMA 1ª edição", "D014_M", "Matemática", "", "4º ano EF", "", "Reconhecer características do sistema de numeração decimal.", "4:EF", 4],
    ["AMA 1ª edição", "D148_M", "Matemática", "", "4º ano EF", "", "Resolver problema com números naturais, envolvendo diferentes significados das operações (adição, subtração, multiplicação, divisão, potenciação).", "4:EF", 4],
    ["AMA 1ª edição", "D002_M", "Matemática", "", "5º ano EF", "", "Corresponder números naturais a pontos da reta numérica.", "5:EF", 5],
    ["AMA 1ª edição", "D005_M", "Matemática", "", "5º ano EF", "", "Identificar composições ou decomposições de números naturais.", "5:EF", 5],
    ["AMA 1ª edição", "D009_M", "Matemática", "", "5º ano EF", "", "Corresponder pontos da reta numérica a números racionais.", "5:EF", 5],
    ["AMA 1ª edição", "D011_M", "Matemática", "", "5º ano EF", "", "Identificar fração como representação que pode estar associada a diferentes significados.", "5:EF", 5],
    ["AMA 1ª edição", "D013_M", "Matemática", "", "5º ano EF", "", "Reconhecer as diferentes representações de um número racional.", "5:EF", 5],
    ["AMA 1ª edição", "D014_M", "Matemática", "", "5º ano EF", "", "Reconhecer características do sistema de numeração decimal.", "5:EF", 5],
    ["AMA 1ª edição", "D114_M", "Matemática", "", "5º ano EF", "", "Num problema, estabelecer trocas entre cédulas e moedas do sistema monetário brasileiro, em função de seus valores.", "5:EF", 5],
    ["AMA 1ª edição", "D009_M", "Matemática", "", "8º ano EF", "", "Corresponder pontos da reta numérica a números racionais.", "8:EF", 6],
    ["AMA 1ª edição", "D010_M", "Matemática", "", "8º ano EF", "", "Efetuar cálculos com números racionais.", "8:EF", 6],
    ["AMA 1ª edição", "D013_M", "Matemática", "", "8º ano EF", "", "Reconhecer as diferentes representações de um número racional.", "8:EF", 6],
    ["AMA 1ª edição", "D024_M", "Matemática", "", "8º ano EF", "", "Resolver problema com números racionais, envolvendo diferentes significados das operações.", "8:EF", 6],
    ["AMA 1ª edição", "D029_M", "Matemática", "", "8º ano EF", "", "Efetuar cálculos simples com valores aproximados de radicais.", "8:EF", 6],
    ["AMA 1ª edição", "D009_M", "Matemática", "", "9º ano EF", "", "Corresponder pontos da reta numérica a números racionais.", "9:EF", 8],
    ["AMA 1ª edição", "D010_M", "Matemática", "", "9º ano EF", "", "Efetuar cálculos com números racionais.", "9:EF", 8],
    ["AMA 1ª edição", "D013_M", "Matemática", "", "9º ano EF", "", "Reconhecer as diferentes representações de um número racional.", "9:EF", 8],
    ["AMA 1ª edição", "D020_M", "Matemática", "", "9º ano EF", "", "Efetuar cálculos com números inteiros.", "9:EF", 8],
    ["AMA 1ª edição", "D021_M", "Matemática", "", "9º ano EF", "", "Identificar a localização de números inteiros na reta numérica.", "9:EF", 8],
    ["AMA 1ª edição", "D024_M", "Matemática", "", "9º ano EF", "", "Resolver problema com números racionais, envolvendo diferentes significados das operações.", "9:EF", 8],
    ["AMA 1ª edição", "D029_M", "Matemática", "", "9º ano EF", "", "Efetuar cálculos simples com valores aproximados de radicais.", "9:EF", 8],
    ["AMA 2ª edição", "D009_M", "Matemática", "", "1ª série EM", "", "Corresponder pontos da reta numérica a números racionais.", "1:EM", 8],
    ["AMA 2ª edição", "D013_M", "Matemática", "", "1ª série EM", "", "Reconhecer as diferentes representações de um número racional.", "1:EM", 8],
    ["AMA 2ª edição", "D033_M", "Matemática", "", "1ª série EM", "", "Identificar a localização de números irracionais na reta numérica.", "1:EM", 8],
    ["AMA 2ª edição", "D038_M", "Matemática", "", "1ª série EM", "", "Utilizar porcentagem na resolução de problemas.", "1:EM", 8],
    ["AMA 2ª edição", "D039_M", "Matemática", "", "1ª série EM", "", "Utilizar proporcionalidade entre duas grandezas na resolução de problema.", "1:EM", 8],
    ["AMA 2ª edição", "D043_M", "Matemática", "", "1ª série EM", "", "Identificar a localização de pontos no plano cartesiano.", "1:EM", 8],
    ["AMA 2ª edição", "D062_M", "Matemática", "", "1ª série EM", "", "Resolver problema envolvendo noções de volume.", "1:EM", 8],
    ["AMA 2ª edição", "D064_M", "Matemática", "", "1ª série EM", "", "Utilizar informações apresentadas em tabelas ou gráficos na resolução de problemas.", "1:EM", 8],
    ["AMA 2ª edição", "D071_M", "Matemática", "", "1ª série EM", "", "Analisar crescimento/decrescimento, zeros de funções reais apresentadas em gráficos.", "1:EM", 8],
    ["AMA 2ª edição", "D078_M", "Matemática", "", "1ª série EM", "", "Corresponder uma função polinomial do 1º grau a seu gráfico.", "1:EM", 8],
    ["AMA 2ª edição", "D086_M", "Matemática", "", "1ª série EM", "", "Reconhecer expressão algébrica que representa uma função a partir de uma tabela.", "1:EM", 8],
    ["AMA 2ª edição", "D108_M", "Matemática", "", "1ª série EM", "", "Identificar informações apresentadas em gráficos de colunas.", "1:EM", 8],
    ["AMA 2ª edição", "D117_M", "Matemática", "", "1ª série EM", "", "Identificar relação entre quadriláteros por meio de suas propriedades.", "1:EM", 8],
    ["AMA 2ª edição", "D132_M", "Matemática", "", "1ª série EM", "", "Resolver problema envolvendo uma função do 1º grau.", "1:EM", 8],
    ["AMA 2ª edição", "D145_M", "Matemática", "", "1ª série EM", "", "Reconhecer o gráfico de uma função polinomial de primeiro grau por meio de seus coeficientes.", "1:EM", 8],
    ["AMA 2ª edição", "D009_M", "Matemática", "", "2ª série EM", "", "Corresponder pontos da reta numérica a números racionais.", "2:EM", 9],
    ["AMA 2ª edição", "D038_M", "Matemática", "", "2ª série EM", "", "Utilizar porcentagem na resolução de problemas.", "2:EM", 9],
    ["AMA 2ª edição", "D039_M", "Matemática", "", "2ª série EM", "", "Utilizar proporcionalidade entre duas grandezas na resolução de problema.", "2:EM", 9],
    ["AMA 2ª edição", "D057_M", "Matemática", "", "2ª série EM", "", "Utilizar o perímetro de uma figura bidimensional na resolução de problema.", "2:EM", 9],
    ["AMA 2ª edição", "D058_M", "Matemática", "", "2ª série EM", "", "Utilizar área de figuras bidimensionais na resolução de problema.", "2:EM", 9],
    ["AMA 2ª edição", "D064_M", "Matemática", "", "2ª série EM", "", "Utilizar informações apresentadas em tabelas ou gráficos na resolução de problemas.", "2:EM", 9],
    ["AMA 2ª edição", "D074_M", "Matemática", "", "2ª série EM", "", "Corresponder as representações algébrica e gráfica de uma função exponencial.", "2:EM", 9],
    ["AMA 2ª edição", "D078_M", "Matemática", "", "2ª série EM", "", "Corresponder uma função polinomial do 1º grau a seu gráfico.", "2:EM", 9],
    ["AMA 2ª edição", "D080_M", "Matemática", "", "2ª série EM", "", "Identificar a representação algébrica e/ou gráfica de uma função logarítmica, reconhecendo-a como inversa da função exponencial.", "2:EM", 9],
    ["AMA 2ª edição", "D088_M", "Matemática", "", "2ª série EM", "", "Utilizar função exponencial a resolução de problemas.", "2:EM", 9],
    ["AMA 2ª edição", "D097_M", "Matemática", "", "2ª série EM", "", "Utilizar propriedades de progressões geométricas na resolução de problemas.", "2:EM", 9],
    ["AMA 2ª edição", "D133_M", "Matemática", "", "2ª série EM", "", "Resolver problemas que envolvam os pontos de máximo ou de mínimo de uma função do 2º grau.", "2:EM", 9],
    ["AMA 2ª edição", "D145_M", "Matemática", "", "2ª série EM", "", "Reconhecer o gráfico de uma função polinomial de primeiro grau por meio de seus coeficientes.", "2:EM", 9],
    ["AMA 2ª edição", "D009_M", "Matemática", "", "3ª série EM", "", "Corresponder pontos da reta numérica a números racionais.", "3:EM", 10],
    ["AMA 2ª edição", "D038_M", "Matemática", "", "3ª série EM", "", "Utilizar porcentagem na resolução de problemas.", "3:EM", 10],
    ["AMA 2ª edição", "D039_M", "Matemática", "", "3ª série EM", "", "Utilizar proporcionalidade entre duas grandezas na resolução de problema.", "3:EM", 10],
    ["AMA 2ª edição", "D042_M", "Matemática", "", "3ª série EM", "", "Utilizar o princípio multiplicativo de contagem na resolução de problema.", "3:EM", 10],
    ["AMA 2ª edição", "D049_M", "Matemática", "", "3ª série EM", "", "Utilizar relações métricas em um triângulo retângulo na resolução de problemas", "3:EM", 10],
    ["AMA 2ª edição", "D057_M", "Matemática", "", "3ª série EM", "", "Utilizar o perímetro de uma figura bidimensional na resolução de problema.", "3:EM", 10],
    ["AMA 2ª edição", "D058_M", "Matemática", "", "3ª série EM", "", "Utilizar área de figuras bidimensionais na resolução de problema.", "3:EM", 10],
    ["AMA 2ª edição", "D063_M", "Matemática", "", "3ª série EM", "", "Corresponder listas e/ou tabelas simples aos gráficos que as representam.", "3:EM", 10],
    ["AMA 2ª edição", "D064_M", "Matemática", "", "3ª série EM", "", "Utilizar informações apresentadas em tabelas ou gráficos na resolução de problemas.", "3:EM", 10],
    ["AMA 2ª edição", "D065_M", "Matemática", "", "3ª série EM", "", "Resolver problema envolvendo noções de probabilidade.", "3:EM", 10],
    ["AMA 2ª edição", "D071_M", "Matemática", "", "3ª série EM", "", "Analisar crescimento/decrescimento, zeros de funções reais apresentadas em gráficos.", "3:EM", 10],
    ["AMA 2ª edição", "D076_M", "Matemática", "", "3ª série EM", "", "Corresponder um polinômio fatorado por meio de polinômios de 1º grau às suas raízes.", "3:EM", 10],
    ["AMA 2ª edição", "D078_M", "Matemática", "", "3ª série EM", "", "Corresponder uma função polinomial do 1º grau a seu gráfico.", "3:EM", 10],
    ["AMA 2ª edição", "D082_M", "Matemática", "", "3ª série EM", "", "Identificar o gráfico que representa uma situação descrita em um texto.", "3:EM", 10],
    ["AMA 2ª edição", "D096_M", "Matemática", "", "3ª série EM", "", "Utilizar propriedades de progressões aritméticas na resolução de problemas.", "3:EM", 10],
    ["AMA 2ª edição", "D119_M", "Matemática", "", "3ª série EM", "", "Identificar triângulos semelhantes mediante o reconhecimento de relações de proporcionalidade.", "3:EM", 10],
    ["AMA 2ª edição", "D132_M", "Matemática", "", "3ª série EM", "", "Resolver problema envolvendo uma função do 1º grau.", "3:EM", 10],
    ["AMA 2ª edição", "D145_M", "Matemática", "", "3ª série EM", "", "Reconhecer o gráfico de uma função polinomial de primeiro grau por meio de seus coeficientes.", "3:EM", 10],
    ["AMA 2ª edição", "D002_M", "Matemática", "", "4º ano EF", "", "Corresponder números naturais a pontos da reta numérica.", "4:EF", 4],
    ["AMA 2ª edição", "D003_M", "Matemática", "", "4º ano EF", "", "Executar adição ou subtração com números naturais.", "4:EF", 4],
    ["AMA 2ª edição", "D004_M", "Matemática", "", "4º ano EF", "", "Executar multiplicação ou divisão com números naturais.", "4:EF", 4],
    ["AMA 2ª edição", "D005_M", "Matemática", "", "4º ano EF", "", "Identificar composições ou decomposições de números naturais.", "4:EF", 4],
    ["AMA 2ª edição", "D014_M", "Matemática", "", "4º ano EF", "", "Reconhecer características do sistema de numeração decimal.", "4:EF", 4],
    ["AMA 2ª edição", "D044_M", "Matemática", "", "4º ano EF", "", "Identificar a localização ou a movimentação de pessoas ou objetos em uma representação plana do espaço.", "4:EF", 4],
    ["AMA 2ª edição", "D057_M", "Matemática", "", "4º ano EF", "", "Utilizar o perímetro de uma figura bidimensional na resolução de problema.", "4:EF", 4],
    ["AMA 2ª edição", "D058_M", "Matemática", "", "4º ano EF", "", "Utilizar área de figuras bidimensionais na resolução de problema.", "4:EF", 4],
    ["AMA 2ª edição", "D106_M", "Matemática", "", "4º ano EF", "", "Executar a medição de grandezas por meio de medidas convencionais ou não.", "4:EF", 4],
    ["AMA 2ª edição", "D108_M", "Matemática", "", "4º ano EF", "", "Identificar informações apresentadas em gráficos de colunas.", "4:EF", 4],
    ["AMA 2ª edição", "D112_M", "Matemática", "", "4º ano EF", "", "Identificar propriedades comuns e diferenças entre figuras bidimensionais pelo número de lados, pelos tipos de ângulos.", "4:EF", 4],
    ["AMA 2ª edição", "D148_M", "Matemática", "", "4º ano EF", "", "Resolver problema com números naturais, envolvendo diferentes significados das operações (adição, subtração, multiplicação, divisão, potenciação)", "4:EF", 4],
    ["AMA 2ª edição", "D153_M", "Matemática", "", "4º ano EF", "", "Ler informações e dados apresentados em tabelas.", "4:EF", 4],
    ["AMA 2ª edição", "D003_M", "Matemática", "", "5º ano EF", "", "Executar adição ou subtração com números naturais.", "5:EF", 5],
    ["AMA 2ª edição", "D009_M", "Matemática", "", "5º ano EF", "", "Corresponder pontos da reta numérica a números racionais.", "5:EF", 5],
    ["AMA 2ª edição", "D013_M", "Matemática", "", "5º ano EF", "", "Reconhecer as diferentes representações de um número racional.", "5:EF", 5],
    ["AMA 2ª edição", "D014_M", "Matemática", "", "5º ano EF", "", "Reconhecer características do sistema de numeração decimal.", "5:EF", 5],
    ["AMA 2ª edição", "D044_M", "Matemática", "", "5º ano EF", "", "Identificar a localização ou a movimentação de pessoas ou objetos em uma representação plana do espaço.", "5:EF", 5],
    ["AMA 2ª edição", "D059_M", "Matemática", "", "5º ano EF", "", "Utilizar conversão entre unidades de medidas de tempo na resolução de problema.", "5:EF", 5],
    ["AMA 2ª edição", "D060_M", "Matemática", "", "5º ano EF", "", "Utilizar conversão entre diferentes unidades de medidas na resolução de problema.", "5:EF", 5],
    ["AMA 2ª edição", "D061_M", "Matemática", "", "5º ano EF", "", "Reconhecer o horário de término de um evento ou acontecimento dado seu intervalo de duração e horário de início.", "5:EF", 5],
    ["AMA 2ª edição", "D106_M", "Matemática", "", "5º ano EF", "", "Executar a medição de grandezas por meio de medidas convencionais ou não.", "5:EF", 5],
    ["AMA 2ª edição", "D108_M", "Matemática", "", "5º ano EF", "", "Identificar informações apresentadas em gráficos de colunas.", "5:EF", 5],
    ["AMA 2ª edição", "D112_M", "Matemática", "", "5º ano EF", "", "Identificar propriedades comuns e diferenças entre figuras bidimensionais pelo número de lados, pelos tipos de ângulos.", "5:EF", 5],
    ["AMA 2ª edição", "D148_M", "Matemática", "", "5º ano EF", "", "Resolver problema com números naturais, envolvendo diferentes significados das operações (adição, subtração, multiplicação, divisão, potenciação).", "5:EF", 5],
    ["AMA 2ª edição", "D153_M", "Matemática", "", "5º ano EF", "", "Ler informações e dados apresentados em tabelas.", "5:EF", 5],
    ["AMA 2ª edição", "D009_M", "Matemática", "", "8º ano EF", "", "Corresponder pontos da reta numérica a números racionais.", "8:EF", 6],
    ["AMA 2ª edição", "D010_M", "Matemática", "", "8º ano EF", "", "Efetuar cálculos com números racionais.", "8:EF", 6],
    ["AMA 2ª edição", "D013_M", "Matemática", "", "8º ano EF", "", "Reconhecer as diferentes representações de um número racional.", "8:EF", 6],
    ["AMA 2ª edição", "D014_M", "Matemática", "", "8º ano EF", "", "Reconhecer características do sistema de numeração decimal.", "8:EF", 6],
    ["AMA 2ª edição", "D018_M", "Matemática", "", "8º ano EF", "", "Calcular o valor numérico de uma expressão algébrica.", "8:EF", 6],
    ["AMA 2ª edição", "D038_M", "Matemática", "", "8º ano EF", "", "Utilizar porcentagem na resolução de problemas.", "8:EF", 6],
    ["AMA 2ª edição", "D039_M", "Matemática", "", "8º ano EF", "", "Utilizar proporcionalidade entre duas grandezas na resolução de problema.", "8:EF", 6],
    ["AMA 2ª edição", "D060_M", "Matemática", "", "8º ano EF", "", "Utilizar conversão entre diferentes unidades de medidas na resolução de problema.", "8:EF", 6],
    ["AMA 2ª edição", "D063_M", "Matemática", "", "8º ano EF", "", "Corresponder listas e/ou tabelas simples aos gráficos que as representam.", "8:EF", 6],
    ["AMA 2ª edição", "D064_M", "Matemática", "", "8º ano EF", "", "Utilizar informações apresentadas em tabelas ou gráficos na resolução de problemas.", "8:EF", 6],
    ["AMA 2ª edição", "D081_M", "Matemática", "", "8º ano EF", "", "Identificar expressão algébrica que modela uma sequência numérica ou figural.", "8:EF", 6],
    ["AMA 2ª edição", "D108_M", "Matemática", "", "8º ano EF", "", "Identificar informações apresentadas em gráficos de colunas.", "8:EF", 6],
    ["AMA 2ª edição", "D111_M", "Matemática", "", "8º ano EF", "", "Relacionar diferentes poliedros ou corpos redondos com suas planificações ou vistas.", "8:EF", 6],
    ["AMA 2ª edição", "D148_M", "Matemática", "", "8º ano EF", "", "Resolver problema com números naturais, envolvendo diferentes significados das operações (adição, subtração, multiplicação, divisão, potenciação).", "8:EF", 6],
    ["AMA 2ª edição", "D009_M", "Matemática", "", "9º ano EF", "", "Corresponder pontos da reta numérica a números racionais.", "9:EF", 7],
    ["AMA 2ª edição", "D013_M", "Matemática", "", "9º ano EF", "", "Reconhecer as diferentes representações de um número racional.", "9:EF", 7],
    ["AMA 2ª edição", "D018_M", "Matemática", "", "9º ano EF", "", "Calcular o valor numérico de uma expressão algébrica.", "9:EF", 7],
    ["AMA 2ª edição", "D024_M", "Matemática", "", "9º ano EF", "", "Resolver problema com números racionais, envolvendo diferentes significados das operações.", "9:EF", 7],
    ["AMA 2ª edição", "D029_M", "Matemática", "", "9º ano EF", "", "Efetuar cálculos simples com valores aproximados de radicais.", "9:EF", 7],
    ["AMA 2ª edição", "D038_M", "Matemática", "", "9º ano EF", "", "Utilizar porcentagem na resolução de problemas.", "9:EF", 7],
    ["AMA 2ª edição", "D039_M", "Matemática", "", "9º ano EF", "", "Utilizar proporcionalidade entre duas grandezas na resolução de problema.", "9:EF", 7],
    ["AMA 2ª edição", "D060_M", "Matemática", "", "9º ano EF", "", "Utilizar conversão entre diferentes unidades de medidas na resolução de problema.", "9:EF", 7],
    ["AMA 2ª edição", "D062_M", "Matemática", "", "9º ano EF", "", "Resolver problema envolvendo noções de volume.", "9:EF", 7],
    ["AMA 2ª edição", "D063_M", "Matemática", "", "9º ano EF", "", "Corresponder listas e/ou tabelas simples aos gráficos que as representam.", "9:EF", 7],
    ["AMA 2ª edição", "D064_M", "Matemática", "", "9º ano EF", "", "Utilizar informações apresentadas em tabelas ou gráficos na resolução de problemas.", "9:EF", 7],
    ["AMA 2ª edição", "D108_M", "Matemática", "", "9º ano EF", "", "Identificar informações apresentadas em gráficos de colunas.", "9:EF", 7],
    ["AMA 2ª edição", "D117_M", "Matemática", "", "9º ano EF", "", "Identificar relação entre quadriláteros por meio de suas propriedades.", "9:EF", 7],
    ["PAEBES", "D001_H", "Ciências Humanas", "História", "9º ano EF", "", "Reconhecer diferentes fontes para a construção do conhecimento histórico.", "9:EF", 2],
    ["PAEBES", "D002_H", "Ciências Humanas", "História", "9º ano EF", "", "Reconhecer diferentes abordagens existentes em fontes históricas diversas.", "9:EF", 2],
    ["PAEBES", "D003_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Analisar dados geográficos representados em gráficos.", "9:EF", 2],
    ["PAEBES", "D004_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Analisar dados geográficos representados em tabelas.", "9:EF", 2],
    ["PAEBES", "D005_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Analisar diferentes tipos de representações cartográficas.", "9:EF", 2],
    ["PAEBES", "D006_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Correlacionar dados geográficos a partir de diferentes linguagens (gráficos, tabelas, textos, etc.).", "9:EF", 2],
    ["PAEBES", "D007_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Reconhecer as diferentes regionalizações do espaço geográfico.", "9:EF", 2],
    ["PAEBES", "D008_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Analisar aspectos que caracterizam a desigualdade social no espaço geográfico.", "9:EF", 3],
    ["PAEBES", "D009_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar a diversidade cultural da população indígena no contexto brasileiro.", "9:EF", 3],
    ["PAEBES", "D010_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar a diversidade cultural da população negra no contexto brasileiro.", "9:EF", 3],
    ["PAEBES", "D011_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar as manifestações religiosas e culturais de grupos étnicos regionais.", "9:EF", 3],
    ["PAEBES", "D013_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar os elementos que constituem as identidades socioculturais dos povos europeus.", "9:EF", 3],
    ["PAEBES", "D014_H", "Ciências Humanas", "História", "9º ano EF", "", "Reconhecer os movimentos artísticos e culturais na sociedade brasileira no decorrer do século XX.", "9:EF", 3],
    ["PAEBES", "D015_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Reconhecer as territorialidades como expressões de grupos diversos nos diferentes continentes.", "9:EF", 3],
    ["PAEBES", "D016_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Reconhecer a multiplicidade cultural de diferentes territórios.", "9:EF", 4],
    ["PAEBES", "D017_H", "Ciências Humanas", "História", "9º ano EF", "", "Reconhecer as diferentes relações de poder ao longo da História.", "9:EF", 4],
    ["PAEBES", "D018_H", "Ciências Humanas", "História", "9º ano EF", "", "Compreender as características dos regimes totalitários europeus da primeira metade do século XX.", "9:EF", 4],
    ["PAEBES", "D019_H", "Ciências Humanas", "História", "9º ano EF", "", "Compreender os processos revolucionários ao longo da História.", "9:EF", 4],
    ["PAEBES", "D020_H", "Ciências Humanas", "História", "9º ano EF", "", "Analisar os principais motivadores das duas Guerras Mundiais.", "9:EF", 4],
    ["PAEBES", "D021_H", "Ciências Humanas", "História", "9º ano EF", "", "Analisar o surgimento dos regimes ditatoriais latino-americanos na segunda metade do século XX.", "9:EF", 4],
    ["PAEBES", "D022_H", "Ciências Humanas", "História", "9º ano EF", "", "Analisar os mecanismos de exclusão étnica e social nas sociedades no decorrer do século XX.", "9:EF", 4],
    ["PAEBES", "D023_H", "Ciências Humanas", "História", "9º ano EF", "", "Relacionar conflitos geopolíticos com o contexto da Guerra Fria.", "9:EF", 5],
    ["PAEBES", "D024_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Compreender a atuação de potências hegemônicas e contra-hegemônicas ao longo do tempo no espaço geográfico.", "9:EF", 5],
    ["PAEBES", "D025_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Compreender condições de desigualdade a partir das diferenças de gênero, etnia, crença e origem.", "9:EF", 5],
    ["PAEBES", "D026_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Analisar a atuação das corporações internacionais e das organizações econômicas mundiais no espaço geográfico.", "9:EF", 5],
    ["PAEBES", "D027_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Analisar transformações territoriais advindas de diferentes tipos de conflitos e tensões.", "9:EF", 5],
    ["PAEBES", "D028_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Identificar diferentes tipos de impactos ambientais.", "9:EF", 5],
    ["PAEBES", "D029_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Compreender processos de apropriação da natureza por diferentes agentes.", "9:EF", 5],
    ["PAEBES", "D030_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Relacionar a dinâmica do meio físico (relevo, clima, vegetação, hidrologia e solos) com as transformações do espaço geográfico.", "9:EF", 5],
    ["PAEBES", "D031_H", "Ciências Humanas", "História", "9º ano EF", "", "Reconhecer as formas de organização do trabalho humano nos diferentes contextos históricos.", "9:EF", 6],
    ["PAEBES", "D032_H", "Ciências Humanas", "História", "9º ano EF", "", "", "9:EF", 6],
    ["PAEBES", "D033_H", "Ciências Humanas", "História", "9º ano EF", "", "Compreender processos econômicos em diferentes contextos históricos.", "9:EF", 6],
    ["PAEBES", "D034_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Identificar características do mundo do trabalho na atualidade.", "9:EF", 6],
    ["PAEBES", "D035_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Analisar a divisão internacional do trabalho e suas relações com o espaço geográfico.", "9:EF", 6],
    ["PAEBES", "D036_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Compreender características do processo de globalização.", "9:EF", 6],
    ["PAEBES", "D037_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Compreender o desenvolvimento técnico-científico-informacional e suas implicações socioespaciais.", "9:EF", 6],
    ["PAEBES", "D038_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Compreender características da formação de blocos econômicos.", "9:EF", 6],
    ["PAEBES", "D039_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Reconhecer as transformações geográficas advindas Habilidada delógica do funcionamento dos fluxos e das redes.", "9:EF", 7],
    ["PAEBES", "D040_H", "Ciências Humanas", "História", "9º ano EF", "", "", "9:EF", 7],
    ["PAEBES", "D041_H", "Ciências Humanas", "História", "9º ano EF", "", "", "9:EF", 7],
    ["PAEBES", "D042_H", "Ciências Humanas", "História", "9º ano EF", "", "Reconhecer os direitos e deveres dos cidadãos como forma de constituição da cidadania ao longo da História.", "9:EF", 7],
    ["PAEBES", "D043_H", "Ciências Humanas", "História", "9º ano EF", "", "Compreender a atuação dos movimentos sociais na conquista de direitos.", "9:EF", 7],
    ["PAEBES", "D044_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Analisar práticas de preservação e conservação ambiental.", "9:EF", 7],
    ["PAEBES", "D045_H", "Ciências Humanas", "História", "9º ano EF", "", "Reconhecer diferentes linguagens na construção do conhecimento histórico.", "9:EF", 12],
    ["PAEBES", "D046_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar a contribuição cultural africana na formação da sociedade nacional e regional.", "9:EF", 12],
    ["PAEBES", "D047_H", "Ciências Humanas", "História", "9º ano EF", "", "Reconhecer os papéis desempenhados pelos agentes históricos na construção das sociedades.", "9:EF", 12],
    ["PAEBES", "D048_H", "Ciências Humanas", "História", "9º ano EF", "", "Compreender a construção do conhecimento histórico em sua relação com diferentes fontes.", "9:EF", 13],
    ["PAEBES", "D050_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Reconhecer tecnologias cartográficas.", "9:EF", 13],
    ["PAEBES", "D051_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar diferentes ritmos temporais em momentos históricos distintos.", "9:EF", 13],
    ["PAEBES", "D052_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Analisar diferentes formações territoriais.", "9:EF", 13],
    ["PAEBES", "D053_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar a contribuição cultural europeia na formação da sociedade nacional e regional.", "9:EF", 13],
    ["PAEBES", "D054_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar a contribuição cultural indígena na formação da sociedade nacional e regional.", "9:EF", 13],
    ["PAEBES", "D055_H", "Ciências Humanas", "História", "9º ano EF", "", "Compreender a afirmação da identidade cultural como forma de resistência da população negra no contexto brasileiro.", "9:EF", 13],
    ["PAEBES", "D056_H", "Ciências Humanas", "História", "9º ano EF", "", "Analisar a importância dos patrimônios materiais e imateriais na sociedade brasileira.", "9:EF", 13],
    ["PAEBES", "D057_H", "Ciências Humanas", "História", "9º ano EF", "", "Analisar as representações artísticas e culturais de diferentes sociedades como produtos da memória.", "9:EF", 14],
    ["PAEBES", "D058_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar formas de resistência sociopolítica dos diferentes grupos étnicos em diversos contextos históricos.", "9:EF", 14],
    ["PAEBES", "D059_H", "Ciências Humanas", "História", "9º ano EF", "", "Compreender os processos de emancipação política em diferentes contextos históricos.", "9:EF", 14],
    ["PAEBES", "D060_H", "Ciências Humanas", "História", "9º ano EF", "", "Analisar as principais características dos conflitos militares no decorrer do século XX.", "9:EF", 14],
    ["PAEBES", "D061_H", "Ciências Humanas", "História", "9º ano EF", "", "Analisar os instrumentos de controle social dos diferentes regimes políticos ao longo da História.", "9:EF", 14],
    ["PAEBES", "D062_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Compreender a ocorrência de diferentes tipos de impactos ambientais.", "9:EF", 14],
    ["PAEBES", "D063_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Compreender as múltiplas interrelações dos processos de globalização e fragmentação do espaço geográfico.", "9:EF", 14],
    ["PAEBES", "D064_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar os Direitos Humanos como forma de garantir a cidadania de diferentes grupos sociais.", "9:EF", 14],
    ["PAEBES", "D114_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Analisar fenômenos, dinâmicas e processos demográficos do território brasileiro.", "9:EF", 15],
    ["PAEBES", "D234_H", "Ciências Humanas", "História", "9º ano EF", "", "Identificar as formas de organização sociocultural de diferentes grupos humanos, desde as sociedades neolíticas até as sociedades americanas e africanas antes da chegada dos europeus.", "9:EF", 3],
    ["PAEBES", "D252_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Compreender o papel das corporações internacionais e das organizações econômicas mundiais.", "9:EF", 10],
    ["PAEBES", "D253_G", "Ciências Humanas", "Geografia", "9º ano EF", "", "Compreender as transformações geográficas advindas da lógica do funcionamento dos fluxos e das redes.", "9:EF", 12],
    ["PAEBES", "D254_H", "Ciências Humanas", "História", "9º ano EF", "", "Analisar a atuação dos movimentos sociais para a construção da cidadania de minorias políticas (mulheres, negros e indígenas) no contexto brasileiro.", "9:EF", 12],
    ["PAEBES", "D01", "Língua Portuguesa", "", "2º ano EF", "", "Relacionar elementos sonoros das palavras com sua representação escrita.", "2:EF", 2],
    ["PAEBES", "D02", "Língua Portuguesa", "", "2º ano EF", "", "Ler palavras.", "2:EF", 2],
    ["PAEBES", "D03", "Língua Portuguesa", "", "2º ano EF", "", "Ler frases.", "2:EF", 2],
    ["PAEBES", "D04", "Língua Portuguesa", "", "2º ano EF", "", "Localizar informações explícitas em textos.", "2:EF", 2],
    ["PAEBES", "D05", "Língua Portuguesa", "", "2º ano EF", "", "Reconhecer a finalidade de um texto.", "2:EF", 2],
    ["PAEBES", "D06", "Língua Portuguesa", "", "2º ano EF", "", "Inferir o assunto de um texto.", "2:EF", 2],
    ["PAEBES", "D07", "Língua Portuguesa", "", "2º ano EF", "", "Inferir informações em textos verbais.", "2:EF", 2],
    ["PAEBES", "D08", "Língua Portuguesa", "", "2º ano EF", "", "Inferir informações em textos que articulam linguagem verbal e não verbal.", "2:EF", 3],
    ["PAEBES", "D09", "Língua Portuguesa", "", "2º ano EF", "ESCRITA", "Escrever palavras.", "2:EF", 3],
    ["PAEBES", "D10", "Língua Portuguesa", "", "2º ano EF", "ESCRITA", "Escrever textos.", "2:EF", 3],
    ["PAEBES", "D003_E", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Produzir textos.", "5:EF", 6],
    ["PAEBES", "D016_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Identificar a finalidade de textos de diferentes gêneros.", "5:EF", 4],
    ["PAEBES", "D019_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Reconhecer formas de tratar uma informação na comparação de textos que tratam do mesmo tema.", "5:EF", 4],
    ["PAEBES", "D021_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Localizar informação explícita.", "5:EF", 4],
    ["PAEBES", "D022_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Inferir o sentido de palavra ou expressão a partir do contexto.", "5:EF", 4],
    ["PAEBES", "D023_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Inferir informações em textos.", "5:EF", 4],
    ["PAEBES", "D024_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Reconhecer efeito de humor ou de ironia em um texto.", "5:EF", 4],
    ["PAEBES", "D025_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Reconhecer efeitos de sentido decorrentes do uso ou função da pontuação e de outras notações.", "5:EF", 4],
    ["PAEBES", "D028_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Reconhecer o assunto de um texto lido.", "5:EF", 5],
    ["PAEBES", "D030_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Reconhecer os elementos que compõem uma narrativa e o conflito gerador.", "5:EF", 5],
    ["PAEBES", "D037_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Reconhecer as relações entre partes de um texto, identificando os recursos coesivos que contribuem para a sua continuidade.", "5:EF", 5],
    ["PAEBES", "D038_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Distinguir um fato da opinião.", "5:EF", 5],
    ["PAEBES", "D039_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Reconhecer o sentido das relações lógico-discursivas em um texto.", "5:EF", 5],
    ["PAEBES", "D057_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Interpretar textos que articulam elementos verbais e não verbais.", "5:EF", 5],
    ["PAEBES", "D061_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Estabelecer relação causa/consequência entre partes e elementos do texto.", "5:EF", 5],
    ["PAEBES", "D103_P", "Língua Portuguesa", "", "5º ano EF", "ESCRITA", "Identificar as marcas linguísticas que evidenciam o locutor e o interlocutor de um texto.", "5:EF", 5],
    ["PAEBES", "D016_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Identificar a finalidade de textos de diferentes gêneros.", "9:EF", 7],
    ["PAEBES", "D019_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Reconhecer formas de tratar uma informação na comparação de textos que tratam do mesmo tema.", "9:EF", 7],
    ["PAEBES", "D021_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Localizar informação explícita.", "9:EF", 7],
    ["PAEBES", "D022_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Inferir o sentido de palavra ou expressão a partir do contexto.", "9:EF", 7],
    ["PAEBES", "D023_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Inferir informações em textos.", "9:EF", 7],
    ["PAEBES", "D024_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Reconhecer efeito de humor ou de ironia em um texto.", "9:EF", 7],
    ["PAEBES", "D025_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Reconhecer efeitos de sentido decorrentes do uso ou função da pontuação e de outras notações.", "9:EF", 7],
    ["PAEBES", "D027_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Distinguir ideias centrais de secundárias ou tópicos e subtópicos em um dado gênero textual.", "9:EF", 7],
    ["PAEBES", "D028_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Reconhecer o assunto de um texto lido.", "9:EF", 8],
    ["PAEBES", "D030_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Reconhecer os elementos que compõem uma narrativa e o conflito gerador.", "9:EF", 8],
    ["PAEBES", "D032_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "", "9:EF", 8],
    ["PAEBES", "D033_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Reconhecer posições distintas relativas ao mesmo fato ou mesmo tema.", "9:EF", 8],
    ["PAEBES", "D037_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Reconhecer as relações entre partes de um texto, identificando os recursos coesivos que contribuem para a sua continuidade.", "9:EF", 8],
    ["PAEBES", "D038_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Distinguir um fato da opinião.", "9:EF", 8],
    ["PAEBES", "D039_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Reconhecer o sentido das relações lógico-discursivas em um texto.", "9:EF", 8],
    ["PAEBES", "D053_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Reconhecer o efeito de sentido decorrente da escolha de uma determinada palavra ou expressão.", "9:EF", 8],
    ["PAEBES", "D055_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Estabelecer relação entre a tese e os argumentos oferecidos para sustentá-la.", "9:EF", 9],
    ["PAEBES", "D057_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Interpretar textos que articulam elementos verbais e não verbais.", "9:EF", 9],
    ["PAEBES", "D061_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Estabelecer relação causa/consequência entre partes e elementos do texto.", "9:EF", 9],
    ["PAEBES", "D102_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Reconhecer o efeito de sentido decorrente da exploração de recursos ortográficos e/ou morfossintáticos.", "9:EF", 9],
    ["PAEBES", "D103_P", "Língua Portuguesa", "", "9º ano EF", "ESCRITA", "Identificar as marcas linguísticas que evidenciam o locutor e o interlocutor de um texto.", "9:EF", 9],
    ["PAEBES", "D01", "Matemática", "", "2º ano EF", "", "Reconhecer o que os números naturais indicam em diferentes situações: quantidade, ordem, medida ou código de identificação.", "2:EF", 2],
    ["PAEBES", "D02", "Matemática", "", "2º ano EF", "", "Identificar a posição ordinal de um objeto ou termo em uma sequência (1º, 2º etc.).", "2:EF", 2],
    ["PAEBES", "D03", "Matemática", "", "2º ano EF", "", "Escrever números naturais de até 3 ordens em sua representação por algarismos ou em língua materna OU associar o registro numérico de números naturais de até 3 ordens ao registro em língua materna.", "2:EF", 2],
    ["PAEBES", "D04", "Matemática", "", "2º ano EF", "", "Comparar OU ordenar quantidades de objetos (até 2 ordens).", "2:EF", 2],
    ["PAEBES", "D05", "Matemática", "", "2º ano EF", "", "Comparar OU ordenar números naturais de até 3 ordens com ou sem suporte da reta numérica.", "2:EF", 2],
    ["PAEBES", "D06", "Matemática", "", "2º ano EF", "", "Identificar a ordem ocupada por um algarismo OU seu valor posicional (ou valor relativo) em um número natural de até 3 ordens.", "2:EF", 2],
    ["PAEBES", "D07", "Matemática", "", "2º ano EF", "", "Calcular o resultado de adições ou subtrações, envolvendo números naturais de até 3 ordens.", "2:EF", 2],
    ["PAEBES", "D08", "Matemática", "", "2º ano EF", "", "Compor OU decompor números naturais de até 3 ordens por meio de diferentes adições.", "2:EF", 3],
    ["PAEBES", "D09", "Matemática", "", "2º ano EF", "", "Resolver problemas de adição ou de subtração, envolvendo números naturais de até 3 ordens, com os significados de juntar, acrescentar, separar ou retirar.", "2:EF", 3],
    ["PAEBES", "D10", "Matemática", "", "2º ano EF", "", "Resolver problemas de multiplicação ou de divisão (por 2, 3, 4 ou 5), envolvendo números naturais, com os significados de formação de grupos iguais ou proporcionalidade (incluindo dobro, metade, triplo ou terça parte).", "2:EF", 3],
    ["PAEBES", "D11", "Matemática", "", "2º ano EF", "", "Analisar argumentações sobre a resolução de problemas de adição, subtração, multiplicação ou divisão envolvendo números naturais.", "2:EF", 3],
    ["PAEBES", "D12", "Matemática", "", "2º ano EF", "", "Identificar a classificação OU classificar objetos ou representações por figuras, por meio de atributos, tais como cor, forma e medida.", "2:EF", 3],
    ["PAEBES", "D13", "Matemática", "", "2º ano EF", "", "Inferir OU descrever atributos ou propriedades comuns que os elementos que constituem uma sequência de números naturais apresentam.", "2:EF", 3],
    ["PAEBES", "D14", "Matemática", "", "2º ano EF", "", "Inferir o padrão ou a regularidade de uma sequência de números naturais ordenados, de objetos ou de figuras.", "2:EF", 4],
    ["PAEBES", "D15", "Matemática", "", "2º ano EF", "", "Inferir os elementos ausentes em uma sequência de números naturais ordenados, de objetos ou de figuras.", "2:EF", 4],
    ["PAEBES", "D16", "Matemática", "", "2º ano EF", "", "Identificar a localização OU a descrição/esboço do deslocamento de pessoas e/ou de objetos em representações bidimensionais (mapas, croquis, etc.).", "2:EF", 4],
    ["PAEBES", "D17", "Matemática", "", "2º ano EF", "", "Reconhecer/nomear figuras geométricas espaciais (cubo, bloco retangular, pirâmide, cone, cilindro e esfera),relacionando-as com objetos do mundo físico.", "2:EF", 4],
    ["PAEBES", "D18", "Matemática", "", "2º ano EF", "", "Reconhecer/nomear figuras geométricas planas (círculo, quadrado, retângulo e triângulo).", "2:EF", 4],
    ["PAEBES", "D19", "Matemática", "", "2º ano EF", "", "Descrever OU esboçar o deslocamento de pessoas e/ou objetos em representações bidimensionais (mapas, croquis etc.) ou plantas de ambientes, de acordo com condições dadas.", "2:EF", 4],
    ["PAEBES", "D20", "Matemática", "", "2º ano EF", "", "Comparar comprimentos, capacidades ou massas OU ordenar imagens de objetos com base na comparação visual de seus comprimentos, capacidades ou massas.", "2:EF", 5],
    ["PAEBES", "D21", "Matemática", "", "2º ano EF", "", "Estimar/inferir medida de comprimento, capacidade ou massa de objetos, utilizando unidades de medida convencionais ou não OU medir comprimento, capacidade ou massa de objetos.", "2:EF", 5],
    ["PAEBES", "D22", "Matemática", "", "2º ano EF", "", "Identificar a medida do comprimento, da capacidade ou da massa de objetos, dada a imagem de um instrumento de medida.", "2:EF", 5],
    ["PAEBES", "D23", "Matemática", "", "2º ano EF", "", "Reconhecer unidades de medida e/ou instrumentos utilizados para medir comprimento, tempo, massa ou capacidade.", "2:EF", 5],
    ["PAEBES", "D24", "Matemática", "", "2º ano EF", "", "Identificar sequência de acontecimentos relativos a um dia.", "2:EF", 5],
    ["PAEBES", "D25", "Matemática", "", "2º ano EF", "", "Identificar datas, dias da semana ou meses do ano em calendário OU escrever uma data, apresentando o dia, o mês e o ano.", "2:EF", 5],
    ["PAEBES", "D26", "Matemática", "", "2º ano EF", "", "Relacionar valores de moedas e/ou cédulas do sistema monetário brasileiro, com base nas imagens desses objetos.", "2:EF", 6],
    ["PAEBES", "D27", "Matemática", "", "2º ano EF", "", "Determinar a data de início, a data de término ou a duração de um acontecimento entre duas datas.", "2:EF", 6],
    ["PAEBES", "D28", "Matemática", "", "2º ano EF", "", "Determinar o horário de início, o horário de término ou a duração de um acontecimento.", "2:EF", 6],
    ["PAEBES", "D29", "Matemática", "", "2º ano EF", "", "Resolver problemas que envolvam moedas e/ou cédulas do sistema monetário brasileiro.", "2:EF", 6],
    ["PAEBES", "D30", "Matemática", "", "2º ano EF", "", "Classificar resultados de eventos cotidianos aleatórios como “pouco prováveis”, “muito prováveis”, “certos” ou “impossíveis”.", "2:EF", 6],
    ["PAEBES", "D31", "Matemática", "", "2º ano EF", "", "Ler/identificar OU comparar dados estatísticos ou informações expressos em tabelas (simples ou de dupla entrada).", "2:EF", 6],
    ["PAEBES", "D32", "Matemática", "", "2º ano EF", "", "Ler/identificar OU comparar dados estatísticos expressos em gráficos (barras simples, colunas simples ou pictóricos).", "2:EF", 7],
    ["PAEBES", "D33", "Matemática", "", "2º ano EF", "", "Representar os dados de uma pesquisa estatística ou de um levantamento em listas, tabelas (simples ou de dupla entrada) ou gráficos (barras simples, colunas simples ou pictóricos).", "2:EF", 7],
    ["PAEBES", "D002_M", "Matemática", "", "5º ano EF", "", "Corresponder números naturais a pontos da reta numérica.", "5:EF", 8],
    ["PAEBES", "D003_M", "Matemática", "", "5º ano EF", "", "Executar adição ou subtração com números naturais.", "5:EF", 8],
    ["PAEBES", "D004_M", "Matemática", "", "5º ano EF", "", "Executar multiplicação ou divisão com números naturais.", "5:EF", 8],
    ["PAEBES", "D005_M", "Matemática", "", "5º ano EF", "", "Identificar composições ou decomposições de números naturais.", "5:EF", 8],
    ["PAEBES", "D009_M", "Matemática", "", "5º ano EF", "", "Corresponder pontos da reta numérica a números racionais.", "5:EF", 8],
    ["PAEBES", "D010_M", "Matemática", "", "5º ano EF", "", "Efetuar cálculos com números racionais.", "5:EF", 12],
    ["PAEBES", "D011_M", "Matemática", "", "5º ano EF", "", "Identificar fração como representação que pode estar associada a diferentes significados.", "5:EF", 8],
    ["PAEBES", "D012_M", "Matemática", "", "5º ano EF", "", "Identificar frações equivalentes.", "5:EF", 12],
    ["PAEBES", "D013_M", "Matemática", "", "5º ano EF", "", "Reconhecer as diferentes representações de um número racional.", "5:EF", 8],
    ["PAEBES", "D014_M", "Matemática", "", "5º ano EF", "", "Reconhecer características do sistema de numeração decimal.", "5:EF", 9],
    ["PAEBES", "D018_M", "Matemática", "", "5º ano EF", "", "Calcular o valor numérico de uma expressão algébrica.", "5:EF", 12],
    ["PAEBES", "D020_M", "Matemática", "", "5º ano EF", "", "Efetuar cálculos com números inteiros.", "5:EF", 12],
    ["PAEBES", "D021_M", "Matemática", "", "5º ano EF", "", "Identificar a localização de números inteiros na reta numérica.", "5:EF", 12],
    ["PAEBES", "D024_M", "Matemática", "", "5º ano EF", "", "Resolver problema com números racionais, envolvendo diferentes significados das operações.", "5:EF", 9],
    ["PAEBES", "D038_M", "Matemática", "", "5º ano EF", "", "Utilizar porcentagem na resolução de problemas.", "5:EF", 9],
    ["PAEBES", "D044_M", "Matemática", "", "5º ano EF", "", "Identificar a localização ou a movimentação de pessoas ou objetos em uma representação plana do espaço.", "5:EF", 9],
    ["PAEBES", "D049_M", "Matemática", "", "5º ano EF", "", "Utilizar relações métricas em um triângulo retângulo na resolução de problemas.", "5:EF", 12],
    ["PAEBES", "D057_M", "Matemática", "", "5º ano EF", "", "Utilizar o perímetro de uma figura bidimensional na resolução de problema.", "5:EF", 9],
    ["PAEBES", "D058_M", "Matemática", "", "5º ano EF", "", "Utilizar área de figuras bidimensionais na resolução de problema.", "5:EF", 9],
    ["PAEBES", "D059_M", "Matemática", "", "5º ano EF", "", "Utilizar conversão entre unidades de medidas de tempo na resolução de problema.", "5:EF", 9],
    ["PAEBES", "D060_M", "Matemática", "", "5º ano EF", "", "Utilizar conversão entre diferentes unidades de medidas na resolução de problema.", "5:EF", 10],
    ["PAEBES", "D061_M", "Matemática", "", "5º ano EF", "", "Reconhecer o horário de término de um evento ou acontecimento dado seu intervalo de duração e horário de início.", "5:EF", 10],
    ["PAEBES", "D106_M", "Matemática", "", "5º ano EF", "", "Executar a medição de grandezas por meio de medidas convencionais ou não.", "5:EF", 10],
    ["PAEBES", "D108_M", "Matemática", "", "5º ano EF", "", "Identificar informações apresentadas em gráficos de colunas.", "5:EF", 10],
    ["PAEBES", "D110_M", "Matemática", "", "5º ano EF", "", "Resolver problemas utilizando números racionais, dados em representação decimal de valores do Sistema Monetário Brasileiro, envolvendo diferentes significados da adição, subtração e multiplicação.", "5:EF", 10],
    ["PAEBES", "D111_M", "Matemática", "", "5º ano EF", "", "Relacionar diferentes poliedros ou corpos redondos com suas planificações ou vistas.", "5:EF", 10],
    ["PAEBES", "D112_M", "Matemática", "", "5º ano EF", "", "Identificar propriedades comuns e diferenças entre figuras bidimensionais pelo número de lados, pelos tipos de ângulos.", "5:EF", 10],
    ["PAEBES", "D113_M", "Matemática", "", "5º ano EF", "", "Reconhecer a conservação ou modificação de medidas dos lados, do perímetro, da área em ampliação e/ou redução de figuras poligonais usando malhas quadriculadas.", "5:EF", 11],
    ["PAEBES", "D114_M", "Matemática", "", "5º ano EF", "", "Num problema, estabelecer trocas entre cédulas e moedas do sistema monetário brasileiro, em função de seus valores.", "5:EF", 11],
    ["PAEBES", "D117_M", "Matemática", "", "5º ano EF", "", "Identificar relação entre quadriláteros por meio de suas propriedades.", "5:EF", 11],
    ["PAEBES", "D121_M", "Matemática", "", "5º ano EF", "", "Reconhecer círculo/circunferência, seus elementos e algumas de suas relações.", "5:EF", 12],
    ["PAEBES", "D148_M", "Matemática", "", "5º ano EF", "", "Resolver problema com números naturais, envolvendo diferentes significados das operações (adição, subtração, multiplicação, divisão, potenciação).", "5:EF", 11],
    ["PAEBES", "D153_M", "Matemática", "", "5º ano EF", "", "Ler informações e dados apresentados em tabelas.", "5:EF", 11],
    ["PAEBES", "D009_M", "Matemática", "", "9º ano EF", "", "Corresponder pontos da reta numérica a números racionais.", "9:EF", 17],
    ["PAEBES", "D024_M", "Matemática", "", "9º ano EF", "", "Resolver problema com números racionais, envolvendo diferentes significados das operações.", "9:EF", 13],
    ["PAEBES", "D029_M", "Matemática", "", "9º ano EF", "", "Efetuar cálculos simples com valores aproximados de radicais.", "9:EF", 13],
    ["PAEBES", "D033_M", "Matemática", "", "9º ano EF", "", "Identificar a localização de números irracionais na reta numérica.", "9:EF", 17],
    ["PAEBES", "D035_M", "Matemática", "", "9º ano EF", "", "", "9:EF", 13],
    ["PAEBES", "D038_M", "Matemática", "", "9º ano EF", "", "Utilizar porcentagem na resolução de problemas.", "9:EF", 13],
    ["PAEBES", "D039_M", "Matemática", "", "9º ano EF", "", "Utilizar proporcionalidade entre duas grandezas na resolução de problema.", "9:EF", 13],
    ["PAEBES", "D042_M", "Matemática", "", "9º ano EF", "", "Utilizar o princípio multiplicativo de contagem na resolução de problema.", "9:EF", 17],
    ["PAEBES", "D043_M", "Matemática", "", "9º ano EF", "", "Identificar a localização de pontos no plano cartesiano.", "9:EF", 13],
    ["PAEBES", "D044_M", "Matemática", "", "9º ano EF", "", "Identificar a localização ou a movimentação de pessoas ou objetos em uma representação plana do espaço.", "9:EF", 13],
    ["PAEBES", "D049_M", "Matemática", "", "9º ano EF", "ESCRITA", "Utilizar relações métricas em um triângulo retângulo na resolução de problemas.", "9:EF", 7],
    ["PAEBES", "D051_M", "Matemática", "", "9º ano EF", "", "Resolver problema que envolva razões trigonométricas no triângulo retângulo (seno, cosseno, tangente).", "9:EF", 17],
    ["PAEBES", "D057_M", "Matemática", "", "9º ano EF", "", "Utilizar o perímetro de uma figura bidimensional na resolução de problema.", "9:EF", 14],
    ["PAEBES", "D058_M", "Matemática", "", "9º ano EF", "", "Utilizar área de figuras bidimensionais na resolução de problema.", "9:EF", 14],
    ["PAEBES", "D060_M", "Matemática", "", "9º ano EF", "", "", "9:EF", 14],
    ["PAEBES", "D062_M", "Matemática", "", "9º ano EF", "", "Resolver problema envolvendo noções de volume.", "9:EF", 14],
    ["PAEBES", "D063_M", "Matemática", "", "9º ano EF", "", "Corresponder listas e/ou tabelas simples aos gráficos que as representam.", "9:EF", 14],
    ["PAEBES", "D064_M", "Matemática", "", "9º ano EF", "", "Utilizar informações apresentadas em tabelas ou gráficos na resolução de problemas.", "9:EF", 14],
    ["PAEBES", "D065_M", "Matemática", "", "9º ano EF", "", "Resolver problema envolvendo noções de probabilidade.", "9:EF", 18],
    ["PAEBES", "D071_M", "Matemática", "", "9º ano EF", "", "Analisar crescimento/decrescimento, zeros de funções reais apresentadas em gráficos.", "9:EF", 18],
    ["PAEBES", "D074_M", "Matemática", "", "9º ano EF", "", "Corresponder as representações algébrica e gráfica de uma função exponencial.", "9:EF", 18],
    ["PAEBES", "D076_M", "Matemática", "", "9º ano EF", "", "Corresponder um polinômio fatorado por meio de polinômios de 1º grau às suas raízes.", "9:EF", 18],
    ["PAEBES", "D077_M", "Matemática", "", "9º ano EF", "", "Corresponder um sistema de equações polinomiais de 1º grau à uma situação problema descrita textualmente.", "9:EF", 14],
    ["PAEBES", "D078_M", "Matemática", "", "9º ano EF", "", "Corresponder uma função polinomial do 1º grau a seu gráfico.", "9:EF", 19],
    ["PAEBES", "D080_M", "Matemática", "", "9º ano EF", "", "inversa da função exponencial.", "9:EF", 19],
    ["PAEBES", "D081_M", "Matemática", "", "9º ano EF", "", "Identificar expressão algébrica que modela uma sequência numérica ou figural.", "9:EF", 14],
    ["PAEBES", "D082_M", "Matemática", "", "9º ano EF", "", "Identificar o gráfico que representa uma situação descrita em um texto.", "9:EF", 19],
    ["PAEBES", "D085_M", "Matemática", "", "9º ano EF", "", "Interpretar geometricamente os coeficientes da equação de uma reta.", "9:EF", 19],
    ["PAEBES", "D086_M", "Matemática", "", "9º ano EF", "", "Reconhecer expressão algébrica que representa uma função a partir de uma tabela.", "9:EF", 19],
    ["PAEBES", "D087_M", "Matemática", "", "9º ano EF", "", "Resolver problema envolvendo equação do 2º grau.", "9:EF", 15],
    ["PAEBES", "D088_M", "Matemática", "", "9º ano EF", "", "Utilizar função exponencial na resolução de problemas.", "9:EF", 19],
    ["PAEBES", "D096_M", "Matemática", "", "9º ano EF", "", "Utilizar propriedades de progressões aritméticas na resolução de problemas.", "9:EF", 19],
    ["PAEBES", "D097_M", "Matemática", "", "9º ano EF", "", "Utilizar propriedades de progressões geométricas na resolução de problemas.", "9:EF", 20],
    ["PAEBES", "D111_M", "Matemática", "", "9º ano EF", "", "Relacionar diferentes poliedros ou corpos redondos com suas planificações ou vistas.", "9:EF", 15],
    ["PAEBES", "D113_M", "Matemática", "", "9º ano EF", "", "e/ou redução de figuras poligonais usando malhas quadriculadas.", "9:EF", 15],
    ["PAEBES", "D116_M", "Matemática", "", "9º ano EF", "", "Identificar propriedades de triângulos pela comparação de medidas de lados e ângulos.", "9:EF", 15],
    ["PAEBES", "D117_M", "Matemática", "", "9º ano EF", "", "Identificar relação entre quadriláteros por meio de suas propriedades.", "9:EF", 15],
    ["PAEBES", "D118_M", "Matemática", "", "9º ano EF", "", "Resolver problema utilizando propriedades dos polígonos (soma de seus ângulos internos, número de diagonais, cálculo da medida de cada ângulo interno nos polígonos regulares).", "9:EF", 15],
    ["PAEBES", "D119_M", "Matemática", "", "9º ano EF", "", "Identificar triângulos semelhantes mediante o reconhecimento de relações de proporcionalidade.", "9:EF", 20],
    ["PAEBES", "D120_M", "Matemática", "", "9º ano EF", "", "Identificar uma equação ou inequação do 1º grau que expressa um problema.", "9:EF", 15],
    ["PAEBES", "D121_M", "Matemática", "", "9º ano EF", "ESCRITA", "Reconhecer círculo/circunferência, seus elementos e algumas de suas relações.", "9:EF", 7],
    ["PAEBES", "D124_M", "Matemática", "", "9º ano EF", "", "Identificar a equação de uma reta apresentada a partir de dois pontos dados ou de um ponto e sua inclinação.", "9:EF", 20],
    ["PAEBES", "D125_M", "Matemática", "", "9º ano EF", "", "Identificar a relação entre o número de vértices, faces e/ou arestas de poliedros expressa em um problema.", "9:EF", 20],
    ["PAEBES", "D126_M", "Matemática", "", "9º ano EF", "", "Identificar gráficos de funções trigonométricas (seno, cosseno, tangente) reconhecendo suas propriedades.", "9:EF", 20],
    ["PAEBES", "D127_M", "Matemática", "", "9º ano EF", "", "Relacionar a determinação do ponto de intersecção de duas ou mais retas com a resolução de um sistema de equações com duas incógnitas.", "9:EF", 20],
    ["PAEBES", "D129_M", "Matemática", "", "9º ano EF", "", "Resolver problema envolvendo a área total e/ou volume de um sólido.", "9:EF", 21],
    ["PAEBES", "D132_M", "Matemática", "", "9º ano EF", "", "Resolver problema envolvendo uma função do 1º grau.", "9:EF", 21],
    ["PAEBES", "D133_M", "Matemática", "", "9º ano EF", "", "Resolver problemas que envolvam os pontos de máximo ou de mínimo de uma função do 2º grau.", "9:EF", 21],
    ["PAEBES", "D144_M", "Matemática", "", "9º ano EF", "", "Reconhecer ângulos como mudança de direção ou giros, identificando ângulos retos e não-retos.", "9:EF", 16],
    ["PAEBES", "D145_M", "Matemática", "", "9º ano EF", "", "Reconhecer o gráfico de uma função polinomial de primeiro grau por meio de seus coeficientes.", "9:EF", 21],
    ["PAEBES", "D147_M", "Matemática", "", "9º ano EF", "", "semelhantes, identificando propriedades e/ou medidas que se modificam ou não se alteram.", "9:EF", 16],
    ["PAEBES", "D148_M", "Matemática", "", "9º ano EF", "", "Resolver problema com números naturais, envolvendo diferentes significados das operações (adição, subtração, multiplicação, divisão, potenciação).", "9:EF", 16],
    ["PAEBES", "D154_M", "Matemática", "", "9º ano EF", "", "Identificar a relação entre as representações algébrica e geométrica de um sistema de equações do 1º grau.", "9:EF", 16],
    ["PAEBES", "D155_M", "Matemática", "", "9º ano EF", "", "Reconhecer, dentre as equações do 2º grau com duas incógnitas, as que representam circunferências.", "9:EF", 21],
    ["PAEBES", "D156_M", "Matemática", "", "9º ano EF", "", "Reconhecer as representações decimais dos números racionais como uma extensão do sistema de numeração decimal, identificando a existência de “ordens” como décimos, centésimos e milésimos.", "9:EF", 16],
    ["PAEBES", "D157_M", "Matemática", "", "9º ano EF", "", "Determinar a solução de um sistema linear associando-o a uma matriz.", "9:EF", 21]
  ];

  var EXPANSAO = null;
  function todos() {
    if (!EXPANSAO) {
      EXPANSAO = LINHAS.map(function (linha, k) {
        var r = { idx: k };
        CAMPOS.forEach(function (campo, i) { r[campo] = linha[i]; });
        return r;
      });
    }
    return EXPANSAO;
  }

  var RE_COMBINANDO = /[\u0300-\u036f]/g;
  /* o professor digita "lingua portuguesa" e o papel tem "Língua Portuguesa": casa sem acento nem caixa */
  function despido(texto) {
    return String(texto == null ? "" : texto).normalize("NFD").replace(RE_COMBINANDO, "")
      .replace(/[\u00ba\u00aa]/g, "o").toLowerCase().replace(/\s+/g, " ").trim();
  }

  /* "5º ano EF", "5 ano", "5ª série EM" viram "5:EF" / "5:EM": a chave que une a turma ao descritor */
  function chaveDeAno(texto) {
    var s = despido(texto);
    var m = s.match(/(\d{1,2})\s*o?\s*(ano|anos|serie|series)/);
    if (!m) return "";
    return Number(m[1]) + ":" + (/serie|series|medio/.test(s) ? "EM" : "EF");
  }

  /* disciplina e ano chegam como texto solto do cadastro, entao o casamento e de rotulo, nao de igual */
  function mesmoRotulo(a, b) {
    var x = despido(a), y = despido(b);
    return !!x && !!y && (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0);
  }

  /* o filtro do seletor. Sem linha nenhuma no ano pedido o ano cai fora da conta: um 6º ano nao
     tem matriz propria e o seletor vazio seria pior que a lista da disciplina toda. */
  function filtrar(opcoes) {
    var o = opcoes || {};
    var chaves = despido(o.busca).split(" ").filter(function (p) { return p; });
    var ano = o.ano ? chaveDeAno(o.ano) : "";
    var lista = todos().filter(function (r) {
      if (!o.incompletos && !r.descricao) return false;
      if (o.matriz && r.matriz !== o.matriz) return false;
      if (o.disciplina && !mesmoRotulo(r.disciplina, o.disciplina)) return false;
      if (o.banda && !mesmoRotulo(r.banda, o.banda)) return false;
      var texto = despido(r.codigo + " " + r.descricao);
      for (var i = 0; i < chaves.length; i++) if (texto.indexOf(chaves[i]) < 0) return false;
      return true;
    });
    if (!ano) return lista;
    var doAno = lista.filter(function (r) { return r.anoChave === ano; });
    return doAno.length ? doAno : lista;
  }

  /* o mesmo codigo vale para mais de uma matriz e de mais de um ano: devolve lista, nunca uma linha */
  function porCodigo(codigo, disciplina) {
    var alvo = despido(codigo);
    if (!alvo) return [];
    return todos().filter(function (r) {
      return despido(r.codigo) === alvo && (!disciplina || mesmoRotulo(r.disciplina, disciplina));
    });
  }

  return {
    todos: todos,
    filtrar: filtrar,
    porCodigo: porCodigo,
    chaveDeAno: chaveDeAno,
    despido: despido,
    total: LINHAS.length
  };
});
