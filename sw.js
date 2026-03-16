/**
 * Fee Tracker — Advanced Service Worker v4
 * ──────────────────────────────────────────
 * Strategies per resource type:
 *   App shell / self-origin  → Cache-First + background refresh
 *   Firebase SDK (CDN)       → Cache-First (versioned, immutable)
 *   Google Fonts CSS         → Stale-While-Revalidate
 *   Google Fonts woff2       → Cache-First (immutable files)
 *   Third-party CDN          → Cache-First
 *   Firebase/Google APIs     → Network-Only (bypass — Firestore has its own offline)
 *   Navigation               → Cache-First → /index.html SPA fallback
 *
 * Extra capabilities:
 *   • Versioned multi-cache with automatic cleanup on activate
 *   • Skip-waiting + clients.claim() for zero-downtime updates
 *   • Background Sync — retries failed writes when back online
 *   • Periodic Background Sync — proactive fee reminders
 *   • Rich push notifications with actions + vibration
 *   • Two-way messaging with the page (SKIP_WAITING, CACHE_URLS, CLEAR_CACHE, etc.)
 *   • Sign-out cache wipe to protect privacy on shared devices
 *   • Detailed dev logging
 */

const VERSION    = 'fee-tracker-v4';
const FONT_CACHE = 'fee-tracker-fonts-v1';
const CDN_CACHE  = 'fee-tracker-cdn-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Pinned exactly to the version imported in index.html
const FIREBASE_SDK = [
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js',
];

const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

// These must NEVER be intercepted — Firebase handles its own offline queue
const BYPASS = [
  'firestore.googleapis.com',
  'firestore.googleapis.com',
  'fcm.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'accounts.google.com',
  'oauth2.googleapis.com',
  'firebase.googleapis.com',
  'cloudmessaging.googleapis.com',
];

const log = (...a) => console.log('[SW]', ...a);

// ─────────────────────────────────────────────────────────────────────────
// INSTALL — pre-cache critical assets
// ─────────────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  log('Installing', VERSION);
  e.waitUntil((async () => {
    // Cache app shell + Firebase SDK (critical — needed for offline boot)
    const shell = await caches.open(VERSION);
    await Promise.allSettled([
      ...APP_SHELL.map(u => shell.add(u).catch(() => log('Shell miss:', u))),
      ...FIREBASE_SDK.map(u => shell.add(u).catch(() => log('SDK miss:', u))),
    ]);
    // Cache CDN (non-critical — graceful if fails)
    const cdn = await caches.open(CDN_CACHE);
    await Promise.allSettled(CDN_ASSETS.map(u => cdn.add(u).catch(() => {})));
    log('Install complete — pre-cache done');
  })());
  self.skipWaiting(); // activate immediately, don't wait for old SW to die
});

// ─────────────────────────────────────────────────────────────────────────
// ACTIVATE — evict old caches, claim all clients
// ─────────────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  const KEEP = new Set([VERSION, FONT_CACHE, CDN_CACHE]);
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !KEEP.has(k)).map(k => {
      log('Evicting old cache:', k);
      return caches.delete(k);
    }));
    await self.clients.claim(); // take control of all open tabs
    log('Activated', VERSION);
    // Tell all open windows a new SW is now running
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

// ─────────────────────────────────────────────────────────────────────────
// FETCH — route requests to the right strategy
// ─────────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = request.url;

  // Only handle GET
  if (request.method !== 'GET') return;

  // Never touch Firebase/Google auth/Firestore — bypass completely
  if (BYPASS.some(p => url.includes(p))) return;

  // 1. Navigation (page load) — cache-first with /index.html SPA fallback
  if (request.mode === 'navigate') {
    e.respondWith(
      caches.match(request)
        .then(r => r || caches.match('/index.html'))
        .then(r => r || fetch(request))
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 2. Google Fonts CSS — stale-while-revalidate (CSS may change slightly)
  if (url.includes('fonts.googleapis.com')) {
    e.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // 3. Google Fonts woff2 — cache-first (font binary files are content-addressed/immutable)
  if (url.includes('fonts.gstatic.com')) {
    e.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // 4. Firebase SDK — cache-first (pinned version, never changes)
  if (url.includes('gstatic.com/firebasejs')) {
    e.respondWith(cacheFirst(request, VERSION));
    return;
  }

  // 5. Other CDN assets (Chart.js etc.) — cache-first
  if (url.includes('cdnjs.cloudflare.com')) {
    e.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // 6. Same-origin app assets — cache-first + background refresh
  if (url.startsWith(self.location.origin)) {
    e.respondWith(cacheFirstWithRefresh(request, VERSION));
    return;
  }

  // 7. Anything else — network, cache as fallback
  e.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          caches.open(CDN_CACHE).then(c => c.put(request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});

// ─────────────────────────────────────────────────────────────────────────
// STRATEGIES
// ─────────────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return new Response('Offline — resource unavailable', { status: 503,
      headers: { 'Content-Type': 'text/plain' } });
  }
}

async function cacheFirstWithRefresh(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  // Always kick off a background refresh so cache stays fresh
  const refresh = fetch(request).then(res => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || refresh;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  // Revalidate in background unconditionally
  fetch(request).then(res => {
    if (res.ok) cache.put(request, res.clone());
  }).catch(() => {});
  return cached || fetch(request).catch(() =>
    new Response('Offline', { status: 503 }));
}

// ─────────────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { payload = { title: 'Fee Tracker', body: e.data.text() }; }

  const n    = payload.notification || payload;
  const data = payload.data || {};

  e.waitUntil(
    self.registration.showNotification(n.title || 'Fee Tracker 📅', {
      body:    n.body || 'You have pending fee payments.',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      tag:     data.tag || 'fee-tracker-push',
      renotify: true,
      vibrate: [200, 80, 200, 80, 400],
      requireInteraction: !!data.requireInteraction,
      data:    { url: data.url || '/', ...data },
      actions: [
        { action: 'open',    title: 'Open App'  },
        { action: 'dismiss', title: 'Later'     },
      ],
      ...(n.image ? { image: n.image } : {}),
    })
  );
});

// ─────────────────────────────────────────────────────────────────────────
// NOTIFICATION CLICK
// ─────────────────────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing open tab
      for (const c of clients) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.focus();
          c.postMessage({ type: 'NOTIFICATION_CLICK', url });
          return;
        }
      }
      // No open tab — open a new one
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('notificationclose', e => {
  log('Notification dismissed:', e.notification.tag);
});

// ─────────────────────────────────────────────────────────────────────────
// BACKGROUND SYNC — fires when connection restores after offline mutations
// ─────────────────────────────────────────────────────────────────────────
self.addEventListener('sync', e => {
  log('Background sync triggered:', e.tag);
  if (e.tag === 'fee-data-sync') {
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'BG_SYNC_TRIGGER' }))
      )
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────
// PERIODIC BACKGROUND SYNC — proactive reminders when app is closed
// ─────────────────────────────────────────────────────────────────────────
self.addEventListener('periodicsync', e => {
  log('Periodic sync:', e.tag);
  if (e.tag === 'fee-reminder-check') {
    e.waitUntil((async () => {
      const clients = await self.clients.matchAll({ type: 'window' });
      if (clients.length > 0) {
        // App is open — let it handle reminders natively
        clients.forEach(c => c.postMessage({ type: 'PERIODIC_REMINDER_CHECK' }));
        return;
      }
      // App is closed — fire a background reminder notification
      const perm = self.Notification?.permission ?? 'default';
      if (perm !== 'granted') return;
      await self.registration.showNotification('Fee Tracker — Fees due? 📅', {
        body: 'Open the app to review your pending payments.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'periodic-reminder',
        renotify: false, // don't buzz again if one is already showing
        actions: [
          { action: 'open',    title: '📱 Open App' },
          { action: 'dismiss', title: 'Later'       },
        ],
      });
    })());
  }
});

// ─────────────────────────────────────────────────────────────────────────
// MESSAGE HANDLER — two-way communication with the page
// ─────────────────────────────────────────────────────────────────────────
self.addEventListener('message', e => {
  const { type, payload } = e.data || {};
  switch (type) {

    // Page explicitly asks the new SW to activate (update prompt flow)
    case 'SKIP_WAITING':
      log('Page requested SKIP_WAITING');
      self.skipWaiting();
      break;

    // Cache specific URLs on demand (e.g. images loaded at runtime)
    case 'CACHE_URLS':
      if (Array.isArray(payload)) {
        caches.open(VERSION).then(c =>
          Promise.allSettled(payload.map(u => c.add(u)))
        );
      }
      break;

    // Wipe all caches on sign-out to protect privacy on shared devices
    case 'CLEAR_CACHE':
      log('Clearing all caches (sign-out)');
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
      break;

    // Page queries the running SW version
    case 'GET_VERSION':
      e.source?.postMessage({ type: 'SW_VERSION', version: VERSION });
      break;

    // Register periodic sync if browser supports it
    case 'REGISTER_PERIODIC_SYNC':
      if ('periodicSync' in self.registration) {
        self.registration.periodicSync.register('fee-reminder-check', {
          minInterval: 24 * 60 * 60 * 1000, // once per day
        }).catch(() => {});
      }
      break;

    default:
      break;
  }
});

log('Script evaluated:', VERSION);
