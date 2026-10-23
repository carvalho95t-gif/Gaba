/* Gaba — payload do QR da folha: único formato para impressão, gerador PDF e scanner */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaQR = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  /* GABA1 e GABA<geometria> tem o mesmo tamanho: versionar pelo prefixo nao engorda o QR */
  var PREFIX_RE = /^GABA(\d+)$/;

  function prefixo() {
    var L = root.GabaLayout;
    if (!L || !L.GEOMETRIA) throw new Error("GabaQR.encode: omrLayout.js precisa carregar antes.");
    return "GABA" + L.GEOMETRIA;
  }

  function clean(v) {
    return String(v == null ? "" : v).trim();
  }

  function idAluno(aluno) {
    if (!aluno) return "";
    if (aluno.id) return clean(aluno.id);
    if (aluno.matricula) return "M:" + clean(aluno.matricula);
    if (aluno.numero != null && aluno.numero !== "") return "N:" + clean(aluno.numero);
    return "";
  }

  function encode(prova, aluno, versao) {
    var v = versao || {};
    return [
      prefixo(),
      clean(prova && prova.id),
      idAluno(aluno),
      clean(aluno && aluno.numero),
      clean(v.versao || 1),
      clean(v.codigo || "V1")
    ].join("|");
  }

  /* geometria 0 = desconhecida: GABA1, legados e JSON nao dizem onde as marcas estavam */
  function blank() {
    return { ok: false, prova_id: "", aluno_id: "", aluno_matricula: "", aluno_numero: "", numero: "", versao: 0, codigo: "", raw: "", formato: "", geometria: 0 };
  }

  /* reconstitui a referência usada em idAluno */
  function aplicarRef(out, ref) {
    if (!ref) return out;
    if (ref.indexOf("M:") === 0) out.aluno_matricula = ref.slice(2);
    else if (ref.indexOf("N:") === 0) out.aluno_numero = ref.slice(2);
    else out.aluno_id = ref;
    return out;
  }

  function resolve(out, alunos) {
    var lista = alunos || [];
    for (var i = 0; i < lista.length; i++) {
      var a = lista[i];
      if (out.aluno_id && a.id === out.aluno_id) return a;
      if (out.aluno_matricula && String(a.matricula || "") === out.aluno_matricula) return a;
      if (out.aluno_numero && String(a.numero || a.matricula || "") === out.aluno_numero) return a;
    }
    return null;
  }

  function fromJson(text) {
    var o = JSON.parse(text);
    if (!o || typeof o !== "object") return null;
    var out = blank();
    out.prova_id = clean(o.prova_id || o.prova);
    out.aluno_id = clean(o.aluno_id || o.aluno || o.matricula);
    out.numero = clean(o.numero != null ? o.numero : (o.matricula || ""));
    out.versao = parseInt(o.versao || o.tipo || 1, 10) || 1;
    out.codigo = clean(o.codigo || o.seed || "");
    out.formato = "json";
    out.ok = Boolean(out.prova_id || out.aluno_id);
    return out;
  }

  /* aceita GABA<n>, o legado GABA|prova|aluno|numero, o legado Gaba|aluno|prova e o JSON do gerador Python */
  function decode(text) {
    var raw = clean(text);
    var out = blank();
    out.raw = raw;
    if (!raw) return out;
    if (raw.charAt(0) === "{") {
      try {
        var j = fromJson(raw);
        if (j) { j.raw = raw; return j; }
      } catch (err) { /* cai no formato pipe */ }
    }
    var parts = raw.split("|");
    var head = parts.shift() || "";
    var legadoAlunoPrimeiro = head === "Gaba";
    var versionado = PREFIX_RE.exec(head);
    out.formato = versionado ? "gaba" + versionado[1] : "legado";
    if (versionado && Number(versionado[1]) >= 2) out.geometria = Number(versionado[1]);
    if (legadoAlunoPrimeiro) {
      aplicarRef(out, clean(parts[0]));
      out.prova_id = clean(parts[1]);
      out.versao = 1;
    } else {
      out.prova_id = clean(parts[0]);
      aplicarRef(out, clean(parts[1]));
      out.numero = clean(parts[2]);
      out.versao = parseInt(parts[3], 10) || 1;
      out.codigo = clean(parts[4]);
    }
    // GABA|aluno|prova sem número: detecta por quem parece UUID quando os dois campos parecem id
    if (out.formato === "legado" && parts.length === 2 && !out.numero &&
        UUID_RE.test(parts[0]) && !UUID_RE.test(parts[1])) {
      out.prova_id = clean(parts[1]);
      out.aluno_id = clean(parts[0]);
    }
    out.ok = Boolean(out.prova_id || out.aluno_id || out.aluno_matricula || out.aluno_numero);
    return out;
  }

  return {
    encode: encode,
    decode: decode,
    idAluno: idAluno,
    resolve: resolve
  };
});
