// ═══════════════════════════════════════════════════════════════════════════
//  Fee Tracker — Advanced Service Worker  v8
//
//  Strategies
//  ───────────────────────────────────────────────────────────────────────
//  • App shell / index.html  →  Stale-while-revalidate  (instant every load)
//  • Local static assets     →  Cache-first, revalidate in background
//  • CDN (fonts, Chart.js)   →  Cache-first, 7-day TTL, LRU eviction
//  • Firebase APIs           →  Network-only  (never cache auth/Firestore)
//  • Non-GET Firestore writes →  Queue in IDB when offline, replay on sync
//
//  IDB stores  (IDB_VERSION 3 — safe upgrade on top of app's v2 schema)
//  ───────────────────────────────────────────────────────────────────────
//  kv              – app data mirror (same as app's 'kv' store, shared)
//  batches_detail  – per-batch cache (same as app's store, shared)
//  sw_queue        – offline write queue  (SW-owned, new in v3)
//  sw_meta         – SW metadata: timestamps, version, trim stats (v3)
//
//  Messages accepted from page
//  ───────────────────────────────────────────────────────────────────────
//  SKIP_WAITING      – activate new SW immediately
//  CLEAR_CACHE       – wipe everything (sign-out)
//  FLUSH_QUEUE       – replay offline queue now
//  CACHE_SNAPSHOT    – push a key/value into IDB from page
//  TRIM_CACHE        – evict old runtime cache entries
//  QUEUE_STATUS      – reply with queue length + SW version (via MessagePort)
//  RECACHE_SHELL     – re-fetch and store all shell assets
//
//  Messages sent to page
//  ───────────────────────────────────────────────────────────────────────
//  SW_ACTIVATED      – new SW just took control (triggers "App updated" toast)
//  BG_SYNC_TRIGGER   – offline queue flushed, re-fetch data
//  PERIODIC_REMINDER_CHECK – page should run checkDueReminder()
//  NOTIFICATION_CLICK      – push notification was tapped
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const CACHE_VERSION   = 'ft-v8';
const SHELL_CACHE     = `${CACHE_VERSION}-shell`;
const STATIC_CACHE    = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE   = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

const CDN_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
];

// Never cache — always live network
const BYPASS_PATTERNS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'fcmregistrations.googleapis.com',
  'firebase.googleapis.com',
  'firebasestorage.googleapis.com',
  'gstatic.com/firebasejs',
];

const MAX_RUNTIME_ENTRIES = 80;
const MAX_RUNTIME_AGE_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days
const FLUSH_THROTTLE_MS   = 30_000;                   // max once per 30 s

// ═══════════════════════════════════════════════════════════════════════════
//  INDEXED-DB  (shared with the app; SW adds two new stores in v3)
// ═══════════════════════════════════════════════════════════════════════════

const IDB_NAME    = 'fee-tracker-cache';
const IDB_VERSION = 3;

let _idb = null;

function openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = ev => {
      const db  = ev.target.result;
      const old = ev.oldVersion;

      // ── v1 stores (app-owned — never recreate) ────────────────────────
      if (!db.objectStoreNames.contains('kv'))
        db.createObjectStore('kv');

      // ── v2 store ──────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('batches_detail'))
        db.createObjectStore('batches_detail');

      // ── v3 stores (SW-owned) ──────────────────────────────────────────
      if (old < 3) {
        if (!db.objectStoreNames.contains('sw_queue')) {
          const qs = db.createObjectStore('sw_queue', { keyPath: 'id', autoIncrement: true });
          qs.createIndex('by_ts',  'ts');
          qs.createIndex('by_uid', 'uid');
        }
        if (!db.objectStoreNames.contains('sw_meta'))
          db.createObjectStore('sw_meta');
      }
    };

    req.onsuccess = ev => { _idb = ev.target.result; res(_idb); };
    req.onerror   = ev => rej(ev.target.error);
  });
}

// ─── low-level helpers ─────────────────────────────────────────────────────

async function idbGet(store, key) {
  try {
    const db = await openIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readonly');
      const r  = tx.objectStore(store).get(key);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror   = () => rej(r.error);
    });
  } catch { return null; }
}

async function idbPut(store, key, value) {
  try {
    const db = await openIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      const r  = tx.objectStore(store).put(value, key);
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
    });
  } catch (e) { console.warn('[SW IDB] put failed', e); }
}

async function idbGetAll(store) {
  try {
    const db = await openIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readonly');
      const r  = tx.objectStore(store).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror   = () => rej(r.error);
    });
  } catch { return []; }
}

async function idbDelete(store, key) {
  try {
    const db = await openIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      const r  = tx.objectStore(store).delete(key);
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
    });
  } catch {}
}

async function idbClear(store) {
  try {
    const db = await openIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      const r  = tx.objectStore(store).clear();
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
    });
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
//  OFFLINE WRITE QUEUE
//  Captures any mutating (POST/PATCH/PUT/DELETE) Firestore request made
//  while offline.  Replayed in-order on reconnect.
// ═══════════════════════════════════════════════════════════════════════════

async function enqueueRequest(uid, request) {
  let body = '';
  try { body = await request.clone().text(); } catch {}
  const headers = {};
  try { request.headers.forEach((v, k) => { headers[k] = v; }); } catch {}

  await openIDB();  // ensure schema is up-to-date
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('sw_queue', 'readwrite');
    const r  = tx.objectStore('sw_queue').add({
      uid,
      ts:      Date.now(),
      method:  request.method,
      url:     request.url,
      body,
      headers,
      retries: 0,
    });
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}

let _lastFlush = 0;

async function flushQueue() {
  const now = Date.now();
  if (now - _lastFlush < FLUSH_THROTTLE_MS) return;
  _lastFlush = now;

  const items = await idbGetAll('sw_queue');
  if (!items.length) return;

  console.log(`[SW Queue] Flushing ${items.length} queued write(s)`);
  let flushed = 0;

  for (const item of items.sort((a, b) => a.ts - b.ts)) {
    try {
      const res = await fetch(item.url, {
        method:  item.method,
        headers: item.headers,
        body:    ['GET','HEAD'].includes(item.method) ? undefined : item.body,
      });

      if (res.ok || res.status === 409) {
        // 409 = already applied by another client (Firestore conflict)
        await idbDelete('sw_queue', item.id);
        flushed++;
      } else if (res.status >= 400 && res.status < 500) {
        // Permanent client error — drop it
        await idbDelete('sw_queue', item.id);
        console.warn('[SW Queue] Dropped non-retriable write', res.status, item.url);
      } else {
        // Temporary server error — increment retry or drop after 5 attempts
        if (item.retries >= 4) {
          await idbDelete('sw_queue', item.id);
          console.warn('[SW Queue] Max retries, dropping', item.url);
        } else {
          const db = await openIDB();
          await new Promise(done => {
            const tx = db.transaction('sw_queue', 'readwrite');
            tx.objectStore('sw_queue').put({ ...item, retries: item.retries + 1 });
            tx.oncomplete = done;
          });
        }
      }
    } catch {
      // Still offline — stop and wait for next sync event
      console.log('[SW Queue] Still offline, pausing flush');
      break;
    }
  }

  if (flushed > 0) {
    await broadcastToClients({ type: 'BG_SYNC_TRIGGER', flushed });
    console.log(`[SW Queue] Flushed ${flushed} write(s)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BROADCAST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function broadcastToClients(msg) {
  const clients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: 'window',
  });
  clients.forEach(c => c.postMessage(msg));
}

// ═══════════════════════════════════════════════════════════════════════════
//  RUNTIME CACHE — LRU eviction by age and count
// ═══════════════════════════════════════════════════════════════════════════

async function stampCacheEntry(url) {
  const meta = (await idbGet('sw_meta', 'rt_ts')) || {};
  meta[url]  = Date.now();
  await idbPut('sw_meta', 'rt_ts', meta);
}

async function trimRuntimeCache() {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const keys  = await cache.keys();
    const meta  = (await idbGet('sw_meta', 'rt_ts')) || {};
    const now   = Date.now();

    // Age eviction
    for (const req of keys) {
      if (meta[req.url] && (now - meta[req.url]) > MAX_RUNTIME_AGE_MS) {
        await cache.delete(req);
        delete meta[req.url];
      }
    }

    // Count eviction (LRU)
    const remaining = await cache.keys();
    if (remaining.length > MAX_RUNTIME_ENTRIES) {
      const sorted = remaining
        .map(r => ({ r, ts: meta[r.url] || 0 }))
        .sort((a, b) => a.ts - b.ts);
      for (const { r } of sorted.slice(0, remaining.length - MAX_RUNTIME_ENTRIES)) {
        await cache.delete(r);
        delete meta[r.url];
      }
    }

    await idbPut('sw_meta', 'rt_ts', meta);
  } catch (e) {
    console.warn('[SW] trimRuntimeCache failed', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  INSTALL  —  precache the app shell
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('install', event => {
  console.log('[SW] Installing', CACHE_VERSION);

  event.waitUntil((async () => {
    // Open IDB early so the v3 upgrade runs immediately
    await openIDB().catch(() => {});

    const cache = await caches.open(SHELL_CACHE);
    // Parallel precache — individual failures don't abort the install
    await Promise.allSettled(
      SHELL_ASSETS.map(url =>
        fetch(new Request(url, { cache: 'reload' }))
          .then(r => r.ok ? cache.put(url, r) : null)
          .catch(e => console.warn('[SW] Precache miss:', url, e.message))
      )
    );

    await idbPut('sw_meta', 'version',    CACHE_VERSION);
    await idbPut('sw_meta', 'install_ts', Date.now());

    // Skip waiting so the new SW activates without waiting for all tabs to close
    await self.skipWaiting();
  })());
});

// ═══════════════════════════════════════════════════════════════════════════
//  ACTIVATE  —  clean up old caches and claim all clients
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('activate', event => {
  console.log('[SW] Activating', CACHE_VERSION);

  event.waitUntil((async () => {
    // Delete every cache that doesn't belong to this version
    const allNames = await caches.keys();
    await Promise.all(
      allNames
        .filter(n => !n.startsWith(CACHE_VERSION))
        .map(n => { console.log('[SW] Deleting stale cache:', n); return caches.delete(n); })
    );

    // Take immediate control of all open tabs
    await self.clients.claim();

    // Announce to every open tab that a fresh SW is now in control
    await broadcastToClients({ type: 'SW_ACTIVATED', version: CACHE_VERSION });

    // Trim before setting off
    await trimRuntimeCache().catch(() => {});

    // Opportunistically flush any queued offline writes
    await flushQueue().catch(() => {});
  })());
});

// ═══════════════════════════════════════════════════════════════════════════
//  FETCH  —  routing
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Ignore non-HTTP ────────────────────────────────────────────────────
  if (!url.protocol.startsWith('http')) return;

  // ── Non-GET: pass through; queue Firestore writes if offline ──────────
  if (request.method !== 'GET') {
    const isFirestore = BYPASS_PATTERNS.some(p => request.url.includes(p));
    if (isFirestore) {
      event.respondWith(
        fetch(request.clone()).catch(async () => {
          console.log('[SW] Offline — queuing write:', url.pathname);
          // Extract uid from URL if present, else mark unknown
          const uid = url.searchParams.get('uid')
            || [...url.pathname.matchAll(/\/users\/([^/]+)\//g)].pop()?.[1]
            || 'unknown';
          await enqueueRequest(uid, request);
          return new Response(
            JSON.stringify({ __queued: true, ts: Date.now() }),
            { status: 202, headers: { 'Content-Type': 'application/json', 'X-SW-Queued': '1' } }
          );
        })
      );
    }
    // Non-Firestore mutations: pass through silently
    return;
  }

  // ── Firebase APIs: always live ────────────────────────────────────────
  if (BYPASS_PATTERNS.some(p => request.url.includes(p))) {
    event.respondWith(fetch(request));
    return;
  }

  // ── App shell ────────────────────────────────────────────────────────
  const isShell =
    url.pathname === '/' ||
    url.pathname.endsWith('index.html') ||
    url.pathname === self.location.pathname.replace('sw.js', '');

  if (isShell) {
    event.respondWith(swrShell(request));
    return;
  }

  // ── CDN (fonts, Chart.js, etc.) ───────────────────────────────────────
  if (CDN_PATTERNS.some(p => request.url.includes(p))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Same-origin static files ──────────────────────────────────────────
  if (url.origin === self.location.origin) {
    const ext = url.pathname.split('.').pop().toLowerCase();
    if (['js','css','png','jpg','jpeg','svg','ico','webp','woff','woff2','ttf','json','webmanifest'].includes(ext)) {
      event.respondWith(cacheFirst(request, SHELL_CACHE));
      return;
    }
  }

  // ── Everything else: network-first ───────────────────────────────────
  event.respondWith(networkFirst(request));
});

// ─── Strategy helpers ───────────────────────────────────────────────────────

/** Stale-while-revalidate for the app shell — always instant, always fresh */
async function swrShell(request) {
  const cache  = await caches.open(SHELL_CACHE);
  const cached =
    await cache.match(request) ||
    await cache.match('./index.html') ||
    await cache.match('./');

  // Kick off background revalidation
  const revalidate = fetch(request).then(async res => {
    if (res.ok) {
      await cache.put(request, res.clone());
      // Also store under the canonical key so both '/' and '/index.html' hit cache
      await cache.put('./index.html', res.clone());
    }
    return res;
  }).catch(() => null);

  // Return cached copy immediately if available
  if (cached) {
    // Don't await revalidation — it updates in background
    revalidate.catch(() => {});
    return cached;
  }

  // No cache yet — wait for network
  const res = await revalidate;
  if (res) return res;

  return new Response(
    '<html><body style="font-family:sans-serif;text-align:center;padding:40px">'
    + '<h2>Fee Tracker</h2><p>You are offline and the app hasn\'t been cached yet.'
    + ' Connect to the internet and reload.</p></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

/** Cache-first: respond from cache, refresh in background */
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Background refresh (don't await)
    fetch(request).then(r => { if (r.ok) cache.put(request, r.clone()); }).catch(() => {});
    return cached;
  }

  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504, statusText: 'Offline – not cached' });
  }
}

/** Network-first: try network, fall back to runtime cache */
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, res.clone());
      stampCacheEntry(request.url).catch(() => {});
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('', { status: 504, statusText: 'Offline – not cached' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BACKGROUND SYNC  —  replay queued Firestore writes
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('sync', event => {
  console.log('[SW] sync:', event.tag);
  if (event.tag === 'ft-offline-queue') {
    event.waitUntil(flushQueue());
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PERIODIC BACKGROUND SYNC  —  daily fee reminder
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('periodicsync', event => {
  if (event.tag === 'fee-reminder-check') {
    event.waitUntil(handlePeriodicReminder());
  }
});

async function handlePeriodicReminder() {
  // If a window is open, let the page do the check (it has Firestore access)
  const windows = await self.clients.matchAll({ type: 'window' });
  if (windows.length > 0) {
    broadcastToClients({ type: 'PERIODIC_REMINDER_CHECK' });
    return;
  }

  // No window open — check the IDB data cache directly and notify if needed
  const profile = await idbGet('kv', '__sw_profile');
  if (!profile?.uid) return;

  const teachers = await idbGet('kv', `${profile.uid}__teachers`);
  if (!teachers || !Object.keys(teachers).length) return;

  const now  = new Date();
  const curM = now.getMonth() + 1;
  const curY = now.getFullYear();

  const due = Object.values(teachers).filter(t => {
    if (!t.baselineMonth || !t.baselineYear) return false;
    return (curY - t.baselineYear) * 12 + (curM - t.baselineMonth) > 0;
  });

  if (!due.length) return;

  const total = due.reduce((sum, t) => {
    const mo = Math.max((curY - t.baselineYear) * 12 + (curM - t.baselineMonth), 0);
    return sum + (t.fee || 0) * mo;
  }, 0);

  await self.registration.showNotification('Fee Tracker — Dues Pending', {
    body:     `${due.length} teacher${due.length > 1 ? 's' : ''} overdue · ₹${total.toLocaleString('en-IN')} total`,
    icon:     './icon-192.png',
    badge:    './icon-192.png',
    tag:      'ft-reminder',
    renotify: false,
    data:     { url: './' },
    actions: [
      { action: 'open',    title: 'Open App'  },
      { action: 'dismiss', title: 'Later'     },
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('push', event => {
  if (!event.data) return;

  let payload = {};
  try { payload = event.data.json(); }
  catch { payload = { title: 'Fee Tracker', body: event.data.text() }; }

  const title   = payload.notification?.title || payload.title || 'Fee Tracker';
  const options = {
    body:     payload.notification?.body  || payload.body  || '',
    icon:     './icon-192.png',
    badge:    './icon-192.png',
    tag:      payload.tag || 'ft-push',
    renotify: !!payload.renotify,
    vibrate:  [150, 80, 150],
    data:     { url: payload.click_action || './', ...(payload.data || {}) },
    actions: [
      { action: 'open',    title: 'Open'    },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { action }     = event;
  const { url = './' } = event.notification.data || {};

  if (action === 'dismiss') return;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const match   = clients.find(c => c.url.includes(self.location.origin));
    if (match) {
      await match.focus();
      match.postMessage({ type: 'NOTIFICATION_CLICK', url });
    } else {
      const w = await self.clients.openWindow(url);
      w?.postMessage({ type: 'NOTIFICATION_CLICK', url });
    }
  })());
});

// ═══════════════════════════════════════════════════════════════════════════
//  MESSAGE HANDLER  —  commands from the page
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('message', event => {
  const { type } = event.data || {};

  switch (type) {

    // ── Activate new SW immediately ────────────────────────────────────
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    // ── Wipe everything on sign-out ────────────────────────────────────
    case 'CLEAR_CACHE':
      event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
        await idbClear('sw_queue');
        await idbClear('sw_meta');
        _lastFlush = 0;
        console.log('[SW] Caches cleared (sign-out)');
      })());
      break;

    // ── Replay offline queue now (called when page detects "online") ───
    case 'FLUSH_QUEUE':
      _lastFlush = 0; // reset throttle so flush runs immediately
      event.waitUntil(flushQueue());
      break;

    // ── Page pushes a data snapshot into SW IDB ────────────────────────
    case 'CACHE_SNAPSHOT': {
      const { key, value } = event.data;
      if (key != null && value !== undefined)
        event.waitUntil(idbPut('kv', key, value));
      break;
    }

    // ── Evict stale runtime cache entries ─────────────────────────────
    case 'TRIM_CACHE':
      event.waitUntil(trimRuntimeCache());
      break;

    // ── Return queue length + version via MessageChannel ──────────────
    case 'QUEUE_STATUS': {
      const port = event.ports?.[0];
      if (!port) break;
      event.waitUntil(
        idbGetAll('sw_queue').then(items =>
          port.postMessage({ queueLength: items.length, version: CACHE_VERSION })
        )
      );
      break;
    }

    // ── Re-fetch and store all shell assets ───────────────────────────
    case 'RECACHE_SHELL':
      event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        await Promise.allSettled(
          SHELL_ASSETS.map(u =>
            fetch(new Request(u, { cache: 'reload' }))
              .then(r => r.ok ? cache.put(u, r) : null)
              .catch(() => {})
          )
        );
        broadcastToClients({ type: 'SW_ACTIVATED', version: CACHE_VERSION });
      })());
      break;
  }
});
