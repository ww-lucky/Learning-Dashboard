/* 学习工作台 Service Worker —— 离线可用 */
var CACHE = 'study-desk-v2';
var ASSETS = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); })
    .then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){ return k === CACHE ? null : caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        // 只在响应正常时更新缓存。服务器返回 4xx/5xx（例如域名被回收后网关报 400）时
        // 绝不能拿错误页覆盖已缓存的 App，否则已安装的应用会被一个错误页替换掉。
        if (res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put('./index.html', copy); });
          return res;
        }
        return caches.match('./index.html').then(function(hit){ return hit || res; });
      }).catch(function(){
        return caches.match('./index.html');
      })
    );
    return;
  }
  e.respondWith(caches.match(req).then(function(hit){
    if (hit) return hit;
    return fetch(req).then(function(res){
      if (res && res.status === 200 && res.type === 'basic'){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
      }
      return res;
    });
  }));
});
