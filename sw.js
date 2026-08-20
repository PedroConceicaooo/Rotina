/* ============================================================
   sw.js — service worker: cache offline + lembretes em segundo plano
   ============================================================ */
importScripts('./js/store.js', './js/notify.js');

var VERSAO = 'rotina-v1';
var ARQUIVOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/store.js',
  './js/nlp.js',
  './js/notify.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSAO)
      .then(function (c) { return c.addAll(ARQUIVOS); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (chaves) {
        return Promise.all(chaves.map(function (k) {
          return k === VERSAO ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* rede primeiro para o HTML, cache primeiro para o resto */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  /* versao.json nunca vai pro cache: é ele que denuncia que saiu versão nova */
  if (url.pathname.indexOf('versao.json') !== -1) return;

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    e.respondWith(
      fetch(req)
        .then(function (r) {
          var copia = r.clone();
          caches.open(VERSAO).then(function (c) { c.put(req, copia); });
          return r;
        })
        .catch(function () {
          return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
        })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cacheado) {
      var rede = fetch(req).then(function (r) {
        if (r && r.status === 200) {
          var copia = r.clone();
          caches.open(VERSAO).then(function (c) { c.put(req, copia); });
        }
        return r;
      }).catch(function () { return cacheado; });
      return cacheado || rede;
    })
  );
});

/* ---------- checagem de lembretes ---------- */
function checarLembretes() {
  return self.RotinaStore.carregar().then(function (state) {
    if (!state.config.notificacoes) return 0;
    return self.RotinaNotify.disparar(state, new Date(), self.registration)
      .then(function (n) {
        if (n > 0) return self.RotinaStore.salvar(state).then(function () { return n; });
        return n;
      });
  }).catch(function () { return 0; });
}

self.addEventListener('periodicsync', function (e) {
  if (e.tag === 'lembretes') e.waitUntil(checarLembretes());
});

self.addEventListener('sync', function (e) {
  if (e.tag === 'lembretes') e.waitUntil(checarLembretes());
});

self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.tipo === 'checar') e.waitUntil(checarLembretes());
  if (d.tipo === 'pular-espera') self.skipWaiting();
  if (d.tipo === 'teste') {
    e.waitUntil(self.registration.showNotification('🔔 Notificações ligadas', {
      body: 'É assim que os lembretes vão aparecer.',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'teste'
    }));
  }
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var alvo = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
      for (var i = 0; i < lista.length; i++) {
        if ('focus' in lista[i]) return lista[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(alvo);
    })
  );
});
