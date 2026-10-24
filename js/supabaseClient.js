/* global supabase */
(function (global) {
  "use strict";

  var STORAGE = {
    url: "gaba_supabase_url",
    key: "gaba_supabase_anon_key",
    keyAlt: "gaba_supabase_key",
    desligada: "gaba_supabase_desligada",
    professorId: "gaba_professor_id",
    professorNome: "gaba_professor_nome",
    professorEmail: "gaba_professor_email"
  };

  /* a dupla do pacote publico; vazia enquanto ninguem preencher js/credencial.js */
  function embutida() {
    var p = global.GabaCredencial || {};
    return { url: enderecoBase(p.url), key: String(p.key || "").trim() };
  }

  /* o painel do Supabase mostra a url da API com /rest/v1; o cliente quer so a raiz */
  function enderecoBase(texto) {
    var t = String(texto || "").trim();
    if (!t) return "";
    if (!/^https?:\/\//i.test(t)) t = "https://" + t;
    try {
      return new URL(t).origin;
    } catch (err) {
      return String(texto).trim();
    }
  }

  function chavePerfil(base) {
    return global.GabaSync ? global.GabaSync.chaveLocal(base) : base + ":sem-conta";
  }

  function readConfig() {
    var digitadaUrl = enderecoBase(localStorage.getItem(STORAGE.url));
    var digitadaKey = (localStorage.getItem(STORAGE.key) || localStorage.getItem(STORAGE.keyAlt) || "").trim();
    var doPacote = localStorage.getItem(STORAGE.desligada) === "1" ? { url: "", key: "" } : embutida();
    var url = digitadaUrl || doPacote.url;
    var key = digitadaKey || doPacote.key;
    return {
      url: url,
      key: key,
      /* o aparelho nao digitou nada e o que conecta vem do pacote: a tela de Ajustes
         diz "embutida" em vez de "guardada neste aparelho" */
      doPacote: Boolean(url && key && !digitadaUrl && !digitadaKey),
      professorId: localStorage.getItem(chavePerfil(STORAGE.professorId)) || "",
      professorNome: localStorage.getItem(chavePerfil(STORAGE.professorNome)) || "",
      professorEmail: localStorage.getItem(chavePerfil(STORAGE.professorEmail)) || ""
    };
  }

  function saveConfig(url, key) {
    var u = enderecoBase(url);
    var k = String(key || "").trim();
    localStorage.setItem(STORAGE.url, u);
    localStorage.setItem(STORAGE.key, k);
    localStorage.setItem(STORAGE.keyAlt, k);
    /* com credencial dentro do pacote, caixas vazias nao querem dizer "sem banco" e sim
       "este aparelho nao sobe nada": sem esta marca o app se reconectaria sozinho */
    if (!u && !k) localStorage.setItem(STORAGE.desligada, "1");
    else localStorage.removeItem(STORAGE.desligada);
    global.GabaDB.client = null;
  }

  function setProfessor(id, nome, email) {
    if (id) localStorage.setItem(chavePerfil(STORAGE.professorId), id);
    else localStorage.removeItem(chavePerfil(STORAGE.professorId));
    if (nome) localStorage.setItem(chavePerfil(STORAGE.professorNome), nome);
    else localStorage.removeItem(chavePerfil(STORAGE.professorNome));
    if (email) localStorage.setItem(chavePerfil(STORAGE.professorEmail), email);
    else localStorage.removeItem(chavePerfil(STORAGE.professorEmail));
  }

  function getClient() {
    var cfg = readConfig();
    if (!cfg.url || !cfg.key) return null;
    if (typeof supabase === "undefined") return null;
    if (global.GabaDB.client) return global.GabaDB.client;
    global.GabaDB.client = supabase.createClient(cfg.url, cfg.key);
    return global.GabaDB.client;
  }

  function isConfigured() {
    var cfg = readConfig();
    return Boolean(cfg.url && cfg.key);
  }

  /* id de .docx neste aparelho e "docx-..."; sem essa checagem o banco devolve erro de uuid */
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function eUuid(v) {
    return UUID.test(String(v || ""));
  }

  function erroProvaLocal(provaId) {
    return new Error("A prova \"" + String(provaId) + "\" ainda nao esta salva no banco. " +
      "As leituras e as versoes ficam neste aparelho ate voce salvar a prova.");
  }

  async function upsertProfessor(nome, email) {
    var chave = chavePerfil(STORAGE.professorId);
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    var { data, error } = await client
      .from("professores")
      .upsert({ nome: nome, email: email }, { onConflict: "email" })
      .select()
      .single();
    if (error) throw error;
    if (chave !== chavePerfil(STORAGE.professorId)) throw new Error("A conta mudou durante o login.");
    setProfessor(data.id, data.nome, data.email);
    return data;
  }

  /* ---------------------------------------------------------- login do professor
     A conexao com o banco se faz uma vez so no aparelho. O que o professor digita
     todo dia é e-mail e senha: o token fica no armazenamento do proprio supabase-js,
     entao abrir o app de novo ja vem com a sessao montada, sem perguntar de novo. */

  function authDisponivel() {
    var client = getClient();
    return client ? client.auth : null;
  }

  async function usuario() {
    var a = authDisponivel();
    if (!a) return null;
    try {
      var { data } = await a.getSession();
      var u = data && data.session && data.session.user;
      if (!u || !u.id) return null;
      return { id: u.id, email: u.email || "", nome: (u.user_metadata || {}).nome || "" };
    } catch (err) {
      return null;
    }
  }

  /* a linha de professores e o que da nome ao login; falar aqui nao desfaz o login,
     porque quem segura o aparelho a partir de agora e a sessao do auth */
  async function vincularProfessor(user) {
    var chave = chavePerfil(STORAGE.professorId);
    var email = String(user.email || "").trim().toLowerCase();
    if (!email) return null;
    var nome = (user.user_metadata || {}).nome || readConfig().professorNome || email.split("@")[0];
    try {
      return await upsertProfessor(nome, email);
    } catch (err) {
      if (chave === chavePerfil(STORAGE.professorId)) setProfessor(readConfig().professorId, nome, email);
      return null;
    }
  }

  async function entrar(email, senha) {
    var a = authDisponivel();
    if (!a) throw new Error("Supabase não configurado.");
    var e = String(email || "").trim().toLowerCase();
    if (!e || !senha) throw new Error("Escreva o e-mail e a senha.");
    var { data, error } = await a.signInWithPassword({ email: e, password: String(senha) });
    if (error) throw error;
    await vincularProfessor(data.user);
    return data.user;
  }

  async function criarConta(nome, email, senha) {
    var a = authDisponivel();
    if (!a) throw new Error("Supabase não configurado.");
    var e = String(email || "").trim().toLowerCase();
    var s = String(senha || "");
    if (!String(nome || "").trim()) throw new Error("Diga o seu nome.");
    if (!e) throw new Error("Escreva o seu e-mail.");
    if (s.length < 6) throw new Error("A senha precisa de pelo menos 6 caracteres.");
    var { data, error } = await a.signUp({
      email: e, password: s, options: { data: { nome: String(nome).trim() } }
    });
    if (error) throw error;
    /* sem sessao é o projeto pedindo a confirmação do e-mail: a conta existe, ainda nao abre */
    if (!data.session) return { user: data.user, confirmado: false };
    await vincularProfessor(data.user);
    return { user: data.user, confirmado: true };
  }

  async function sair() {
    var a = authDisponivel();
    if (a) {
      var { error } = await a.signOut();
      if (error) throw error;
    }
    setProfessor("", "", "");
  }

  async function fetchCorrecoes() {
    var client = getClient();
    if (!client) return [];
    // sem embed: correcoes nao tem foreign key de proposito; nome e numero do aluno ja vao gravados na linha
    var { data, error } = await client
      .from("correcoes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    return data || [];
  }

  async function insertCorrecao(row, dono) {
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    if (!eUuid(row.prova_id)) throw erroProvaLocal(row.prova_id);
    var payload = {
      aluno_id: eUuid(row.aluno_id) ? row.aluno_id : null,
      turma_id: eUuid(row.turma_id) ? row.turma_id : null,
      prova_id: row.prova_id,
      aluno_nome: row.aluno_nome || null,
      aluno_numero: row.aluno_numero || null,
      versao: row.versao || null,
      codigo: row.codigo || null,
      qr_payload: row.qr_texto || row.qr_payload || null,
      engine: row.engine || null,
      respostas: row.respostas_banco || row.respostas || [],
      respostas_originais: row.respostas || [],
      confusao: row.confusao || [],
      branco: row.branco || 0,
      acertos: row.acertos || 0,
      total_questoes: row.total_questoes || 0,
      nota: row.nota || 0
    };
    if (dono) payload.dono = dono;
    var query = client.from("correcoes");
    var outcome = payload.qr_payload
      ? await query.upsert(payload, { onConflict: "prova_id,qr_payload" }).select().single()
      : await query.insert(payload).select().single();
    var { data, error } = outcome;
    if (error) throw error;
    return data;
  }

  /* o lote que foi para a impressora: qualquer aparelho pode montar as mesmas versões */
  async function upsertProvaVersoes(provaId, itens, meta) {
    var verificar = global.GabaSync.verificadorConta();
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    if (!provaId) throw new Error("Falta o id da prova.");
    if (!eUuid(provaId)) throw erroProvaLocal(provaId);
    var m = meta || {};
    var rows = (itens || []).map(function (it) {
      var v = it.versao || {};
      var a = it.aluno || {};
      return {
        prova_id: provaId,
        turma_id: eUuid(a.turma_id || m.turma_id) ? (a.turma_id || m.turma_id) : null,
        aluno_id: eUuid(a.id) ? a.id : null,
        aluno_numero: a.numero || null,
        aluno_nome: a.nome || null,
        lote_id: m.lote_id || m.em || "lote",
        tipo: v.versao || 1,
        codigo: v.codigo || "",
        ordem: v.ordem || [],
        alt_map: v.altMap || [],
        gabarito: v.gabarito || [],
        impresso_em: m.em || new Date().toISOString()
      };
    });
    verificar();
    var apagado = await client.from("prova_versoes").delete().eq("prova_id", provaId);
    verificar();
    if (apagado.error) throw apagado.error;
    for (var i = 0; i < rows.length; i += 500) {
      verificar();
      var inserido = await client.from("prova_versoes").insert(rows.slice(i, i + 500));
      verificar();
      if (inserido.error) throw inserido.error;
    }
    return rows.length;
  }

  async function listProvaVersoes(provaId) {
    var client = getClient();
    if (!client || !eUuid(provaId)) return [];
    var { data, error } = await client
      .from("prova_versoes")
      .select("*")
      .eq("prova_id", provaId)
      .order("impresso_em", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data || []).map(function (r) {
      var ordem = jsonOuValor(r.ordem || []);
      return {
        aluno: { id: r.aluno_id, numero: r.aluno_numero, nome: r.aluno_nome, turma_id: r.turma_id },
        versao: {
          versao: r.tipo, codigo: r.codigo, ordem: ordem, total: ordem.length,
          altMap: jsonOuValor(r.alt_map || []), gabarito: jsonOuValor(r.gabarito || [])
        },
        lote_id: r.lote_id,
        impresso_em: r.impresso_em
      };
    });
  }

  async function lookupAluno(alunoId, numeroOuMatricula) {
    var client = getClient();
    if (!client) return null;
    if (alunoId && eUuid(alunoId)) {
      var byId = await client.from("alunos").select("*").eq("id", alunoId).maybeSingle();
      if (byId.error) throw byId.error;
      if (byId.data) return byId.data;
    }
    if (numeroOuMatricula != null && numeroOuMatricula !== "") {
      var n = Number(numeroOuMatricula);
      if (!Number.isNaN(n)) {
        var byNum = await client.from("alunos").select("*").eq("numero", n).limit(1);
        if (!byNum.error && byNum.data && byNum.data[0]) return byNum.data[0];
      }
      var byMat = await client.from("alunos").select("*").eq("matricula", String(numeroOuMatricula)).limit(1);
      if (byMat.error) throw byMat.error;
      return (byMat.data && byMat.data[0]) || null;
    }
    return null;
  }

  async function lookupProva(provaId) {
    var client = getClient();
    if (!client || !eUuid(provaId)) return null;
    var { data, error } = await client.from("provas").select("*").eq("id", provaId).maybeSingle();
    if (error) throw error;
    return data;
  }

  function jsonOuValor(v) {
    if (typeof v !== "string") return v;
    var t = v.trim();
    if (!t || (t.charAt(0) !== "[" && t.charAt(0) !== "{")) return v;
    try {
      return JSON.parse(t);
    } catch (err) {
      return [];
    }
  }

  function normalizarProva(row) {
    if (!row) return row;
    var p = Object.assign({}, row);
    p.questoes = jsonOuValor(p.questoes || []);
    p.gabarito = jsonOuValor(p.gabarito || []);
    p.pesos = jsonOuValor(p.pesos || []);
    p.tipos = jsonOuValor(p.tipos || []);
    p.descritores = jsonOuValor(p.descritores || []);
    p.modo = p.modo || "fixa";
    p.num_tipos = Math.max(1, parseInt(p.num_tipos, 10) || 1);
    p.alternativas = Math.max(2, Math.min(5, parseInt(p.alternativas, 10) || 5));
    p.embaralharAlternativas = p.embaralhar_alternativas !== false;
    p.embaralharQuestoes = p.embaralhar_questoes !== false;
    p.salt = p.salt || undefined;
    p.questoes = p.questoes.map(function (q, i) {
      var peso = Number(q.peso);
      return Object.assign({}, q, {
        numero: q.numero || i + 1,
        peso: peso > 0 ? peso : (Number((p.pesos || [])[i]) > 0 ? Number(p.pesos[i]) : 1),
        alternativas: jsonOuValor(q.alternativas || [])
      });
    });
    return p;
  }

  function paraData(v) {
    var t = String(v || "").trim();
    if (!t) return null;
    var br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return br[3] + "-" + ("0" + br[2]).slice(-2) + "-" + ("0" + br[1]).slice(-2);
    var d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  /* o objeto prova do app -> as colunas de public.provas */
  function provaParaLinha(prova) {
    var questoes = (prova.questoes || []).map(function (q, i) {
      return Object.assign({}, q, {
        numero: q.numero || i + 1,
        peso: Number(q.peso) > 0 ? Number(q.peso) : 1,
        alternativas: (q.alternativas || []).slice(0, 5)
      });
    });
    var total = questoes.length || Number(prova.quantidade_questoes) || 0;
    if (!total) throw new Error("Nada para salvar: esta prova nao tem questoes.");
    if (total > 90) throw new Error("A prova tem " + total + " questoes e o caderno suporta ate 90.");
    var gabarito = questoes.length
      ? questoes.map(function (q) { return String(q.gabarito || "").toUpperCase().charAt(0); })
      : (prova.gabarito || []).map(function (g) { return String(g || "").toUpperCase().charAt(0); });
    var alternativas = Math.max(2, Math.min(5, parseInt(prova.alternativas, 10) || 5));
    var numTipos = Math.max(1, Math.min(26, parseInt(prova.num_tipos, 10) || (prova.tipos || []).length || 1));
    return {
      titulo: String(prova.titulo || "Prova").trim().slice(0, 200),
      disciplina: String(prova.disciplina || "Geral").trim().slice(0, 80),
      escola: String(prova.escola || "").trim().slice(0, 120) || null,
      data: paraData(prova.data),
      turma_id: eUuid(prova.turma_id) ? prova.turma_id : null,
      quantidade_questoes: total,
      total_questoes: total,
      alternativas: alternativas,
      gabarito: gabarito,
      questoes: questoes,
      pesos: questoes.map(function (q) { return q.peso; }),
      descritores: questoes.map(function (q) {
        return { descritor: q.descritor || "", habilidade_bncc: q.habilidade_bncc || "" };
      }),
      tipos: prova.tipos || [],
      modo: prova.modo === "turma" || prova.modo === "aluno" ? prova.modo : "fixa",
      num_tipos: numTipos,
      embaralhar_questoes: prova.embaralhar_questoes !== false && prova.embaralharQuestoes !== false,
      embaralhar_alternativas: prova.embaralhar_alternativas !== false && prova.embaralharAlternativas !== false,
      salt: String(prova.salt || "").trim() || null
    };
  }

  async function um(client, tabela, linha, id) {
    var query = id
      ? client.from(tabela).update(linha).eq("id", id)
      : client.from(tabela).insert(linha);
    var { data, error } = await query.select().single();
    if (error) throw error;
    return data;
  }

  async function excluir(client, tabela, id) {
    if (!eUuid(id)) throw new Error("Este registro ainda nao esta no banco, entao nao ha o que apagar aqui.");
    var { error } = await client.from(tabela).delete().eq("id", id);
    if (error) throw error;
  }

  async function listEscolas() {
    var client = getClient();
    if (!client) return [];
    var { data, error } = await client.from("escolas").select("*").order("nome");
    if (error) throw error;
    return data || [];
  }

  async function salvarEscola(dados) {
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    var nome = String(dados.nome || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!nome) throw new Error("Dê um nome para a escola.");
    return um(client, "escolas", { nome: nome }, eUuid(dados.id) ? dados.id : null);
  }

  function excluirEscola(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error("Supabase não configurado."));
    return excluir(client, "escolas", id);
  }

  async function salvarTurma(dados) {
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    var nome = String(dados.nome || "").trim();
    if (!nome) throw new Error("Dê um nome para a turma.");
    return um(client, "turmas", {
      nome: nome.slice(0, 120),
      ano: String(dados.ano || "").trim().slice(0, 40) || null,
      escola: String(dados.escola || "").trim().slice(0, 120) || null
    }, eUuid(dados.id) ? dados.id : null);
  }

  function excluirTurma(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error("Supabase não configurado."));
    return excluir(client, "turmas", id);
  }

  async function salvarAluno(dados) {
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    var nome = String(dados.nome || "").trim();
    var numero = parseInt(dados.numero, 10);
    if (!nome) throw new Error("Falta o nome do aluno.");
    if (!eUuid(dados.turma_id)) throw new Error("Escolha a turma deste aluno.");
    if (!(numero > 0)) throw new Error("O número de chamada precisa ser um número maior que zero.");
    var linha = {
      turma_id: dados.turma_id,
      nome: nome.slice(0, 200),
      numero: numero,
      matricula: String(dados.matricula || "").trim().slice(0, 40) || null,
      responsavel: String(dados.responsavel || "").trim().slice(0, 200) || null,
      email_responsavel: String(dados.email_responsavel || "").trim().toLowerCase().slice(0, 200) || null,
      telefone_responsavel: String(dados.telefone_responsavel || "").trim().slice(0, 40) || null
    };
    return um(client, "alunos", linha, eUuid(dados.id) ? dados.id : null);
  }

  function excluirAluno(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error("Supabase não configurado."));
    return excluir(client, "alunos", id);
  }

  /* a lista de chamada inteira de uma vez: o numero de chamada + turma e a chave,
     entao reimportar a mesma planilha corrige os nomes em vez de duplicar a turma */
  async function salvarAlunosEmLote(turmaId, alunos) {
    var verificar = global.GabaSync.verificadorConta();
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    if (!eUuid(turmaId)) throw new Error("Escolha primeiro a turma que vai receber a lista.");
    var linhas = [];
    var problemas = [];
    var vistos = {};
    (alunos || []).forEach(function (a, i) {
      var nome = String(a.nome || "").trim();
      var numero = parseInt(a.numero, 10);
      if (!nome) { problemas.push("Linha " + (i + 1) + " sem nome: ficou de fora."); return; }
      if (!(numero > 0)) { problemas.push('"' + nome + '" sem número de chamada: ficou de fora.'); return; }
      if (vistos[numero]) { problemas.push("Nº " + numero + " se repete na lista: " + nome + " não foi salvo."); return; }
      vistos[numero] = true;
      var tipo = parseInt(a.tipo, 10);
      linhas.push({
        turma_id: turmaId,
        numero: numero,
        nome: nome.slice(0, 200),
        matricula: String(a.matricula || "").trim().slice(0, 40) || null,
        tipo: tipo > 0 && tipo <= 26 ? tipo : null,
        responsavel: String(a.responsavel || "").trim().slice(0, 200) || null,
        email_responsavel: String(a.email_responsavel || "").trim().toLowerCase().slice(0, 200) || null,
        telefone_responsavel: String(a.telefone_responsavel || "").trim().slice(0, 40) || null
      });
    });
    if (!linhas.length) return { gravados: 0, problemas: problemas, alunos: [] };
    var gravados = [];
    for (var i = 0; i < linhas.length; i += 200) {
      var lote = linhas.slice(i, i + 200);
      verificar();
      var resposta = await client.from("alunos").upsert(lote, { onConflict: "turma_id,numero" }).select();
      verificar();
      if (resposta.error && faltaNoBanco(resposta.error, "tipo")) {
        /* o banco do professor ainda pode nao ter rodado a migracao do tipo */
        lote.forEach(function (l) { delete l.tipo; });
        verificar();
        resposta = await client.from("alunos").upsert(lote, { onConflict: "turma_id,numero" }).select();
        verificar();
        problemas.push("O banco ainda não tem a coluna \"tipo\" (rode supabase/schema.sql): o tipo de caderno da planilha não foi guardado.");
      }
      if (resposta.error) throw resposta.error;
      gravados = gravados.concat(resposta.data || []);
    }
    return { gravados: gravados.length, problemas: problemas, alunos: gravados };
  }

  function faltaNoBanco(error, nome) {
    var m = String((error && error.message) || error || "");
    return m.indexOf(nome) >= 0 && /does not exist|PGRST204|42703/i.test(m);
  }

  /* ------------------------------------------- quem saiu da turma, com o motivo

     A tabela e a parte visivel de "ficaram de fora": o professor precisa saber quem e por que,
     mesmo depois de fechar o painel. Ela fica fora de alunos de proposito: a lista de alunos e o
     que vira caderno impresso, e um transferido ali dentro geraria folha em branco para quem nao
     esta mais na sala. O banco do professor pode ainda nao ter a tabela (schema.sql nao rodado):
     aqui isso e um aviso, nao um erro, e a importacao dos alunos continua. */

  async function buscaSaidas(client, turmaId) {
    var out = { dados: [], semTabela: false };
    var query = client.from("saidas").select("*");
    if (turmaId) query = query.eq("turma_id", turmaId);
    var { data, error } = await query.order("numero").limit(2000);
    if (error) {
      if (faltaNoBanco(error, "saidas")) return out;
      throw error;
    }
    out.dados = (data || []).map(function (s) {
      return Object.assign({}, s, { numero: s.numero != null ? s.numero : "" });
    });
    return out;
  }

  async function listSaidas(turmaId) {
    var client = getClient();
    if (!client) return [];
    return (await buscaSaidas(client, turmaId)).dados;
  }

  /* saidas: a lista lida agora; ativos: os alunos que ficaram na turma, para apagar a linha de
     quem voltou; a chave do aluno ativo e o numero ou o nome, entao quem voltou com outro numero
     de chamada tambem sai da lista. */
  async function salvarSaidas(turmaId, opc) {
    var verificar = global.GabaSync.verificadorConta();
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    if (!eUuid(turmaId)) throw new Error("Escolha primeiro a turma que vai receber a lista.");
    var L = global.GabaLista;
    var resultado = { gravadas: 0, apagadas: 0, semTabela: false };
    var novas = {};
    var linhas = [];
    ((opc || {}).saidas || []).forEach(function (s) {
      var chave = L.chaveDeSaida(s);
      if (!chave || novas[chave]) return;
      novas[chave] = true;
      var numero = parseInt(s.numero, 10);
      linhas.push({
        turma_id: turmaId,
        chave: chave,
        numero: numero > 0 ? numero : null,
        nome: String(s.nome || "").trim().slice(0, 200),
        situacao: String(s.situacao || "").trim().slice(0, 120) || null,
        fonte: String(s.fonte || "").trim().slice(0, 160) || null
      });
    });
    var ativos = {};
    var temAtivo = false;
    ((opc || {}).ativos || []).forEach(function (a) {
      L.chavesDeAtivo(a).forEach(function (k) { ativos[k] = true; temAtivo = true; });
    });
    if (temAtivo) {
      var antigas = await buscaSaidas(client, turmaId);
      verificar();
      if (antigas.semTabela) {
        resultado.semTabela = true;
        return resultado;
      }
      var ides = antigas.dados.filter(function (r) {
        return ativos[r.chave] && !novas[r.chave];
      }).map(function (r) { return r.id; });
      if (ides.length) {
        var apag = await client.from("saidas").delete().in("id", ides);
        verificar();
        if (apag.error) {
          if (faltaNoBanco(apag.error, "saidas")) {
            resultado.semTabela = true;
            return resultado;
          }
          throw apag.error;
        }
        resultado.apagadas = ides.length;
      }
    }
    for (var i = 0; i < linhas.length; i += 200) {
      var lote = linhas.slice(i, i + 200);
      verificar();
      var resposta = await client.from("saidas").upsert(lote, { onConflict: "turma_id,chave" }).select();
      verificar();
      if (resposta.error) {
        if (faltaNoBanco(resposta.error, "saidas")) {
          resultado.semTabela = true;
          return resultado;
        }
        throw resposta.error;
      }
      resultado.gravadas += (resposta.data || []).length;
    }
    return resultado;
  }

  async function salvarProva(prova) {
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    var linha = provaParaLinha(prova);
    var id = eUuid(prova.id) ? prova.id : null;
    var { data, error } = await (id
      ? client.from("provas").update(linha).eq("id", id)
      : client.from("provas").insert(linha)
    ).select().single();
    if (error) throw error;
    return normalizarProva(data);
  }

  function excluirProva(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error("Supabase não configurado."));
    return excluir(client, "provas", id);
  }

  async function listProvas() {
    var client = getClient();
    if (!client) return [];
    var { data, error } = await client
      .from("provas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data || []).map(normalizarProva);
  }

  async function listTurmas() {
    var client = getClient();
    if (!client) return [];
    var { data, error } = await client.from("turmas").select("*").order("nome");
    if (error) throw error;
    return data || [];
  }

  async function listAlunos(turmaId) {
    var client = getClient();
    if (!client) return [];
    var query = client.from("alunos").select("*");
    if (turmaId) query = query.eq("turma_id", turmaId);
    var { data, error } = await query.order("numero").limit(2000);
    if (error) throw error;
    return (data || []).map(function (a) {
      return Object.assign({}, a, { numero: a.numero != null ? a.numero : "", gabarito: jsonOuValor(a.gabarito || []) });
    });
  }

  global.GabaDB = {
    STORAGE: STORAGE,
    client: null,
    readConfig: readConfig,
    saveConfig: saveConfig,
    /* apaga a marca de "este aparelho nao sobe nada" e as credenciais digitadas:
       o aparelho volta a se conectar com a dupla que vai dentro do pacote */
    usarCredencialDoPacote: function () {
      [STORAGE.desligada, STORAGE.url, STORAGE.key, STORAGE.keyAlt].forEach(function (k) {
        localStorage.removeItem(k);
      });
      global.GabaDB.client = null;
    },
    temCredencialDoPacote: function () {
      var p = embutida();
      return Boolean(p.url && p.key);
    },
    setProfessor: setProfessor,
    getClient: getClient,
    isConfigured: isConfigured,
    eUuid: eUuid,
    upsertProfessor: upsertProfessor,
    usuario: usuario,
    entrar: entrar,
    criarConta: criarConta,
    sair: sair,
    listEscolas: listEscolas,
    salvarEscola: salvarEscola,
    excluirEscola: excluirEscola,
    fetchCorrecoes: fetchCorrecoes,
    insertCorrecao: insertCorrecao,
    upsertProvaVersoes: upsertProvaVersoes,
    listProvaVersoes: listProvaVersoes,
    lookupAluno: lookupAluno,
    lookupProva: lookupProva,
    salvarTurma: salvarTurma,
    excluirTurma: excluirTurma,
    salvarAluno: salvarAluno,
    salvarAlunosEmLote: salvarAlunosEmLote,
    listSaidas: listSaidas,
    salvarSaidas: salvarSaidas,
    excluirAluno: excluirAluno,
    salvarProva: salvarProva,
    excluirProva: excluirProva,
    provaParaLinha: provaParaLinha,
    paraData: paraData,
    listProvas: listProvas,
    listTurmas: listTurmas,
    listAlunos: listAlunos,
    normalizarProva: normalizarProva
  };
})(window);
