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
    // A plain page in place of the video, where a check clicks in it: the frame takes the keyboard like the real one, and nothing plays.
    if (opts.blankVideo) await ctx.route(/youtube\.com|youtube-nocookie\.com/, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<body style="margin:0;background:#3a342e"></body>' }));
    // The masters database answered here, where a check needs known numbers: 53 games, 14 won by White, 32 drawn, 7 by Black.
    if (opts.masters) {
      await ctx.route('https://explorer.lichess.ovh/**', route => {
        const cors = { 'access-control-allow-origin': '*' };
        if (!new URL(route.request().url()).pathname.startsWith('/masters')) return route.fulfill({ status: 404, headers: cors, body: '{}' });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: cors,
          body: JSON.stringify({
            white: 14,
            draws: 32,
            black: 7,
            moves: [
              { uci: 'f1e1', san: 'Re1', white: 9, draws: 22, black: 3, averageRating: 2650 },
              { uci: 'd2d3', san: 'd3', white: 4, draws: 8, black: 3, averageRating: 2640 },
              { uci: 'a4c6', san: 'Bxc6', white: 1, draws: 2, black: 1, averageRating: 2600 },
            ],
            topGames: [],
            opening: { eco: 'C84', name: 'Ruy Lopez: Closed' },
          }),
        });
      });
    }
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
    await page.waitForFunction(() => /^6…/.test(document.querySelector('.side-col .pv-first')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {});
    const firstPv = await page.locator('.side-col .pv-first').first().innerText().catch(() => '');
    check('the engine lines are for the position on the board (Black to play move 6)', /^6…/.test(firstPv), firstPv);
    check('the evaluation above the board has a score', /[+−]?\d/.test(await page.locator('.eval-strip').getAttribute('aria-label')), await page.locator('.eval-strip').getAttribute('aria-label'));

    // a second own move by clicking, for Black
    await click(page, 'd7');
    check('legal squares are marked for the piece picked up', (await page.locator('.board-col square.move-dest').count()) === 2);
    await click(page, 'd6');
    check('a second move, by two clicks, joins the line', /6\. ?d3 d6$/.test(await ownLine(page)), await ownLine(page));
    await page.waitForTimeout(400); // let the pawn land: pieceAt below reads where a piece is, and a piece in flight is nowhere

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

  // ---- 3. guessing has its own card beside the board; the engine and the moves are the first tab
  {
    const { ctx, page, errors } = await open();
    await page.waitForSelector('.left-col .predict');
    await page.waitForSelector('.model-estimate');
    const tabNames = (await page.locator('.tabs button').allInnerTexts()).map(t => t.trim());
    check('the tabs start with Stockfish, open by default, and guessing is not one of them', tabNames.join(',') === 'Stockfish,Benzer,Grafik,Maç,Ayarlar' && (await page.locator('.tabs button.active').innerText()).trim() === 'Stockfish', tabNames.join(','));
    const firstTab = await page.evaluate(() => {
      const body = document.querySelector('.side-col .tab-body');
      const engine = body.querySelector('.engine-card');
      const list = body.querySelector('.move-list');
      // two moves to a row: White's and Black's side by side
      const rows = new Set([...list.querySelectorAll('.move')].map(c => Math.round(c.getBoundingClientRect().top)));
      return {
        engineFirst: !!engine && !!list && engine.getBoundingClientRect().bottom <= list.getBoundingClientRect().top + 1,
        display: getComputedStyle(list).display,
        columns: getComputedStyle(list).gridTemplateColumns.split(' ').length,
        moves: list.querySelectorAll('.move').length,
        rows: rows.size,
        winChanceInTab: !!body.querySelector('.win-chance'),
      };
    });
    check('the first tab is the engine with the moves under it, as a table of number, White and Black', firstTab.engineFirst && firstTab.display === 'grid' && firstTab.columns === 3 && firstTab.moves === 10 && firstTab.rows === 5 && !firstTab.winChanceInTab, JSON.stringify(firstTab));
    const leftCards = await page.evaluate(() => [...document.querySelectorAll('.left-col > *')].map(el => (el.classList.contains('win-chance') ? 'win' : el.classList.contains('predict-card') ? 'guess' : el.classList.contains('time-panel') || el.querySelector('.time-panel, .time-chart') ? 'time' : el.className)));
    check('beside the board: win chance, guessing where the engine was, then time per move', leftCards.join(',') === 'win,guess,time' && (await page.locator('.left-col .engine-card').count()) === 0, leftCards.join(','));

    // the site's own estimate, on the main page under the board, whatever tab is open
    const estimate = page.locator('.model-estimate');
    const numbers = async () => (await estimate.locator('.model-moves .num').allInnerTexts()).map(t => (t.trim().startsWith('<') ? 0 : Number(t.replace(/\D/g, ''))));
    const first = await numbers();
    check('the model estimate shows three moves and "other", adding up to 100', first.length === 4 && first.reduce((a, b) => a + b, 0) === 100 && /Diğer hamleler/.test(await estimate.innerText()), first.join(' + '));
    check('it carries no "Deneysel" label and says whose move it is about', !/Deneysel/i.test(await estimate.innerText()) && (await estimate.locator('.tag').count()) === 0 && /Sindarov için, 6\. hamle/.test(await estimate.innerText()), (await estimate.innerText()).replace(/\s+/g, ' ').slice(0, 90));
    const shownMoves = (await estimate.locator('.model-moves strong').allInnerTexts()).map(t => t.trim());
    const legal = (await page.evaluate(() => [...document.querySelectorAll('.strip-track .move')].length)) > 0;
    check('its three moves are different from each other', legal && new Set(shownMoves).size === 3, shownMoves.join(', '));
    const place = await page.evaluate(() => {
      const el = document.querySelector('.model-estimate');
      const board = document.querySelector('.board-col cg-board').getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { inBoardColumn: !!el.closest('.board-col'), inTabs: !!el.closest('.predict'), below: r.top >= board.bottom, position: getComputedStyle(el).position };
    });
    check('it is in the board column, below the board, in the flow of the page', place.inBoardColumn && !place.inTabs && place.below && place.position === 'static', JSON.stringify(place));
    check('its moves are text, not controls', (await estimate.locator('.model-moves button, .model-moves a').count()) === 0);
    check('it is a title and a list: no explanation block and no link', (await estimate.locator('details, a, summary').count()) === 0 && !/Nasıl hesaplanıyor|Ölçüm/.test(await estimate.innerText()));
    check('the guess panel carries neither the estimate nor the note under the masters’ moves', (await page.locator('.predict .model-estimate').count()) === 0 && !/gerçek sıklıktır/.test(await page.locator('.predict').innerText()));

    await page.locator('.predict .seg button', { hasText: 'Açık' }).click();
    await page.waitForTimeout(300);
    check('guess mode asks in its own card', /Sence ne oynayacak/.test(await page.locator('.left-col .guess-card').innerText()));
    const inGuessMode = await numbers();
    check('in guess mode the estimate is shown at once: nothing to wait for and no button', inGuessMode.length === 4 && inGuessMode.reduce((a, b) => a + b, 0) === 100 && (await estimate.locator('button').count()) === 0 && !/sen tahminini yaptıktan sonra/.test(await estimate.innerText()), inGuessMode.join(' + '));
    // the model's card is under the board now; apart from it, the board column says nothing about guessing
    const boardColumnText = await page.evaluate(() => {
      const column = document.querySelector('.board-col').cloneNode(true);
      column.querySelectorAll('.model-estimate').forEach(el => el.remove());
      return column.textContent;
    });
    check('nothing asks for a guess on the board column', (await page.locator('.board-col .banner.guess').count()) === 0 && !/Tahmin|Sence ne oynayacak/.test(boardColumnText) && (await page.locator('.board-col .model-estimate input, .board-col .model-estimate select').count()) === 0);
    await page.waitForFunction(() => document.querySelectorAll('.side-col .pv-list li').length > 0, null, { timeout: 60000 }).catch(() => {});
    check('the engine in the first tab is not hidden by guess mode', (await page.locator('.side-col .pv-list li').count()) > 0);

    // a move on the board is analysis, never a guess
    await drag(page, 'd2', 'd3');
    check('a move on the board starts a line and makes no guess', /6\. ?d3/.test(await ownLine(page)) && !/Tahminin:/.test(await page.locator('.predict').innerText()));
    check('the card says its guess is about the game, not the board', /oyundaki en son konum/.test(await page.locator('.guess-card').innerText()));

    // choosing in the card moves nothing on the board
    const before = await ownLine(page);
    await page.locator('.move-chooser .chip', { hasText: /^Ke1$/ }).click();
    await page.waitForTimeout(300);
    check('a move picked from the list becomes the guess', /Tahminin:\s*6\. ?Ke1/.test(await page.locator('.guess-card').innerText().then(t => t.replace(/\s+/g, ' '))), await page.locator('.guess-card').innerText());
    check('and the board keeps the viewer’s own line', (await ownLine(page)) === before && /pawn/.test((await pieceAt(page, 'd3')) || '') && /rook/.test((await pieceAt(page, 'f1')) || ''));
    const afterGuess = await numbers();
    check('after a guess the estimate is as it was, still about the game and not the board', afterGuess.length === 4 && afterGuess.reduce((a, b) => a + b, 0) === 100 && /Sindarov için, 6\. hamle/.test(await estimate.innerText()), afterGuess.join(' + '));

    // typing in the card's field does not drive the board
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
    check('no page errors while guessing', errors.length === 0, errors.join(' | '));
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
    check('the broadcast is chosen from a labelled dropdown of the listed channels', options.join(', ') === 'Chess.com Türkçe, Chess.com (EN), FIDE (EN)' && /Yayın/.test(await page.locator('.stream-pick').textContent()), options.join(', '));
    const srcBefore = await page.locator('.player iframe').getAttribute('src');
    await select.selectOption('yt-fide');
    await page.waitForTimeout(400);
    check('choosing another channel changes the video', (await page.locator('.player iframe').getAttribute('src')) !== srcBefore && (await select.inputValue()) === 'yt-fide');
    check('there is no link of the viewer’s own and no button to another tab', (await page.locator('.stream input, .stream-top a').count()) === 0 && !/Kendi bağlantım|SatranChess/.test(await page.locator('.stream').innerText()) && (await page.locator('.stream-top button').count()) === 1);
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

  // ---- 6b. the right side can be made wider, and the board is never cramped by it
  {
    const { ctx, page, errors } = await open({ viewport: { width: 1600, height: 820 } });
    const box = async selector => page.locator(selector).first().boundingBox();
    const boardBefore = await box('.board-wrap');
    const sideBefore = await box('.side-col');

    // a short, wide window leaves room beside the board: turning the board and sharing sit there
    const rail = await box('.board-tools');
    const divider = await box('.divider');
    check('with free room beside the board, turning it and sharing are in a small rail there', !!rail && rail.x >= boardBefore.x + boardBefore.width && rail.x + rail.width <= divider.x && (await page.locator('.board-tools button').count()) === 2, rail ? `${Math.round(rail.x)}..${Math.round(rail.x + rail.width)} between ${Math.round(boardBefore.x + boardBefore.width)} and ${Math.round(divider.x)}` : 'no rail');
    check('and neither is under the board any more', (await page.locator('.move-strip > .nav-btn').count()) === 0 && (await page.locator('.board-actions .share-btn').count()) === 0);
    check('the rail takes nothing from the board', Math.round(boardBefore.width) === 546 && Math.abs(boardBefore.width - boardBefore.height) < 1, `${Math.round(boardBefore.width)}x${Math.round(boardBefore.height)}`);
    const orientationBefore = await page.locator('.board-col .cg-wrap').evaluate(el => (el.classList.contains('orientation-black') ? 'black' : 'white'));
    await page.locator('.board-tools button[aria-keyshortcuts="F"]').click();
    await page.waitForTimeout(300);
    const orientationAfter = await page.locator('.board-col .cg-wrap').evaluate(el => (el.classList.contains('orientation-black') ? 'black' : 'white'));
    check('the rail’s first button turns the board', orientationBefore !== orientationAfter, `${orientationBefore} -> ${orientationAfter}`);
    await page.locator('.board-tools button[aria-keyshortcuts="F"]').click();
    await page.locator('.board-tools .share-btn').click();
    await page.waitForSelector('.share-slot .share-panel');
    const panel = await box('.share-slot .share-panel');
    const boardNow = await box('.board-wrap');
    check('sharing from the rail shows the link under the board, inside the column', !!panel && panel.y >= boardNow.y + boardNow.height && panel.x >= boardNow.x - 1 && panel.x + panel.width <= boardNow.x + boardNow.width + 1, panel ? `${Math.round(panel.width)} wide` : 'no panel');
    await page.keyboard.press('Escape');

    // drag the divider as far left as it goes
    await page.mouse.move(divider.x + 6, divider.y + 200);
    await page.mouse.down();
    await page.mouse.move(divider.x - 300, divider.y + 200, { steps: 6 });
    await page.mouse.move(30, divider.y + 200, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const boardAfter = await box('.board-wrap');
    const sideAfter = await box('.side-col');
    const squares = await page.locator('.board-col cg-board').boundingBox();
    check('dragging the divider makes the right side wider', sideAfter.width > sideBefore.width + 100, `${Math.round(sideBefore.width)} -> ${Math.round(sideAfter.width)}`);
    check('but stops while the board is still 480 wide, and the board stays square', Math.round(boardAfter.width) === 480 && Math.abs(boardAfter.width - boardAfter.height) < 1 && Math.abs(squares.width - squares.height) < 1, `${Math.round(boardAfter.width)}x${Math.round(boardAfter.height)}, squares ${Math.round(squares.width)}x${Math.round(squares.height)}`);
    check('nothing overflows the window', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
    check('with no room left beside the board the two buttons are back under it', (await page.locator('.board-tools').count()) === 0 && (await page.locator('.move-strip > .nav-btn').count()) === 1 && (await page.locator('.board-actions .share-btn').count()) === 1);

    // a width saved on a larger window cannot cramp the board either
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('wcc26:settings') || '{}');
      localStorage.setItem('wcc26:settings', JSON.stringify({ ...saved, sideWidth: 1400 }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button.move');
    await page.waitForTimeout(800);
    const reloaded = await box('.board-wrap');
    check('a far too wide saved width is held to the same limit after a reload', Math.round(reloaded.width) === 480 && Math.abs(reloaded.width - reloaded.height) < 1 && (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, `${Math.round(reloaded.width)}x${Math.round(reloaded.height)}`);
    await page.screenshot({ path: out + '/board-wide-side.png' });
    check('no page errors while resizing', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 6c. the top bar's mark and title
  {
    const { ctx, page, errors } = await open({ viewport: { width: 1728, height: 1000 } });
    await page.evaluate(() => document.fonts.ready);
    const brand = await page.evaluate(() => {
      const h1 = document.querySelector('.brand h1');
      const place = document.querySelector('.brand p');
      return {
        mark: !!document.querySelector('.brand svg.logo path'),
        family: getComputedStyle(h1).fontFamily,
        loaded: document.fonts.check('600 18px "Fraunces Variable"'),
        // the font comes from this site, not from anyone else's server
        sources: [...document.fonts].filter(f => /Fraunces/.test(f.family) && f.status === 'loaded').length,
        oneLine: h1.getBoundingClientRect().height < 30,
        title: h1.textContent,
        place: place ? getComputedStyle(place).textTransform + ':' + place.textContent : '',
      };
    });
    const fontRequests = (await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => /\.woff2?($|\?)/.test(n)))).map(u => new URL(u).origin);
    check('the title is set in the site’s own serif, loaded from the site itself', brand.mark && /Fraunces Variable/.test(brand.family) && brand.loaded && brand.sources >= 1 && fontRequests.length >= 1 && fontRequests.every(o => o === new URL(APP).origin), JSON.stringify({ ...brand, fontRequests }));
    check('on a wide bar it is one line with the place under it', brand.oneLine && brand.title === 'Dünya Satranç Şampiyonası 2026' && brand.place === 'uppercase:Cenevre', `${brand.title} / ${brand.place}`);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    const narrow = await page.evaluate(() => {
      const h1 = document.querySelector('.brand h1');
      const tops = new Set([...h1.querySelectorAll('span')].map(sp => Math.round(sp.getBoundingClientRect().top)));
      const top = document.querySelector('.top');
      return { lines: tops.size, halves: [...h1.querySelectorAll('span')].map(sp => sp.textContent), barOverflow: top.scrollWidth - top.clientWidth, brandRight: Math.round(document.querySelector('.brand').getBoundingClientRect().right), stripLeft: Math.round(document.querySelector('.match-strip').getBoundingClientRect().left) };
    });
    check('on a shorter bar it takes exactly two lines and runs into nothing', narrow.lines === 2 && narrow.halves.join('|') === 'Dünya Satranç|Şampiyonası 2026' && narrow.barOverflow <= 0 && narrow.brandRight <= narrow.stripLeft, JSON.stringify(narrow));
    check('no page errors in the top bar', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 6d. the tabs and the top bar after the clean-up of 26 November
  {
    const { ctx, page, errors } = await open({ masters: true });
    const topRight = (await page.locator('.top-right').innerText()).replace(/\s+/g, ' ').trim();
    check('the top bar has no connection dot: the status and the language', (await page.locator('.feed-dot').count()) === 0 && topRight === 'CANLI EN', topRight);

    await page.locator('.tabs button', { hasText: 'Benzer' }).click();
    await page.waitForSelector('.similar .res-legend');
    await page.waitForSelector('.similar .next-moves .resbar');
    const legend = (await page.locator('.similar .res-legend').innerText()).replace(/\s+/g, ' ').trim();
    check('how the games in the position ended is written out for all three results, Black’s included', legend === 'Beyaz 26% Berabere 60% Siyah 13%', legend);
    const similar = await page.locator('.similar').innerText();
    check('the tab has no "Bu maçta" block and no line saying every move is a known one', !/Bu maçta|hamleye kadar aynı|Buraya kadarki/.test(similar) && (await page.locator('.similar .novelty').count()) === 0);
    const bars = await page.evaluate(() =>
      [...document.querySelectorAll('.similar .next-moves .resbar')].map(bar =>
        [...bar.querySelectorAll('i')].map(part => {
          const label = part.querySelector('span');
          const shown = !!label && getComputedStyle(label).display !== 'none';
          return { width: Math.round(part.getBoundingClientRect().width), text: label ? label.textContent : '', shown, fits: !shown || label.scrollWidth <= part.clientWidth };
        }),
      ),
    );
    const parts = bars.flat();
    check('in the small bars a share is shown wherever its part is wide enough, Black’s too, and never cut off', bars.length === 3 && parts.every(x => x.fits) && parts.every(x => x.shown === (x.width > 27 || (x.text.length < 3 && x.width >= 19))) && bars[1][2].shown && bars[1][2].text === '20%', JSON.stringify(bars.map(b => b.map(x => `${x.width}:${x.text}${x.shown ? '' : ' hidden'}`))));

    await page.locator('.tabs button', { hasText: 'Grafik' }).click();
    await page.waitForSelector('.charts');
    await page.waitForTimeout(300);
    check('the evaluation chart has its title and no line under it', !/hamle hamle/.test(await page.locator('.charts').innerText()) && (await page.locator('.charts h3').first().innerText()).startsWith('Değerlendirme grafiği') && (await page.locator('.charts section').first().locator('p.sub').count()) === 0);

    await page.locator('.tabs button', { hasText: 'Ayarlar' }).click();
    await page.waitForSelector('.settings .setting');
    const settings = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('.settings > .setting')];
      const notes = [...document.querySelectorAll('.settings p:not(.notice)')];
      return {
        blocks: blocks.length,
        rules: blocks.map(b => parseFloat(getComputedStyle(b).borderTopWidth)).join(','),
        bottomRules: blocks.filter(b => parseFloat(getComputedStyle(b).borderBottomWidth) > 0).length,
        notes: notes.length,
        notesInside: notes.every(n => n.parentElement.classList.contains('setting')),
        // a note starts under its own row, with nothing drawn between the two
        noteGaps: notes.map(n => Math.round(n.getBoundingClientRect().top - n.parentElement.querySelector('.setting-row').getBoundingClientRect().bottom)).join(','),
        padding: [...new Set(blocks.map(b => getComputedStyle(b).paddingTop + '/' + getComputedStyle(b).paddingBottom))].join(' '),
      };
    });
    check('each setting is one block with its note inside it, and the rule is between settings, never between a row and its note', settings.blocks >= 7 && settings.notes >= 2 && settings.notesInside && settings.bottomRules === 0 && settings.rules === ['0', ...Array(settings.blocks - 1).fill('1')].join(',') && settings.noteGaps.split(',').every(g => Number(g) >= 0 && Number(g) <= 10) && settings.padding === '12px/12px', JSON.stringify(settings));
    check('no page errors in these tabs', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 6e. after a click in the video, a press on the page brings the arrow keys back
  {
    const { ctx, page, errors } = await open({ blankVideo: true });
    const activeMove = async () => (await page.locator('.strip-track .move.active').first().innerText().catch(() => '')).trim();
    const focus = () => page.evaluate(() => document.activeElement?.tagName);
    const intoVideo = async () => {
      const box = await page.locator('.player iframe').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(200);
    };
    const arrowLeft = async () => {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(250);
    };
    const toLive = async () => {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(250);
    };
    const live = await activeMove();

    await intoVideo();
    await arrowLeft();
    check('a click in the video hands the keyboard to the video: the arrow keys do not reach the board', (await focus()) === 'IFRAME' && (await activeMove()) === live, `${await focus()}, ${await activeMove()}`);

    // an empty square of the board
    {
      const [x, y] = await centre(page, 'h4');
      await page.mouse.click(x, y);
      await page.waitForTimeout(200);
      const where = await focus();
      await arrowLeft();
      check('a click on an empty square of the board brings the arrow keys back', where === 'BODY' && (await activeMove()) !== live, `${where}, ${live} -> ${await activeMove()}`);
      await toLive();
    }
    // somewhere else on the page
    for (const [name, selector] of [['a card beside the board', '.win-chance'], ['the footer', '.foot'], ['a move number in the list of moves', '.side-col .move-list .move-num']]) {
      await intoVideo();
      const box = await page.locator(selector).first().boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(200);
      const where = await focus();
      await arrowLeft();
      check(`so does a click on ${name}`, where === 'BODY' && (await activeMove()) !== live, `${where}, ${live} -> ${await activeMove()}`);
      await toLive();
    }
    // the press that brings the keyboard back is still the press it was: a piece dragged straight after the video is played
    await intoVideo();
    await drag(page, 'd2', 'd3');
    check('a piece dragged straight after a click in the video is still played', /6\. ?d3/.test(await ownLine(page)) && (await focus()) !== 'IFRAME', `${await ownLine(page)}, ${await focus()}`);
    await arrowLeft();
    check('and the arrow keys then step back through it: the pawn is on d2 again', /pawn/.test((await pieceAt(page, 'd2')) || '') && (await pieceAt(page, 'd3')) === null, `d2 ${await pieceAt(page, 'd2')}, d3 ${await pieceAt(page, 'd3')}`);
    // a field keeps the keyboard: the page takes it back from a frame, from nothing else
    await page.locator('.move-strip .go-live').click().catch(() => {});
    const select = page.locator('.stream-pick select');
    await select.focus();
    const [bx, by] = await centre(page, 'h4');
    await page.mouse.move(bx, by);
    check('a control that has the keyboard keeps it until the viewer clicks elsewhere', (await focus()) === 'SELECT');
    check('no page errors around the video', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 6f. the video and the panel under it share the column: more moves by default, and a bar to set it by hand
  {
    const { ctx, page, errors } = await open({ viewport: { width: 1600, height: 930 }, blankVideo: true });
    // the right side as wide as Özgür had it
    await page.evaluate(() => localStorage.setItem('wcc26:settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('wcc26:settings') || '{}'), sideWidth: 640 })));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button.move');
    await page.waitForTimeout(800);
    const shape = () =>
      page.evaluate(() => {
        const box = sel => document.querySelector(sel).getBoundingClientRect();
        const side = box('.side-col');
        const video = box('.player iframe');
        const engine = box('.side-col .engine-card');
        const list = box('.side-col .move-list');
        const lastRow = [...document.querySelectorAll('.side-col .move-list .move')].at(-1).getBoundingClientRect();
        return {
          side: Math.round(side.width),
          video: Math.round(box('.player').height),
          ratio: Math.round((video.width / video.height) * 100) / 100,
          centred: Math.abs(video.left + video.width / 2 - (side.left + side.width / 2)) < 1,
          engine: Math.round(engine.height),
          engineWhole: engine.bottom <= list.top + 1 && [...document.querySelectorAll('.side-col .pv-list li')].every(li => li.getBoundingClientRect().bottom <= engine.bottom + 1),
          list: Math.round(list.height),
          lastMoveInView: lastRow.bottom <= list.bottom + 1 && list.bottom <= innerHeight,
          panelBottom: Math.round(box('.tab-body').bottom),
          saved: JSON.parse(localStorage.getItem('wcc26:settings') || '{}').videoHeight ?? 0,
          overflowX: document.documentElement.scrollWidth - innerWidth,
        };
      });
    const auto = await shape();
    check('by default the list of moves has room for four rows or more, with the engine’s lines whole above it', auto.list >= 140 && auto.engineWhole && auto.lastMoveInView && auto.panelBottom <= 930, JSON.stringify(auto));
    check('the room comes from the video: lower than its width would allow, still 16:9, in the middle of the column', auto.side === 640 && auto.video < 360 && auto.video >= 200 && auto.ratio === 1.78 && auto.centred, `${auto.video} high of 360, ratio ${auto.ratio}`);
    // the engine goes on thinking and its lines change; the video must not change size with them
    await page.waitForTimeout(2500);
    const later = await shape();
    check('the video keeps that height while the engine thinks', later.video === auto.video, `${auto.video} -> ${later.video}`);
    const dragBar = async dy => {
      const bar = await page.locator('.hsplit').boundingBox();
      const x = bar.x + bar.width / 2;
      const y = bar.y + bar.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + dy / 2, { steps: 4 });
      await page.mouse.move(x, y + dy, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    };
    await dragBar(-100);
    const up = await shape();
    check('dragging the bar under the video up gives the moves that much more and the video that much less', up.video === auto.video - 100 && up.list === auto.list + 100 && up.engine === auto.engine && up.ratio === 1.78, `${auto.video}/${auto.list} -> ${up.video}/${up.list}`);
    await dragBar(-600);
    const top = await shape();
    check('the video stops at a small size, and the engine’s lines are still whole', top.video === 120 && top.engineWhole && top.overflowX <= 0, JSON.stringify(top));
    await dragBar(800);
    const down = await shape();
    check('dragged down, the video stops at the height its width allows, and the moves keep a strip', down.video === 360 && down.list >= 64 && down.lastMoveInView, JSON.stringify(down));
    await dragBar(-60);
    const chosen = await shape();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button.move');
    await page.waitForTimeout(800);
    const again = await shape();
    check('the chosen height is remembered', chosen.saved === chosen.video && again.video === chosen.video && again.list === chosen.list, `${chosen.video} -> ${again.video}`);
    await page.locator('.tabs button', { hasText: 'Ayarlar' }).click();
    await page.waitForTimeout(300);
    const otherTab = await page.evaluate(() => Math.round(document.querySelector('.player').getBoundingClientRect().height));
    check('and it is the same under every tab', otherTab === chosen.video, String(otherTab));
    await page.locator('.tabs button', { hasText: 'Stockfish' }).click();
    await page.locator('.hsplit').dblclick();
    await page.waitForTimeout(300);
    const reset = await shape();
    check('a double click on the bar goes back to automatic', reset.saved === 0 && reset.video === auto.video && reset.list === auto.list, JSON.stringify(reset));
    check('no page errors while resizing the video', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    // a column with room for everything: the video is as large as its width allows, as before
    const { ctx, page } = await open({ viewport: { width: 1728, height: 1000 }, blankVideo: true });
    const roomy = await page.evaluate(() => {
      const video = document.querySelector('.player iframe').getBoundingClientRect();
      return { side: Math.round(document.querySelector('.side-col').getBoundingClientRect().width), video: [Math.round(video.width), Math.round(video.height)], list: Math.round(document.querySelector('.side-col .move-list').getBoundingClientRect().height) };
    });
    check('where the column has room for both, the video keeps its full size', roomy.video[0] === roomy.side && roomy.video[1] === Math.round((roomy.side * 9) / 16) && roomy.list >= 140, JSON.stringify(roomy));
    await ctx.close();
  }
  for (const side of [320, 432, 631]) {
    // Özgür's window with five engine lines, at the three widths he had the right side
    const { ctx, page } = await open({ viewport: { width: 1803, height: 919 }, blankVideo: true });
    await page.evaluate(w => localStorage.setItem('wcc26:settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('wcc26:settings') || '{}'), sideWidth: w, engineLines: 5 })), side);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button.move');
    await page.waitForFunction(() => document.querySelectorAll('.side-col .pv-list li').length === 5, null, { timeout: 60000 });
    await page.waitForTimeout(600);
    const five = await page.evaluate(() => {
      const box = sel => document.querySelector(sel).getBoundingClientRect();
      const engine = box('.side-col .engine-card');
      const list = box('.side-col .move-list');
      const rows = [...document.querySelectorAll('.side-col .pv-list li')];
      const lastRow = [...document.querySelectorAll('.side-col .move-list .move')].at(-1).getBoundingClientRect();
      const pick = document.querySelector('.side-col .engine-head .engine-lines select');
      return {
        side: Math.round(box('.side-col').width),
        video: Math.round(box('.player').height),
        engine: Math.round(engine.height),
        list: Math.round(list.height),
        rowHeights: rows.map(li => Math.round(li.getBoundingClientRect().height)),
        rowsWhole: rows.every(li => li.getBoundingClientRect().bottom <= engine.bottom + 1) && engine.bottom <= list.top + 1,
        wholeLineOnHover: rows.every(li => li.title.replace(/\d+[.…] /g, '').split(' ').length === li.querySelectorAll('.pv-rest > span').length + 1 && li.title.startsWith('6. ')),
        pickInHead: !!pick && pick.value === '5' && !!pick.closest('label').textContent.trim(),
        lastMoveInView: lastRow.bottom <= list.bottom + 1 && list.bottom <= innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
      };
    });
    check(`five engine lines beside the board at ${side} px still leave the moves four rows or more`, five.side === side && five.list >= 140 && five.rowsWhole && five.lastMoveInView && five.video >= 120 && five.overflowX <= 0, JSON.stringify(five));
    check(`each of the five is one row, with the whole line as its tooltip, and their number is chosen in the card’s head (${side} px)`, five.rowHeights.every(h => h <= 44) && five.wholeLineOnHover && five.pickInHead, JSON.stringify(five));
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
    const phoneTabs = (await page.locator('.tabs button').allInnerTexts()).map(t => t.trim());
    check('on a phone guessing is a tab, after Stockfish', phoneTabs.join(',') === 'Stockfish,Tahmin,Benzer,Grafik,Maç,Ayarlar', phoneTabs.join(','));
    check('and the two board buttons stay under the board', (await page.locator('.board-tools').count()) === 0 && (await page.locator('.move-strip > .nav-btn').count()) === 1);
    check('there is no bar to drag under the video on a phone', (await page.locator('.hsplit').count()) === 0);

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

    await page.waitForSelector('.model-estimate');
    const phoneEstimate = await page.evaluate(() => {
      const el = document.querySelector('.model-estimate');
      const r = el.getBoundingClientRect();
      const board = document.querySelector('.board-col cg-board').getBoundingClientRect();
      const tabs = document.querySelector('.tabs').getBoundingClientRect();
      const nums = [...el.querySelectorAll('.model-moves .num')].map(n => (n.textContent.trim().startsWith('<') ? 0 : Number(n.textContent.replace(/\D/g, ''))));
      return { underBoard: r.top >= board.bottom, aboveTabs: r.bottom <= tabs.top + 1, position: getComputedStyle(el).position, left: Math.round(r.left), right: Math.round(r.right), sum: nums.reduce((a, b) => a + b, 0), rows: nums.length, overflow: document.documentElement.scrollWidth - window.innerWidth };
    });
    check('on a phone the estimate is under the board and above the tabs, in the flow, within the screen', phoneEstimate.underBoard && phoneEstimate.aboveTabs && phoneEstimate.position === 'static' && phoneEstimate.left >= 0 && phoneEstimate.right <= width && phoneEstimate.sum === 100 && phoneEstimate.rows === 4 && phoneEstimate.overflow <= 0, JSON.stringify(phoneEstimate));
    await page.evaluate(() => window.scrollTo(0, 0));

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
