// Builds a single self-contained HTML page of the game (for sharing / playing in a browser tab):
// the game code is bundled inline, three.js is loaded from jsDelivr through an import map,
// sprite sheets are embedded as data URIs. Output: dist-artifact/dojo-heroes.html
import fs from 'fs';
import path from 'path';
import { build } from 'vite';

const THREE_VERSION = JSON.parse(fs.readFileSync('node_modules/three/package.json', 'utf8')).version;
const out = 'dist-artifact';
await build({
  logLevel: 'warn',
  publicDir: false,
  build: {
    outDir: out, emptyOutDir: true, minify: true, target: 'es2022',
    lib: { entry: 'src/main.js', formats: ['es'], fileName: () => 'game.js' },
    rollupOptions: { external: ['three'] },
  },
});
const js = fs.readFileSync(path.join(out, 'game.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const assets = {};
for (const f of fs.readdirSync('public/sprites')) {
  const p = path.join('public/sprites', f);
  if (f.endsWith('.json')) assets[`/sprites/${f}`] = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (f.endsWith('.png')) assets[`/sprites/${f}`] = `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
}
const html = `<title>Dojo Heroes</title>
<style>
  :root { --bg: #08060c; color-scheme: dark; }
  html, body { height: 100%; background: var(--bg); overflow: hidden; }
  #app { position: fixed; inset: 0; }
  #app canvas { display: block; width: 100%; height: 100%; }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet">
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js" } }</script>
<script>window.__ASSETS = ${JSON.stringify(assets)};</script>
<div id="app"></div>
<script type="module">${js}</script>
`;
fs.writeFileSync(path.join(out, 'dojo-heroes.html'), html);
console.log('wrote', path.join(out, 'dojo-heroes.html'), (html.length / 1024).toFixed(0), 'KB, three', THREE_VERSION);
