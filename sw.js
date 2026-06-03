// Service Worker Version
const CACHE_NAME = 'store-pwa-v2';
const CACHE_VERSION = '2026.01';

// Essential files to cache immediately
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

// External resources to cache
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap'
];

// ============================================
// 1. Install Event - Cache essential files
// ============================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll([...STATIC_ASSETS, ...EXTERNAL_ASSETS]);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache assets:', error);
      })
  );
});

// ============================================
// 2. Activate Event - Clean old caches
// ============================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old caches
              return cacheName !== CACHE_NAME && cacheName.startsWith('store-pwa-');
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Old caches cleaned');
        return self.clients.claim();
      })
  );
});

// ============================================
// 3. Fetch Event - Network First, Cache Fallback
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Strategy: Network First for HTML, Cache First for assets
  if (request.headers.get('accept').includes('text/html')) {
    // Network First for HTML pages
    event.respondWith(networkFirst(request));
  } else {
    // Cache First for static assets
    event.respondWith(cacheFirst(request));
  }
});

// ============================================
// Network First Strategy
// ============================================
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // If successful, clone and cache
    if (networkResponse && networkResponse.status === 200) {
      const responseToCache = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback to index.html for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }
    
    return new Response('Offline - Resource not found', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// ============================================
// Cache First Strategy
// ============================================
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      // Fetch in background to update cache
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, networkResponse.clone());
          });
        }
      }).catch(() => {
        // Network failed, but we have cache - that's fine
      });
      
      return cachedResponse;
    }
    
    // Not in cache, try network
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const responseToCache = networkResponse.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// ============================================
// 4. Message Handling
// ============================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skipping waiting...');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Clearing cache...');
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

// ============================================
// 5. Background Sync (for future use)
// ============================================
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncTransactions());
  }
});

async function syncTransactions() {
  // Future: Sync offline transactions when back online
  console.log('[SW] Syncing transactions...');
}

// ============================================
// 6. Push Notifications (for future use)
// ============================================
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: './icons/icon-192.svg',
    badge: './icons/icon-192.svg',
    vibrate: [200, 100, 200],
    tag: 'store-notification',
    requireInteraction: true
  };
  
  event.waitUntil(
    self.registration.showNotification('إدارة المتجر', options)
  );
});

// ============================================
// 7. Notification Click Handler
// ============================================
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === './' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
  );
});

// ============================================
// Helper: Check if URL is external
// ============================================
function isExternalURL(url) {
  return url.startsWith('http') && !url.includes(self.location.hostname);
}

console.log('[SW] Service Worker loaded - Version:', CACHE_VERSION);
