// The board and the workspace in a real browser: one board that is never
// rebuilt, moves of the viewer's own with the engine following, the way back
// to live, prediction kept in its tab, promotion, puzzles, the game list and
// the broadcast dropdown, at desktop and phone size.
//
// Not part of CI (it needs a browser). To run it:
//   npm run build && npx vite preview --port 4173 --host 127.0.0.1
//   node tests/e2e/board.cjs [folder for screenshots]
const { chromium, devices } = require('playwright');

const APP = 'http://127.0.0.1:4173';
const TOUR = 'qfkdt8mn';
const TAG = "120'/40m + 30'/end, 30/move from move 41";
const LINE = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];
const QGD = ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7'];
const MATE2 = { id: 'tstM2', fen: '8/3RRp2/5kp1/8/3P1P1p/8/6rr/5K2 w - - 1 1', lastMove: 'g7f6', solution: ['e7f7', 'f6e6', 'd4d5'], rating: 1303, themes: ['mateIn2'] };

const out = process.argv[2] || '.';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const clock = s => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const SPENT = [7, 26, 9, 19, 51, 80, 45, 130, 310, 60, 25, 700, 95, 40];
const pgn = (round, id, sans, result, opts = {}) => {
  const clocks = [7200, 7200];
  const body = sans
    .map((san, i) => {
      clocks[i % 2] -= SPENT[(i + round) % SPENT.length];
      return `${i % 2 === 0 ? `${i / 2 + 1}.` : `${(i - 1) / 2 + 1}...`} ${san} { [%clk ${clock(clocks[i % 2])}] }`;
    })
    .join(' ');
  const w = opts.gukeshWhite ? ['Gukesh D', '46616543'] : ['Sindarov, Javokhir', '14205483'];
  const b = opts.gukeshWhite ? ['Sindarov, Javokhir', '14205483'] : ['Gukesh D', '46616543'];
  const fen = opts.fen ? `[SetUp "1"]\n[FEN "${opts.fen}"]\n` : '';
  return `[Event "Test"]\n[Round "${round}.1"]\n[White "${w[0]}"]\n[Black "${b[0]}"]\n[Result "${result}"]\n[WhiteFideId "${w[1]}"]\n[BlackFideId "${b[1]}"]\n[TimeControl "${TAG}"]\n${fen}[Variant "Standard"]\n[GameURL "https://lichess.org/broadcast/t/r/r${round}/${id}"]\n\n${body} ${result}\n\n\n`;
};

(async () => {
  const browser = await chromium.launch();

  /** A match of three known rounds: two played, the third live. `world.plies` is how far the live game has got. */
  const open = async (opts = {}) => {
    const world = { plies: opts.plies ?? 10, fen: opts.fen };
    const now = Date.now();
    const rounds = [
      { id: 'rrrrrrr1', name: 'Game 1', slug: 'g1', url: '', startsAt: now - 49 * 3600e3, finished: true },
      { id: 'rrrrrrr2', name: 'Game 2', slug: 'g2', url: '', startsAt: now - 25 * 3600e3, finished: true },
      { id: 'rrrrrrr3', name: 'Game 3', slug: 'g3', url: '', startsAt: now - 3600e3, ongoing: true },
      ...Array.from({ length: 11 }, (_, i) => ({ id: `rrrrrr${String(i + 4).padStart(2, '0')}`, name: `Game ${i + 4}`, slug: `g${i + 4}`, url: '', startsAt: now + (i + 1) * 24 * 3600e3 })),
    ];
    const g1 = pgn(1, 'game0001', QGD, '1/2-1/2');
    const g2 = pgn(2, 'game0002', LINE.slice(0, 10), '1-0', { gukeshWhite: true });
    const g3 = () => (world.fen ? pgn(3, 'game0003', [], '*', { fen: world.fen }) : pgn(3, 'game0003', LINE.slice(0, world.plies), '*'));
    const ctx = await browser.newContext(opts.device ? { ...devices[opts.device] } : { viewport: opts.viewport ?? { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) errors.push('CSP: ' + m.text().slice(0, 200)); });
    await ctx.route('https://lichess.org/**', route => {
      const u = new URL(route.request().url());
      const cors = { 'access-control-allow-origin': '*' };
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
      const text = body => route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', headers: cors, body });
      if (u.pathname.startsWith('/api/puzzle/')) return json({ game: { pgn: '' }, puzzle: MATE2 });
      if (u.pathname === `/api/broadcast/${TOUR}`) return json({ tour: { id: TOUR, name: 'Test', slug: 't', url: '', info: {} }, rounds, defaultRoundId: 'rrrrrrr3' });
      if (u.pathname === `/api/broadcast/${TOUR}.pgn`) return text(g1 + g2 + g3());
      if (u.pathname.endsWith('rrrrrrr3.pgn')) return text(g3());
      if (u.pathname.endsWith('rrrrrrr2.pgn')) return text(g2);
      if (u.pathname.endsWith('rrrrrrr1.pgn')) return text(g1);
      if (u.pathname.startsWith('/api/broadcast/-/-/')) return json({ round: {}, games: [] });
      return route.fulfill({ status: 404, headers: cors, body: '{}' });
    });
    await page.goto(APP + (opts.path ?? '/'), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(opts.wait ?? '.board-col cg-board piece', { timeout: 25000 });
    await page.waitForTimeout(1500);
    return { ctx, page, errors, world };
  };

  const centre = async (page, square, bottom = 'white', scope = '.board-col') => {
    const box = await page.locator(`${scope} cg-board`).boundingBox();
    const file = 'abcdefgh'.indexOf(square[0]);
    const rank = Number(square[1]);
    const col = bottom === 'white' ? file : 7 - file;
    const row = bottom === 'white' ? 8 - rank : rank - 1;
    return [box.x + (col + 0.5) * (box.width / 8), box.y + (row + 0.5) * (box.height / 8)];
  };
  const drag = async (page, from, to) => {
    const [x1, y1] = await centre(page, from);
    const [x2, y2] = await centre(page, to);
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
    await page.mouse.move(x2, y2, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  };
  const click = async (page, square, bottom = 'white', scope = '.board-col') => {
    const [x, y] = await centre(page, square, bottom, scope);
    await page.mouse.click(x, y);
    await page.waitForTimeout(150);
  };
  /** The piece on a square, read from where Chessground has put it. */
  const pieceAt = (page, square, scope = '.board-col') =>
    page.evaluate(
      ([sq, sel]) => {
        const board = document.querySelector(`${sel} cg-board`);
        const size = board.getBoundingClientRect().width / 8;
        const x = 'abcdefgh'.indexOf(sq[0]) * size;
        const y = (8 - Number(sq[1])) * size;
        for (const p of board.querySelectorAll('piece')) {
          if (p.classList.contains('ghost')) continue;
          const m = /translate\(([\d.]+)px,\s*([\d.]+)px\)/.exec(p.style.transform || '');
          if (m && Math.abs(Number(m[1]) - x) < 2 && Math.abs(Number(m[2]) - y) < 2) return p.className.replace(/\s*(anim|dragging)\s*/g, ' ').trim();
        }
        return null;
      },
      [square, scope],
    );
  /**
   * Remembers the board and its pieces, and from then on records every piece
   * that is animated, added or removed. `seen()` gives what happened since.
   */
  const watch = (page, scope = '.board-col') =>
    page.evaluate(sel => {
      const board = document.querySelector(`${sel} cg-board`);
      const w = (window.__watch = { board, pieces: [...board.querySelectorAll('piece')], animated: new Set(), added: 0, removed: 0 });
      new MutationObserver(list => {
        for (const m of list) {
          if (m.type === 'attributes' && m.target.tagName === 'PIECE' && m.target.classList.contains('anim')) w.animated.add(m.target);
          if (m.type === 'childList') {
            w.added += [...m.addedNodes].filter(n => n.tagName === 'PIECE').length;
            w.removed += [...m.removedNodes].filter(n => n.tagName === 'PIECE').length;
          }
        }
      }).observe(board, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    }, scope);
  const seen = (page, scope = '.board-col') =>
    page.evaluate(sel => {
      const w = window.__watch;
      const board = document.querySelector(`${sel} cg-board`);
      const r = {
        sameBoard: board === w.board && board.isConnected,
        piecesKept: w.pieces.filter(p => p.isConnected).length,
        piecesBefore: w.pieces.length,
        animated: w.animated.size,
        added: w.added,
        removed: w.removed,
      };
      w.animated = new Set();
      w.added = 0;
      w.removed = 0;
      return r;
    }, scope);
  const active = page => page.locator('.strip-track .move.active').first().innerText().catch(() => '');
  const ownLine = page => page.locator('.strip-track.own').innerText().then(t => t.replace(/\s+/g, ' ').trim()).catch(() => '');

  // ---- 1. one board, and pieces that only move when a move is made
  {
    const { ctx, page, errors } = await open();
    await watch(page);
    check('the newest move is on the board', (await active(page)) === 'Fe7', await active(page));

    await page.locator('.move-strip button[aria-label="Önceki hamle"]').click();
    await page.waitForTimeout(450);
    let s = await seen(page);
    check('one step back moves one piece on the same board', s.sameBoard && s.animated === 1 && s.added === 0 && s.removed === 0, JSON.stringify(s));

    await page.locator('.move-strip button[aria-label="Önceki hamle"]').click(); // back over castling
    await page.waitForTimeout(450);
    s = await seen(page);
    check('stepping back over castling moves the king and the rook only', s.sameBoard && s.animated === 2 && s.added === 0 && s.removed === 0, JSON.stringify(s));

    // fast back to the start, far past it
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);
    s = await seen(page);
    check('fast steps back end on the first position with the same board and all 32 pieces', s.sameBoard && (await page.locator('.board-col cg-board piece').count()) === 32 && /pawn/.test((await pieceAt(page, 'e2')) || ''), JSON.stringify(s));

    // again and again at the first position: nothing at all happens on the board
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(300);
    s = await seen(page);
    check('back at the first position, again and again, touches nothing', s.sameBoard && s.animated === 0 && s.added === 0 && s.removed === 0, JSON.stringify(s));
    check('the back controls are disabled there', await page.locator('.move-strip button[aria-label="Önceki hamle"]').isDisabled());

    // a jump: from the first position straight to the newest
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(500);
    s = await seen(page);
    check('the up arrow returns to the newest position, shown at once with no piece flying', s.sameBoard && s.animated === 0 && (await active(page)) === 'Fe7', JSON.stringify(s));
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    check('Home goes to the first position', (await page.locator('.strip-track .move.active').count()) === 0 && /pawn/.test((await pieceAt(page, 'e2')) || ''));
    await page.keyboard.press('End');
    await page.waitForTimeout(300);

    // fast forward and back
    for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowRight']) await page.keyboard.press(key);
    await page.waitForTimeout(500);
    s = await seen(page);
    check('quick steps back and forward end on the newest move, same board', s.sameBoard && (await active(page)) === 'Fe7' && s.added === 0, JSON.stringify(s));
    check('no page errors while stepping', errors.length === 0, errors.join(' | '));
    await page.screenshot({ path: out + '/board-desktop.png' });
    await ctx.close();
  }

  // ---- 2. moves of the viewer's own, the engine, the game going on, and the way back
  {
    const { ctx, page, errors, world } = await open();
    await watch(page);
    check('sharing is offered on a game position', (await page.locator('.board-actions .share-btn').count()) === 1);
    await drag(page, 'd2', 'd3');
    let s = await seen(page);
    check('a dragged move stays where it was dropped, on the same board', s.sameBoard && /pawn/.test((await pieceAt(page, 'd3')) || '') && (await pieceAt(page, 'd2')) === null, JSON.stringify(s));
    check('the strip shows the line as the viewer’s own', /^Analiz ● 6\. ?d3$/.test(await ownLine(page)), await ownLine(page));
    check('the board is marked and sharing is gone', (await page.locator('.board-row.analysing').count()) === 1 && (await page.locator('.board-actions .share-btn').count()) === 0);
    check('the return control says "Canlı konuma dön"', (await page.locator('.move-strip .go-live').innerText()).trim() === 'Canlı konuma dön');

    // the engine follows the position on the board: Black to move at move 6
    await page.waitForFunction(() => /^6…/.test(document.querySelector('.left-col .pv-first')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {});
    const firstPv = await page.locator('.left-col .pv-first').first().innerText().catch(() => '');
    check('the engine lines are for the position on the board (Black to play move 6)', /^6…/.test(firstPv), firstPv);
    check('the evaluation above the board has a score', /[+−]?\d/.test(await page.locator('.eval-strip').getAttribute('aria-label')), await page.locator('.eval-strip').getAttribute('aria-label'));

    // a second own move by clicking, for Black
    await click(page, 'd7');
    check('legal squares are marked for the piece picked up', (await page.locator('.board-col square.move-dest').count()) === 2);
    await click(page, 'd6');
    check('a second move, by two clicks, joins the line', /6\. ?d3 d6$/.test(await ownLine(page)), await ownLine(page));

    // the game goes on underneath
    world.plies = 12;
    await page.waitForFunction(() => /2 yeni hamle/.test(document.querySelector('.board-actions')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    check('new moves of the game are announced, not shown', /Oyunda 2 yeni hamle oynandı/.test(await page.locator('.board-actions').innerText()), await page.locator('.board-actions').innerText());
    check('the line and its position are untouched by them', /6\. ?d3 d6$/.test(await ownLine(page)) && /pawn/.test((await pieceAt(page, 'd6')) || '') && /pawn/.test((await pieceAt(page, 'b7')) || ''), `${await ownLine(page)} | d6 ${await pieceAt(page, 'd6')} | b7 ${await pieceAt(page, 'b7')}`);
    await page.screenshot({ path: out + '/board-analysis.png' });

    // back within the line, then leave it with the up arrow
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(350);
    check('the left arrow steps back inside the line', (await active(page)) === 'd3' && /pawn/.test((await pieceAt(page, 'd7')) || ''), await active(page));
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(500);
    check('the up arrow drops the line and shows the newest move of the game', (await page.locator('.strip-track.own').count()) === 0 && (await active(page)) === 'b5', await active(page));
    check('at the newest position the control says the board is live', /CANLI|Canlı/i.test(await page.locator('.live-state').innerText()) && (await page.locator('.move-strip .go-live').count()) === 0);
    check('sharing is back', (await page.locator('.board-actions .share-btn').count()) === 1);

    // from an earlier position, and back with the button
    await page.locator('.strip-track .move', { hasText: 'Fb5' }).click();
    await page.waitForTimeout(300);
    await drag(page, 'h7', 'h6');
    check('a line can start from an earlier position', /^Analiz ● 3… ?h6$/.test(await ownLine(page)), await ownLine(page));
    check('"Analizi kapat" is offered, to go back to where it started', (await page.locator('.board-actions .link', { hasText: 'Analizi kapat' }).count()) === 1);
    await page.locator('.move-strip .go-live').click();
    await page.waitForTimeout(400);
    check('the button returns to the live position', (await page.locator('.strip-track.own').count()) === 0 && (await active(page)) === 'b5');

    // and with the last-move control
    await drag(page, 'a2', 'a3');
    await page.locator('.move-strip-moves .nav-btn').last().click();
    await page.waitForTimeout(400);
    check('the last-move control returns as well', (await page.locator('.strip-track.own').count()) === 0 && (await active(page)) === 'b5');

    // a move that is not legal is not played
    await drag(page, 'a2', 'a5');
    check('an illegal drag changes nothing', (await page.locator('.strip-track.own').count()) === 0 && /pawn/.test((await pieceAt(page, 'a2')) || ''));
    s = await seen(page);
    check('all of this happened on one board', s.sameBoard, JSON.stringify(s));
    check('no page errors while analysing', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 3. prediction stays in its tab
  {
    const { ctx, page, errors } = await open();
    await page.locator('.tabs button', { hasText: 'Tahmin' }).click();
    await page.locator('.predict .seg button', { hasText: 'Açık' }).click();
    await page.waitForTimeout(300);
    check('guess mode asks in its tab', /Sence ne oynayacak/.test(await page.locator('.guess-card').innerText()));
    check('nothing about a guess is on the board column', (await page.locator('.board-col .banner.guess').count()) === 0 && !/Tahmin/.test(await page.locator('.board-col').innerText()));
    await page.waitForFunction(() => document.querySelectorAll('.left-col .pv-list li').length > 0, null, { timeout: 60000 }).catch(() => {});
    check('the engine beside the board is not hidden by guess mode', (await page.locator('.left-col .pv-list li').count()) > 0);

    // a move on the board is analysis, never a guess
    await drag(page, 'd2', 'd3');
    check('a move on the board starts a line and makes no guess', /6\. ?d3/.test(await ownLine(page)) && !/Tahminin:/.test(await page.locator('.predict').innerText()));
    check('the tab says its guess is about the game, not the board', /oyundaki en son konum/.test(await page.locator('.guess-card').innerText()));

    // choosing in the tab moves nothing on the board
    const before = await ownLine(page);
    await page.locator('.move-chooser .chip', { hasText: /^Ke1$/ }).click();
    await page.waitForTimeout(300);
    check('a move picked from the list becomes the guess', /Tahminin:\s*6\. ?Ke1/.test(await page.locator('.guess-card').innerText().then(t => t.replace(/\s+/g, ' '))), await page.locator('.guess-card').innerText());
    check('and the board keeps the viewer’s own line', (await ownLine(page)) === before && /pawn/.test((await pieceAt(page, 'd3')) || '') && /rook/.test((await pieceAt(page, 'f1')) || ''));

    // typing in the tab's field does not drive the board
    await page.locator('.guess-card .link', { hasText: 'Değiştir' }).click();
    const field = page.locator('.move-input input');
    await field.fill('c3');
    await field.press('ArrowLeft');
    await field.press('ArrowUp');
    await page.waitForTimeout(200);
    check('arrow keys in the move field leave the board alone', (await ownLine(page)) === before);
    await field.press('Enter');
    await page.waitForTimeout(300);
    check('a typed move becomes the guess', /Tahminin:\s*6\. ?c3/.test(await page.locator('.guess-card').innerText().then(t => t.replace(/\s+/g, ' '))));
    check('no page errors in the prediction tab', errors.length === 0, errors.join(' | '));
    await page.screenshot({ path: out + '/board-predict.png' });
    await ctx.close();
  }

  // ---- 4. promotion on the main board
  {
    const { ctx, page, errors } = await open({ fen: '7k/4P2p/6pK/8/8/8/8/8 w - - 0 1' });
    await watch(page);
    await drag(page, 'e7', 'e8');
    check('a pawn reaching the last rank asks which piece', (await page.locator('.promo[role="dialog"]').count()) === 1);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    check('arrow keys do nothing while the choice is open', (await page.locator('.promo[role="dialog"]').count()) === 1 && (await page.locator('.strip-track.own').count()) === 0);
    await page.locator('.promo .link', { hasText: 'Vazgeç' }).click();
    await page.waitForTimeout(450);
    check('cancelling puts the pawn back and plays nothing', /pawn/.test((await pieceAt(page, 'e7')) || '') && (await pieceAt(page, 'e8')) === null && (await page.locator('.strip-track.own').count()) === 0);
    await drag(page, 'e7', 'e8');
    await page.locator('.promo-row button', { hasText: 'Kale' }).click();
    await page.waitForTimeout(450);
    check('choosing a rook plays the promotion into the line', /rook/.test((await pieceAt(page, 'e8')) || '') && /e8=K/.test(await ownLine(page)), await ownLine(page));
    await drag(page, 'e7', 'e8');
    const s = await seen(page);
    check('the board was never rebuilt for it', s.sameBoard, JSON.stringify(s));
    check('a game set up from a position shows no invented clock', /–:––/.test(await page.locator('.board-col .clock').first().innerText()), await page.locator('.board-col .clock').first().innerText());
    check('no page errors with promotion', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 5. a puzzle: the solver's move and the reply on one board
  {
    const { ctx, page, errors } = await open({ path: '/#bulmaca', wait: '.puzzle-col cg-board piece' });
    await watch(page, '.puzzle-col');
    await click(page, 'e7', 'white', '.puzzle-col');
    await click(page, 'f7', 'white', '.puzzle-col');
    await page.waitForTimeout(1300);
    let s = await seen(page, '.puzzle-col');
    check('the right move and the reply are played on the same board', s.sameBoard && /king/.test((await pieceAt(page, 'e6', '.puzzle-col')) || ''), JSON.stringify(s));
    check('only the pieces that move are animated: the rook, then the king', s.animated <= 2 && s.added === 0, JSON.stringify(s));
    check('every other piece is the node it was (one pawn was captured)', s.piecesKept === s.piecesBefore - 1, `${s.piecesKept} of ${s.piecesBefore}`);
    await page.locator('.move-input input').fill('d5');
    await page.locator('.move-input input').press('Enter');
    await page.waitForTimeout(600);
    s = await seen(page, '.puzzle-col');
    check('the mating move finishes it, still on the same board', s.sameBoard && /Çözdün/.test(await page.locator('.feedback').innerText()), JSON.stringify(s));
    await page.locator('.puzzle-actions button', { hasText: 'Baştan' }).click();
    await page.waitForTimeout(500);
    s = await seen(page, '.puzzle-col');
    check('starting over shows the first position at once, with nothing flying', s.sameBoard && s.animated === 0 && /rook/.test((await pieceAt(page, 'e7', '.puzzle-col')) || ''), JSON.stringify(s));
    check('no page errors in the puzzle', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 6. the match on top, the list of games, the broadcast dropdown
  {
    const { ctx, page, errors } = await open();
    const squares = page.locator('.game-squares .sq');
    check('one square per game, each with its name', (await squares.count()) === 14 && /^1\. oyun: Sindarov – Gukesh, ½–½$/.test(await squares.nth(0).getAttribute('aria-label')), await squares.nth(0).getAttribute('aria-label'));
    check('the played, live and coming games are told apart', /won-a/.test(await squares.nth(1).getAttribute('class')) && /live/.test(await squares.nth(2).getAttribute('class')) && /ahead/.test(await squares.nth(5).getAttribute('class')));
    check('the open game is marked', (await squares.nth(2).getAttribute('aria-current')) === 'true' && /3\. oyun/.test(await page.locator('.match-strip .game-now').innerText()));
    await squares.nth(1).click();
    await page.waitForFunction(() => /2\. oyun/.test(document.querySelector('.match-strip .game-now')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {});
    check('a square opens its game', /2\. oyun/.test(await page.locator('.match-strip .game-now').innerText()) && (await squares.nth(1).getAttribute('aria-current')) === 'true');

    const button = page.locator('.games-btn');
    await button.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.games-drawer[open]');
    check('the full list opens as a dialog and takes the focus', await page.evaluate(() => !!document.activeElement?.closest('dialog.games-drawer')));
    check('it lists every game with what is known of it', (await page.locator('.games-drawer .game-row').count()) === 14 && /Gukesh – Sindarov, 1–0, şu an açık/.test(await page.locator('.games-drawer .game-row.current').getAttribute('aria-label')), await page.locator('.games-drawer .game-row.current').getAttribute('aria-label'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('Escape closes it and the focus is back on its button', (await page.locator('dialog.games-drawer[open]').count()) === 0 && (await button.evaluate(el => document.activeElement === el)));
    await button.click();
    await page.locator('.games-drawer .game-row').nth(2).click();
    await page.waitForFunction(() => /3\. oyun/.test(document.querySelector('.match-strip .game-now')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {});
    check('picking a game in the list opens it and closes the list', /3\. oyun/.test(await page.locator('.match-strip .game-now').innerText()) && (await page.locator('dialog.games-drawer[open]').count()) === 0);

    const select = page.locator('.stream-pick select');
    const options = await select.locator('option').allInnerTexts();
    check('the broadcast is chosen from a labelled dropdown', options.length === 5 && options[0] === 'Chess.com Türkçe' && options[4] === 'Kendi bağlantım' && /Yayın/.test(await page.locator('.stream-pick').textContent()), options.join(', '));
    const srcBefore = await page.locator('.player iframe').getAttribute('src');
    await select.selectOption('yt-fide');
    await page.waitForTimeout(400);
    check('choosing another channel changes the video', (await page.locator('.player iframe').getAttribute('src')) !== srcBefore && (await select.inputValue()) === 'yt-fide');
    await select.selectOption('custom');
    check('"Kendi bağlantım" opens the field for a link and keeps the video until one is given', (await page.locator('.paste input').count()) === 1 && /youtube/.test(await page.locator('.player iframe').getAttribute('src')));
    check('the dropdown can be driven from the keyboard', await (async () => {
      await select.selectOption('yt-chesscomtr');
      await select.focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
      return (await select.inputValue()) !== 'yt-chesscomtr';
    })());

    // the time chart uses real clock readings
    const time = page.locator('.left-col .time-panel');
    check('time per move names both players and their longest think', /Gukesh/.test(await time.innerText()) && /Sindarov/.test(await time.innerText()) && /En uzun düşünme/i.test(await time.innerText()), (await time.innerText()).replace(/\s+/g, ' ').slice(0, 120));
    check('it draws a bar for each move with a known time', (await time.locator('svg .bar').count()) === 10, String(await time.locator('svg .bar').count()));
    check('no page errors in the top bar and the dropdown', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 7. a phone
  {
    const { ctx, page, errors } = await open({ device: 'iPhone 14' });
    const width = await page.evaluate(() => window.innerWidth);
    const board = await page.locator('.board-col cg-board').boundingBox();
    check('no sideways scrolling on a phone', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
    check('the board keeps almost the full width', board.width >= width - 24, `${Math.round(board.width)} of ${width}`);
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.move-strip button, .board-actions button, .games-btn, .viewnav button')].filter(b => b.offsetParent).map(b => Math.round(b.getBoundingClientRect().height)));
    check('controls are at least 40px tall', Math.min(...sizes) >= 40, sizes.join(','));
    check('the engine and the time per move are in the tabs', (await page.locator('.left-col').count()) === 0 && (await page.locator('.tab-body .engine-card').count()) === 1);

    // a swipe that starts on a piece scrolls the page and plays nothing
    const client = await ctx.newCDPSession(page);
    const [sx, sy] = await centre(page, 'e2');
    const y0 = await page.evaluate(() => window.scrollY);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
    for (let i = 1; i <= 8; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - i * 25 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(600);
    const y1 = await page.evaluate(() => window.scrollY);
    check('a swipe over the board scrolls the page and moves no piece', y1 > y0 + 50 && (await page.locator('.strip-track.own').count()) === 0, `scrolled ${Math.round(y1 - y0)}px`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    // two taps make a move
    const tap = async square => {
      await page.locator('.board-col cg-board').scrollIntoViewIfNeeded();
      const [x, y] = await centre(page, square);
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(250);
    };
    await tap('d2');
    await tap('d3');
    check('two taps play a move of the viewer’s own', /6\. ?d3/.test(await ownLine(page)), await ownLine(page));
    const back = page.locator('.move-strip .go-live');
    const bb = await back.boundingBox();
    check('the way back to live is a full-width button of its own', bb && bb.width >= width - 24 && bb.height >= 44, bb ? `${Math.round(bb.width)}x${Math.round(bb.height)}` : 'missing');
    await back.tap();
    await page.waitForTimeout(300);
    check('it returns to the live position', (await page.locator('.strip-track.own').count()) === 0);

    await page.locator('.games-btn').tap();
    await page.waitForSelector('dialog.games-drawer[open]');
    const drawer = await page.locator('dialog.games-drawer').boundingBox();
    check('the game list opens as a drawer that fits the screen', drawer.width <= width && (await page.locator('.games-drawer .game-row').count()) === 14, `${Math.round(drawer.width)} of ${width}`);
    await page.screenshot({ path: out + '/board-phone-drawer.png' });
    await page.locator('.games-drawer .btn', { hasText: 'Kapat' }).tap();
    await page.screenshot({ path: out + '/board-phone.png', fullPage: true });
    check('no page errors on the phone', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 8. a tablet: two columns, nothing cut off
  {
    const { ctx, page, errors } = await open({ viewport: { width: 1024, height: 768 } });
    check('no sideways scrolling at tablet width', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
    check('the board and the broadcast sit side by side, the engine in the first tab', (await page.locator('.left-col').count()) === 0 && (await page.locator('.tab-body .engine-card').count()) === 1 && (await page.locator('.games-btn').count()) === 1);
    await page.screenshot({ path: out + '/board-tablet.png' });
    check('no page errors at tablet width', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
