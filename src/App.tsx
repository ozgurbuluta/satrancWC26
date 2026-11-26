import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { REPO_URL } from './config';
import { MovesPanel } from './components/AnalysisPanel';
import { Board } from './components/Board';
import { CatchUpBar } from './components/CatchUpBar';
import { EngineCard, EvalStrip, WinChance } from './components/EnginePanel';
import { Header } from './components/Header';
import { MatchPanel } from './components/MatchPanel';
import { FlipButton, MoveStrip } from './components/MoveStrip';
import { PromotionPicker, usePromotion } from './components/MoveEntry';
import { PlayerBar } from './components/PlayerBar';
import { SettingsPanel } from './components/SettingsPanel';
import { ShareButton } from './components/ShareButton';
import { StreamPanel } from './components/StreamPanel';
import { TimePanel } from './components/TimePanel';
import { GAME_SQUARES, useEval, useIsMobile, useKeyboardBackFromFrames, useMedia, useNow, useT, WIDE_LAYOUT } from './hooks';
import { setContext, track, trackOutbound } from './lib/analytics';
import { displayName, firstMoveSquares, materialFromFen, pvToSan, shortName } from './lib/format';
import { seedGameScores } from './lib/quality';
import { shortcutFor } from './lib/shortcuts';
import { unlockAudio } from './lib/sound';
import { analysisPosition, AUTO_SWITCH_SEC, canSharePosition, selectGameData, selectGuessFen, selectRoundNo, selectShownPly, useStore } from './store';

// Loaded on first use, so the first paint only carries the board and the analysis tab.
const SimilarPanel = lazy(() => import('./components/SimilarPanel').then(m => ({ default: m.SimilarPanel })));
const ChartsPanel = lazy(() => import('./components/ChartsPanel').then(m => ({ default: m.ChartsPanel })));
const PredictPanel = lazy(() => import('./components/PredictPanel').then(m => ({ default: m.PredictPanel })));
// The model's tables are a few hundred KB: they come after the page, not with it.
const ModelEstimate = lazy(() => import('./components/ModelEstimate').then(m => ({ default: m.ModelEstimate })));
const PuzzleBoard = lazy(() => import('./components/PuzzleView').then(m => ({ default: m.PuzzleBoard })));
const PuzzlePanel = lazy(() => import('./components/PuzzleView').then(m => ({ default: m.PuzzlePanel })));

type Tab = 'analysis' | 'predict' | 'similar' | 'charts' | 'match' | 'settings';
/** Beside the board there is a column for guessing the move; without that column it is a tab. */
const TABS_BESIDE: Tab[] = ['analysis', 'similar', 'charts', 'match', 'settings'];
const TABS_ALONE: Tab[] = ['analysis', 'predict', 'similar', 'charts', 'match', 'settings'];
/** Free width, in pixels, that the rail of board buttons needs to the right of the board. */
const BOARD_RAIL_ROOM = 64;

export default function App() {
  const t = useT();
  const init = useStore(s => s.init);
  const game = useStore(selectGameData);
  const shown = useStore(selectShownPly);
  const revealed = useStore(s => s.revealed);
  const viewPly = useStore(s => s.viewPly);
  const flipped = useStore(s => s.flipped);
  const resultVisible = useStore(s => s.resultVisible);
  const loadError = useStore(s => s.loadError);
  const settings = useStore(s => s.settings);
  const paused = useStore(s => s.paused);
  const preview = useStore(s => s.preview);
  const streamUncovered = useStore(s => s.streamUncovered);
  const step = useStore(s => s.step);
  const setViewPly = useStore(s => s.setViewPly);
  const toggleFlip = useStore(s => s.toggleFlip);
  const setSetting = useStore(s => s.setSetting);
  const pause = useStore(s => s.pause);
  const setPreview = useStore(s => s.setPreview);
  const rounds = useStore(s => s.rounds);
  const roundNo = useStore(selectRoundNo);
  const shareable = useStore(canSharePosition);
  const nextUp = useStore(s => s.nextUp);
  const followLatest = useStore(s => s.followLatest);
  const goToRound = useStore(s => s.goToRound);
  const stayHere = useStore(s => s.stayHere);
  const view = useStore(s => s.view);
  const setView = useStore(s => s.setView);
  const movesWhenLeft = useStore(s => s.movesWhenLeft);
  const analysis = useStore(s => s.analysis);
  const analysisMove = useStore(s => s.analysisMove);
  const closeAnalysis = useStore(s => s.closeAnalysis);
  const guessFen = useStore(selectGuessFen);
  const [boardSync, setBoardSync] = useState(0);
  const [shareSlot, setShareSlot] = useState<HTMLDivElement | null>(null);
  // Turning the board and sharing sit in a small rail beside the board when there is free room there.
  const [toolsBeside, setToolsBeside] = useState(false);
  const [tab, setTabState] = useState<Tab>('analysis');
  const setTab = (id: Tab) => {
    setTabState(id);
    track('tab_open', { tab: id });
  };
  const isMobile = useIsMobile();
  // Win chance, guessing and move times sit beside the board on wide screens; elsewhere they live in the tabs.
  const wide = useMedia(WIDE_LAYOUT);
  const squares = useMedia(GAME_SQUARES);
  const layoutRef = useRef<HTMLElement>(null);

  useEffect(() => init(), [init]);
  // After a click in the video, a press on the board or anywhere else on the page brings the arrow keys back.
  useKeyboardBackFromFrames();

  // The board is as large as the height allows, so a wide window leaves room on both sides of it. The rail is laid
  // over that room and takes nothing from the board; where there is none, the two buttons stay under the board.
  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const col = layout.querySelector<HTMLElement>('.board-col');
      const divider = layout.querySelector<HTMLElement>('.divider');
      setToolsBeside(!!col && !!divider && divider.getBoundingClientRect().left - col.getBoundingClientRect().right >= BOARD_RAIL_ROOM);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(layout);
    for (const el of layout.children) ro.observe(el);
    return () => ro.disconnect();
  }, [view, isMobile, wide, !!game]);

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  // Context that rides on every analytics event.
  useEffect(() => {
    setContext({
      page_lang: settings.lang,
      layout: isMobile ? 'phone' : 'desktop',
      view,
      game_no: roundNo || undefined,
      game_state: paused ? 'paused' : resultVisible ? 'finished' : revealed > 0 ? 'live' : 'upcoming',
    });
  }, [settings.lang, isMobile, view, roundNo, paused, resultVisible, revealed]);

  // Evaluations that arrive with the feed feed the charts and move quality.
  useEffect(() => {
    if (game) seedGameScores(game);
  }, [game]);

  // Keyboard navigation, and unlock audio on the first interaction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // the shortcuts drive the live game; the puzzle corner has its own buttons
      if (useStore.getState().view !== 'live') return;
      const shortcut = shortcutFor(e, !!document.querySelector('.promo'));
      if (!shortcut) return;
      if (shortcut === 'back') step(-1);
      else if (shortcut === 'forward') step(1);
      else if (shortcut === 'start') setViewPly(0);
      else if (shortcut === 'live') setViewPly(null);
      else if (shortcut === 'closePreview') setPreview(null);
      else toggleFlip();
      e.preventDefault();
    };
    const unlock = () => unlockAudio();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', unlock);
    };
  }, [step, setViewPly, toggleFlip, setPreview]);

  const ply = game && shown > 0 ? game.plies[shown - 1] : undefined;
  const gameFen = ply?.fen ?? game?.initialFen;
  // The viewer's own line, when the board shows one. It belongs to the game it was started in.
  const line = analysis && game && analysis.gameId === game.id ? analysis : null;
  const linePos = useMemo(() => (line ? analysisPosition(line) : undefined), [line]);
  // What the board shows: another game's position, the viewer's own line, or the game.
  const fen = preview?.fen ?? linePos?.fen ?? gameFen;
  const atLiveEdge = viewPly === null;
  // The engine follows the board. A result is only ever shown for the position it was asked about.
  const evaluation = useEval(fen, settings.engine && !!game && view === 'live');
  const material = useMemo(() => (fen ? materialFromFen(fen) : undefined), [fen]);
  const arrow = useMemo(
    () => (settings.arrow && fen && evaluation ? firstMoveSquares(fen, evaluation.pvs[0]?.moves[0]) : undefined),
    [settings.arrow, fen, evaluation],
  );
  // A move on the board is the viewer's own analysis. It is never a prediction.
  // A promotion waits for its piece only on the exact board it was started on:
  // any step, a new move of the game under it, another game or another view drops it.
  const promo = usePromotion(
    fen ?? '',
    move => {
      if (!analysisMove(move.uci)) setBoardSync(n => n + 1);
    },
    () => setBoardSync(n => n + 1),
    `${game?.id}:${view}:${line ? `own:${line.cursor}:${line.moves.length}` : `game:${shown}`}:${boardSync}`,
  );
  const lastMove = useMemo<[string, string] | undefined>(
    () => (preview ? preview.lastMove : linePos ? linePos.lastMove : ply ? [ply.from, ply.to] : undefined),
    [preview, linePos, ply],
  );
  const check = preview ? false : linePos ? linePos.check : !!ply?.check;
  // The viewer's own moves with their numbers, for the line under the board.
  const ownMoves = useMemo(() => (line ? pvToSan(line.rootFen, line.moves.map(m => m.uci), line.moves.length) : []), [line]);
  const newInGame = line && !paused ? Math.max(0, revealed - line.revealedAtStart) : 0;
  // "Live" only while there is something live to go back to.
  const liveNow = !paused && !resultVisible && revealed > 0;
  const backLabel = liveNow ? t.backToLive : t.backToGamePos;

  // Tab title follows the game so a background tab still tells you something, without spoiling a paused game.
  useEffect(() => {
    if (!game) return;
    const names = `${shortName(game.white)} – ${shortName(game.black)}`;
    if (paused) document.title = `⏸ ${names} · ${t.title}`;
    else if (revealed > 0 && !resultVisible) document.title = `${Math.ceil(revealed / 2)}. ${names} · ${t.live}`;
    else document.title = `${names} · ${t.title}`;
  }, [game, revealed, resultVisible, paused, t]);

  const startDrag = (e: React.PointerEvent) => {
    const layout = layoutRef.current;
    if (!layout) return;
    e.preventDefault();
    const box = layout.getBoundingClientRect();
    const style = getComputedStyle(layout);
    const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
    // What the right side may take: everything but the left column, the divider and a board that is still comfortable.
    // The stylesheet holds the same limit, so a width saved on a larger window cannot cramp the board either.
    const inner = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const left = layout.querySelector<HTMLElement>('.left-col');
    const leftWidth = left ? left.getBoundingClientRect().width + parseFloat(getComputedStyle(left).marginRight) : 0;
    const most = Math.max(320, inner - leftWidth - 12 - (px('--board-min') || 480));
    const right = box.right - parseFloat(style.paddingRight);
    const widthAt = (clientX: number) => Math.round(Math.max(320, Math.min(right - clientX, most)));
    const move = (ev: PointerEvent) => layout.style.setProperty('--side-w', `${widthAt(ev.clientX)}px`);
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      setSetting('sideWidth', widthAt(ev.clientX));
    };
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const orientation = flipped ? 'black' : 'white';
  const inLine = !!line && !preview;
  const top = orientation === 'white' ? 'black' : 'white';
  const bottom = orientation;
  const layoutStyle = !isMobile && settings.sideWidth ? ({ '--side-w': `${settings.sideWidth}px` } as React.CSSProperties) : undefined;

  const nextRound = roundNo > 0 ? rounds[roundNo] : undefined;
  const nextUpRound = nextUp ? rounds.find(r => r.id === nextUp.roundId) : undefined;
  useNow(1000, !!nextUp); // re-render every second while an announcement counts down
  const locale = settings.lang === 'tr' ? 'tr-TR' : 'en-GB';

  const resultBanner = () => {
    if (!game || !resultVisible || !atLiveEdge || preview || line) return null;
    const text = game.result === '1/2-1/2' ? t.draw : `${displayName(game.result === '1-0' ? game.white : game.black)} ${t.wins}`;
    const when =
      nextRound?.startsAt && !nextRound.finished
        ? new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(nextRound.startsAt)
        : undefined;
    return (
      <div className="banner result">
        {text} <b>{game.result === '1/2-1/2' ? '½–½' : game.result.replace('-', '–')}</b>
        {when && <span className="next-when"> · {t.nextGameAt.replace('{when}', when)}</span>}
      </div>
    );
  };

  // A later game is live or about to start. Unless the viewer declines, the page opens it by itself.
  const nextUpBanner = () => {
    if (!nextUp || !nextUpRound || preview) return null;
    const n = rounds.indexOf(nextUpRound) + 1;
    const now = Date.now();
    const started = !!nextUpRound.ongoing || (nextUpRound.startsAt ?? Infinity) <= now;
    const left = Math.min(AUTO_SWITCH_SEC, Math.max(0, AUTO_SWITCH_SEC - Math.floor((now - nextUp.since) / 1000)));
    // The page never moves to another game by itself while the viewer is exploring.
    const counting = followLatest && atLiveEdge && !line;
    return (
      <div className="banner nextup" role="status">
        <span>
          <b>{(started ? t.nextStarted : t.nextSoon).replace('{n}', String(n))}</b>
          {counting && <span className="muted"> · {t.switchingIn.replace('{s}', String(left))}</span>}
        </span>
        <span className="nextup-actions">
          <button className="btn" onClick={() => goToRound(nextUp.roundId)}>
            {t.goToGame}
          </button>
          <button className="btn ghost" onClick={stayHere}>
            {t.stayHere}
          </button>
        </span>
      </div>
    );
  };

  // The first tab is the engine with the moves under it.
  const tabLabel = (id: Tab) =>
    ({ analysis: t.tabEngine, predict: t.tabPredict, similar: t.tabSimilar, charts: t.tabCharts, match: t.tabMatch, settings: t.tabSettings })[id];

  const shareButton = (compact: boolean) =>
    game &&
    shareable && (
      <ShareButton
        // a new game starts with no panel: a link copied for another game is not left on screen
        key={game.id}
        compact={compact}
        panelHost={shareSlot}
        // the position on the board, which is never beyond what this viewer has been shown
        target={{ view: 'live', gameNo: roundNo, ply: shown }}
        describe={(shown === 0 ? t.shareGame : t.sharePosition).replace('{g}', String(roundNo)).replace('{m}', String(Math.ceil(shown / 2)))}
      />
    );

  const boardColumn = (
    <section className="board-col">
      {game && fen ? (
        <>
          <PlayerBar
            game={game}
            color={top}
            player={game[top]}
            shown={shown}
            atLiveEdge={atLiveEdge && !preview}
            captured={material ? (top === 'white' ? material.capturedByWhite : material.capturedByBlack) : []}
            lead={material ? (top === 'white' ? material.diff : -material.diff) : 0}
          />
          <EvalStrip evaluation={evaluation} />
          <div className={`board-row ${inLine ? 'analysing' : ''}`}>
            <Board
              fen={fen}
              lastMove={lastMove}
              check={check}
              orientation={orientation}
              arrow={arrow}
              // Any legal move can be tried, from the newest position or an earlier one. Another game's position is only looked at.
              onMove={!preview && !promo.pending ? promo.squares : undefined}
              syncToken={boardSync}
              // Fingers tap to move here, so a swipe over the board still scrolls the page.
              touch="tap"
            />
            {promo.pending && <PromotionPicker onChoose={promo.choose} />}
            {toolsBeside && !preview && (
              <div className="board-tools" role="group" aria-label={t.boardTools}>
                <FlipButton className="tool-btn" />
                {shareButton(true)}
              </div>
            )}
          </div>
          <PlayerBar
            game={game}
            color={bottom}
            player={game[bottom]}
            shown={shown}
            atLiveEdge={atLiveEdge && !preview}
            captured={material ? (bottom === 'white' ? material.capturedByWhite : material.capturedByBlack) : []}
            lead={material ? (bottom === 'white' ? material.diff : -material.diff) : 0}
          />
          {preview ? (
            <div className="banner preview">
              <span>
                <b>{t.previewing}:</b> {preview.label}
              </span>
              <button className="btn" onClick={() => setPreview(null)}>
                {t.backToGame}
              </button>
            </div>
          ) : (
            <>
              <MoveStrip
                game={game}
                shown={shown}
                line={line}
                ownMoves={ownMoves}
                backLabel={backLabel}
                atNewest={atLiveEdge && !line}
                flip={!toolsBeside}
              />
              <div className="board-actions">
                {!toolsBeside && shareButton(isMobile)}
                {view === 'live' && liveNow && (
                  <button className="pause-btn" onClick={pause} title={t.pauseTitle}>
                    ⏸ {t.pauseBtn}
                  </button>
                )}
                {line && newInGame > 0 && (
                  <span className="muted small" role="status">
                    {t.newMovesInGame.replace('{n}', String(newInGame))}
                  </span>
                )}
                {line && line.rootPly < revealed && (
                  <button type="button" className="link small" onClick={closeAnalysis} title={t.closeAnalysisTitle}>
                    {t.closeAnalysis}
                  </button>
                )}
              </div>
            </>
          )}
          <div className="share-slot" ref={setShareSlot} />
          {paused && !preview && (settings.streamHidden || streamUncovered) && <CatchUpBar />}
          {nextUpBanner() ?? resultBanner()}
          {revealed === 0 && !resultVisible && !paused && !preview && !line && <div className="banner">{t.notStarted}</div>}
          {/* The site's own estimate of the next move of the game, whatever the board is showing. */}
          {!preview && guessFen && (
            <Suspense fallback={null}>
              <ModelEstimate game={game} fen={guessFen} />
            </Suspense>
          )}
        </>
      ) : (
        <div className="board-skeleton">{loadError ? t.loadError : ''}</div>
      )}
    </section>
  );

  const threeColumns = wide && view === 'live';
  const tabs = threeColumns ? TABS_BESIDE : TABS_ALONE;
  // A tab that this layout does not have (guessing, once it has its own column) shows the first one.
  const openTab = tabs.includes(tab) ? tab : 'analysis';
  const winChance = game && fen && <WinChance game={game} evaluation={evaluation} />;
  const predictPanel = game && guessFen && (
    <Suspense fallback={<p className="muted pad">{t.loading}</p>}>
      <PredictPanel game={game} fen={guessFen} evaluation={evaluation} boardElsewhere={fen !== guessFen} />
    </Suspense>
  );

  // Beside the board: how the game stands, the viewer's own guess of the next move, and the time each move took.
  const leftColumn = (
    <aside className="left-col" aria-label={t.tabAnalysis}>
      {winChance}
      {predictPanel && (
        <section className="card predict-card" aria-labelledby="predict-title">
          {predictPanel}
        </section>
      )}
      {game && <TimePanel game={game} shown={shown} />}
    </aside>
  );

  const sideColumn = (
    <section className="side-col">
      <StreamPanel live={view === 'live'} />
      {view === 'puzzles' ? (
        <div className="tab-body">
          <Suspense fallback={<p className="muted pad">{t.loading}</p>}>
            {/* While paused nothing about the game is hinted at, not even that a move was played. */}
            <PuzzlePanel onBack={() => setView('live')} newMove={!paused && !resultVisible && movesWhenLeft >= 0 && revealed > movesWhenLeft} />
          </Suspense>
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {tabs.map(id => (
              // "Stockfish" is a name: without the language mark Turkish capitals would make it "STOCKFİSH"
              <button key={id} role="tab" aria-selected={openTab === id} className={openTab === id ? 'active' : ''} onClick={() => setTab(id)} lang={id === 'analysis' ? 'en' : undefined}>
                {tabLabel(id)}
              </button>
            ))}
          </div>
          <div className="tab-body">
            {openTab === 'analysis' && game && fen && (
              <>
                {/* The engine's lines, and the moves of the game under them. */}
                {!threeColumns && winChance}
                <EngineCard game={game} fen={fen} shown={shown} evaluation={evaluation} inLine={inLine} />
                <MovesPanel game={game} shown={shown} lineFrom={inLine && line ? line.rootPly : undefined} />
              </>
            )}
            {openTab === 'predict' && predictPanel}
            <Suspense fallback={<p className="muted pad">{t.loading}</p>}>
              {openTab === 'similar' && game && gameFen && <SimilarPanel game={game} fen={gameFen} shown={shown} />}
              {openTab === 'charts' && game && <ChartsPanel game={game} shown={shown} withTime={!wide} />}
            </Suspense>
            {openTab === 'match' && <MatchPanel />}
            {openTab === 'settings' && <SettingsPanel />}
          </div>
        </>
      )}
    </section>
  );

  return (
    <div className="app">
      <Header squares={squares} />
      <main className={`layout ${threeColumns ? 'three' : ''}`} ref={layoutRef} style={layoutStyle}>
        {threeColumns && leftColumn}
        {view === 'puzzles' ? (
          <Suspense fallback={<section className="board-col" />}>
            <PuzzleBoard />
          </Suspense>
        ) : (
          boardColumn
        )}
        {!isMobile && <div className="divider" onPointerDown={startDrag} role="separator" aria-orientation="vertical" />}
        {sideColumn}
      </main>
      <footer className="foot">
        {t.footer}{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer" onClick={() => trackOutbound(REPO_URL)}>
          {t.source}
        </a>
      </footer>
    </div>
  );
}
