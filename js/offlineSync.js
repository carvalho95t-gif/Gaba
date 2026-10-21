(function (global) {
  "use strict";

  var DB_NAME = "gaba-omr";
  var DB_VERSION = 1;
  var STORE = "pending";
  var RESULTS = "results";
  var dbPromise = null;
  var listeners = [];

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(RESULTS)) {
          var results = db.createObjectStore(RESULTS, { keyPath: "id" });
          results.createIndex("created_at", "created_at");
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
    return dbPromise;
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
      tx.onabort = function () {
        reject(tx.error || new Error("IndexedDB abort"));
      };
    });
  }

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function notify() {
    countPending().then(function (n) {
      listeners.forEach(function (fn) {
        try {
          fn(n);
        } catch (e) {
          /* ignore */
        }
      });
    });
  }

  async function enqueue(record) {
    var row = Object.assign({}, record);
    if (!row.id) row.id = uuid();
    row.queued_at = new Date().toISOString();
    row.sync_error = null;
    var db = await openDb();
    var tx = db.transaction([STORE, RESULTS], "readwrite");
    tx.objectStore(STORE).put(row);
    tx.objectStore(RESULTS).put(Object.assign({}, row, { origem: "local" }));
    await txDone(tx);
    notify();
    return row;
  }

  async function saveLocalResult(record) {
    var db = await openDb();
    var tx = db.transaction(RESULTS, "readwrite");
    tx.objectStore(RESULTS).put(record);
    await txDone(tx);
  }

  async function listPending() {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = function () {
        resolve(req.result || []);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  async function listResults() {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var req = db.transaction(RESULTS, "readonly").objectStore(RESULTS).getAll();
      req.onsuccess = function () {
        resolve(req.result || []);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  async function removePending(id) {
    var db = await openDb();
    var tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    notify();
  }

  async function countPending() {
    var items = await listPending();
    return items.length;
  }

  async function flush() {
    if (!navigator.onLine) return { synced: 0, failed: 0 };
    if (!global.GabaDB || !GabaDB.isConfigured() || !GabaDB.getClient()) {
      return { synced: 0, failed: 0, reason: "unconfigured" };
    }
    var pending = await listPending();
    var synced = 0;
    var failed = 0;
    for (var i = 0; i < pending.length; i++) {
      var item = pending[i];
      try {
        var payload = {
          id: item.id,
          prova_id: item.prova_id,
          aluno_id: item.aluno_id || null,
          professor_id: item.professor_id || null,
          matricula: item.matricula || null,
          aluno_nome: item.aluno_nome || null,
          respostas: item.respostas || [],
          acertos: item.acertos || 0,
          total_questoes: item.total_questoes || 0,
          nota: item.nota || 0,
          confianca: item.confianca || null,
          qr_payload: item.qr_payload || null,
          raw_payload: item.raw_payload || null,
          created_at: item.created_at || item.queued_at
        };
        await GabaDB.insertCorrecao(payload);
        await removePending(item.id);
        synced += 1;
      } catch (err) {
        failed += 1;
        item.sync_error = String(err && err.message ? err.message : err);
        var db = await openDb();
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(item);
        await txDone(tx);
      }
    }
    notify();
    return { synced: synced, failed: failed };
  }

  function onPendingChange(fn) {
    listeners.push(fn);
    countPending().then(fn);
    return function () {
      listeners = listeners.filter(function (x) {
        return x !== fn;
      });
    };
  }

  global.addEventListener("online", function () {
    flush();
  });

  global.GabaSync = {
    uuid: uuid,
    enqueue: enqueue,
    saveLocalResult: saveLocalResult,
    listPending: listPending,
    listResults: listResults,
    countPending: countPending,
    flush: flush,
    onPendingChange: onPendingChange
  };
})(window);
