/* global supabase */
(function (global) {
  "use strict";

  var STORAGE = {
    url: "gaba_supabase_url",
    key: "gaba_supabase_anon_key",
    professorId: "gaba_professor_id",
    professorNome: "gaba_professor_nome"
  };

  function readConfig() {
    return {
      url: (localStorage.getItem(STORAGE.url) || "").trim(),
      key: (localStorage.getItem(STORAGE.key) || "").trim(),
      professorId: localStorage.getItem(STORAGE.professorId) || "",
      professorNome: localStorage.getItem(STORAGE.professorNome) || ""
    };
  }

  function saveConfig(url, key) {
    localStorage.setItem(STORAGE.url, url || "");
    localStorage.setItem(STORAGE.key, key || "");
    global.GabaDB.client = null;
  }

  function setProfessor(id, nome) {
    if (id) localStorage.setItem(STORAGE.professorId, id);
    else localStorage.removeItem(STORAGE.professorId);
    if (nome) localStorage.setItem(STORAGE.professorNome, nome);
    else localStorage.removeItem(STORAGE.professorNome);
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

  async function upsertProfessor(nome, email) {
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    var { data, error } = await client
      .from("professores")
      .upsert({ nome: nome, email: email }, { onConflict: "email" })
      .select()
      .single();
    if (error) throw error;
    setProfessor(data.id, data.nome);
    return data;
  }

  async function listProvas(professorId) {
    var client = getClient();
    if (!client) return [];
    var query = client.from("provas").select("*").order("created_at", { ascending: false });
    if (professorId) query = query.eq("professor_id", professorId);
    var { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function listTurmas(professorId) {
    var client = getClient();
    if (!client) return [];
    var query = client.from("turmas").select("*").order("nome");
    if (professorId) query = query.eq("professor_id", professorId);
    var { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function listAlunos(turmaId) {
    var client = getClient();
    if (!client) return [];
    var query = client.from("alunos").select("*, turmas(nome, professor_id)").order("nome");
    if (turmaId) query = query.eq("turma_id", turmaId);
    var { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function fetchQuestoes(provaId) {
    var client = getClient();
    if (!client) return [];
    var { data, error } = await client
      .from("questoes")
      .select("*")
      .eq("prova_id", provaId)
      .order("numero");
    if (error) throw error;
    return data || [];
  }

  async function fetchCorrecoes() {
    var client = getClient();
    if (!client) return [];
    var { data, error } = await client
      .from("correcoes_omr")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    return data || [];
  }

  async function insertCorrecao(row) {
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    var { data, error } = await client.from("correcoes_omr").insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async function lookupAluno(alunoId, matricula) {
    var client = getClient();
    if (!client) return null;
    if (alunoId) {
      var byId = await client.from("alunos").select("*, turmas(nome)").eq("id", alunoId).maybeSingle();
      if (byId.error) throw byId.error;
      if (byId.data) return byId.data;
    }
    if (matricula) {
      var byMat = await client.from("alunos").select("*, turmas(nome)").eq("matricula", matricula).limit(1);
      if (byMat.error) throw byMat.error;
      return (byMat.data && byMat.data[0]) || null;
    }
    return null;
  }

  async function lookupProva(provaId) {
    var client = getClient();
    if (!client || !provaId) return null;
    var { data, error } = await client.from("provas").select("*").eq("id", provaId).maybeSingle();
    if (error) throw error;
    return data;
  }

  global.GabaDB = {
    STORAGE: STORAGE,
    client: null,
    readConfig: readConfig,
    saveConfig: saveConfig,
    setProfessor: setProfessor,
    getClient: getClient,
    isConfigured: isConfigured,
    upsertProfessor: upsertProfessor,
    listProvas: listProvas,
    listTurmas: listTurmas,
    listAlunos: listAlunos,
    fetchQuestoes: fetchQuestoes,
    fetchCorrecoes: fetchCorrecoes,
    insertCorrecao: insertCorrecao,
    lookupAluno: lookupAluno,
    lookupProva: lookupProva
  };
})(window);
