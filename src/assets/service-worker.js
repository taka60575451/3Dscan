// Service Worker for LiDAR 3D Scanner Web App
const CACHE_NAME = 'lidar-scanner-cache-v1';
const OFFLINE_PAGE = '/offline.html';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/help.html',
  '/css/main.css',
  '/js/app.js',
  '/js/deviceDetector.js',
  '/js/viewManager.js',
  '/js/eventBus.js',
  '/js/settingsManager.js',
  '/js/lidarScanner.js',
  '/js/pointCloudProcessor.js',
  '/js/pointCloudRenderer.js',
  '/js/exportManager.js',
  '/js/measurementTools.js',
  '/js/ui.js',
  '/js/utils.js',
  '/js/shaders.js',
  '/images/icons.svg',
  '/images/app-logo.svg',
  '/manifest.json',
  OFFLINE_PAGE
];

// Install Service Worker and Cache Assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching app assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches on activation
self.addEventListener('activate', event => {
  const currentCaches = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
    }).then(cachesToDelete => {
      return Promise.all(cachesToDelete.map(cacheToDelete => {
        return caches.delete(cacheToDelete);
      }));
    }).then(() => self.clients.claim())
  );
});

// Network-first strategy for dynamic content, Cache-first for static assets
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // Special handling for API requests
  if (event.request.url.includes('/api/')) {
    return handleApiRequest(event);
  }
  
  // For page navigations, use network first with offline fallback
  if (event.request.mode === 'navigate') {
    return handleNavigationRequest(event);
  }
  
  // For static assets, use cache first with network fallback
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Return cached response and update cache in background
        updateAssetCache(event.request);
        return cachedResponse;
      }
      
      return fetchAndCache(event.request);
    })
  );
});

// Handle navigation requests with network-first strategy
function handleNavigationRequest(event) {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache the latest version
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, response.clone());
        });
        return response;
      })
      .catch(() => {
        // If network fails, try to return cached page
        return caches.match(event.request)
          .then(cachedResponse => {
            return cachedResponse || caches.match(OFFLINE_PAGE);
          });
      })
  );
}

// Handle API requests with network-first strategy
function handleApiRequest(event) {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Don't cache error responses
        if (!response.ok) {
          return response;
        }
        
        // Cache successful API responses for short-term use
        caches.open(CACHE_NAME + '-api').then(cache => {
          cache.put(event.request, response.clone());
        });
        return response;
      })
      .catch(() => {
        // Try to return cached API response if available
        return caches.match(event.request);
      })
  );
}

// Fetch and cache new assets
function fetchAndCache(request) {
  return fetch(request)
    .then(response => {
      // Don't cache error responses or non-GET requests
      if (!response.ok || request.method !== 'GET') {
        return response;
      }
      
      caches.open(CACHE_NAME).then(cache => {
        cache.put(request, response.clone());
      });
      return response;
    })
    .catch(error => {
      console.error('Fetch failed:', error);
      throw error;
    });
}

// Update asset cache in background
function updateAssetCache(request) {
  fetch(request).then(response => {
    if (response.ok && request.method === 'GET') {
      caches.open(CACHE_NAME).then(cache => {
        cache.put(request, response);
      });
    }
  }).catch(() => {
    // Silently fail - we already have a cached version
  });
}

// Background sync for pending exports
self.addEventListener('sync', event => {
  if (event.tag === 'pending-exports') {
    event.waitUntil(syncPendingExports());
  }
});

// Handle pending exports
async function syncPendingExports() {
  try {
    const pendingExports = await getPendingExportsFromIDB();
    for (const exportData of pendingExports) {
      try {
        await uploadExport(exportData);
        await markExportComplete(exportData.id);
      } catch (error) {
        console.error('Failed to sync export:', error);
      }
    }
  } catch (error) {
    console.error('Failed to process pending exports:', error);
  }
}

// Placeholder functions for background sync
function getPendingExportsFromIDB() {
  // Implement IndexedDB access to get pending exports
  return Promise.resolve([]);
}

function uploadExport(exportData) {
  // Implement export upload logic
  return Promise.resolve();
}

function markExportComplete(id) {
  // Implement marking export as complete in IndexedDB
  return Promise.resolve();
}

// Push notification support
self.addEventListener('push', event => {
  if (!event.data) {
    return;
  }
  
  const data = event.data.json();
  const options = {
    body: data.body || 'New notification',
    icon: '/images/app-logo.svg',
    badge: '/images/notification-badge.png',
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'LiDAR Scanner', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({type: 'window'})
      .then(clientList => {
        const url = event.notification.data.url;
        
        // If a window is already open, focus it
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});