// Embed test: serves the proposed /satranc/ page (docs/embed-shell) on
// http://localhost:4174 and checks the chess site inside its sandboxed frame,
// on another origin, under the production security headers.
//
// Not part of CI (it needs a browser). To run it:
//   npm run build
//   PREVIEW_FRAME_ANCESTORS=http://localhost:4174 npx vite preview --port 4173 --host 127.0.0.1
//   node tests/e2e/embed.cjs            (needs the `playwright` package and its Chromium)
// Arguments: [all|desktop|denied|phone] [folder for screenshots]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const APP = 'http://127.0.0.1:4173';
const SHELL_DIR = path.join(__dirname, '../../docs/embed-shell');
const sandboxOverride = process.env.SANDBOX; // to try a different token list

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:4174');
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  try {
    let body = fs.readFileSync(path.join(SHELL_DIR, path.basename(file)), 'utf8').replaceAll('APP_ORIGIN', APP);
    if (sandboxOverride !== undefined) body = body.replace(/sandbox="[^"]*"/, `sandbox="${sandboxOverride}"`);
    res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

const run = async (label, opts = {}) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(opts.device ? { ...devices[opts.device] } : { viewport: { width: 1440, height: 900 } });
  if (opts.denyStorage) {
    await ctx.addInitScript(() => {
      if (location.origin !== 'http://127.0.0.1:4173') return; // only the chess app loses storage, not the video player
      const deny = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
      Storage.prototype.setItem = deny;
      Storage.prototype.getItem = deny;
      Storage.prototype.removeItem = deny;
    });
  }
  const page = await ctx.newPage();
  const violations = [];
  const errors = [];
  page.on('console', m => {
    const t = m.text();
    if (/Content Security Policy|Refused to|sandbox|Blocked/i.test(t)) violations.push(`${m.location().url.slice(0, 50)} :: ${t.slice(0, 230)}`);
  });
  page.on('pageerror', e => errors.push(String(e).slice(0, 120) + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' <- ').slice(0, 260)));
  const popups = [];
  ctx.on('page', p => popups.push(p));

  await page.goto('http://localhost:4174/?parti=1&hamle=12&internal=1&secret=abc&utm_source=tw&posthog=evil', { waitUntil: 'domcontentloaded' });
  const handle = await page.waitForSelector('#satranc');
  const frame = await handle.contentFrame();
  await frame.waitForSelector('.player-bar', { timeout: 25000 });
  await frame.waitForTimeout(6000);

  const out = {};
  out.frameUrl = frame.url();
  out.shellTitle = await page.title();
  out.activeMove = await frame.locator('.strip-track .move.active').first().innerText().catch(() => null);
  out.movesShown = await frame.locator('button.move').count();
  out.evalText = await frame.locator('.eval-strip').getAttribute('aria-label').catch(() => null);
  out.engineSource = await frame.locator('.engine-src').innerText().catch(() => null);
  out.storage = await frame.evaluate(() => { try { localStorage.setItem('satranc:probe2', '1'); const ok = localStorage.getItem('satranc:probe2') === '1'; localStorage.removeItem('satranc:probe2'); return ok ? 'works' : 'no'; } catch (e) { return 'denied: ' + e.name; } });
  out.framed = await frame.evaluate(() => { try { return window.top !== window.self; } catch { return true; } });
  out.canReadParent = await frame.evaluate(() => { try { return String(window.parent.document.title); } catch (e) { return 'blocked: ' + e.name; } });
  out.canReadParentCookie = await frame.evaluate(() => { try { return window.parent.document.cookie; } catch (e) { return 'blocked: ' + e.name; } });
  out.topNavigation = await frame.evaluate(() => { try { window.top.location.href = 'https://example.com/'; return 'NOT BLOCKED'; } catch (e) { return 'blocked: ' + e.name; } });
  await page.waitForTimeout(800);
  out.shellStillHere = page.url().startsWith('http://localhost:4174/');
  const yt = page.frames().find(f => /youtube\.com\/embed/.test(f.url()));
  out.youtubeFrame = yt ? yt.url().slice(0, 60) : null;
  if (yt) {
    await yt.waitForTimeout(2500);
    out.youtubePlayer = await yt.evaluate(() => ({ player: !!document.querySelector('.html5-video-player, #player'), error: document.querySelector('.ytp-error')?.textContent?.slice(0, 80) || '' })).catch(e => 'eval failed: ' + String(e).slice(0, 80));
  }
  // keyboard works without a click: the shell focused the frame on load
  const before = out.activeMove;
  await page.keyboard.press('ArrowLeft');
  await frame.waitForTimeout(300);
  out.arrowKeyMoved = (await frame.locator('.strip-track .move.active').first().innerText().catch(() => null)) !== before;
  // after a click in the video, a click on the board brings the arrow keys back, inside the frame as well
  if (!opts.device) {
    const active = () => frame.locator('.strip-track .move.active').first().innerText().catch(() => null);
    const video = await frame.locator('.player iframe').boundingBox();
    if (video) {
      // what the page has under that point, in its own coordinates: the video's frame and nothing over it
      const under = await frame.evaluate(() => {
        const b = document.querySelector('.player iframe').getBoundingClientRect();
        const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return `${at?.tagName} ${Math.round(b.width)}x${Math.round(b.height)}`;
      });
      await page.mouse.click(video.x + video.width / 2, video.y + video.height / 2);
      await frame.waitForTimeout(600);
      const inVideo = await frame.evaluate(() => document.activeElement?.tagName);
      const beforeKeys = await active();
      await page.keyboard.press('ArrowRight');
      await frame.waitForTimeout(300);
      const stuck = (await active()) === beforeKeys;
      const board = await frame.locator('.board-col cg-board').boundingBox();
      await page.mouse.click(board.x + board.width * 0.94, board.y + board.height * 0.56);
      await frame.waitForTimeout(300);
      const afterClick = await frame.evaluate(() => document.activeElement?.tagName);
      await page.keyboard.press('ArrowRight');
      await frame.waitForTimeout(300);
      out.keysAfterVideo = { underTheClick: under, clickedAt: [Math.round(video.x + video.width / 2), Math.round(video.y + video.height / 2)], focusInVideo: inVideo, arrowsHeldByVideo: stuck, focusAfterBoardClick: afterClick, arrowMovedAgain: (await active()) !== beforeKeys };
      await page.keyboard.press('ArrowLeft');
      await frame.waitForTimeout(200);
    }
  }
  // outbound link opens a normal tab
  if (!opts.device) {
    // the page's one link to somewhere else: the source code, in the footer
    await frame.locator('.foot a').first().click().catch(e => (out.popupError = String(e).slice(0, 120)));
    await page.waitForTimeout(1500);
    out.popupOpened = popups.length;
    if (popups[0]) out.popupUrl = popups[0].url().slice(0, 50);
  }
  // viewport fill and inner scrolling
  out.fill = await page.evaluate(() => { const r = document.getElementById('satranc').getBoundingClientRect(); return { frame: [Math.round(r.width), Math.round(r.height)], viewport: [innerWidth, innerHeight], pageScrolls: document.documentElement.scrollHeight > innerHeight + 1 }; });
  out.innerScroll = await frame.evaluate(() => ({ scrollable: document.documentElement.scrollHeight > innerHeight, overflowX: document.documentElement.scrollWidth - innerWidth }));
  // settings: language switch, persistence notice
  await frame.locator('.tabs button').last().click();
  await frame.waitForTimeout(300);
  out.persistenceNotice = (await frame.locator('.notice').count()) > 0;
  await frame.locator('.settings .seg button', { hasText: 'English' }).click();
  await frame.waitForTimeout(300);
  // the first tab is "Stockfish" in both languages; the last one is not
  out.languageSwitched = (await frame.locator('.tabs button').last().innerText()).trim() === 'Settings';
  if (opts.shot) await page.screenshot({ path: opts.shot });

  console.log(`\n=== ${label}`);
  for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  console.log('  CSP/sandbox messages:', violations.length ? '\n    ' + [...new Set(violations)].slice(0, 8).join('\n    ') : 'none');
  console.log('  page errors:', errors.length ? errors.slice(0, 4) : 'none');
  await browser.close();
};

server.listen(4174, 'localhost', async () => {
  const which = process.argv[2] || 'all';
  const dir = process.argv[3] || '.';
  try {
    if (which === 'all' || which === 'desktop') await run('desktop, storage available', { shot: dir + '/embed-desktop.png' });
    if (which === 'all' || which === 'denied') await run('desktop, storage denied (Safari-style)', { denyStorage: true });
    if (which === 'all' || which === 'phone') await run('iPhone 14 emulation', { device: 'iPhone 14', shot: dir + '/embed-phone.png' });
  } finally {
    server.close();
  }
});
