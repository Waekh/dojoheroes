// Starts the Vite dev server, opens the scene in headless Chromium and saves 1920x1080 screenshots.
// Usage: npm run shots [-- name=foo url=/index.html wait=1500]
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = Object.fromEntries(process.argv.slice(2).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
const name = args.name || 'scene';
const url = args.url || '/index.html';
const wait = Number(args.wait || 1500);
const port = 5199;
fs.mkdirSync('shots', { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'pipe', detached: true });
const stopVite = () => { try { process.kill(-vite.pid); } catch { /* already gone */ } };
process.on('exit', stopVite);
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('vite did not start')), 30000);
  vite.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(to); res(); } });
});

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text()); });
await page.goto(`http://localhost:${port}${url}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
await page.waitForTimeout(wait);
const out = path.join('shots', `${name}.png`);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
stopVite();
process.exit(0);
