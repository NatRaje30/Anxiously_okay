/*
 * platform.js — one small API for the browser (Netlify / preview) and the Capacitor app.
 *
 *   AOPlatform.isNative()                      true inside the iOS/Android app
 *   AOPlatform.storage.get/set/remove/clear    small NON-personal flags (Preferences / localStorage)
 *   AOPlatform.secret.get/set/remove           secrets in the iOS Keychain / Android Keystore (native only)
 *   AOPlatform.files.save/load/remove/clear    raw (already encrypted) bytes in the app's private folder
 *   AOPlatform.idb                             tiny IndexedDB helper used by the browser fallbacks
 *   AOPlatform.notify.*                        local notifications (or best-effort web Notification)
 *   AOPlatform.haptic(style)                   light tap feedback on native, no-op on web
 *   AOPlatform.lock.*                          Face ID / Touch ID / fingerprint with device passcode fallback
 *   AOPlatform.media.pick()                    native multi-select photo + video picker
 *   AOPlatform.share.file(name, text)          native share sheet (or a browser download)
 *   AOPlatform.onPause / onResume              app lifecycle
 *
 * Nothing in here ever logs user content.
 */
(function () {
  'use strict';
  var C = window.AOCap || null;
  var native = !!(C && C.Capacitor && typeof C.Capacitor.isNativePlatform === 'function' && C.Capacitor.isNativePlatform());
  var DATA_DIR = 'AnxiouslyOkay';            // Library/AnxiouslyOkay on iOS (excluded from backup), files/ on Android
  var LS_PREFIX = 'ao.';

  function lsGet(k) { try { return localStorage.getItem(LS_PREFIX + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(LS_PREFIX + k, String(v)); } catch (e) {} }
  function lsRemove(k) { try { localStorage.removeItem(LS_PREFIX + k); } catch (e) {} }

  /* ---------- bytes <-> base64 (chunked so large media never blows the stack) ---------- */
  function b64FromBytes(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function bytesFromB64(b64) {
    var bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  /* ---------- IndexedDB (browser fallback) ---------- */
  var idbPromise = null;
  var idb = {
    open: function () {
      if (idbPromise) return idbPromise;
      idbPromise = new Promise(function (resolve, reject) {
        var req;
        try { req = indexedDB.open('anxiously-okay', 1); } catch (e) { reject(e); return; }
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
        };
        req.onsuccess = function () {
          var db = req.result;
          /* another tab is deleting/upgrading the database: let go so it isn't blocked */
          db.onversionchange = function () { db.close(); idbPromise = null; };
          resolve(db);
        };
        req.onerror = function () { reject(req.error || new Error('indexeddb')); };
        req.onblocked = function () { reject(new Error('indexeddb-blocked')); };
      });
      idbPromise.catch(function () { idbPromise = null; });
      return idbPromise;
    },
    tx: function (store, mode, fn) {
      return idb.open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(store, mode), os = t.objectStore(store), out;
          var r = fn(os);
          if (r) r.onsuccess = function () { out = r.result; };
          t.oncomplete = function () { resolve(out); };
          t.onerror = function () { reject(t.error || new Error('idb')); };
          t.onabort = function () { reject(t.error || new Error('idb-abort')); };
        });
      });
    },
    get: function (store, key) { return idb.tx(store, 'readonly', function (os) { return os.get(key); }); },
    put: function (store, key, val) { return idb.tx(store, 'readwrite', function (os) { return os.put(val, key); }); },
    del: function (store, key) { return idb.tx(store, 'readwrite', function (os) { return os.delete(key); }); },
    keys: function (store) { return idb.tx(store, 'readonly', function (os) { return os.getAllKeys(); }); },
    clear: function (store) { return idb.tx(store, 'readwrite', function (os) { return os.clear(); }); },
    destroy: function () {
      return new Promise(function (resolve) {
        var go = function () { try { var r = indexedDB.deleteDatabase('anxiously-okay'); r.onsuccess = r.onerror = r.onblocked = function () { resolve(); }; } catch (e) { resolve(); } };
        if (idbPromise) idbPromise.then(function (db) { db.close(); idbPromise = null; go(); }, go); else go();
      });
    }
  };

  /* ---------- non-personal flags ---------- */
  var storage = {
    get: function (k) { return native ? C.Preferences.get({ key: k }).then(function (r) { return r.value; }) : Promise.resolve(lsGet(k)); },
    set: function (k, v) { return native ? C.Preferences.set({ key: k, value: String(v) }) : Promise.resolve(lsSet(k, v)); },
    remove: function (k) { return native ? C.Preferences.remove({ key: k }) : Promise.resolve(lsRemove(k)); },
    clear: function () {
      if (native) return C.Preferences.clear();
      try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(LS_PREFIX) === 0) localStorage.removeItem(k); }); } catch (e) {}
      return Promise.resolve();
    }
  };

  /* ---------- secrets: Keychain (this device only, never iCloud-synced) / Android Keystore ---------- */
  var secretReady = null;
  function secretInit() {
    if (!native) return Promise.reject(new Error('no-secure-storage'));
    if (!secretReady) {
      var SS = C.SecureStorage;
      secretReady = Promise.resolve()
        .then(function () { return SS.setKeyPrefix('ao_'); })
        .then(function () { return SS.setSynchronize(false); })
        .then(function () { return SS.setDefaultKeychainAccess(C.KeychainAccess.whenUnlockedThisDeviceOnly); });
    }
    return secretReady;
  }
  var secret = {
    available: function () { return native; },
    get: function (k) { return secretInit().then(function () { return C.SecureStorage.get(k, false); }); },
    set: function (k, v) { return secretInit().then(function () { return C.SecureStorage.set(k, v, false, false, C.KeychainAccess.whenUnlockedThisDeviceOnly); }); },
    remove: function (k) { return secretInit().then(function () { return C.SecureStorage.remove(k); }); }
  };

  /* ---------- files: raw bytes in the private data folder ---------- */
  var CHUNK_B64 = 3 * 256 * 1024; // bytes per bridge call (multiple of 3 keeps base64 chunks joinable)
  function npath(p) { return DATA_DIR + '/' + p; }
  var files = {
    /* data: Uint8Array | Blob */
    save: function (path, data) {
      if (!native) return Promise.resolve(data instanceof Blob ? data : new Blob([data])).then(function (b) { return idb.put('files', path, b); });
      var Fs = C.Filesystem, dir = C.Directory.Library, tmp = path + '.part';
      var toBytes = data instanceof Blob ? data.arrayBuffer().then(function (ab) { return new Uint8Array(ab); }) : Promise.resolve(data);
      return toBytes.then(function (u8) {
        var p = Fs.writeFile({ path: npath(tmp), data: b64FromBytes(u8.subarray(0, CHUNK_B64)), directory: dir, recursive: true });
        for (var off = CHUNK_B64; off < u8.length; off += CHUNK_B64) {
          (function (o) { p = p.then(function () { return Fs.appendFile({ path: npath(tmp), data: b64FromBytes(u8.subarray(o, o + CHUNK_B64)), directory: dir }); }); })(off);
        }
        /* write to a temp file, then rename: a crash mid-write never leaves a half file under the real name */
        return p.then(function () { return Fs.deleteFile({ path: npath(path), directory: dir }).catch(function () {}); })
                .then(function () { return Fs.rename({ from: npath(tmp), to: npath(path), directory: dir, toDirectory: dir }); });
      });
    },
    /* resolves Uint8Array, or null if the file doesn't exist */
    load: function (path) {
      if (!native) return idb.get('files', path).then(function (b) { return b ? b.arrayBuffer().then(function (ab) { return new Uint8Array(ab); }) : null; });
      var Fs = C.Filesystem, dir = C.Directory.Library;
      return Fs.stat({ path: npath(path), directory: dir }).then(function (st) {
        /* fast path: stream the file through the webview's local file server */
        return fetch(C.Capacitor.convertFileSrc(st.uri)).then(function (r) {
          if (!r.ok) throw new Error('read');
          return r.arrayBuffer();
        }).then(function (ab) { return new Uint8Array(ab); })
          .catch(function () { return Fs.readFile({ path: npath(path), directory: dir }).then(function (r) { return bytesFromB64(r.data); }); });
      }, function () { return null; });
    },
    remove: function (path) {
      if (!native) return idb.del('files', path);
      return C.Filesystem.deleteFile({ path: npath(path), directory: C.Directory.Library }).catch(function () {});
    },
    list: function () {
      if (!native) return idb.keys('files');
      var out = [];
      function walk(rel) {
        return C.Filesystem.readdir({ path: npath(rel), directory: C.Directory.Library }).then(function (r) {
          return Promise.all(r.files.map(function (f) {
            var p = rel ? rel + '/' + f.name : f.name;
            return f.type === 'directory' ? walk(p) : (out.push(p), null);
          }));
        }, function () { return null; });
      }
      return walk('').then(function () { return out; });
    },
    clear: function () {
      if (!native) return idb.destroy();
      return C.Filesystem.rmdir({ path: DATA_DIR, directory: C.Directory.Library, recursive: true }).catch(function () {})
        .then(function () { return C.Filesystem.mkdir({ path: DATA_DIR, directory: C.Directory.Library, recursive: true }).catch(function () {}); });
    }
  };

  /* ---------- notifications ---------- */
  var webTimers = {}, webPending = [];
  var notify = {
    supported: function () { return native || typeof Notification !== 'undefined'; },
    /* 'granted' | 'denied' | 'prompt' | 'unsupported' */
    permission: function () {
      if (native) return C.LocalNotifications.checkPermissions().then(function (r) { return r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'prompt'; });
      if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
      return Promise.resolve(Notification.permission === 'default' ? 'prompt' : Notification.permission);
    },
    request: function () {
      if (native) return C.LocalNotifications.requestPermissions().then(function (r) { return r.display === 'granted' ? 'granted' : 'denied'; });
      if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
      return Notification.requestPermission().then(function (p) { return p === 'default' ? 'prompt' : p; });
    },
    registerActions: function (types) {
      return native ? C.LocalNotifications.registerActionTypes({ types: types }) : Promise.resolve();
    },
    /* items: [{id, at(ms), title, body, actionTypeId, extra}] */
    schedule: function (items) {
      if (!items.length) return Promise.resolve();
      if (native) {
        return C.LocalNotifications.schedule({ notifications: items.map(function (n) {
          return { id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true },
                   actionTypeId: n.actionTypeId || undefined, extra: n.extra || {}, smallIcon: 'ic_stat_notify', iconColor: '#3a8a4a' };
        }) });
      }
      /* Browser: best effort while the page stays open, within the next 24h only */
      items.forEach(function (n) {
        webPending.push(n);
        var ms = n.at - Date.now();
        if (ms > 0 && ms < 864e5 && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          clearTimeout(webTimers[n.id]);
          webTimers[n.id] = setTimeout(function () { delete webTimers[n.id]; webPending = webPending.filter(function (x) { return x.id !== n.id; }); try { new Notification(n.title, { body: n.body, tag: 'ao-' + n.id }); } catch (e) {} }, ms);
        }
      });
      return Promise.resolve();
    },
    cancel: function (ids) {
      if (!ids || !ids.length) return Promise.resolve();
      if (native) return C.LocalNotifications.cancel({ notifications: ids.map(function (id) { return { id: id }; }) });
      ids.forEach(function (id) { clearTimeout(webTimers[id]); delete webTimers[id]; });
      webPending = webPending.filter(function (n) { return ids.indexOf(n.id) < 0; });
      return Promise.resolve();
    },
    cancelAll: function () {
      if (native) {
        return C.LocalNotifications.getPending().then(function (r) {
          return r.notifications.length ? C.LocalNotifications.cancel({ notifications: r.notifications.map(function (n) { return { id: n.id }; }) }) : null;
        });
      }
      Object.keys(webTimers).forEach(function (k) { clearTimeout(webTimers[k]); }); webTimers = {}; webPending = [];
      return Promise.resolve();
    },
    /* [{id, at(ms), title, body, extra}] */
    pending: function () {
      if (native) {
        return C.LocalNotifications.getPending().then(function (r) {
          return r.notifications.map(function (n) { return { id: n.id, at: n.schedule && n.schedule.at ? new Date(n.schedule.at).getTime() : null, title: n.title, body: n.body, extra: n.extra || {} }; });
        });
      }
      return Promise.resolve(webPending.slice());
    },
    /* cb({actionId, extra, at}) — fires for body taps ('tap') and action buttons */
    onAction: function (cb) {
      if (!native) return;
      C.LocalNotifications.addListener('localNotificationActionPerformed', function (ev) {
        var n = ev.notification || {};
        cb({ actionId: ev.actionId, extra: n.extra || {}, id: n.id, at: Date.now() });
      });
    }
  };

  /* ---------- haptics ---------- */
  function haptic(style) {
    if (!native) return;
    try { C.Haptics.impact({ style: (C.ImpactStyle && C.ImpactStyle[style === 'medium' ? 'Medium' : 'Light']) || 'LIGHT' }); } catch (e) {}
  }

  /* ---------- biometric / device passcode lock ---------- */
  var lock = {
    /* {available, kind:'Face ID'|'Touch ID'|'fingerprint'|'passcode'|''} */
    check: function () {
      if (!native) return Promise.resolve({ available: false, kind: '' });
      return C.BiometricAuth.checkBiometry().then(function (r) {
        var t = r.biometryType, kind = t === 1 ? 'Touch ID' : t === 2 ? 'Face ID' : t === 3 ? 'fingerprint' : t === 4 ? 'face unlock' : t === 5 ? 'iris' : '';
        return { available: !!(r.isAvailable || r.deviceIsSecure), kind: r.isAvailable ? kind : (r.deviceIsSecure ? 'passcode' : '') };
      }, function () { return { available: false, kind: '' }; });
    },
    authenticate: function (reason) {
      return C.BiometricAuth.authenticate({
        reason: reason || 'Unlock Anxiously Okay',
        cancelTitle: 'Cancel',
        allowDeviceCredential: true,
        iosFallbackTitle: 'Use passcode',
        androidTitle: 'Unlock Anxiously Okay',
        androidSubtitle: 'Your entries stay private'
      }).then(function () { return true; }, function () { return false; });
    }
  };

  /* ---------- native multi-select photo + video picker ---------- */
  var media = {
    available: function () { return native; },
    /* resolves [{blob, name, type, size}] */
    pick: function () {
      return C.FilePicker.pickMedia({ readData: false, limit: 0 }).then(function (r) {
        return Promise.all((r.files || []).map(function (f) {
          return fetch(C.Capacitor.convertFileSrc(f.path)).then(function (res) { return res.blob(); }).then(function (b) {
            return { blob: b, name: f.name || 'file', type: f.mimeType || b.type || '', size: f.size || b.size };
          }, function () { return { error: true, name: f.name, type: f.mimeType || '' }; });
        }));
      }, function (e) {
        /* a cancel is not an error */
        if (e && /cancel/i.test(String(e.message || e.code || ''))) return [];
        throw e;
      });
    }
  };

  /* ---------- share ---------- */
  var share = {
    file: function (name, text) {
      if (native) {
        return C.Filesystem.writeFile({ path: name, data: text, directory: C.Directory.Cache, encoding: C.Encoding.UTF8 })
          .then(function (r) { return C.Share.share({ title: name, files: [r.uri] }).catch(function () {}).then(function () {
            return C.Filesystem.deleteFile({ path: name, directory: C.Directory.Cache }).catch(function () {}); }); });
      }
      var file;
      try { file = new File([text], name, { type: 'application/json' }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(function () {});
      var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
      return Promise.resolve();
    }
  };

  /* ---------- lifecycle ---------- */
  var pauseCbs = [], resumeCbs = [];
  function firePause() { pauseCbs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function fireResume() { resumeCbs.forEach(function (f) { try { f(); } catch (e) {} }); }
  if (native) {
    C.App.addListener('appStateChange', function (s) { if (s.isActive) fireResume(); else firePause(); });
  } else {
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') firePause(); else fireResume(); });
    window.addEventListener('pagehide', firePause);
  }

  window.AOPlatform = {
    isNative: function () { return native; },
    platform: function () { return native ? C.Capacitor.getPlatform() : 'web'; },
    storage: storage, secret: secret, files: files, idb: idb,
    notify: notify, haptic: haptic, lock: lock, media: media, share: share,
    onPause: function (f) { pauseCbs.push(f); },
    onResume: function (f) { resumeCbs.push(f); },
    statusBar: function (isDark) {
      if (!native) return;
      try { C.StatusBar.setStyle({ style: isDark ? C.Style.Dark : C.Style.Light }); } catch (e) {}
    },
    hideSplash: function () { if (native) { try { C.SplashScreen.hide(); } catch (e) {} } },
    b64FromBytes: b64FromBytes, bytesFromB64: bytesFromB64
  };
})();
