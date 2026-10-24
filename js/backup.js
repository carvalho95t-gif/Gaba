/* global GabaDB */
(function (global) {
  "use strict";

  var STORAGE_KEY = "gaba_ultimo_backup";
  var TABELAS = ["escolas", "turmas", "alunos", "provas", "prova_versoes", "correcoes", "professores"];
  var VERSAO = 1;

  function ultimoBackup() {
    try {
      return JSON.parse(localStorage.getItem(global.GabaSync.chaveLocal(STORAGE_KEY)));
    } catch (_) { return null; }
  }

  function salvarMarca(contagens) {
    localStorage.setItem(global.GabaSync.chaveLocal(STORAGE_KEY), JSON.stringify({
      data: new Date().toISOString(),
      contagens: contagens
    }));
  }

  async function buscarTudo() {
    var verificar = global.GabaSync.verificadorConta();
    var client = GabaDB.getClient();
    if (!client) throw new Error("Faça login antes de baixar a cópia.");
    var dados = {};
    for (var i = 0; i < TABELAS.length; i++) {
      var t = TABELAS[i];
      var limite = t === "correcoes" ? 50000 : 10000;
      var { data, error } = await client.from(t).select("*").limit(limite);
      verificar();
      if (error) throw new Error("Erro ao ler " + t + ": " + (error.message || error));
      dados[t] = data || [];
    }
    return dados;
  }

  function contagens(dados) {
    var c = {};
    TABELAS.forEach(function (t) { c[t] = (dados[t] || []).length; });
    return c;
  }

  function nomeArquivo() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return "gaba-backup-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".json";
  }

  async function exportar() {
    var verificar = global.GabaSync.verificadorConta();
    var dados = await buscarTudo();
    verificar();
    var envelope = {
      gaba_backup: VERSAO,
      data: new Date().toISOString(),
      tabelas: dados
    };
    var blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo();
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 200);
    salvarMarca(contagens(dados));
    return contagens(dados);
  }

  function lerArquivo(file) {
    return new Promise(function (ok, fail) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var obj = JSON.parse(reader.result);
          if (!obj || !obj.gaba_backup || !obj.tabelas) throw new Error("Arquivo não é um backup do Gaba.");
          ok(obj);
        } catch (e) { fail(e); }
      };
      reader.onerror = function () { fail(new Error("Falha ao ler o arquivo.")); };
      reader.readAsText(file);
    });
  }

  var ORDEM_RESTAURAR = ["escolas", "professores", "turmas", "provas", "alunos", "prova_versoes", "correcoes"];

  async function restaurar(envelope, progresso) {
    var verificar = global.GabaSync.verificadorConta();
    var client = GabaDB.getClient();
    if (!client) throw new Error("Faça login antes de restaurar.");
    var tabelas = envelope.tabelas;
    var resultado = {};
    for (var i = 0; i < ORDEM_RESTAURAR.length; i++) {
      var t = ORDEM_RESTAURAR[i];
      var linhas = tabelas[t];
      if (!linhas || !linhas.length) { resultado[t] = 0; continue; }
      if (progresso) progresso(t, linhas.length);
      var gravados = 0;
      for (var j = 0; j < linhas.length; j += 200) {
        var lote = linhas.slice(j, j + 200);
        lote.forEach(function (l) { delete l.created_at; });
        verificar();
        var { error } = await client.from(t).upsert(lote, { onConflict: "id" }).select();
        verificar();
        if (error) throw new Error("Erro ao restaurar " + t + ": " + (error.message || error));
        gravados += lote.length;
      }
      resultado[t] = gravados;
    }
    return resultado;
  }

  global.GabaBackup = {
    TABELAS: TABELAS,
    ultimoBackup: ultimoBackup,
    exportar: exportar,
    lerArquivo: lerArquivo,
    restaurar: restaurar,
    contagens: contagens
  };
})(window);
