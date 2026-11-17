#!/usr/bin/env node
'use strict';
/* Minimal statisk filserver för lokal körning och tester:  node tools/serve.js [port]
   (Spelet går också att öppna direkt via filen index.html, men en server ger "https-lika" beteende,
   t.ex. att Kopiera-länk fungerar via urklippets API på localhost.) */
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function start(port, cb) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root)) { res.writeHead(403); return res.end('no'); }
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(d);
    });
  });
  srv.listen(port, () => cb && cb(srv, srv.address().port));
  return srv;
}
module.exports = { start };
if (require.main === module) {
  const port = +process.argv[2] || 8080;
  start(port, (s, p) => console.log('Le Grand Fromage: http://localhost:' + p + '/'));
}
