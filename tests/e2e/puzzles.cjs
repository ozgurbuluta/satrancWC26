// Puzzle view in a real browser: wrong move, board clicks, typed moves, the
// reply, hint, reveal, start over, promotion, the offline set and the score.
//
// Not part of CI (it needs a browser). To run it:
//   npm run build && npx vite preview --port 4173 --host 127.0.0.1
//   node tests/e2e/puzzles.cjs [folder for screenshots]
const { chromium, devices } = require('playwright');

const APP = 'http://127.0.0.1:4173';
// Rook check, forced king move, pawn mate (also in the built-in set).
const MATE2 = { id: 'tstM2', fen: '8/3RRp2/5kp1/8/3P1P1p/8/6rr/5K2 w - - 1 1', lastMove: 'g7f6', solution: ['e7f7', 'f6e6', 'd4d5'], rating: 1303, themes: ['mateIn2'] };
// A pawn that has to promote (checkmate with a queen; a rook mates too).
const PROMO = { id: 'tstPr', fen: '7k/4P2p/6pK/8/8/8/8/8 w - - 0 1', lastMove: 'g8h8', solution: ['e7e8q'], rating: 900, themes: ['mateIn1', 'promotion'] };

const out = process.argv[2] || '.';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`);
};

(async () => {
  const browser = await chromium.launch();

  const open = async (queue, opts = {}) => {
    const ctx = await browser.newContext(opts.device ? { ...devices[opts.device] } : { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) errors.push('CSP: ' + m.text().slice(0, 200)); });
    await page.route('https://lichess.org/api/puzzle/**', route => {
      if (opts.offline) return route.abort();
      const next = queue.length > 1 ? queue.shift() : queue[0];
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ game: { pgn: '' }, puzzle: next }) });
    });
    await page.goto(APP + '/#bulmaca', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.puzzle-col cg-board', { timeout: 25000 });
    await page.waitForTimeout(700);
    return { ctx, page, errors };
  };

  /** Clicks a square of the puzzle board, given the side at the bottom. */
  const clickSquare = async (page, square, bottom = 'white') => {
    const box = await page.locator('.puzzle-col cg-board').boundingBox();
    const file = 'abcdefgh'.indexOf(square[0]);
    const rank = Number(square[1]);
    const col = bottom === 'white' ? file : 7 - file;
    const row = bottom === 'white' ? 8 - rank : rank - 1;
    await page.mouse.click(box.x + (col + 0.5) * (box.width / 8), box.y + (row + 0.5) * (box.height / 8));
  };
  const feedback = page => page.locator('.feedback').innerText();
  const stat = async (page, i) => Number(await page.locator('.stats dd').nth(i).innerText());
  const pieceAt = (page, square) =>
    page.evaluate(sq => {
      const board = document.querySelector('.puzzle-col cg-board');
      const size = board.getBoundingClientRect().width / 8;
      const x = 'abcdefgh'.indexOf(sq[0]) * size;
      const y = (8 - Number(sq[1])) * size;
      for (const p of board.querySelectorAll('piece')) {
        const m = /translate\(([\d.]+)px,\s*([\d.]+)px\)/.exec(p.style.transform || '');
        if (m && Math.abs(Number(m[1]) - x) < 2 && Math.abs(Number(m[2]) - y) < 2) return p.className;
      }
      return null;
    }, square);

  // ---- 1. a full solve with one mistake on the way
  {
    const { ctx, page, errors } = await open([MATE2, PROMO]);
    check('puzzle view opens from the #bulmaca address', (await page.locator('.viewnav button.active').innerText()) === 'Bulmaca');
    check('says who is to play', /Beyaz oynar/.test(await page.locator('.puzzle-head').innerText()));
    check('the status line is announced to screen readers', (await page.locator('.feedback').getAttribute('aria-live')) === 'polite');

    // a legal but wrong move, typed in Turkish notation (K = Kale, the rook)
    await page.locator('.move-input input').fill('Kd8');
    await page.locator('.move-input input').press('Enter');
    await page.waitForTimeout(300);
    check('a wrong move is refused and says so', /Tekrar dene/.test(await feedback(page)), await feedback(page));
    check('the position did not change after the wrong move', /rook/.test((await pieceAt(page, 'd7')) || ''));

    // something that is not a legal move at all
    await page.locator('.move-input input').fill('Vh5');
    await page.locator('.move-input input').press('Enter');
    check('an illegal typed move gets an inline error', (await page.locator('.move-input .error').count()) === 1);

    // the right first move, by clicking two squares
    await clickSquare(page, 'e7');
    await page.waitForTimeout(150);
    check('legal destinations are marked after picking a piece', (await page.locator('.puzzle-col square.move-dest').count()) > 0);
    await clickSquare(page, 'f7');
    await page.waitForTimeout(1000);
    check('a right move is accepted and the reply is played', /king/.test((await pieceAt(page, 'e6')) || ''), await feedback(page));
    check('moves played are listed in Turkish notation', /Kxf7\+\s+Şe6/.test(await page.locator('.pz-line').innerText()), await page.locator('.pz-line').innerText());

    // the mating move, typed
    await page.locator('.move-input input').fill('d5');
    await page.locator('.move-input .btn').click();
    await page.waitForTimeout(500);
    check('the last move solves the puzzle', /Çözdün\.$/.test((await feedback(page)).trim()), await feedback(page));
    check('a solve with a mistake counts as solved, not as first try', (await stat(page, 0)) === 1 && (await stat(page, 1)) === 0);
    check('the move box goes away once solved', (await page.locator('.move-input').count()) === 0);
    await page.screenshot({ path: out + '/puzzle-solved.png' });

    // start over lets you replay it without counting twice
    await page.locator('.puzzle-actions button', { hasText: 'Baştan' }).click();
    await page.waitForTimeout(300);
    check('start over puts the first position back', /rook/.test((await pieceAt(page, 'e7')) || ''));
    await clickSquare(page, 'e7');
    await clickSquare(page, 'f7');
    await page.waitForTimeout(1000);
    await page.locator('.move-input input').fill('d5');
    await page.locator('.move-input input').press('Enter');
    await page.waitForTimeout(400);
    check('replaying a finished puzzle does not add to the score', (await stat(page, 0)) === 1);

    // ---- 2. next puzzle: promotion
    await page.locator('.puzzle-actions button', { hasText: 'Sonraki bulmaca' }).click();
    await page.waitForSelector('.puzzle-col cg-board');
    await page.waitForTimeout(900);
    await clickSquare(page, 'e7');
    await clickSquare(page, 'e8');
    await page.waitForTimeout(300);
    check('a pawn on the last rank asks which piece', (await page.locator('.promo[role="dialog"]').count()) === 1);
    check('the choice has four named buttons', (await page.locator('.promo-row button').allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim().split(' ').pop()).join(',') === 'Vezir,Kale,Fil,At');
    await page.locator('.promo-row button', { hasText: 'Vezir' }).click();
    await page.waitForTimeout(500);
    check('promoting solves it on the first try', /ilk denemede/.test(await feedback(page)), await feedback(page));
    check('score: two solved, one first try, streak one', (await stat(page, 0)) === 2 && (await stat(page, 1)) === 1 && (await stat(page, 2)) === 1);

    // the score survives a reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.stats dd');
    check('the score is still there after a reload', (await stat(page, 0)) === 2 && (await stat(page, 3)) === 1);
    check('no page errors or CSP violations', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 3. hint, then reveal
  {
    const { ctx, page, errors } = await open([MATE2]);
    await page.locator('.puzzle-actions button', { hasText: 'İpucu' }).click();
    await page.waitForTimeout(200);
    check('first hint marks the piece', /işaretli taş/.test(await feedback(page)) && (await page.locator('.puzzle-col .cg-shapes g > *').count()) > 0);
    await page.locator('.puzzle-actions button', { hasText: 'İpucu' }).click();
    check('second hint shows the move, and there is no third', /ok hamleyi/.test(await feedback(page)) && (await page.locator('.puzzle-actions button', { hasText: 'İpucu' }).isDisabled()));
    await page.locator('.puzzle-actions button', { hasText: 'Çözümü göster' }).click();
    await page.waitForTimeout(2600);
    check('reveal plays the whole solution', /pawn/.test((await pieceAt(page, 'd5')) || '') && /Çözüm gösterildi/.test(await feedback(page)));
    check('a revealed puzzle is not counted as solved', (await stat(page, 0)) === 0 && /gösterilen: 1/.test(await page.locator('.puzzle-panel').innerText()));
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 4. Lichess unreachable: the built-in set
  {
    const { ctx, page, errors } = await open([], { offline: true });
    check('falls back to a built-in puzzle and says so', /Lichess'e ulaşılamadı/.test(await page.locator('.puzzle-panel').innerText()) && (await page.locator('.puzzle-col cg-board piece').count()) > 2);
    check('no page errors offline', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 5. phone size and getting back to the match
  {
    const { ctx, page, errors } = await open([MATE2], { device: 'iPhone 14' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('no sideways scrolling on a phone', overflow <= 0, 'overflow ' + overflow);
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.puzzle-actions button, .move-input button, .viewnav button')].map(b => Math.round(b.getBoundingClientRect().height)));
    check('buttons are at least 36px tall for touch', Math.min(...sizes) >= 36, sizes.join(','));
    // At the top of the page the whole board sits below the pinned video.
    await page.evaluate(() => window.scrollTo(0, 0));
    const board = await page.locator('.puzzle-col cg-board').boundingBox();
    const video = await page.locator('.player').boundingBox();
    check('the whole board is visible below the pinned video', board.y >= video.y + video.height - 1 && board.y + board.height <= 844, `video ends ${Math.round(video.y + video.height)}, board ${Math.round(board.y)}-${Math.round(board.y + board.height)}`);
    const tap = async square => {
      const size = board.width / 8;
      await page.touchscreen.tap(board.x + ('abcdefgh'.indexOf(square[0]) + 0.5) * size, board.y + (8 - Number(square[1]) + 0.5) * size);
      await page.waitForTimeout(150);
    };
    await tap('e7');
    await tap('f7');
    await page.waitForTimeout(1000);
    check('tapping squares works on a phone', /Doğru/.test(await feedback(page)), await feedback(page));
    await page.screenshot({ path: out + '/puzzle-phone.png', fullPage: true });
    await page.locator('.viewnav button', { hasText: 'Canlı maç' }).click();
    await page.waitForSelector('.player-bar', { timeout: 20000 });
    check('back to the match from the header', !(await page.url()).includes('#bulmaca'));
    check('no page errors on the phone', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
