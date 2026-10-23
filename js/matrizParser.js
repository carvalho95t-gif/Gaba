/* Gaba — extrai os descritores de uma matriz de referência (PAEBES / AMA) do PDF já lido com
   geometria. Uma matriz é uma tabela desenhada coluna por coluna: o código fica numa faixa de x,
   a habilidade noutra e o ano numa tarja que só aparece no topo de cada banda. A ordem de leitura
   não serve: o código é desenhado no MEIO da célula, então a primeira frase do descritor chega
   antes dele e a continuação depois. Por isso a tabela aqui é lida por coluna e por faixa vertical.
   Nada casa acento com letra acentuada na regex: o PDF vem com Ê pré-composto e o arquivo
   com o acento decomposto, então todo casamento passa por despido(), que derruba o acento. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaMatriz = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RE_COMBINANDO = /[\u0300-\u036f]/g;
  /* D01, D016_P, D148_M: o sufixo entrega a disciplina quando o texto em volta engana.
     sem \\b de proposito: "D121_MD032_P" chegou colado do PDF e os dois sao codigos */
  var RE_CODIGO = /^D(\d{1,3})(?:_([A-Z]))?[\s.:,\u2013-]*/;
  var RE_ORDINAL = /[\u00ba\u00aa]/g;
  /* o recheio de uma celula comeca em maiuscula; o rodape e a tarja nao */
  var RE_MAIUSCULA = /^[A-Z\u00c0-\u00de]/;

  var RE_RODAPE = /^matriz(?:es)?\s+de\s+referencia.*paebes/i;
  var RE_PAGINA = /^pagina\s+\d/i;
  var RE_TABELA = /^(codigo do descritor|codigo do|descritor|habilidade|descricao|observacao|observa|descritor habilidade)$/i;
  var RE_TARJA = /^matriz(?:es)?\s+de\s+referencia\s*[\u2013\u2014:-]\s*/i;
  var RE_ANO = /^(\d{1,2})\s*[o a]?\s*(ano|anos|serie|series)\b/i;
  var RE_BANDA = /^(escrita|leitura|producao de texto)$/i;
  var DISCIPLINAS = [
    [/lingua\s*portugu|^lp$/, "Língua Portuguesa"],
    [/matem|matematic/, "Matemática"],
    [/ciencias\s+humanas|^ch$/, "Ciências Humanas"],
    [/ciencias\s+(da\s+)?natureza|biolog|fisic|quim/, "Ciências da Natureza"]
  ];
  var SUFIXO = {
    P: ["Língua Portuguesa", ""],
    M: ["Matemática", ""],
    H: ["Ciências Humanas", "História"],
    G: ["Ciências Humanas", "Geografia"],
    C: ["Ciências da Natureza", ""],
    N: ["Ciências da Natureza", ""]
  };

  /* distancia que ainda e a mesma coluna: a mesma coluna nao anda mais que 1pt entre paginas e
     a vizinha comeca a mais de 30pt */
  var TOL_COLUMNA = 12;

  /* tira o acento de tudo que serve para casar, sem tocar no texto que vai para o catalogo */
  function despido(texto) {
    return String(texto || "").normalize("NFD").replace(RE_COMBINANDO, "")
      .replace(RE_ORDINAL, "o").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function limpar(texto) {
    return String(texto || "").replace(/\s+/g, " ").replace(/\s+([,.;:!?\u2026])/g, "$1").trim();
  }

  /* "9º ano EF", "9o ano EF" e "9ºAno/Ensino Fundamental" viram a mesma chave de filtro */
  function chaveDeAno(texto) {
    var s = despido(texto);
    var m = s.match(/(\d{1,2})\s*o?\s*(ano|anos|serie|series)/);
    if (!m) return "";
    return Number(m[1]) + ":" + (/serie|series|medio/.test(s) ? "EM" : "EF");
  }

  function anoDe(rotulo) {
    var m = despido(rotulo).match(RE_ANO);
    if (!m) return "";
    var n = Number(m[1]);
    var serie = /^serie/.test(m[2]);
    return serie ? n + "\u00aa s\u00e9rie EM" : n + "\u00ba ano EF";
  }

  function disciplinaDe(texto) {
    var s = despido(texto);
    for (var i = 0; i < DISCIPLINAS.length; i++) if (DISCIPLINAS[i][0].test(s)) return DISCIPLINAS[i][1];
    return "";
  }

  /* rotulo: o que a celula diz sobre a tabela, ou mudo quando ela e recheio */
  function rotuloDe(texto) {
    var t = limpar(texto);
    if (!t) return { tipo: "mudo" };
    var s = despido(t);
    if (RE_RODAPE.test(s) || RE_PAGINA.test(s) || RE_TABELA.test(s)) return { tipo: "enfeite" };
    var semTarja = s.replace(RE_TARJA, "");
    if (semTarja !== s) {
      var anoTarja = anoDe(semTarja);
      if (anoTarja) return { tipo: "ano", valor: anoTarja };
      if (/paebes/.test(s)) return { tipo: "enfeite" };
      var discTarja = disciplinaDe(semTarja);
      if (discTarja) return { tipo: "disciplina", valor: discTarja };
      return { tipo: "enfeite" };
    }
    if (RE_BANDA.test(s)) return { tipo: "banda", valor: limpar(t) };
    if (RE_ANO.test(s) && t.length <= 14) return { tipo: "ano", valor: anoDe(t) };
    var soDisciplina = disciplinaDe(t);
    /* "LÍNGUA PORTUGUESA E MATEMÁTICA" da capa nao e secao de tabela */
    if (soDisciplina && t.length <= 26 && !/ e (matematic|lingua)/.test(s)) return { tipo: "disciplina", valor: soDisciplina };
    return { tipo: "mudo" };
  }

  function novaQuestaoDe(t, estado, origem, pagina) {
    var m = String(t || "").match(RE_CODIGO);
    if (!m) return null;
    var sufixo = SUFIXO[m[2] || ""];
    var resto = limpar(t.replace(RE_CODIGO, ""));
    return {
      codigo: "D" + m[1] + (m[2] ? "_" + m[2] : ""),
      componente: sufixo ? sufixo[1] : "",
      disciplina: sufixo ? sufixo[0] : ((estado && estado.disciplina) || (origem && origem.disciplina) || ""),
      descricao: resto,
      sobra: resto,
      ano: (estado && estado.ano) || "",
      banda: (estado && estado.banda) || "",
      matriz: (origem && origem.matriz) || "",
      fonte: (origem && origem.fonte) || "",
      pagina: pagina
    };
  }

  /* uma celula por coluna da linha: estes PDFs desenham letra por letra, entao o buraco ate a
     letra vizinha e de 1 a 9pt e o buraco que troca de coluna da tabela passa de 27pt */
  function celulasDaPagina(linhas) {
    var celulas = [];
    (linhas || []).forEach(function (linha) {
      var corpo = linha.tamanho || 1;
      var folga = Math.max(12, corpo);
      var folgaDeEspaco = Math.max(0.8, 0.16 * corpo);
      var celula = null;
      var partes = linha.partes && linha.partes.length ? linha.partes : [{ x: linha.x, fim: linha.x, texto: linha.texto }];
      partes.forEach(function (p) {
        var texto = String(p.texto || "");
        if (!texto) return;
        if (celula && p.x - celula.fim > folga) celula = null;
        if (!celula) {
          celulas.push(celula = { x: Math.round(p.x * 10) / 10, fim: p.fim, y: linha.y,
            tamanho: corpo, texto: texto });
          return;
        }
        celula.texto += (p.x - celula.fim > folgaDeEspaco ? " " : "") + texto;
        if (p.fim > celula.fim) celula.fim = p.fim;
      });
    });
    return celulas;
  }

  /* voto de coluna de texto: uma celula de verdade comeca em maiuscula e a pagina nao fala
     dela mesma; o rodape, a tarja e o titulo de secao ficam de fora e nao elegem coluna */
  function recheio(celula) {
    return rotuloDe(celula.texto).tipo === "mudo" && RE_MAIUSCULA.test(celula.texto) &&
      !novaQuestaoDe(celula.texto, null, null, 0);
  }

  /* as colunas do papel, da esquerda para a direita: o x de origem entrega a coluna, que e
     alinhada a esquerda; a observacao, centralizada, se espalha e nunca vence a votacao */
  function colunasDasCelulas(celulas) {
    var porX = celulas.slice().sort(function (a, b) { return a.x - b.x || b.y - a.y; });
    var colunas = [];
    porX.forEach(function (c) {
      var última = colunas[colunas.length - 1];
      if (última && c.x - última.x < TOL_COLUMNA) última.celulas.push(c);
      else colunas.push({ x: c.x, celulas: [c] });
    });
    colunas.forEach(function (coluna) {
      coluna.celulas.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
      coluna.textos = coluna.celulas.filter(recheio).length;
    });
    return colunas;
  }

  /* a tabela da pagina: a coluna da habilidade e a faixa vertical de cada codigo.
     pagina sem codigo nao e tabela, mas ainda e passeio: a capa diz a disciplina do arquivo */
  function tabelaDaPagina(linhas) {
    var celulas = celulasDaPagina(linhas);
    var codigos = celulas.filter(function (c) { return novaQuestaoDe(c.texto, null, null, 0); })
      .sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var deTexto = null;
    if (codigos.length) {
      /* o codigo da tabela e centralizado na celula: ele anda de x e nao forma uma coluna so,
         entao a coluna se escolhe pelo recheio e o codigo fica com tudo que esta a esquerda dele */
      colunasDasCelulas(celulas).forEach(function (coluna) {
        if (!coluna.textos) return;
        if (!deTexto || coluna.textos > deTexto.textos) deTexto = coluna;
      });
      /* se todo codigo ja esta a direita da coluna de texto, a coluna escolhida nao e a dele */
      var antes = deTexto ? codigos.filter(function (c) { return c.x < deTexto.x; }) : codigos;
      if (deTexto && !antes.length) deTexto = null;
      else codigos = antes;
    }
    /* o codigo fica no meio da linha: a metade do caminho ate o vizinho e a fronteira da faixa */
    var faixas = codigos.map(function (celula, k) {
      var faixa = {
        celula: celula,
        topo: k === 0 ? Infinity : (codigos[k - 1].y + celula.y) / 2,
        fundo: k === codigos.length - 1 ? -Infinity : (celula.y + codigos[k + 1].y) / 2,
        textos: []
      };
      celula.faixa = faixa;
      return faixa;
    });
    if (deTexto) {
      deTexto.celulas.forEach(function (celula) {
        /* na coluna da habilidade ate a frase curta vale ("Ler palavras."); o que a pagina diz
           sobre si mesma (rodape, tarja, titulo) nunca e descricao de um descritor */
        if (novaQuestaoDe(celula.texto, null, null, 0) || rotuloDe(celula.texto).tipo !== "mudo") return;
        for (var k = 0; k < faixas.length; k++) {
          if (celula.y <= faixas[k].topo && celula.y > faixas[k].fundo) {
            faixas[k].textos.push(celula);
            celula.usada = true;
            return;
          }
        }
      });
    }
    return { faixas: faixas, celulas: celulas.sort(function (a, b) { return b.y - a.y || a.x - b.x; }) };
  }

  /* a faixa virou descritor: o codigo abre o registro e o texto da coluna dele fecha a frase */
  function registroDaFaixa(faixa, estado, origem, pagina, registros) {
    var q = novaQuestaoDe(faixa.celula.texto, estado, origem, pagina);
    var fila = [q];
    while (q.sobra) {
      var proximo = novaQuestaoDe(q.sobra, estado, origem, pagina);
      if (!proximo) break;
      q.sobra = "";
      q.descricao = "";
      fila.push(proximo);
      registros.push(q);
      q = proximo;
    }
    q.sobra = "";
    /* "D035_MD121_M" sao duas linhas do papel impressas uma sobre a outra: os dois codicos
       chegam na mesma base e as duas habilidades ficam a 1,6pt uma da outra, entao nao ha como
       saber de quem e cada frase. Ninguem recebe chute: a duvida fica marcada e a deduplicacao
       devolve o texto que o mesmo codigo tem em outra pagina. */
    var colados = fila.length - 1;
    if (colados) {
      fila.forEach(function (r) {
        r.duvida = "dois codigos colados na mesma celula";
        r.descricao = "";
      });
    } else if (faixa.textos.length) {
      q.descricao = limpar([q.descricao].concat(faixa.textos.map(function (c) { return c.texto; }))
        .filter(function (t) { return t; }).join(" "));
    }
    registros.push(q);
    /* quantas linhas desta pagina saem duvidosas: numa celula colada, sao todos os codigos dela */
    return colados ? fila.length : 0;
  }

  /* o passeio: a tarja manda ano e disciplina, cada codigo da pagina ganha a faixa dele */
  function descritoresDoPdf(lido, origem) {
    var estado = { ano: "", disciplina: (origem && origem.disciplina) || "", banda: "" };
    var registros = [];
    var duvidosos = 0;
    (lido && lido.linhas ? lido.linhas : []).forEach(function (linhas, k) {
      var pagina = k + 1;
      var tabela = tabelaDaPagina(linhas || []);
      tabela.celulas.forEach(function (c) {
        if (c.faixa) duvidosos += registroDaFaixa(c.faixa, estado, origem, pagina, registros);
        else if (!c.usada) {
          var rot = rotuloDe(c.texto);
          if (rot.tipo === "ano") estado.ano = rot.valor;
          else if (rot.tipo === "disciplina") estado.disciplina = rot.valor;
          else if (rot.tipo === "banda") estado.banda = rot.valor;
        }
      });
    });
    return { registros: registros, duvidosos: duvidosos };
  }

  function chave(reg) {
    return [reg.matriz, reg.disciplina, reg.ano, reg.codigo].join("|");
  }

  /* junta o que os arquivos repetem: o mesmo descritor vale para duas matrizes */
  function deduplicar(registros) {
    var porChave = {};
    var saida = [];
    (registros || []).forEach(function (r) {
      var k = chave(r);
      var existente = porChave[k];
      if (existente) {
        /* a occorrenca duvidosa nao tem texto: pega o que o mesmo codigo diz em outra pagina limpa */
        if (!existente.descricao && r.descricao) {
          existente.descricao = r.descricao;
          if (!r.duvida) existente.duvida = "";
        }
        if (existente.fontes.indexOf(r.fonte) < 0) existente.fontes.push(r.fonte);
        return;
      }
      var novo = Object.assign({}, r, { fontes: [r.fonte] });
      delete novo.fonte;
      delete novo.sobra;
      porChave[k] = novo;
      saida.push(novo);
    });
    return saida;
  }

  return {
    descritoresDoPdf: descritoresDoPdf,
    descritoresDaMatriz: function (lido, origem) { return deduplicar(descritoresDoPdf(lido, origem).registros); },
    deduplicar: deduplicar,
    rotuloDe: rotuloDe,
    tabelaDaPagina: tabelaDaPagina,
    celulasDaPagina: celulasDaPagina,
    novaQuestaoDe: novaQuestaoDe,
    chaveDeAno: chaveDeAno,
    anoDe: anoDe,
    disciplinaDe: disciplinaDe,
    despido: despido,
    limpar: limpar
  };
});
