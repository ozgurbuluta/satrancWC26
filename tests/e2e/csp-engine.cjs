// Confirms the in-browser engine (WebAssembly worker), the masters lookup and
// the charts run under the production content security policy.
//
// Not part of CI (it needs a browser). To run it:
//   npm run build && npx vite preview --port 4173 --host 127.0.0.1
//   node tests/e2e/csp-engine.cjs       (needs the `playwright` package and its Chromium)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const violations = [];
  const errors = [];
  p.on('console', m => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) violations.push(t.slice(0, 260)); });
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  // no cloud evaluations: the local engine has to do the work
  await p.route('**/api/cloud-eval**', r => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
  await p.goto('http://127.0.0.1:4173/?parti=1&hamle=40', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.player-bar', { timeout: 25000 });
  let src = null;
  for (let i = 0; i < 40 && !/Yerel|Local/.test(src || ''); i++) { await p.waitForTimeout(500); src = await p.locator('.engine-src').innerText().catch(() => null); }
  console.log('engine source:', src, '| eval:', await p.locator('.eval-big').innerText().catch(() => null));
  console.log('engine lines:', await p.locator('.pv-list li').count());
  await p.locator('.tabs button', { hasText: 'Benzer' }).click();
  await p.waitForTimeout(5000);
  console.log('similar tab:', (await p.locator('.similar').innerText()).replace(/\n+/g, ' | ').slice(0, 160));
  await p.locator('.tabs button', { hasText: 'Grafik' }).click();
  await p.waitForTimeout(6000);
  console.log('charts tab head:', (await p.locator('.charts section').first().innerText()).replace(/\n+/g, ' | ').slice(0, 120));
  console.log('CSP violations:', violations.length ? violations : 'none');
  console.log('page errors:', errors.length ? errors : 'none');
  await b.close();
})();
