/* ============================================================
   构建「docs」目录
   用法：node 构建发布目录.js
   作用：以 学习工作台.html（单文件版）为唯一源，
        生成 docs/ 目录（可托管版）：
          index.html              注入静态 manifest 引用
          manifest.webmanifest    真实 manifest 文件
          sw.js                   Service Worker（离线 + 安装提示）
          icon-192.png            PWA 图标
          icon-512.png
          icon-maskable-512.png
          .nojekyll               让 GitHub Pages 跳过 Jekyll 处理
   目录名用 docs/ 是为了直接对接 GitHub Pages：
   仓库 Settings → Pages → Source 选 main / docs，
   线上地址即 https://<用户名>.github.io/<仓库名>/

   改完 学习工作台.html 后重跑本脚本，再 push 即可（Pages 会自动重新部署）。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'docs');
const SRC = path.join(ROOT, '学习工作台.html');

/* ============ 1. 极简 PNG 编码器（仅用内置 zlib） ============ */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    const o = y * (w * 4 + 1);
    raw[o] = 0;
    rgba.copy(raw, o + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ============ 2. 图标绘制（秒表 + 蓝紫渐变，4x4 超采样抗锯齿） ============ */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inRoundRect(x, y, r) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  const cx = clamp(x, r, 1 - r), cy = clamp(y, r, 1 - r);
  return (x === cx && y === cy) || Math.hypot(x - cx, y - cy) <= r;
}
function renderIcon(size, { roundRadius, glyphScale }) {
  const SS = 4, HW = 0.031, s = glyphScale;
  const P = (x, y) => [0.5 + (x - 0.5) * s, 0.5 + (y - 0.5) * s];
  const [rcx, rcy] = P(0.5, 0.545), RR = 0.245 * s, RHW = HW * s;
  const [p1x, p1y] = P(0.5, 0.395), [p2x, p2y] = P(0.5, 0.56), [p3x, p3y] = P(0.585, 0.62);
  const [s1x, s1y] = P(0.4, 0.245), [s2x, s2y] = P(0.6, 0.245);
  const [s3x, s3y] = P(0.5, 0.245), [s4x, s4y] = P(0.5, 0.30);
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rS = 0, gS = 0, bS = 0, aS = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
          if (roundRadius > 0 && !inRoundRect(x, y, roundRadius)) continue;
          const t = clamp((x + y) / 2, 0, 1);
          let R = 0x3b + (0x7a - 0x3b) * t, G = 0x74 + (0x5c - 0x74) * t, B = 0xff;
          let white = Math.abs(Math.hypot(x - rcx, y - rcy) - RR) <= RHW;
          if (!white) white = Math.min(distSeg(x, y, p1x, p1y, p2x, p2y), distSeg(x, y, p2x, p2y, p3x, p3y)) <= RHW;
          if (!white) white = Math.min(distSeg(x, y, s1x, s1y, s2x, s2y), distSeg(x, y, s3x, s3y, s4x, s4y)) <= RHW;
          if (white) { R = 255; G = 255; B = 255; }
          rS += R; gS += G; bS += B; aS += 255;
        }
      }
      const o = (py * size + px) * 4;
      if (aS === 0) continue;
      const n = aS / 255;
      out[o] = Math.round(rS / n); out[o + 1] = Math.round(gS / n);
      out[o + 2] = Math.round(bS / n); out[o + 3] = Math.round(aS / (SS * SS));
    }
  }
  return encodePNG(size, size, out);
}

/* ============ 3. 开始构建 ============ */
if (!fs.existsSync(SRC)) { console.error('找不到源文件：' + SRC); process.exit(1); }
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

/* 3.1 图标 */
[['icon-192.png', 192, { roundRadius: 0.22, glyphScale: 1.0 }],
 ['icon-512.png', 512, { roundRadius: 0.22, glyphScale: 1.0 }],
 ['icon-maskable-512.png', 512, { roundRadius: 0.0, glyphScale: 0.70 }]
].forEach(([name, size, opts]) => {
  fs.writeFileSync(path.join(OUT, name), renderIcon(size, opts));
});

/* 3.2 index.html：注入静态 manifest 引用 */
let html = fs.readFileSync(SRC, 'utf8');
const anchor = '<meta name="description" content="离线可用的学习目标与学习时长管理台，单文件、零依赖。">';
if (html.indexOf(anchor) < 0) { console.error('注入锚点未找到，请检查 学习工作台.html 的 head'); process.exit(1); }
if (html.indexOf('rel="manifest" href="./manifest.webmanifest"') < 0) {
  html = html.replace(anchor, anchor + '\n<link rel="manifest" href="./manifest.webmanifest">');
}
fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');

/* 3.3 manifest.webmanifest */
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: '学习工作台',
  short_name: '学习工作台',
  description: '离线可用的学习目标与学习时长管理台',
  lang: 'zh-CN',
  dir: 'ltr',
  start_url: './index.html',
  scope: './',
  id: './',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui'],
  orientation: 'portrait',
  background_color: '#eef1f7',
  theme_color: '#2f6bff',
  categories: ['productivity', 'education'],
  icons: [
    { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: './icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ],
  shortcuts: [
    { name: '开始专注', short_name: '专注', url: './index.html#focus' },
    { name: '数据统计', short_name: '统计', url: './index.html#stats' }
  ]
}, null, 2), 'utf8');

/* 3.4 sw.js */
fs.writeFileSync(path.join(OUT, 'sw.js'), `/* 学习工作台 Service Worker —— 离线可用 */
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
`, 'utf8');

/* 3.5 .nojekyll —— 让 GitHub Pages 原样输出，不做 Jekyll 处理 */
fs.writeFileSync(path.join(OUT, '.nojekyll'), '', 'utf8');

/* 3.6 汇报 */
console.log('源文件: 学习工作台.html');
console.log('输出目录: docs/\n');
fs.readdirSync(OUT).sort().forEach(f => {
  console.log('  ' + f.padEnd(26) + (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + ' KB');
});
console.log('\n完成。');
console.log('  · GitHub Pages：git push 后自动重新部署，地址不变');
console.log('  · 若要用 WorkBuddy 沙箱托管：workbuddy_sites_deploy 的 directory 指向 docs/');
