/* global supabase */
(function (global) {
  "use strict";

  var STORAGE = {
    url: "gaba_supabase_url",
    key: "gaba_supabase_anon_key",
    keyAlt: "gaba_supabase_key",
    professorId: "gaba_professor_id",
    professorNome: "gaba_professor_nome",
    professorEmail: "gaba_professor_email"
  };

  function readConfig() {
    return {
      url: (localStorage.getItem(STORAGE.url) || "").trim(),
      key: (localStorage.getItem(STORAGE.key) || localStorage.getItem(STORAGE.keyAlt) || "").trim(),
      professorId: localStorage.getItem(STORAGE.professorId) || "",
      professorNome: localStorage.getItem(STORAGE.professorNome) || "",
      professorEmail: localStorage.getItem(STORAGE.professorEmail) || ""
    };
  }

  function saveConfig(url, key) {
    localStorage.setItem(STORAGE.url, url || "");
    localStorage.setItem(STORAGE.key, key || "");
    localStorage.setItem(STORAGE.keyAlt, key || "");
    global.GabaDB.client = null;
  }

  function setProfessor(id, nome, email) {
    if (id) localStorage.setItem(STORAGE.professorId, id);
    else localStorage.removeItem(STORAGE.professorId);
    if (nome) localStorage.setItem(STORAGE.professorNome, nome);
    else localStorage.removeItem(STORAGE.professorNome);
    if (email) localStorage.setItem(STORAGE.professorEmail, email);
    else localStorage.removeItem(STORAGE.professorEmail);
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
    setProfessor(data.id, data.nome, data.email);
    return data;
  }

  async function fetchCorrecoes() {
    var client = getClient();
    if (!client) return [];
    var { data, error } = await client
      .from("correcoes")
      .select("*, alunos(nome, numero), turmas(nome), provas(titulo)")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    return data || [];
  }

  async function insertCorrecao(row) {
    var client = getClient();
    if (!client) throw new Error("Supabase não configurado.");
    var payload = {
      aluno_id: row.aluno_id,
      turma_id: row.turma_id,
      prova_id: row.prova_id,
      respostas: row.respostas || [],
      acertos: row.acertos || 0,
      total_questoes: row.total_questoes || 0,
      nota: row.nota || 0
    };
    var { data, error } = await client.from("correcoes").insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function lookupAluno(alunoId, numeroOuMatricula) {
    var client = getClient();
    if (!client) return null;
    if (alunoId) {
      var byId = await client.from("alunos").select("*, turmas(nome)").eq("id", alunoId).maybeSingle();
      if (byId.error) throw byId.error;
      if (byId.data) return byId.data;
    }
    if (numeroOuMatricula != null && numeroOuMatricula !== "") {
      var n = Number(numeroOuMatricula);
      if (!Number.isNaN(n)) {
        var byNum = await client.from("alunos").select("*, turmas(nome)").eq("numero", n).limit(1);
        if (!byNum.error && byNum.data && byNum.data[0]) return byNum.data[0];
      }
      var byMat = await client.from("alunos").select("*, turmas(nome)").eq("matricula", String(numeroOuMatricula)).limit(1);
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
    fetchCorrecoes: fetchCorrecoes,
    insertCorrecao: insertCorrecao,
    lookupAluno: lookupAluno,
    lookupProva: lookupProva
  };
})(window);
