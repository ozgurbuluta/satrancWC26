// Guess the move in a real browser, against a simulated live game:
// engine held back, guessing on the board and by typing, hit and miss,
// the two reference blocks, guessing while paused, phone size.
//
// Not part of CI (it needs a browser). To run it:
//   npm run build && npx vite preview --port 4173 --host 127.0.0.1
//   node tests/e2e/guess.cjs [folder for screenshots]
const { chromium, devices } = require('playwright');

const APP = 'http://127.0.0.1:4173';
const TOUR = 'qfkdt8mn';
const R1 = 'xLgOJ6cb';
const LINE = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'];
const out = process.argv[2] || '.';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const pgn = (plies, result = '*') => {
  const body = LINE.slice(0, plies)
    .map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}.` : `${(i - 1) / 2 + 1}...`} ${san} { [%clk 1:5${9 - (i % 9)}:00] }`)
    .join(' ');
  return `[Event "Test"]\n[Round "1.1"]\n[White "Sindarov, Javokhir"]\n[Black "Gukesh D"]\n[Result "${result}"]\n[WhiteFideId "14205483"]\n[BlackFideId "46616543"]\n[TimeControl "40/7200:20/3600:900+30"]\n[Variant "Standard"]\n[GameURL "https://lichess.org/broadcast/t/r/${R1}/game0001"]\n\n${body} ${result}\n\n\n`;
};

(async () => {
  const browser = await chromium.launch();

  const open = async (opts = {}) => {
    const world = { plies: 2, result: '*' };
    const ctx = await browser.newContext(opts.device ? { ...devices[opts.device] } : { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) errors.push('CSP: ' + m.text().slice(0, 200)); });
    await page.route('https://lichess.org/**', route => {
      const u = new URL(route.request().url());
      const cors = { 'access-control-allow-origin': '*' };
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
      if (u.pathname === `/api/broadcast/${TOUR}`)
        return json({ tour: { id: TOUR, name: 'Test', slug: 't', url: '', info: {} }, rounds: [{ id: R1, name: 'Game 1', slug: 'g1', url: '', startsAt: Date.now() - 3600e3, ongoing: world.result === '*' }], defaultRoundId: R1 });
      if (u.pathname.endsWith('.pgn')) return route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', headers: cors, body: pgn(world.plies, world.result) });
      if (u.pathname.startsWith('/api/broadcast/-/-/')) return json({ round: {}, games: [{ id: 'game0001', thinkTime: 30, players: [] }] });
      if (u.pathname.startsWith('/api/cloud-eval')) return route.fulfill({ status: 404, headers: cors, body: '{}' });
      return route.fulfill({ status: 404, headers: cors, body: '{}' });
    });
    await page.goto(APP + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button.move', { timeout: 25000 });
    await page.waitForTimeout(1500);
    return { ctx, page, errors, world };
  };

  const tab = (page, name) => page.locator('.tabs button', { hasText: name }).click();
  const clickSquare = async (page, square) => {
    const box = await page.locator('.board-col cg-board').boundingBox();
    await page.mouse.click(box.x + ('abcdefgh'.indexOf(square[0]) + 0.5) * (box.width / 8), box.y + (8 - Number(square[1]) + 0.5) * (box.height / 8));
    await page.waitForTimeout(150);
  };
  /** Waits until the newest settled guess mentions `move` (the feed delivers it within a few seconds). */
  const waitForResult = async (page, move) => {
    for (let i = 0; i < 60; i++) {
      const text = await page.locator('.guess-result').innerText().catch(() => '');
      if (text.includes(move)) return text.replace(/\n+/g, ' ');
      await page.waitForTimeout(500);
    }
    return '';
  };

  // ---- desktop: the whole flow
  {
    const { ctx, page, errors, world } = await open();
    await tab(page, 'Analiz');
    await page.waitForTimeout(6000); // let the local engine produce lines
    check('engine lines and the best-move arrow show when guess mode is off', (await page.locator('.pv-list li').count()) > 0 && (await page.locator('.board-col .cg-shapes g > *').count()) > 0);
    check('the board is not playable when guess mode is off', (await page.locator('.board-col .board-wrap.is-interactive').count()) === 0);

    await tab(page, 'Tahmin');
    await page.locator('.predict .seg button', { hasText: 'Açık' }).click();
    await page.waitForTimeout(400);
    check('asks whose move it is', /Sıra Sindarov oyuncusunda/.test(await page.locator('.guess-card').innerText()), (await page.locator('.guess-card').innerText()).replace(/\n+/g, ' | ').slice(0, 80));
    check('references are held until the guess', /tahminini yaptıktan sonra/.test(await page.locator('.predict').innerText()) && (await page.locator('.freq').count()) === 0);
    check('the best-move arrow is gone while guessing', (await page.locator('.board-col .cg-shapes g > *').count()) === 0);
    check('a strip under the board says it is waiting for a move', /Tahmin modu/.test(await page.locator('.banner.guess').innerText()));
    await tab(page, 'Analiz');
    check('the analysis tab hides engine lines and says why', /Önce tahminini yap/.test(await page.locator('.engine-card.held').innerText()) && (await page.locator('.pv-list:visible').count()) === 0);
    check('no "only move" hint leaks while guessing', (await page.locator('.note:visible').count()) === 0);

    // guess on the board: Nf3
    await clickSquare(page, 'g1');
    const dests = await page.locator('.board-col square.move-dest').count();
    check('legal destinations are marked', dests >= 2, dests + ' squares');
    await clickSquare(page, 'f3');
    await page.waitForTimeout(400);
    check('the guess is shown under the board in Turkish notation', /Tahminin: Af3/.test(await page.locator('.banner.guess').innerText()), await page.locator('.banner.guess').innerText());
    const knightHome = await page.evaluate(() => {
      const board = document.querySelector('.board-col cg-board');
      const size = board.getBoundingClientRect().width / 8;
      return [...board.querySelectorAll('piece.white.knight')].some(p => {
        const m = /translate\(([\d.]+)px,\s*([\d.]+)px\)/.exec(p.style.transform || '');
        return m && Math.abs(Number(m[1]) - 6 * size) < 2 && Math.abs(Number(m[2]) - 7 * size) < 2;
      });
    });
    check('the guess is an arrow; the knight itself did not move', (await page.locator('.board-col .cg-shapes g > *').count()) > 0 && knightHome);
    check('the engine is available again once the guess is made', (await page.locator('.engine-card.held').count()) === 0);

    await tab(page, 'Tahmin');
    await page.waitForTimeout(3500);
    const text = (await page.locator('.predict').innerText()).replace(/\n+/g, ' | ');
    check('master frequencies are shown with their sample size', /usta partisinde oynanan hamleler/.test(text) && (await page.locator('.freq tbody tr').count()) >= 2, text.match(/Bu pozisyona ulaşan[^|]*/)?.[0]);
    check('the frequency block says what it is', /Geçmiş partilerdeki gerçek sıklıktır/.test(text));
    check('engine suggestions are a separate block that says what it is not', /Oyuncunun bunları oynayacağı anlamına gelmez/.test(text) && (await page.locator('.engine-first li').count()) > 0);
    check('the page says there is no prediction model and the shares are not probabilities', /insan hamlesini tahmin eden bir model yok/.test(text) && /olasılık değil/.test(text));
    await page.screenshot({ path: out + '/guess-open.png' });

    // the move arrives: Nf3 was played
    world.plies = 3;
    const hit = await waitForResult(page, 'Af3');
    check('the real move arrives and a right guess is announced', /Tutturdun/.test(hit), hit);
    check('the score counts it', /1 tahminin 1 tanesi tuttu/.test(await page.locator('.guess-score').innerText()));

    // next move, typed, and wrong: Black plays Nc6, we say d6
    await page.locator('.move-input input').fill('d6');
    await page.locator('.move-input input').press('Enter');
    await page.waitForTimeout(300);
    check('a typed guess is accepted', /Tahminin:.*d6/.test((await page.locator('.guess-card').innerText()).replace(/\n+/g, ' ')));
    world.plies = 4;
    const miss = await waitForResult(page, 'Ac6');
    check('a wrong guess says what was played and what was guessed', /tutmadı/.test(miss) && /Ac6/.test(miss) && /d6/.test(miss), miss);
    check('the history lists both, newest first', (await page.locator('.guess-rows li').count()) === 2 && /Ac6/.test(await page.locator('.guess-rows li').first().innerText()));

    // an illegal typed guess
    await page.locator('.move-input input').fill('Vh5');
    await page.locator('.move-input input').press('Enter');
    check('an illegal typed guess is refused', /Vh4|Vf3|Bu hamle bu pozisyonda/.test(await page.locator('.move-input').innerText()) && (await page.locator('.move-input .error').count()) === 1);

    // skip this move: look at the engine instead
    await page.locator('.guess-card button', { hasText: 'motoru göster' }).click();
    await page.waitForTimeout(300);
    check('after looking at the engine this move can no longer be guessed', /motora baktın/.test(await page.locator('.guess-card').innerText()) && (await page.locator('.board-col .board-wrap.is-interactive').count()) === 0);

    // guessing while paused: nothing is settled by moves that are still hidden
    await page.locator('.pause-btn').click();
    await page.waitForTimeout(300);
    world.plies = 8; // the game goes on out of sight
    await page.waitForTimeout(6000);
    check('nothing is announced for moves played while paused', (await page.locator('.guess-rows li').count()) === 2);
    await page.keyboard.press('ArrowRight'); // reveal 3. Bb5
    await page.waitForTimeout(500);
    await clickSquare(page, 'g8');
    await clickSquare(page, 'f6');
    await page.waitForTimeout(300);
    check('a guess can be made while paused', /Tahminin: Af6/.test(await page.locator('.banner.guess').innerText().catch(() => '')), await page.locator('.banner.guess').innerText().catch(() => 'no strip'));
    check('no result is shown before the move is revealed', (await page.locator('.guess-rows li').count()) === 2);
    await page.keyboard.press('ArrowRight'); // reveal 3… a6
    await page.waitForTimeout(500);
    const paused = (await page.locator('.guess-result').innerText()).replace(/\n+/g, ' ');
    check('revealing the next move settles the guess against that move only', /tutmadı/.test(paused) && /a6/.test(paused) && /Af6/.test(paused), paused);
    check('no page errors or CSP violations', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- phone size
  {
    const { ctx, page, errors } = await open({ device: 'iPhone 14' });
    await tab(page, 'Tahmin');
    await page.locator('.predict .seg button', { hasText: 'Açık' }).click();
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('no sideways scrolling on a phone with six tabs', overflow <= 0, 'overflow ' + overflow);
    // Scroll as a visitor would: the video stays pinned at the top and the whole board sits under it.
    await page.evaluate(() => {
      const b = document.querySelector('.board-col cg-board').getBoundingClientRect();
      const v = document.querySelector('.player').getBoundingClientRect();
      window.scrollBy(0, b.top - v.height - 46);
    });
    await page.waitForTimeout(300);
    const board = await page.locator('.board-col cg-board').boundingBox();
    const view = page.viewportSize();
    const video = await page.locator('.player').boundingBox();
    check('video and the whole board fit on a phone screen together', video.y <= 1 && board.y >= video.height && board.y + board.height <= view.height, `video 0-${Math.round(video.height)}, board ${Math.round(board.y)}-${Math.round(board.y + board.height)}, screen ${view.height}`);
    const tap = async square => {
      await page.touchscreen.tap(board.x + ('abcdefgh'.indexOf(square[0]) + 0.5) * (board.width / 8), board.y + (8 - Number(square[1]) + 0.5) * (board.height / 8));
      await page.waitForTimeout(200);
    };
    await tap('g1');
    await tap('f3');
    const strip = await page.locator('.banner.guess').innerText().catch(() => 'no strip');
    const state = await page.evaluate(() => ({ interactive: document.querySelectorAll('.board-col .board-wrap.is-interactive').length, banners: [...document.querySelectorAll('.board-col .banner')].map(b => b.textContent.slice(0, 50)), scrollY: Math.round(scrollY) }));
    check('a guess can be made by tapping on a phone', /Tahminin: Af3/.test(strip), `${strip} | ${JSON.stringify(state)} | board ${Math.round(board.y)}-${Math.round(board.y + board.height)}`);
    await page.screenshot({ path: out + '/guess-phone.png', fullPage: true });
    check('no page errors on the phone', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
