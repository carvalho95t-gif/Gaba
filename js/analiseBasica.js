/* Gaba — agregação básica das correções para painéis de turma, aluno e descritor.
   Trabalha sobre os mesmos dados que analise.js, sem criar tabela nova. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaBasica = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function rd(v, d) { var f = Math.pow(10, d || 1); return Math.round(v * f) / f; }

  function respostas(r) {
    var b = r.respostas_banco;
    if (Array.isArray(b) && b.length) return b;
    return Array.isArray(r.respostas) ? r.respostas : [];
  }

  function filtrar(prova, correcoes, turmaId) {
    var id = String((prova && prova.id) || "");
    return (correcoes || []).filter(function (r) {
      if (!r) return false;
      if (id && r.prova_id != null && String(r.prova_id) !== id) return false;
      if (turmaId && String(r.turma_id || "") !== String(turmaId)) return false;
      return respostas(r).length > 0;
    });
  }

  function mediana(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function desvio(arr, media) {
    if (arr.length < 2) return 0;
    var soma = arr.reduce(function (s, v) { return s + (v - media) * (v - media); }, 0);
    return Math.sqrt(soma / arr.length);
  }

  function resumoTurma(prova, correcoes, turmaId) {
    var folhas = filtrar(prova, correcoes, turmaId);
    var notas = folhas.map(function (r) { return num(r.nota); });
    var media = notas.length ? rd(notas.reduce(function (a, b) { return a + b; }, 0) / notas.length, 1) : 0;
    var med = rd(mediana(notas), 1);
    var dp = rd(desvio(notas, media), 1);
    var max = notas.length ? rd(Math.max.apply(null, notas), 1) : 0;
    var min = notas.length ? rd(Math.min.apply(null, notas), 1) : 0;
    var aprovados = notas.filter(function (n) { return n >= 6; }).length;
    var faixas = [0, 0, 0, 0, 0];
    notas.forEach(function (n) {
      var i = n >= 10 ? 4 : Math.floor(n / 2);
      if (i < 0) i = 0;
      faixas[i]++;
    });
    return {
      alunos: folhas.length, media: media, mediana: med, desvio: dp,
      max: max, min: min, aprovados: aprovados,
      taxaAprovacao: folhas.length ? rd(aprovados / folhas.length * 100, 1) : 0,
      faixas: faixas, faixaRotulos: ["0-2", "2-4", "4-6", "6-8", "8-10"]
    };
  }

  function ranking(prova, correcoes, turmaId, alunos) {
    var folhas = filtrar(prova, correcoes, turmaId);
    var porAluno = new Map();
    folhas.forEach(function (r) {
      var chave = String(r.aluno_id || r.aluno_numero || r.aluno_nome || "?");
      if (!porAluno.has(chave) || String(r.created_at || "") > String(porAluno.get(chave).created_at || "")) {
        porAluno.set(chave, r);
      }
    });
    var lista = Array.from(porAluno.values()).map(function (r) {
      var al = (alunos || []).filter(function (a) { return String(a.id) === String(r.aluno_id); })[0];
      var total = r.total_questoes || respostas(r).length || 0;
      return {
        aluno_id: r.aluno_id || "", nome: r.aluno_nome || (al ? al.nome : ""),
        numero: r.aluno_numero || (al ? al.numero : 0),
        nota: num(r.nota), acertos: num(r.acertos), total: total,
        branco: num(r.branco), respostas: respostas(r)
      };
    }).sort(function (a, b) { return b.nota - a.nota || (a.nome || "").localeCompare(b.nome || ""); });
    lista.forEach(function (a, i) { a.posicao = i + 1; });
    return lista;
  }

  function perfilAluno(prova, rankItem) {
    var questoes = (prova && prova.questoes) || [];
    var gabarito = (prova && prova.gabarito) || [];
    var resp = rankItem.respostas || [];
    var porDescritor = new Map();
    questoes.forEach(function (q, i) {
      var d = q.descritor || "";
      if (!d) return;
      if (!porDescritor.has(d)) porDescritor.set(d, { descritor: d, acertos: 0, total: 0 });
      porDescritor.get(d).total++;
      var correto = String(q.gabarito || gabarito[i] || "").toUpperCase().charAt(0);
      var marcou = String(resp[i] || "").toUpperCase().charAt(0);
      if (correto && marcou === correto) porDescritor.get(d).acertos++;
    });
    return Array.from(porDescritor.values()).map(function (o) {
      o.taxa = o.total ? rd(o.acertos / o.total * 100, 0) : 0;
      o.status = o.taxa >= 70 ? "dominado" : o.taxa >= 40 ? "parcial" : "fragil";
      return o;
    }).sort(function (a, b) { return b.taxa - a.taxa; });
  }

  function taxaPorDescritor(prova, correcoes, turmaId, catalogo) {
    var folhas = filtrar(prova, correcoes, turmaId);
    var questoes = (prova && prova.questoes) || [];
    var gabarito = (prova && prova.gabarito) || [];
    var acc = new Map();
    folhas.forEach(function (r) {
      var resp = respostas(r);
      questoes.forEach(function (q, i) {
        var d = q.descritor || "";
        if (!d) return;
        if (!acc.has(d)) acc.set(d, { descritor: d, acertos: 0, total: 0 });
        acc.get(d).total++;
        var correto = String(q.gabarito || gabarito[i] || "").toUpperCase().charAt(0);
        var marcou = String(resp[i] || "").toUpperCase().charAt(0);
        if (correto && marcou === correto) acc.get(d).acertos++;
      });
    });
    var cat = catalogo || [];
    return Array.from(acc.values()).map(function (o) {
      o.taxa = o.total ? rd(o.acertos / o.total * 100, 0) : 0;
      o.status = o.taxa >= 70 ? "dominado" : o.taxa >= 40 ? "parcial" : "fragil";
      var info = cat.filter(function (c) { return c.codigo === o.descritor; })[0];
      o.descricao = info ? info.descricao || "" : "";
      return o;
    }).sort(function (a, b) { return b.taxa - a.taxa; });
  }

  /* Fronteira do painel: não altera registros, notas nem as APIs legadas acima. */
  function listaPainel(v) { return Array.isArray(v) ? v : []; }
  function textoPainel(v) { return v == null ? "" : String(v); }
  function numeroPainel(v) {
    if (typeof v !== "number" && typeof v !== "string") return null;
    if (typeof v === "string" && !v.trim()) return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function marcaPainel(v) { return textoPainel(v).trim().toUpperCase(); }
  function letraPainel(v) {
    var l = marcaPainel(v);
    return /^[A-E]$/.test(l) ? l : "";
  }
  function dataPainel(r) {
    var n = Date.parse(textoPainel(r.created_at));
    return Number.isFinite(n) ? n : -Infinity;
  }
  function nomeChave(v) { return textoPainel(v).trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR"); }
  function numeroChave(v) {
    var n = numeroPainel(v);
    return n === null ? textoPainel(v).trim() : String(n);
  }
  function chaveIdentidade(tipo, turma, valor) { return JSON.stringify([tipo, turma, valor]); }
  function mesmaLeitura(a, b) {
    var qr = textoPainel(a.qr_texto || a.qr_payload);
    var codigo = textoPainel(a.codigo);
    return Boolean(qr && codigo && dataPainel(a) !== -Infinity &&
      qr === textoPainel(b.qr_texto || b.qr_payload) && codigo === textoPainel(b.codigo) &&
      dataPainel(a) === dataPainel(b));
  }

  function montarPainel(prova, correcoes, turmas, alunos, versoes, catalogo) {
    prova = prova || {};
    var pid = textoPainel(prova.id);
    var questoes = listaPainel(prova.questoes).map(function (q, i) {
      q = q || {};
      var alternativas = [], letras = new Set();
      listaPainel(q.alternativas).forEach(function (a) {
        a = a || {};
        var l = letraPainel(a.letra);
        if (!l || letras.has(l)) return;
        letras.add(l);
        alternativas.push({ letra: l, texto: textoPainel(a.texto) });
      });
      var gab = letraPainel(q.gabarito) || letraPainel(listaPainel(prova.gabarito)[i]);
      if (letras.size && !letras.has(gab)) gab = "";
      var numero = numeroPainel(q.numero), peso = numeroPainel(q.peso);
      return { indice: i, numero: Number.isInteger(numero) && numero > 0 ? numero : i + 1,
        enunciado: textoPainel(q.enunciado), comando: textoPainel(q.comando), alternativas: alternativas,
        gabarito: gab, peso: peso !== null && peso > 0 ? peso : null,
        descritor: textoPainel(q.descritor).trim(), bncc: textoPainel(q.habilidade_bncc || q.bncc),
        parte: textoPainel(q.parte).trim() };
    });
    var porTurma = new Map(), porAluno = new Map(), roster = new Set(), aliases = new Map();
    function incluirTurma(id, nome) {
      id = textoPainel(id);
      if (id && !porTurma.has(id)) porTurma.set(id, { id: id, nome: textoPainel(nome) || "Turma " + id });
    }
    listaPainel(turmas).forEach(function (t) { if (t) incluirTurma(t.id, t.nome); });
    function incluirAlias(a) {
      [["numero", numeroChave(a.numero)], ["nome", nomeChave(a.nome)]].forEach(function (par) {
        if (!a.turma_id || !par[1]) return;
        var k = chaveIdentidade(par[0], a.turma_id, par[1]);
        if (!aliases.has(k)) aliases.set(k, a.id);
        else if (aliases.get(k) !== a.id) aliases.set(k, null); // homônimos não são associados por palpite
      });
    }
    listaPainel(alunos).forEach(function (a) {
      if (!a || a.id == null || textoPainel(a.id) === "") return;
      var id = textoPainel(a.id);
      porAluno.set(id, { id: id, nome: textoPainel(a.nome), numero: a.numero == null ? "" : a.numero,
        matricula: textoPainel(a.matricula), turma_id: textoPainel(a.turma_id), correcao: null });
      roster.add(id);
    });
    porAluno.forEach(incluirAlias);
    var registros = listaPainel(correcoes).filter(function (r) {
      return r && textoPainel(r.prova_id) === pid;
    });
    function alunoDaCorrecao(r, id) {
      return { id: id, nome: textoPainel(r.aluno_nome || r.nome),
        numero: r.aluno_numero != null ? r.aluno_numero : (r.numero == null ? "" : r.numero),
        matricula: textoPainel(r.matricula), turma_id: textoPainel(r.turma_id), correcao: null };
    }
    // Indexa primeiro IDs explícitos para associar também cópias antigas do banco sem aluno_id.
    registros.forEach(function (r) {
      var id = textoPainel(r.aluno_id);
      if (!id) return;
      if (!porAluno.has(id)) porAluno.set(id, alunoDaCorrecao(r, id));
      var alias = alunoDaCorrecao(r, id);
      if (!alias.turma_id) alias.turma_id = porAluno.get(id).turma_id;
      incluirAlias(alias);
    });
    var historico = new Map();
    registros.forEach(function (r, i) {
      var id = textoPainel(r.aluno_id), turma = textoPainel(r.turma_id);
      var numero = numeroChave(r.aluno_numero != null ? r.aluno_numero : r.numero);
      var nome = nomeChave(r.aluno_nome || r.nome);
      if (!id && turma) {
        id = (numero && aliases.get(chaveIdentidade("numero", turma, numero))) ||
          (nome && aliases.get(chaveIdentidade("nome", turma, nome))) || "";
      }
      if (!id) {
        var k = numero && turma ? chaveIdentidade("numero", turma, numero) :
          nome && turma ? chaveIdentidade("nome", turma, nome) :
          chaveIdentidade("registro", turma, textoPainel(r.id) || textoPainel(r.qr_texto || r.qr_payload) || String(i));
        id = "__correcao__:" + k;
        if (roster.has(id)) id += ":leitura";
      }
      if (!porAluno.has(id)) {
        var a = alunoDaCorrecao(r, id);
        porAluno.set(id, a);
        incluirAlias(a);
      }
      if (!historico.has(id)) historico.set(id, []);
      historico.get(id).push(r);
    });
    var mapas = new Map();
    listaPainel(versoes).forEach(function (v) {
      if (v && textoPainel(v.codigo)) mapas.set(textoPainel(v.codigo), listaPainel(v.ordem));
    });
    historico.forEach(function (rows, id) {
      var r = rows.reduce(function (anterior, atual) {
        return !anterior || dataPainel(atual) >= dataPainel(anterior) ? atual : anterior;
      }, null);
      var a = porAluno.get(id);
      if (!roster.has(id)) {
        var recente = alunoDaCorrecao(r, id);
        ["nome", "numero", "matricula", "turma_id"].forEach(function (k) {
          if (recente[k] !== "") a[k] = recente[k];
        });
      }
      var leitura = rows.filter(function (row) { return row === r || mesmaLeitura(r, row); });
      var fonteBase = leitura.filter(function (row) {
        return Array.isArray(row.respostas_banco) && row.respostas_banco.length;
      })[0];
      var fonteLocal = leitura.filter(function (row) {
        return Array.isArray(row.respostas) && row.respostas.length;
      })[0];
      var base = fonteBase ? fonteBase.respostas_banco : fonteLocal ? fonteLocal.respostas : [];
      // Não completa folhas parciais: ausência de uma posição não é marcação em branco.
      var resp = base.slice(0, questoes.length).map(marcaPainel);
      var confusao = new Set();
      leitura.forEach(function (row) {
        listaPainel(row.confusao).forEach(function (v) {
          var n = numeroPainel(v);
          if (Number.isInteger(n) && n > 0 && n <= questoes.length) confusao.add(n);
        });
      });
      var ordem = mapas.get(textoPainel(r.codigo)), revisar = new Set();
      confusao.forEach(function (n) {
        var pos = ordem ? numeroPainel(ordem[n - 1]) : null;
        if (Number.isInteger(pos) && pos >= 0 && pos < questoes.length) revisar.add(pos);
      });
      var nota = numeroPainel(r.nota);
      if (nota === null || nota < 0 || nota > 10) {
        leitura.some(function (row) {
          var valor = numeroPainel(row.nota);
          if (valor === null || valor < 0 || valor > 10) return false;
          nota = valor;
          return true;
        });
      }
      var acertos = 0, branco = 0;
      resp.forEach(function (l, i) {
        if (!l) branco++;
        if (questoes[i].gabarito && l === questoes[i].gabarito) acertos++;
      });
      a.correcao = { nota: nota !== null && nota >= 0 && nota <= 10 ? nota : null,
        acertos: acertos, branco: branco, respostas: resp, confusao: Array.from(confusao),
        revisarBase: Array.from(revisar), total: questoes.length };
    });
    porAluno.forEach(function (a) { incluirTurma(a.turma_id); });
    var descricoes = {};
    var usados = new Set(questoes.map(function (q) { return q.descritor; }).filter(Boolean));
    listaPainel(catalogo).forEach(function (c) {
      if (!c) return;
      var codigo = textoPainel(c.codigo).trim();
      if (usados.has(codigo)) Object.defineProperty(descricoes, codigo,
        { value: textoPainel(c.descricao), enumerable: true, configurable: true, writable: true });
    });
    return { prova: { id: pid, titulo: textoPainel(prova.titulo || prova.nome), questoes: questoes },
      turmas: Array.from(porTurma.values()).sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); }),
      alunos: Array.from(porAluno.values()).sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); }),
      descricoes: descricoes, analises: [] };
  }

  function analisarPainel(modelo, turmaId) {
    turmaId = textoPainel(turmaId);
    var alunos = modelo.alunos.filter(function (a) { return !turmaId || a.turma_id === turmaId; });
    var corrigidos = alunos.filter(function (a) { return a.correcao !== null; });
    var notas = corrigidos.map(function (a) { return a.correcao.nota; }).filter(function (n) { return n !== null; });
    var faixas = [0, 0, 0, 0, 0];
    notas.forEach(function (n) { faixas[Math.min(4, Math.floor(n / 2))]++; });
    var prova = modelo.prova;
    var folhas = corrigidos.filter(function (a) { return a.correcao.respostas.length > 0; }).map(function (a) {
      return { prova_id: prova.id, aluno_id: a.id, turma_id: a.turma_id, nota: a.correcao.nota,
        total_questoes: a.correcao.respostas.length,
        respostas: a.correcao.respostas.map(function (l) { return letraPainel(l) || (l ? "?" : ""); }) };
    });
    // Resolve em tempo de chamada, inclusive quando analise.js é carregado depois no browser.
    var motor = root.GabaAnalise || (root.window && root.window.GabaAnalise);
    if (!motor && typeof module === "object" && module.exports) motor = require("./analise");
    var calculados = motor && typeof motor.itens === "function" ? motor.itens(prova, folhas) : [];
    var notadas = folhas.filter(function (r) { return r.nota !== null; });
    var discriminados = notadas.length === folhas.length ? calculados :
      motor && typeof motor.itens === "function" ? motor.itens(prova, notadas) : [];
    var itens = prova.questoes.map(function (q) {
      var contagem = {}, acertos = 0, branco = 0, outras = 0, participantes = 0;
      q.alternativas.forEach(function (a) { contagem[a.letra] = 0; });
      corrigidos.forEach(function (a) {
        if (!Object.prototype.hasOwnProperty.call(a.correcao.respostas, q.indice)) return;
        participantes++;
        var l = a.correcao.respostas[q.indice];
        if (!l) branco++;
        else if (Object.prototype.hasOwnProperty.call(contagem, l)) contagem[l]++;
        else outras++;
        if (q.gabarito && l === q.gabarito) acertos++;
      });
      var it = calculados[q.indice];
      if (it && it.participantes === participantes) {
        q.alternativas.forEach(function (a) { contagem[a.letra] = it.contagem[a.letra] || 0; });
        acertos = it.acertos;
        branco = it.branco;
      }
      var disc = discriminados[q.indice];
      var completas = notadas.every(function (r) { return Object.prototype.hasOwnProperty.call(r.respostas, q.indice); });
      return Object.assign({}, q, { contagem: contagem, acertos: acertos, branco: branco, outras: outras,
        participantes: participantes, taxa: participantes && q.gabarito ? acertos / participantes * 100 : null,
        discriminacao: q.gabarito && completas && disc ? disc.discriminacao : null });
    });
    var grupos = new Map();
    itens.forEach(function (q) {
      var codigo = q.descritor || "__sem_descritor__";
      if (!grupos.has(codigo)) grupos.set(codigo, { codigo: codigo,
        descricao: Object.prototype.hasOwnProperty.call(modelo.descricoes, codigo) ? modelo.descricoes[codigo] :
          q.descritor ? "Habilidade sem descrição no catálogo" : "Questões sem descritor informado",
        questoes: [], acertos: 0, total: 0, partes: [] });
      var d = grupos.get(codigo);
      d.questoes.push(q);
      if (q.parte && d.partes.indexOf(q.parte) < 0) d.partes.push(q.parte);
      if (q.gabarito) { d.acertos += q.acertos; d.total += q.participantes; }
    });
    var descritores = Array.from(grupos.values()).map(function (d) {
      return Object.assign({}, d, { parte: d.partes.join(" / "), taxa: d.total ? d.acertos / d.total * 100 : null });
    }).sort(function (a, b) {
      return (a.taxa === null ? Infinity : a.taxa) - (b.taxa === null ? Infinity : b.taxa) || a.codigo.localeCompare(b.codigo);
    });
    return { alunos: alunos, corrigidos: corrigidos, notas: notas,
      revisao: corrigidos.filter(function (a) { return a.correcao.confusao.length > 0; }).length,
      semLeitura: alunos.length - corrigidos.length, faixas: faixas, itens: itens, descritores: descritores,
      media: notas.length ? notas.reduce(function (s, n) { return s + n; }, 0) / notas.length : null };
  }

  return {
    filtrar: filtrar,
    resumoTurma: resumoTurma,
    ranking: ranking,
    perfilAluno: perfilAluno,
    taxaPorDescritor: taxaPorDescritor,
    montarPainel: montarPainel,
    analisarPainel: analisarPainel
  };
});
