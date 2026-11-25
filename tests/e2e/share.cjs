// Share button in a real browser: what lands on the clipboard, what happens
// when copying is refused, inside the sandboxed frame on another origin, at
// phone size and with the keyboard only.
//
// Not part of CI (it needs a browser). To run it:
//   VITE_PUBLIC_URL=https://ozgurakanay.com/satranc/ npm run build
//   PREVIEW_FRAME_ANCESTORS=http://localhost:4174 npx vite preview --port 4173 --host 127.0.0.1
//   node tests/e2e/share.cjs [folder for screenshots]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const APP = 'http://127.0.0.1:4173';
const SHELL = 'http://localhost:4174';
const SHELL_DIR = path.join(__dirname, '../../docs/embed-shell');
const PUBLIC = 'https://ozgurakanay.com/satranc/';
const TOUR = 'qfkdt8mn';
const R1 = 'xLgOJ6cb';
const LINE = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'];
// What a visitor's address can carry besides the game and the move. None of it may reach a shared link.
const NOISE = 'internal=1&posthog=test&ref=x.com&utm_source=tw&utm_campaign=wc&secret=abc';
const LEAK = /internal|posthog|ref=|utm_|secret|tour|round|127\.0\.0\.1|localhost|vercel/;
const MATE2 = { id: 'tstM2', fen: '8/3RRp2/5kp1/8/3P1P1p/8/6rr/5K2 w - - 1 1', lastMove: 'g7f6', solution: ['e7f7', 'f6e6', 'd4d5'], rating: 1303, themes: ['mateIn2'] };

const out = process.argv[2] || '.';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const pgn = (plies, board = 1) => {
  const body = LINE.slice(0, plies)
    .map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}.` : `${(i - 1) / 2 + 1}...`} ${san} { [%clk 1:5${9 - (i % 9)}:00] }`)
    .join(' ');
  return `[Event "Test"]\n[Round "1.${board}"]\n[White "Sindarov, Javokhir"]\n[Black "Gukesh D"]\n[Result "*"]\n[WhiteFideId "14205483"]\n[BlackFideId "46616543"]\n[TimeControl "40/7200:20/3600:900+30"]\n[Variant "Standard"]\n[GameURL "https://lichess.org/broadcast/t/r/${R1}/game000${board}"]\n\n${body} *\n\n\n`;
};

// The proposed /satranc/ page, plus an empty page of the same origin to read the clipboard from.
const shell = http.createServer((req, res) => {
  const url = new URL(req.url, SHELL);
  if (url.pathname === '/clipboard') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><title>clipboard</title><textarea id="t"></textarea>');
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  try {
    const body = fs.readFileSync(path.join(SHELL_DIR, path.basename(file)), 'utf8').replaceAll('APP_ORIGIN', APP);
    res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

(async () => {
  await new Promise(resolve => shell.listen(4174, 'localhost', resolve));
  const browser = await chromium.launch();

  /** A context with the feed simulated. `refuse` makes both ways of copying fail, in every frame. */
  const context = async (opts = {}) => {
    const ctx = await browser.newContext(opts.device ? { ...devices[opts.device] } : { viewport: { width: 1440, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SHELL });
    if (opts.refuse) {
      await ctx.addInitScript(mode => {
        if (location.origin !== 'http://127.0.0.1:4173') return; // only the chess site is refused, not the page the clipboard is read from
        if (mode !== 'fallback' && navigator.clipboard) navigator.clipboard.writeText = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));
        document.execCommand = () => {
          if (mode === 'throw') throw new DOMException('The operation is insecure.', 'SecurityError');
          return false;
        };
      }, opts.refuse);
    }
    const errors = [];
    ctx.on('page', page => {
      page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
      page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) errors.push('CSP: ' + m.text().slice(0, 200)); });
    });
    await ctx.route('https://lichess.org/**', route => {
      const u = new URL(route.request().url());
      const cors = { 'access-control-allow-origin': '*' };
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
      if (u.pathname.startsWith('/api/puzzle/')) return json({ game: { pgn: '' }, puzzle: MATE2 });
      if (u.pathname.startsWith('/api/broadcast/') && !u.pathname.startsWith('/api/broadcast/-/') && !u.pathname.endsWith('.pgn'))
        return json({ tour: { id: TOUR, name: 'Test', slug: 't', url: '', info: {} }, rounds: [{ id: R1, name: 'Game 1', slug: 'g1', url: '', startsAt: Date.now() - 3600e3, ongoing: true }], defaultRoundId: R1 });
      // `boards: 2` makes the round a tie-break day: two games in one round
      if (u.pathname.endsWith('.pgn')) return route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', headers: cors, body: pgn(LINE.length) + (opts.boards === 2 ? pgn(4, 2) : '') });
      if (u.pathname.startsWith('/api/broadcast/-/-/')) return json({ round: {}, games: [{ id: 'game0001', thinkTime: 30, players: [] }] });
      return route.fulfill({ status: 404, headers: cors, body: '{}' });
    });
    /** What the system clipboard holds, read from a separate page. */
    const clipboard = async () => {
      const reader = await ctx.newPage();
      await reader.goto(SHELL + '/clipboard');
      await reader.bringToFront();
      const text = await reader.evaluate(() => navigator.clipboard.readText()).catch(e => 'unreadable: ' + String(e).slice(0, 80));
      await reader.close();
      return text;
    };
    /** Puts a marker on the clipboard, so a copy that did not happen cannot be mistaken for one that did. */
    const stamp = async () => {
      const writer = await ctx.newPage();
      await writer.goto(SHELL + '/clipboard');
      await writer.bringToFront();
      await writer.evaluate(() => navigator.clipboard.writeText('nothing copied yet'));
      await writer.close();
    };
    return { ctx, errors, clipboard, stamp };
  };

  const openMatch = async (ctx, query) => {
    const page = await ctx.newPage();
    await page.goto(`${APP}/?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button.move', { timeout: 25000 });
    await page.waitForTimeout(1200);
    return page;
  };
  const panel = scope => ({
    status: () => scope.locator('.share-panel [role="status"]').innerText(),
    value: () => scope.locator('.share-panel input').inputValue(),
    label: () => scope.locator('.share-panel label').innerText(),
    selected: () =>
      scope.locator('.share-panel input').evaluate(el => ({ focused: document.activeElement === el, from: el.selectionStart, to: el.selectionEnd, length: el.value.length, readOnly: el.readOnly })),
  });

  // ---- 1. on the site itself, copying allowed
  {
    const { ctx, errors, clipboard } = await context();
    const page = await openMatch(ctx, `parti=1&hamle=4&${NOISE}`);
    const p = panel(page);
    const share = page.locator('.board-actions .share-btn');
    check('the linked position is on the board (after 2...Nc6)', (await page.locator('.strip-track .move.active').innerText()).trim() === 'Ac6', await page.locator('.strip-track .move.active').innerText());
    check('the button is named and starts collapsed', (await share.innerText()).trim() === 'Paylaş' && (await share.getAttribute('aria-expanded')) === 'false');

    await share.click();
    await page.waitForSelector('.share-panel');
    const first = await clipboard();
    check('the clipboard holds the public link to this game and move, and nothing else', first === `${PUBLIC}?parti=1&hamle=4`, first);
    check('nothing from the visitor\'s own address is in it', !LEAK.test(first), first);
    check('the outcome is said in a live region', (await p.status()) === 'Bağlantı kopyalandı.' && (await page.locator('.share-panel [role="status"]').getAttribute('aria-live')) === 'polite');
    check('the link is also shown, in a labelled read-only field', (await p.value()) === first && (await p.label()) === 'Bu pozisyonun bağlantısı (1. oyun, 2. hamle)' && (await p.selected()).readOnly, await p.label());
    check('the button says it is expanded and names the panel', (await share.getAttribute('aria-expanded')) === 'true' && (await page.locator('#' + (await share.getAttribute('aria-controls')).replace(/([:«»])/g, '\\$1')).count()) === 1);
    await page.screenshot({ path: out + '/share-desktop.png' });

    // step forward on the board and share again
    await page.locator('.move-strip button[aria-label="Sonraki hamle"]').click();
    await page.waitForTimeout(200);
    check('the open panel still shows the link that was copied', (await p.value()) === `${PUBLIC}?parti=1&hamle=4`);
    await share.click();
    await page.waitForTimeout(300);
    const second = await clipboard();
    check('sharing after a step forward copies the new position', second === `${PUBLIC}?parti=1&hamle=5` && (await p.label()) === 'Bu pozisyonun bağlantısı (1. oyun, 3. hamle)', second);

    // the start of the game
    await page.locator('.share-panel button', { hasText: 'Kapat' }).click();
    check('the close button removes the panel and returns to the share button', (await page.locator('.share-panel').count()) === 0 && (await share.evaluate(el => document.activeElement === el)));
    await page.locator('.move-strip button[aria-label="İlk hamle"]').click();
    await share.click();
    await page.waitForTimeout(300);
    const start = await clipboard();
    check('the start of the game is linked as move 0', start === `${PUBLIC}?parti=1&hamle=0` && /başlangıç/.test(await p.label()), start);

    // the link that was produced opens the same position (same query against the local build)
    const again = await openMatch(ctx, new URL(second).search.slice(1));
    check('the copied link opens the same position (after 3.Bb5)', (await again.locator('.strip-track .move.active').innerText()).trim() === 'Fb5', await again.locator('.strip-track .move.active').innerText());
    await again.close();

    // another broadcast opened for testing must not produce links to the match
    const other = await ctx.newPage();
    await other.goto(`${APP}/?tour=zzTestzz`, { waitUntil: 'domcontentloaded' });
    await other.waitForSelector('button.move', { timeout: 25000 });
    check('a test broadcast offers no share button', (await other.locator('.board-actions .share-btn').count()) === 0);
    await other.close();

    check('no page errors or CSP violations', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 2. on the site itself, copying refused both ways: the copy command says no, or throws
  for (const refuse of ['all', 'throw']) {
    console.log(`     copy command ${refuse === 'throw' ? 'throws' : 'returns false'}:`);
    const { ctx, errors, clipboard, stamp } = await context({ refuse });
    await stamp();
    const page = await openMatch(ctx, `parti=1&hamle=4&${NOISE}`);
    const p = panel(page);
    await page.locator('.board-actions .share-btn').click();
    await page.waitForSelector('.share-panel');
    check('a refused copy is not reported as a success', /kopyalanamadı/.test(await p.status()), await p.status());
    const sel = await p.selected();
    check('the link is focused with all of it selected', sel.focused && sel.from === 0 && sel.to === sel.length && sel.length > 0, JSON.stringify(sel));
    check('no helper field is left in the page', (await page.locator('textarea').count()) === 0);
    check('the shown link is the public one, with no leak', (await p.value()) === `${PUBLIC}?parti=1&hamle=4` && !LEAK.test(await p.value()));
    check('the clipboard was left alone', (await clipboard()) === 'nothing copied yet', await clipboard());
    if (refuse === 'all') await page.screenshot({ path: out + '/share-refused.png' });

    // the visitor copies by hand: the browser's own copy command on the selection
    await page.bringToFront();
    await page.locator('.share-panel input').focus();
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(200);
    const byHand = await clipboard();
    check('copying the selection by hand (Ctrl+C) gives the link', byHand === `${PUBLIC}?parti=1&hamle=4`, byHand);

    // arrow keys in the field move the caret, not the game
    await page.bringToFront();
    await page.locator('.share-panel input').focus();
    const before = await page.locator('.strip-track .move.active').innerText();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    check('arrow keys inside the field do not step through the game', (await page.locator('.strip-track .move.active').innerText()) === before);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check('Escape closes the panel and returns focus to the button', (await page.locator('.share-panel').count()) === 0 && (await page.locator('.board-actions .share-btn').evaluate(el => document.activeElement === el)));
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 3. inside the sandboxed frame on another origin, as visitors see it
  for (const refuse of [undefined, 'fallback']) {
    const { ctx, errors, clipboard, stamp } = await context({ refuse });
    await stamp();
    const page = await ctx.newPage();
    await page.goto(`${SHELL}/?parti=1&hamle=4&${NOISE}`, { waitUntil: 'domcontentloaded' });
    const frame = await (await page.waitForSelector('#satranc')).contentFrame();
    await frame.waitForSelector('button.move', { timeout: 25000 });
    await frame.waitForTimeout(1200);
    const p = panel(frame);
    const label = refuse ? 'in the frame, older copy command unavailable' : 'in the frame';
    const policy = await frame.evaluate(() => navigator.clipboard.writeText('probe').then(() => 'allowed', e => 'refused: ' + e.name));
    await stamp();
    await page.bringToFront();
    await frame.locator('.board-actions .share-btn').click();
    await frame.waitForSelector('.share-panel');
    const status = await p.status();
    const held = await clipboard();
    const value = await p.value();
    console.log(`     ${label}: clipboard interface ${policy}; page says "${status}"; clipboard holds "${held}"`);
    check(`${label}: the link shown is the public one, with no leak`, value === `${PUBLIC}?parti=1&hamle=4` && !LEAK.test(value), value);
    if (/kopyalandı\.$/.test(status)) {
      check(`${label}: said copied, and the clipboard holds the link`, held === value, held);
    } else {
      const sel = await p.selected();
      check(`${label}: said not copied, clipboard untouched, link focused and selected`, held === 'nothing copied yet' && sel.focused && sel.from === 0 && sel.to === sel.length, JSON.stringify(sel) + ' ' + held);
      await page.bringToFront();
      await frame.locator('.share-panel input').focus();
      await page.keyboard.press('Control+C');
      await page.waitForTimeout(200);
      const byHand = await clipboard();
      check(`${label}: copying the selection by hand gives the link`, byHand === value, byHand);
    }
    if (!refuse) await page.screenshot({ path: out + '/share-frame.png' });
    check(`${label}: no page errors`, errors.filter(e => !/clipboard|Clipboard/.test(e)).length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 4. the puzzle corner
  {
    const { ctx, errors, clipboard } = await context();
    const page = await ctx.newPage();
    await page.goto(`${APP}/?parti=1&hamle=4&${NOISE}#bulmaca`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.puzzle-col cg-board', { timeout: 25000 });
    await page.waitForTimeout(600);
    await page.locator('.puzzle-top .share-btn').click();
    await page.waitForSelector('.share-panel');
    const held = await clipboard();
    check('the puzzle corner is shared as the public address and its fragment only', held === `${PUBLIC}#bulmaca`, held);
    check('its field is labelled as the puzzle corner', (await panel(page).label()) === 'Bulmaca köşesinin bağlantısı');
    check('no page errors in the puzzle corner', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 4b. a round with several boards: the link could not say which one
  {
    const { ctx, errors } = await context({ boards: 2 });
    const page = await openMatch(ctx, 'parti=1&hamle=4');
    await page.locator('.games-btn').click();
    await page.waitForSelector('dialog.games-drawer[open]');
    const boards = await page.locator('.games-drawer .board-pick').count();
    check('a round with two boards lists both and offers no share button', boards === 2 && (await page.locator('.board-actions .share-btn').count()) === 0, `boards ${boards}`);
    await page.locator('.games-drawer .board-pick:not(.current)').click();
    await page.waitForTimeout(300);
    check('still none after picking the other board by hand', (await page.locator('.board-actions .share-btn').count()) === 0 && (await page.locator('.share-panel').count()) === 0);
    check('the puzzle corner keeps its own share button', await (async () => {
      await page.locator('.viewnav button', { hasText: 'Bulmaca' }).click();
      await page.waitForSelector('.puzzle-col cg-board', { timeout: 25000 });
      return (await page.locator('.puzzle-top .share-btn').count()) === 1;
    })());
    check('no page errors with two boards', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 5. keyboard only
  {
    const { ctx, errors, clipboard } = await context();
    const page = await openMatch(ctx, 'parti=1&hamle=4');
    let reached = false;
    for (let i = 0; i < 60 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.classList.contains('share-btn') ?? false);
    }
    check('the share button can be reached with Tab', reached);
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' || s.boxShadow !== 'none'; });
    check('it shows a focus indicator', ring);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.share-panel');
    check('Enter shares', (await clipboard()) === `${PUBLIC}?parti=1&hamle=4`);
    await page.bringToFront();
    const order = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => { const el = document.activeElement; return el?.closest('.share-panel') ? (el.tagName === 'INPUT' ? 'link' : el.textContent.trim()) : null; }));
    }
    const inPanel = order.filter(Boolean);
    check('Tab reaches the link, Copy and Close, in that order', inPanel.join(',') === 'link,Kopyala,Kapat', JSON.stringify(order));
    // back into the panel, then Escape
    await page.locator('.share-panel button', { hasText: 'Kopyala' }).focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check('Escape from inside the panel closes it and focus returns to the button', (await page.locator('.share-panel').count()) === 0 && (await page.evaluate(() => document.activeElement?.classList.contains('share-btn') ?? false)));
    check('no page errors with the keyboard', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 6. phone size
  {
    const { ctx, errors, clipboard } = await context({ device: 'iPhone 14' });
    const page = await openMatch(ctx, `parti=1&hamle=4&${NOISE}`);
    const share = page.locator('.board-actions .share-btn');
    const box = await share.boundingBox();
    check('on a phone the button is icon-only but still named', (await share.getAttribute('aria-label')) === 'Paylaş' && (await share.innerText()).trim() === '');
    check('it is at least 44px tall and 44px wide for touch', box.height >= 44 && box.width >= 44, `${Math.round(box.width)}x${Math.round(box.height)}`);
    /** Every control under the board: inside the screen, big enough, and with its label not cut off. */
    const row = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.move-strip > button, .move-strip-moves > button, .move-strip .go-live, .board-actions button')]
          .filter(b => b.offsetParent)
          .map(b => {
            const r = b.getBoundingClientRect();
            return { name: (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), inside: r.left >= 0 && r.right <= window.innerWidth, cut: b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1 };
          }),
      );
    const steppedBack = await row();
    check('stepped back from live: every control is on screen, at least 40x40, and no label is cut off', steppedBack.every(b => b.inside && !b.cut && b.w >= 40 && b.h >= 40), JSON.stringify(steppedBack));
    const back = steppedBack.find(b => /Canlı konuma/.test(b.name));
    check('stepped back from live: the way back to live gets its own row', !!back && back.w > 300 && steppedBack.filter(b => b.top === back.top).length === 1, JSON.stringify(steppedBack.map(b => [b.name, b.top, b.w])));
    await share.scrollIntoViewIfNeeded();
    await share.tap();
    await page.waitForSelector('.share-panel');
    const held = await clipboard();
    await page.bringToFront();
    check('tapping it shares the public link', held === `${PUBLIC}?parti=1&hamle=4`, held);
    const fit = await page.evaluate(() => {
      const r = document.querySelector('.share-panel').getBoundingClientRect();
      const input = document.querySelector('.share-panel input');
      const buttons = [...document.querySelectorAll('.share-panel button')].map(b => Math.round(b.getBoundingClientRect().height));
      return { overflow: document.documentElement.scrollWidth - window.innerWidth, left: Math.round(r.left), right: Math.round(r.right), width: window.innerWidth, font: parseFloat(getComputedStyle(input).fontSize), buttons };
    });
    check('the panel fits the screen with no sideways scrolling', fit.overflow <= 0 && fit.left >= 0 && fit.right <= fit.width, JSON.stringify(fit));
    check('the field uses 16px text (no zoom on focus in iOS) and its buttons are 40px tall', fit.font >= 16 && Math.min(...fit.buttons) >= 40, JSON.stringify(fit));
    await page.screenshot({ path: out + '/share-phone.png' });
    // following live: one row
    await page.locator('.share-panel button', { hasText: 'Kapat' }).tap();
    await page.locator('.move-strip .go-live').tap();
    await page.waitForTimeout(300);
    const live = await row();
    check('following live: no way-back row, and nothing is cut off', !live.some(b => /Canlı konuma/.test(b.name)) && live.every(b => b.inside && !b.cut && b.w >= 40 && b.h >= 40), JSON.stringify(live.map(b => [b.name, b.w, b.cut])));
    await page.screenshot({ path: out + '/share-phone-live.png' });
    check('no page errors on the phone', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  shell.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
