/* Gaba — a busca do guia de uso. Sem IA: normaliza acentos, junta os sinônimos que o
   professor usa (folha/cartão, câmera/celular), tolera erro de digitação e ordena por
   BM25. A mesma função roda no app e nos testes do node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaBusca = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STOP = {};
  ("a o e de da do das dos em no na nos nas num numa por para pra pro com sem ao aos " +
    "que quem se um uma uns umas como qual quais quanto quanta onde quando porque " +
    "meu minha seu sua nosso nossa este esta esse essa isso isto aquele aquela aquilo " +
    "tem tenho tinha ter ha esta estao foi ser sou ja mais muito muita pouco pode posso " +
    "consigo conseguir devo fazer faco preciso quero queria gostaria deveria aqui ali " +
    "entao tambem so bem coisa coisas jeito forma caso vez vezes agora ainda depois antes " +
    "sempre eu tu ele ela eles elas voce voces nos lhe me te la gaba")
    .split(/\s+/).forEach(function (w) { if (w) STOP[w] = true; });

  var NEG = { nao: 1, nunca: 1, nem: 1 };

  /* cada linha vira um "conceito": todas as palavras dela apontam para a primeira.
     é isto que faz "cartão de resposta" cair no mesmo lugar que "folha". */
  var CONCEITOS = [
    "ler leitura leitor scanner escanear escaneamento scan digitalizar lido lidas lidos lendo",
    "folha folhas cartao cartoes resposta respostas marcacao marcacoes",
    "duvida duvidas confusao confusa ambigua ambiguo incerta incerto rasura rasurada bolha bolhas duas",
    "sensibilidade sensivel lapis caneta clareza fraca escura grafite",
    "qr qrcode fiducial fiduciais marcador marcadores",
    "codigo codigos cod lote",
    "apagar excluir remover deletar exclusao eliminar",
    "gabarito gabaritos chave",
    "questao questoes pergunta perguntas enunciado enunciados",
    "peso pesos ponto pontos pontuacao valor",
    "descritor descritores habilidade habilidades bncc matriz curricular",
    "sugestao sugestoes ideia ideias melhoria melhorias pedido pedidos reclamacao reclamacoes",
    "problema problemas erro erros falha falhas defeito defeitos bug bugs travamento travando",
    "relato relatos relatar reportar comunicar informar",
    "professor professores docente docentes",
    "aluno alunos estudante estudantes crianca criancas",
    "escola escolas unidade unidades colegio colegios",
    "turma turmas classe classes serie series periodo ano",
    "senha senhas",
    "login logar entrar entrada acesso acessar conectar conexao conectado desconectado",
    "conta contas cadastro cadastrar registro registrar inscricao",
    "email emails",
    "internet rede redes wifi offline on-line online nuvem",
    "instalar instalacao instale aplicativo aplicativos app atalho icone pwa",
    "imprimir impressao impressora a4",
    "cortado cortada corte cortes encaixe coube cabe medida medidas transbordou estourou estourada",
    "reimprimir reimpressao validade",
    "modelo modelos cabecalho enem paebes saeb ama sedu coluna colunas",
    "instrucao instrucoes",
    "camera cameras webcam",
    "permissao permissoes autorizar autorizacao bloqueada negada",
    "foco enquadramento enquadrar distancia sombra sombras reflexo luz borrada borrado tremida",
    "nota notas resultado resultados correcao correcoes relatorio relatorios desempenho",
    "excel planilha xlsx csv exportar baixar",
    "analise analises item itens acerto acertos discriminacao distrator distratores dificil dificuldade",
    "aparelho aparelhos celular celulares telefone dispositivo movel",
    "subir fila filas pendente pendentes sincronizar sincronizacao enviar",
    "ajuda suporte atendimento contato",
    "privacidade dados lgpd pessoal pessoais nome nomes",
    "guardar guardado salvar salvo armazenar armazenado",
    "lista listas chamada chamadas importar xls",
    "filtro filtrar seletor topo desapareceu sumiu mostrar esconder",
    "comecar iniciar primeiro primeiros passo passos ordem tutorial",
    "versao versoes tipo tipos variacao variacoes",
    "salt semente",
    "previa visualizar conferir rascunho",
    "alivio painel papel pilha pilhas tempo horas",
    "banco supabase url anon servidor configurar"
  ];

  var DE_PARA = [
    ["impresso", "imprimir"], ["impressa", "imprimir"], ["imprimi", "imprimir"],
    ["imprimiu", "imprimir"], ["imprimindo", "imprimir"], ["reconhecida", "reconhecer"],
    ["reconhecido", "reconhecer"], ["reconhece", "reconhecer"], ["achado", "achar"],
    ["acha", "achar"], ["travou", "travar"], ["trava", "travar"], ["sumiram", "sumiu"],
    ["desaparecidas", "desapareceu"], ["estourar", "estourou"], ["cabeu", "coube"],
    ["cabem", "coube"], ["saiu", "sair"], ["cortar", "cortado"], ["exclui", "excluir"],
    ["apaguei", "apagar"], ["apagou", "apagar"], ["apagada", "apagar"], ["mudei", "mudar"],
    ["troquei", "trocar"], ["trocou", "trocar"], ["errei", "erro"], ["errada", "erro"],
    ["errado", "erro"], ["erradas", "erro"], ["subiu", "subir"], ["sobem", "subir"],
    ["enviei", "enviar"], ["enviou", "enviar"], ["salvei", "salvar"], ["salvou", "salvar"],
    ["cadastrei", "cadastrar"], ["importei", "importar"], ["importou", "importar"],
    ["embaralhei", "embaralhar"], ["emparalhei", "embaralhar"], ["gere", "gerar"],
    ["gerou", "gerar"], ["revisei", "revisao"], ["revisar", "revisao"],
    ["instalei", "instalar"], ["instalou", "instalar"], ["baixei", "baixar"],
    ["baixou", "baixar"], ["exportei", "exportar"], ["exportou", "exportar"],
    ["coloquei", "colocar"], ["guardei", "guardado"], ["gravou", "guardado"],
    ["inserir", "importar"], ["inseri", "importar"], ["puxar", "importar"],
    ["leu", "ler"], ["lida", "ler"], ["corrigi", "corrigir"], ["corrigiu", "corrigir"],
    ["corrigida", "corrigir"], ["duvidosa", "duvida"], ["duvidosas", "duvida"],
    ["confusa", "confusao"], ["ambiguas", "ambigua"], ["media", "nota"],
    ["comecei", "comecar"], ["comeco", "comecar"], ["comecou", "comecar"],
    ["aplicacao", "aplicativo"], ["codigos", "codigo"], ["codigo", "codigo"],
    ["camara", "camera"]
  ];

  function semAcento(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function normalizar(texto) {
    return semAcento(texto).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function stem(palavra) {
    var w = palavra;
    if (w.length > 3 && w.slice(-3) === "oes") w = w.slice(0, -3) + "ao";
    if (w.length > 3 && w.slice(-3) === "aes") w = w.slice(0, -3) + "ao";
    if (w.length > 4 && w.slice(-3) === "ais") w = w.slice(0, -3) + "al";
    if (w.length > 4 && w.slice(-3) === "eis") w = w.slice(0, -3) + "el";
    if (w.length > 4 && w.slice(-3) === "ois") w = w.slice(0, -3) + "ol";
    if (w.length > 4 && w.slice(-2) === "ns") w = w.slice(0, -1);
    else if (w.length > 3 && w.slice(-2) === "es") w = w.slice(0, -2);
    else if (w.length > 3 && w.slice(-1) === "s") w = w.slice(0, -1);
    if (w.length >= 6 && w.slice(-4) === "cao") w = w.slice(0, -3);
    if (w.length >= 6 && w.slice(-4) === "sao") w = w.slice(0, -3);
    if (w.length >= 8 && w.slice(-6) === "mente") w = w.slice(0, -6);
    if (w.length >= 6 && w.slice(-5) === "idade") w = w.slice(0, -4);
    if (w.length >= 6 && w.slice(-5) === "dade") w = w.slice(0, -4);
    if (w.length >= 7 && w.slice(-3) === "ado") w = w.slice(0, -3);
    if (w.length >= 7 && w.slice(-3) === "ada") w = w.slice(0, -3);
    if (w.length >= 7 && w.slice(-3) === "ido") w = w.slice(0, -3);
    if (w.length >= 7 && w.slice(-3) === "ida") w = w.slice(0, -3);
    if (w.length >= 5 && w.slice(-2) === "ar") w = w.slice(0, -2);
    if (w.length >= 5 && w.slice(-2) === "er") w = w.slice(0, -2);
    if (w.length >= 5 && w.slice(-2) === "ir") w = w.slice(0, -2);
    if (w.length >= 4 && w.slice(-2) === "ou") w = w.slice(0, -2);
    if (w.length >= 4 && w.slice(-2) === "eu") w = w.slice(0, -2);
    if (w.length >= 4 && w.slice(-2) === "iu") w = w.slice(0, -2);
    if (w.length >= 4 && w.slice(-3) === "ram") w = w.slice(0, -3);
    if (w.length >= 4 && w.slice(-2) === "am") w = w.slice(0, -2);
    if (w.length >= 4 && w.slice(-2) === "em") w = w.slice(0, -2);
    if (w.length > 3 && w.slice(-1) === "a") w = w.slice(0, -1);
    if (w.length > 3 && w.slice(-1) === "o") w = w.slice(0, -1);
    if (w.length > 3 && w.slice(-1) === "e") w = w.slice(0, -1);
    return w;
  }

  var CONCEITO_SIMPLES = {};

  function marcar(palavra, chave) {
    var k = normalizar(palavra);
    if (!k) return;
    CONCEITO_SIMPLES[k] = chave;
    CONCEITO_SIMPLES[stem(k)] = chave;
  }

  (function carregarConceitos() {
    CONCEITOS.forEach(function (linha) {
      var palavras = linha.split(/\s+/).filter(Boolean);
      if (!palavras.length) return;
      var chave = "\u00a7" + stem(normalizar(palavras[0]));
      palavras.forEach(function (p) {
        var k = normalizar(p);
        if (CONCEITO_SIMPLES[k] || CONCEITO_SIMPLES[stem(k)]) return;
        marcar(p, chave);
      });
    });
    DE_PARA.forEach(function (par) {
      var de = normalizar(par[0]), para = normalizar(par[1]);
      var alvo = CONCEITO_SIMPLES[para] || CONCEITO_SIMPLES[stem(para)] || "\u00a7" + stem(para);
      if (CONCEITO_SIMPLES[normalizar(de)] || CONCEITO_SIMPLES[stem(de)]) return;
      marcar(de, alvo);
    });
  })();

  var CONCEITOS_POR_LETRA = {};
  Object.keys(CONCEITO_SIMPLES).forEach(function (k) {
    var l = k.charAt(0);
    (CONCEITOS_POR_LETRA[l] = CONCEITOS_POR_LETRA[l] || []).push(k);
  });

  function distancia(a, b, limite) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > limite) return limite + 1;
    var linha = [], j, i, c;
    for (j = 0; j <= b.length; j++) linha[j] = j;
    for (i = 1; i <= a.length; i++) {
      var ant = linha[0];
      linha[0] = i;
      for (c = 1; c <= b.length; c++) {
        var temp = linha[c];
        linha[c] = Math.min(linha[c] + 1, linha[c - 1] + 1, ant + (a[i - 1] === b[c - 1] ? 0 : 1));
        ant = temp;
      }
    }
    return linha[b.length];
  }

  function tolerancia(t) {
    if (t.length >= 9) return 2;
    if (t.length >= 7) return 1;
    return 0;
  }

  function criarResolvedor(vocab) {
    var cache = {};
    return function resolver(palavra) {
      if (!palavra) return null;
      if (Object.prototype.hasOwnProperty.call(cache, palavra)) return cache[palavra];
      var r = null;
      if (CONCEITO_SIMPLES[palavra]) r = CONCEITO_SIMPLES[palavra];
      if (!r) {
        var s = stem(palavra);
        if (CONCEITO_SIMPLES[s]) r = CONCEITO_SIMPLES[s];
        else if (vocab[palavra]) r = s;
        else if (vocab[s]) r = s;
      }
      /* o typo só é corrigido contra o dicionário de conceitos: palavra comum
         do texto ("ganhou" ~ "ganha") não pode puxar artigo nenhum */
      if (!r) {
        var lim = tolerancia(palavra);
        if (lim) {
          var letra = palavra.charAt(0);
          var alvo = stem(palavra);
          var listaC = CONCEITOS_POR_LETRA[letra] || [];
          for (var k = 0; k < listaC.length; k++) {
            var cand = listaC[k];
            if (Math.abs(cand.length - palavra.length) > lim &&
                Math.abs(cand.length - alvo.length) > lim) continue;
            var d = Math.min(distancia(palavra, cand, lim), distancia(alvo, cand, lim));
            if (d <= lim) { r = CONCEITO_SIMPLES[cand]; break; }
          }
        }
      }
      cache[palavra] = r;
      return r;
    };
  }

  function tokenizar(texto, resolver) {
    var brutos = normalizar(texto).split(" ").filter(Boolean);
    var tokens = [], primarios = [], ignorados = 0;
    var negando = false;
    for (var i = 0; i < brutos.length; i++) {
      var b = brutos[i];
      if (NEG[b]) { negando = true; continue; }
      if (STOP[b]) { negando = false; continue; }
      var r = resolver(b);
      if (r === null) { ignorados += 1; negando = false; continue; }
      /* a palavra exata continua valendo como pista (exportar != excel), mas
         cobertura e nível contam só o conceito */
      if (r.charAt(0) === "\u00a7" && !negando) tokens.push("~" + stem(b));
      var t = negando ? r + "_neg" : r;
      tokens.push(t);
      if (!negando) primarios.push(t);
      negando = false;
    }
    return { tokens: tokens, primarios: primarios, ignorados: ignorados };
  }

  function tokensDoTexto(texto, resolver) {
    return tokenizar(texto, resolver).tokens;
  }

  var CAMPOS = [
    { nome: "titulo", peso: 3 },
    { nome: "perguntas", peso: 3.2 },
    { nome: "chaves", peso: 2 },
    { nome: "resumo", peso: 1.2 },
    { nome: "passos", peso: 1 },
    { nome: "notas", peso: 0.7 },
    { nome: "tela", peso: 1.2 }
  ];

  var K1 = 1.2, B = 0.65;

  function textoDoCampo(artigo, campo) {
    if (campo === "titulo") return artigo.titulo;
    if (campo === "perguntas") return (artigo.perguntas || []).join(" . ");
    if (campo === "chaves") return (artigo.chaves || []).join(" ");
    if (campo === "resumo") return artigo.resumo;
    if (campo === "passos") return (artigo.passos || []).join(" . ");
    if (campo === "notas") return (artigo.notas || []).join(" . ");
    return artigo.tela || "";
  }

  var CACHE_INDICE = { artigos: null, indice: null };

  function indexar(artigos) {
    var vocab = {};
    artigos.forEach(function (a) {
      CAMPOS.forEach(function (c) {
        normalizar(textoDoCampo(a, c.nome)).split(" ").forEach(function (w) {
          if (!w || STOP[w] || NEG[w]) return;
          vocab[w] = (vocab[w] || 0) + 1;
          var s = stem(w);
          if (s !== w) vocab[s] = (vocab[s] || 0) + 1;
        });
      });
    });
    var resolver = criarResolvedor(vocab);

    var docs = artigos.map(function (a) {
      var campos = {};
      var tf = {};
      var tamanhoTotal = 0;
      CAMPOS.forEach(function (c) {
        var tokens = tokensDoTexto(textoDoCampo(a, c.nome), resolver);
        var t = {};
        tokens.forEach(function (tk) { t[tk] = (t[tk] || 0) + 1; });
        campos[c.nome] = { tf: t, len: tokens.length, peso: c.peso };
        Object.keys(t).forEach(function (k) { tf[k] = (tf[k] || 0) + t[k]; });
        tamanhoTotal += tokens.length;
      });
      return { artigo: a, campos: campos, tf: tf, len: tamanhoTotal || 1 };
    });

    var df = {};
    docs.forEach(function (d) {
      Object.keys(d.tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
    });
    var media = docs.reduce(function (s, d) { return s + d.len; }, 0) / (docs.length || 1);
    var idf = {};
    Object.keys(df).forEach(function (t) {
      idf[t] = Math.log(1 + (docs.length - df[t] + 0.5) / (df[t] + 0.5));
    });
    return { vocab: vocab, docs: docs, idf: idf, media: media, resolver: resolver, originais: artigos };
  }

  function indiceDe(artigos) {
    if (CACHE_INDICE.artigos !== artigos) {
      CACHE_INDICE.artigos = artigos;
      CACHE_INDICE.indice = indexar(artigos);
    }
    return CACHE_INDICE.indice;
  }

  function tokensDaConsulta(q, resolver) {
    var r = tokenizar(q, resolver);
    var unicos = [], primarios = [];
    r.tokens.forEach(function (t) { if (unicos.indexOf(t) < 0) unicos.push(t); });
    r.primarios.forEach(function (t) { if (primarios.indexOf(t) < 0) primarios.push(t); });
    return { tokens: unicos, primarios: primarios, ignorados: r.ignorados };
  }

  function trechoDoArtigo(artigo, casados, consulta) {
    var candidatos = [artigo.resumo].concat(artigo.passos || [], artigo.notas || []);
    var query = normalizar(consulta).split(" ").filter(Boolean);
    var melhor = artigo.resumo, melhorN = -1;
    candidatos.forEach(function (c) {
      if (!c) return;
      var palavras = normalizar(c).split(" ").filter(Boolean);
      var n = palavras.filter(function (p) { return casados[p] || casados[stem(p)] || query.indexOf(p) >= 0; }).length;
      if (n > melhorN) { melhorN = n; melhor = c; }
    });
    return melhor;
  }

  function buscarGuiado(artigos, q, opcoes) {
    opcoes = opcoes || {};
    var consulta = tokensDaConsulta(q, indiceDe(artigos).resolver);
    var indice = indiceDe(artigos);
    var unicos = consulta.tokens;
    if (!unicos.length) return { nivel: "nada", resultados: [], tokens: [], cobertura: 0, ignorados: consulta.ignorados };
    var primarios = consulta.primarios;
    var base = primarios.length || unicos.length;

    var resultados = indice.docs.map(function (d) {
      var pontos = {}, casados = {};
      unicos.forEach(function (t) {
        var s = 0;
        CAMPOS.forEach(function (c) {
          var campo = d.campos[c.nome];
          var f = campo.tf[t] || 0;
          if (!f) return;
          var idfv = indice.idf[t] || 0;
          var denom = f + K1 * (1 - B + B * (campo.len / (indice.media || 1)));
          s += c.peso * idfv * (f * (K1 + 1)) / (denom || 1);
        });
        if (s > 0) casados[t] = s;
        pontos[t] = s;
      });
      var soma = 0;
      Object.keys(pontos).forEach(function (t) { soma += pontos[t]; });
      var acertos = primarios.filter(function (t) { return casados[t]; }).length;
      var cobertura = base ? acertos / base : 0;
      var multiplicadorTela = opcoes.tela && d.artigo.tela === opcoes.tela ? 1.12 : 1;
      var porCobertura = Math.pow(Math.max(cobertura, 0.15), 1.1);
      var score = soma * (0.6 + 0.8 * porCobertura) * multiplicadorTela;
      return { id: d.artigo.id, artigo: d.artigo, score: score, cobertura: cobertura, casados: casados };
    }).filter(function (r) { return r.score > 0; });

    resultados.sort(function (a, b) {
      if (Math.abs(b.score - a.score) > 0.0001) return b.score - a.score;
      return (a.artigo.titulo || "").localeCompare(b.artigo.titulo || "");
    });

    var top = resultados[0];
    var nivel = "nada";
    if (top) {
      if (top.score >= 12 && top.cobertura >= 0.34) nivel = "bom";
      else if (top.score >= 8) nivel = "talvez";
    }
    var corte = nivel === "bom" ? Math.max(6, top.score * 0.15) : 8;
    var lista = nivel === "nada" ? [] : resultados.filter(function (r) { return r.score >= corte; }).slice(0, 4);
    lista.forEach(function (r) { r.trecho = trechoDoArtigo(r.artigo, r.casados, q); });
    return {
      nivel: nivel,
      resultados: lista,
      tokens: top ? Object.keys(top.casados) : [],
      cobertura: top ? top.cobertura : 0,
      ignorados: consulta.ignorados
    };
  }

  /* para a tela pintar o trecho: devolve pedaços do texto com a marca de acerto */
  function formasDaConsulta(q) {
    var palavras = normalizar(q).split(" ").filter(Boolean);
    var formas = [];
    palavras.forEach(function (p) {
      if (STOP[p] || NEG[p]) return;
      formas.push({
        n: p,
        s: stem(p),
        c: CONCEITO_SIMPLES[p] || CONCEITO_SIMPLES[stem(p)] || null
      });
    });
    return formas;
  }

  function partesDestacadas(texto, q) {
    var formas = formasDaConsulta(q);
    if (!formas.length) return [{ t: texto, hit: false }];
    var pedacos = [];
    var palavras = String(texto || "").split(/(\s+)/);
    palavras.forEach(function (pedaco) {
      if (!pedaco) return;
      var n = normalizar(pedaco);
      var hit = false;
      if (n) {
        var s = stem(n);
        var c = CONCEITO_SIMPLES[n] || CONCEITO_SIMPLES[s] || null;
        for (var i = 0; i < formas.length; i++) {
          var f = formas[i];
          if (f.n === n || f.s === s || (f.c && c && f.c === c)) { hit = true; break; }
        }
      }
      var ultimo = pedacos[pedacos.length - 1];
      if (ultimo && ultimo.hit === hit) ultimo.t += pedaco;
      else pedacos.push({ t: pedaco, hit: hit });
    });
    return pedacos;
  }

  return {
    normalizar: normalizar,
    stem: stem,
    buscar: buscarGuiado,
    indexar: indexar,
    formasDaConsulta: formasDaConsulta,
    partesDestacadas: partesDestacadas
  };
});
