import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { REPO_URL } from './config';
import { AnalysisPanel } from './components/AnalysisPanel';
import { Board, type BoardShape } from './components/Board';
import { CatchUpBar } from './components/CatchUpBar';
import { EvalBar } from './components/EvalBar';
import { Header } from './components/Header';
import { MatchPanel } from './components/MatchPanel';
import { PromotionPicker, usePromotion } from './components/MoveEntry';
import { PlayerBar } from './components/PlayerBar';
import { SettingsPanel } from './components/SettingsPanel';
import { StreamPanel } from './components/StreamPanel';
import { useEval, useIsMobile, useNow, useT } from './hooks';
import { setContext, track, trackOutbound } from './lib/analytics';
import { displayName, firstMoveSquares, localizeSan, materialFromFen, shortName } from './lib/format';
import { seedGameScores } from './lib/quality';
import { unlockAudio } from './lib/sound';
import { AUTO_SWITCH_SEC, canGuess, engineHeldBack, selectGameData, selectRoundNo, selectShownPly, useStore } from './store';

// Loaded on first use, so the first paint only carries the board and the analysis tab.
const SimilarPanel = lazy(() => import('./components/SimilarPanel').then(m => ({ default: m.SimilarPanel })));
const ChartsPanel = lazy(() => import('./components/ChartsPanel').then(m => ({ default: m.ChartsPanel })));
const PredictPanel = lazy(() => import('./components/PredictPanel').then(m => ({ default: m.PredictPanel })));
const PuzzleBoard = lazy(() => import('./components/PuzzleView').then(m => ({ default: m.PuzzleBoard })));
const PuzzlePanel = lazy(() => import('./components/PuzzleView').then(m => ({ default: m.PuzzlePanel })));

type Tab = 'analysis' | 'predict' | 'similar' | 'charts' | 'match' | 'settings';
const TABS: Tab[] = ['analysis', 'predict', 'similar', 'charts', 'match', 'settings'];

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
  const gameOrder = useStore(s => s.gameOrder);
  const games = useStore(s => s.games);
  const settings = useStore(s => s.settings);
  const paused = useStore(s => s.paused);
  const preview = useStore(s => s.preview);
  const streamUncovered = useStore(s => s.streamUncovered);
  const step = useStore(s => s.step);
  const setViewPly = useStore(s => s.setViewPly);
  const toggleFlip = useStore(s => s.toggleFlip);
  const selectGame = useStore(s => s.selectGame);
  const setSetting = useStore(s => s.setSetting);
  const pause = useStore(s => s.pause);
  const setPreview = useStore(s => s.setPreview);
  const rounds = useStore(s => s.rounds);
  const roundNo = useStore(selectRoundNo);
  const nextUp = useStore(s => s.nextUp);
  const followLatest = useStore(s => s.followLatest);
  const goToRound = useStore(s => s.goToRound);
  const stayHere = useStore(s => s.stayHere);
  const view = useStore(s => s.view);
  const setView = useStore(s => s.setView);
  const movesWhenLeft = useStore(s => s.movesWhenLeft);
  const guessing = useStore(canGuess);
  const held = useStore(engineHeldBack);
  const guess = useStore(s => s.guess);
  const makeGuess = useStore(s => s.makeGuess);
  const peekEngine = useStore(s => s.peekEngine);
  const [boardSync, setBoardSync] = useState(0);
  const [tab, setTabState] = useState<Tab>('analysis');
  const setTab = (id: Tab) => {
    setTabState(id);
    track('tab_open', { tab: id });
  };
  const isMobile = useIsMobile();
  const layoutRef = useRef<HTMLElement>(null);

  useEffect(() => init(), [init]);

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
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // the shortcuts drive the live game; the puzzle corner has its own buttons
      if (useStore.getState().view !== 'live') return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'Home' || e.key === 'ArrowUp') setViewPly(0);
      else if (e.key === 'End' || e.key === 'ArrowDown') setViewPly(null);
      else if (e.key === 'Escape') setPreview(null);
      else if (e.key === 'f') toggleFlip();
      else return;
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
  // A position from another game temporarily replaces the board.
  const fen = preview?.fen ?? gameFen;
  const atLiveEdge = viewPly === null;
  const evaluation = useEval(fen, settings.engine && !!game && view === 'live');
  const material = useMemo(() => (fen ? materialFromFen(fen) : undefined), [fen]);
  // No best-move arrow while the viewer is still guessing this move.
  const arrow = useMemo(
    () => (settings.arrow && !held && fen && evaluation ? firstMoveSquares(fen, evaluation.pvs[0]?.moves[0]) : undefined),
    [settings.arrow, held, fen, evaluation],
  );
  // A guess is drawn as an arrow; the pieces themselves do not move.
  const promo = usePromotion(
    fen ?? '',
    move => {
      makeGuess(move);
      setBoardSync(n => n + 1);
    },
    () => setBoardSync(n => n + 1),
    `${game?.id}:${shown}:${view}:${settings.guessMode}:${boardSync}`,
  );
  const guessOpen = !!guess && !!game && guess.gameId === game.id && guess.forPly === revealed + 1 && atLiveEdge && !preview;
  const guessShapes = useMemo<BoardShape[]>(() => (guessOpen && guess ? [{ from: guess.from, to: guess.to, brush: 'green' }] : []), [guessOpen, guess]);
  const lastMove = useMemo<[string, string] | undefined>(
    () => (preview ? preview.lastMove : ply ? [ply.from, ply.to] : undefined),
    [preview, ply],
  );

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
    const right = layout.getBoundingClientRect().right;
    const widthAt = (clientX: number) => Math.round(Math.max(320, Math.min(right - clientX - 16, window.innerWidth * 0.6)));
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
  const top = orientation === 'white' ? 'black' : 'white';
  const bottom = orientation;
  const layoutStyle = !isMobile && settings.sideWidth ? ({ '--side-w': `${settings.sideWidth}px` } as React.CSSProperties) : undefined;

  const nextRound = roundNo > 0 ? rounds[roundNo] : undefined;
  const nextUpRound = nextUp ? rounds.find(r => r.id === nextUp.roundId) : undefined;
  useNow(1000, !!nextUp); // re-render every second while an announcement counts down
  const locale = settings.lang === 'tr' ? 'tr-TR' : 'en-GB';

  const resultBanner = () => {
    if (!game || !resultVisible || !atLiveEdge || preview) return null;
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

  // Guess mode: say that the board is waiting for a move, or show the guess that was made.
  const guessStrip = () => {
    if (!game || !guessing || preview) return null;
    const mover = (fen ?? '').split(' ')[1] === 'b' ? game.black : game.white;
    return (
      <div className="banner guess" role="status">
        {guessOpen && guess ? `${t.yourGuess} ${localizeSan(guess.san, settings.notation)}` : t.guessStrip.replace('{player}', shortName(mover))}
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
    const counting = followLatest && atLiveEdge;
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

  const tabLabel = (id: Tab) =>
    ({ analysis: t.tabAnalysis, predict: t.tabPredict, similar: t.tabSimilar, charts: t.tabCharts, match: t.tabMatch, settings: t.tabSettings })[id];

  const boardColumn = (
    <section className="board-col">
      {gameOrder.length > 1 && (
        <label className="game-picker">
          {t.selectGame}
          <select value={game?.id ?? ''} onChange={e => selectGame(e.target.value)}>
            {gameOrder.map(id => (
              <option key={id} value={id}>
                {displayName(games[id].white)} – {displayName(games[id].black)}
              </option>
            ))}
          </select>
        </label>
      )}
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
          <div className="board-row">
            <EvalBar evaluation={settings.engine ? evaluation : undefined} orientation={orientation} />
            <Board
              fen={fen}
              lastMove={lastMove}
              check={!preview && !!ply?.check}
              orientation={orientation}
              arrow={arrow}
              shapes={guessShapes}
              onMove={guessing && !promo.pending ? promo.squares : undefined}
              syncToken={boardSync}
            />
            {promo.pending && <PromotionPicker onChoose={promo.choose} />}
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
            <div className="controls">
              <button onClick={() => setViewPly(0)} disabled={shown === 0} aria-label={t.first} title={t.first}>
                ⏮
              </button>
              <button onClick={() => step(-1)} disabled={shown === 0} aria-label={t.prev} title={t.prev}>
                ◀
              </button>
              <button onClick={() => step(1)} disabled={atLiveEdge && !paused} aria-label={t.next} title={t.next}>
                ▶
              </button>
              <button onClick={() => setViewPly(null)} disabled={atLiveEdge} aria-label={t.last} title={t.last}>
                ⏭
              </button>
              <button onClick={toggleFlip} aria-label={t.flip} title={t.flip}>
                ⇅
              </button>
              {!paused && !resultVisible && (
                <button className="pause-btn" onClick={pause} title={t.pauseTitle}>
                  ⏸ {t.pauseBtn}
                </button>
              )}
              {!atLiveEdge && !paused && (
                <button className="go-live" onClick={() => setViewPly(null)}>
                  <i className="pulse" /> {t.backToLive}
                </button>
              )}
            </div>
          )}
          {paused && !preview && (settings.streamHidden || streamUncovered) && <CatchUpBar />}
          {nextUpBanner() ?? resultBanner() ?? guessStrip()}
          {revealed === 0 && !resultVisible && !paused && !preview && <div className="banner">{t.notStarted}</div>}
        </>
      ) : (
        <div className="board-skeleton">{loadError ? t.loadError : ''}</div>
      )}
    </section>
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
        {TABS.map(id => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {tabLabel(id)}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === 'analysis' && game && fen && (
          <AnalysisPanel game={game} fen={fen} shown={shown} evaluation={evaluation} held={held} onShowEngine={peekEngine} />
        )}
        <Suspense fallback={<p className="muted pad">{t.loading}</p>}>
          {tab === 'predict' && game && gameFen && <PredictPanel game={game} fen={gameFen} evaluation={evaluation} />}
          {tab === 'similar' && game && gameFen && <SimilarPanel game={game} fen={gameFen} shown={shown} />}
          {tab === 'charts' && game && <ChartsPanel game={game} shown={shown} />}
        </Suspense>
        {tab === 'match' && <MatchPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
        </>
      )}
    </section>
  );

  return (
    <div className="app">
      <Header />
      <main className="layout" ref={layoutRef} style={layoutStyle}>
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
