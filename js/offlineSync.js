(function (global) {
  "use strict";

  var DB_VERSION = 2;
  var STORE = "pending";
  var RESULTS = "results";
  var PROVAS = "provas";
  var dbPromises = Object.create(null);
  var flushing = Object.create(null);
  var listeners = [];
  var current = makeContext(null);

  function configUrl() {
    var config = global.GabaDB && global.GabaDB.readConfig ? global.GabaDB.readConfig() : null;
    return String(config && config.url || "");
  }

  function makeContext(user) {
    var id = user && user.id != null ? String(user.id) : null;
    if (!id) id = null;
    var url = id === null ? "" : configUrl();
    var scope = JSON.stringify(id === null ? ["sem-conta"] : ["conta", url, id]);
    return { userId: id, url: url, scope: scope, dbName: "gaba-omr-scope:" + scope };
  }

  function contextError() {
    var error = new Error("A conta ou a configuração mudou durante a operação.");
    error.code = "GABA_SYNC_CONTEXT_CHANGED";
    return error;
  }

  function assertContext(context) {
    if (current !== context || (context.userId !== null && configUrl() !== context.url)) {
      throw contextError();
    }
  }

  function definirConta(user) {
    var next = makeContext(user);
    if (next.scope === current.scope) return false;
    current = next;
    notify(next);
    return true;
  }

  function contaAtual() {
    return current.scope;
  }

  function verificadorConta() {
    var context = current;
    return function () { assertContext(context); };
  }

  function chaveLocal(base) {
    return "gaba-local:" + JSON.stringify([current.scope, String(base)]);
  }

  function nomeBanco() {
    return current.dbName;
  }

  function openDb(context) {
    assertContext(context);
    if (dbPromises[context.dbName]) return dbPromises[context.dbName];
    var promise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(context.dbName, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(RESULTS)) {
          var results = db.createObjectStore(RESULTS, { keyPath: "id" });
          results.createIndex("created_at", "created_at");
        }
        if (!db.objectStoreNames.contains(PROVAS)) {
          db.createObjectStore(PROVAS, { keyPath: "id" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        delete dbPromises[context.dbName];
        reject(req.error);
      };
    });
    dbPromises[context.dbName] = promise;
    return promise;
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

  async function readAll(context, store) {
    var db = await openDb(context);
    assertContext(context);
    var items = await new Promise(function (resolve, reject) {
      var req = db.transaction(store, "readonly").objectStore(store).getAll();
      req.onsuccess = function () {
        resolve(req.result || []);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
    assertContext(context);
    return items;
  }

  async function write(context, changes, guard) {
    var db = await openDb(context);
    assertContext(context);
    if (guard) {
      await guard();
      assertContext(context);
    }
    var stores = changes.map(function (change) { return change.store; });
    var tx = db.transaction(stores, "readwrite");
    changes.forEach(function (change) {
      tx.objectStore(change.store)[change.remove ? "delete" : "put"](change.value);
    });
    await txDone(tx);
    assertContext(context);
    if (guard) {
      await guard();
      assertContext(context);
    }
  }

  function notify(context, only) {
    var tickets = (only ? [only] : listeners.slice()).map(function (listener) {
      return { listener: listener, version: ++listener.version };
    });
    readAll(context, STORE).then(function (items) {
      assertContext(context);
      tickets.forEach(function (ticket) {
        try {
          assertContext(context);
          var listener = ticket.listener;
          if (listeners.indexOf(listener) !== -1 && listener.version === ticket.version) {
            listener.fn(items.length);
          }
        } catch (e) {
          /* ignore */
        }
      });
    }).catch(function () { /* no stale notifications */ });
  }

  async function enqueue(record) {
    var context = current;
    var row = Object.assign({}, record);
    if (!row.id) row.id = uuid();
    row.queued_at = new Date().toISOString();
    row.sync_error = null;
    await write(context, [
      { store: STORE, value: row },
      { store: RESULTS, value: Object.assign({}, row, { origem: "local" }) }
    ]);
    assertContext(context);
    notify(context);
    return row;
  }

  async function saveLocalResult(record) {
    var context = current;
    await write(context, [{ store: RESULTS, value: record }]);
    assertContext(context);
  }

  function listPending() {
    return readAll(current, STORE);
  }

  function listResults() {
    return readAll(current, RESULTS);
  }

  async function removePending(context, id, guard) {
    await write(context, [{ store: STORE, value: id, remove: true }], guard);
    assertContext(context);
    notify(context);
  }

  async function guardarProva(prova) {
    var context = current;
    if (!prova || !prova.id) throw new Error("A prova precisa de um id para ficar no aparelho.");
    await write(context, [{
      store: PROVAS,
      value: Object.assign({}, prova, { atualizado_em: new Date().toISOString() })
    }]);
    assertContext(context);
    return prova;
  }

  function listarProvas() {
    return readAll(current, PROVAS);
  }

  async function esquecerProva(id) {
    var context = current;
    await write(context, [{ store: PROVAS, value: id, remove: true }]);
    assertContext(context);
  }

  async function countPending() {
    var context = current;
    var items = await readAll(context, STORE);
    assertContext(context);
    return items.length;
  }

  async function flush() {
    var context = current;
    var client = global.GabaDB;
    if (!navigator.onLine) return { synced: 0, failed: 0 };
    if (context.userId === null) return { synced: 0, failed: 0, reason: "unauthenticated" };
    if (!client || !client.isConfigured() || !client.getClient()) {
      return { synced: 0, failed: 0, reason: "unconfigured" };
    }
    if (!client.usuario) return { synced: 0, failed: 0, reason: "unauthenticated" };
    assertContext(context);
    if (flushing[context.dbName]) return { synced: 0, failed: 0, reason: "busy" };
    flushing[context.dbName] = true;
    var user;
    var synced = 0;
    var failed = 0;

    async function verifyIdentity() {
      assertContext(context);
      if (global.GabaDB !== client) throw contextError();
      var active = await client.usuario();
      assertContext(context);
      if (global.GabaDB !== client || !active || String(active.id) !== context.userId) {
        throw contextError();
      }
      return active;
    }

    try {
      var active = await verifyIdentity();
      assertContext(context);
      user = { id: active.id };
      var pending = await readAll(context, STORE);
      assertContext(context);
      for (var i = 0; i < pending.length; i++) {
        var item = pending[i];
        await verifyIdentity();
        assertContext(context);
        try {
          await client.insertCorrecao(item, user.id);
        } catch (err) {
          await verifyIdentity();
          assertContext(context);
          item.sync_error = String(err && err.message ? err.message : err);
          await write(context, [{ store: STORE, value: item }], verifyIdentity);
          assertContext(context);
          failed += 1;
          continue;
        }
        await verifyIdentity();
        assertContext(context);
        await removePending(context, item.id, verifyIdentity);
        assertContext(context);
        synced += 1;
      }
      await verifyIdentity();
      assertContext(context);
      notify(context);
      return { synced: synced, failed: failed };
    } catch (err) {
      if (err && err.code === "GABA_SYNC_CONTEXT_CHANGED") {
        return { synced: 0, failed: 0, reason: "account-changed" };
      }
      throw err;
    } finally {
      delete flushing[context.dbName];
    }
  }

  function onPendingChange(fn) {
    var context = current;
    var listener = { fn: fn, version: 0 };
    listeners.push(listener);
    notify(context, listener);
    return function () {
      listeners = listeners.filter(function (x) {
        return x !== listener;
      });
    };
  }

  global.addEventListener("online", function () {
    flush().catch(function () { /* retry on the next flush */ });
  });

  global.GabaSync = {
    definirConta: definirConta,
    contaAtual: contaAtual,
    verificadorConta: verificadorConta,
    chaveLocal: chaveLocal,
    nomeBanco: nomeBanco,
    uuid: uuid,
    enqueue: enqueue,
    saveLocalResult: saveLocalResult,
    listPending: listPending,
    listResults: listResults,
    countPending: countPending,
    flush: flush,
    onPendingChange: onPendingChange,
    guardarProva: guardarProva,
    listarProvas: listarProvas,
    esquecerProva: esquecerProva
  };
})(window);
