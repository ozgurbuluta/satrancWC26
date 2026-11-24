import { useEffect, useMemo, useRef, useState } from 'react';
import { REPO_URL } from './config';
import { AnalysisPanel } from './components/AnalysisPanel';
import { Board } from './components/Board';
import { EvalBar } from './components/EvalBar';
import { Header } from './components/Header';
import { MatchPanel } from './components/MatchPanel';
import { PlayerBar } from './components/PlayerBar';
import { SettingsPanel } from './components/SettingsPanel';
import { StreamPanel } from './components/StreamPanel';
import { useEval, useIsMobile, useT } from './hooks';
import { displayName, firstMoveSquares, materialFromFen, shortName } from './lib/format';
import { unlockAudio } from './lib/sound';
import { selectGameData, selectShownPly, useStore } from './store';

type Tab = 'analysis' | 'match' | 'settings';

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
  const step = useStore(s => s.step);
  const setViewPly = useStore(s => s.setViewPly);
  const toggleFlip = useStore(s => s.toggleFlip);
  const selectGame = useStore(s => s.selectGame);
  const setSetting = useStore(s => s.setSetting);
  const [tab, setTab] = useState<Tab>('analysis');
  const isMobile = useIsMobile();
  const layoutRef = useRef<HTMLElement>(null);

  useEffect(() => init(), [init]);

  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);

  // Keyboard navigation, and unlock audio on the first interaction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'Home' || e.key === 'ArrowUp') setViewPly(0);
      else if (e.key === 'End' || e.key === 'ArrowDown') setViewPly(null);
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
  }, [step, setViewPly, toggleFlip]);

  const ply = game && shown > 0 ? game.plies[shown - 1] : undefined;
  const fen = ply?.fen ?? game?.initialFen;
  const atLiveEdge = viewPly === null;
  const evaluation = useEval(fen, settings.engine && !!game);
  const material = useMemo(() => (fen ? materialFromFen(fen) : undefined), [fen]);
  const arrow = useMemo(
    () => (settings.arrow && fen && evaluation ? firstMoveSquares(fen, evaluation.pvs[0]?.moves[0]) : undefined),
    [settings.arrow, fen, evaluation],
  );
  const lastMove = useMemo<[string, string] | undefined>(() => (ply ? [ply.from, ply.to] : undefined), [ply]);

  // Tab title follows the game so a background tab still tells you something.
  useEffect(() => {
    if (!game) return;
    const names = `${shortName(game.white)} – ${shortName(game.black)}`;
    document.title = revealed > 0 && !resultVisible ? `${Math.ceil(revealed / 2)}. ${names} · ${t.live}` : `${names} · ${t.title}`;
  }, [game, revealed, resultVisible, t]);

  const startDrag = (e: React.PointerEvent) => {
    const layout = layoutRef.current;
    if (!layout) return;
    e.preventDefault();
    const right = layout.getBoundingClientRect().right;
    const move = (ev: PointerEvent) => {
      const w = Math.round(Math.max(320, Math.min(right - ev.clientX - 16, window.innerWidth * 0.6)));
      layout.style.setProperty('--side-w', `${w}px`);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      setSetting('sideWidth', Math.round(Math.max(320, Math.min(right - ev.clientX - 16, window.innerWidth * 0.6))));
    };
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const orientation = flipped ? 'black' : 'white';
  const top = orientation === 'white' ? 'black' : 'white';
  const bottom = orientation;
  const layoutStyle = !isMobile && settings.sideWidth ? ({ '--side-w': `${settings.sideWidth}px` } as React.CSSProperties) : undefined;

  const resultBanner = () => {
    if (!game || !resultVisible || !atLiveEdge) return null;
    const text =
      game.result === '1/2-1/2'
        ? t.draw
        : `${displayName(game.result === '1-0' ? game.white : game.black)} ${t.wins}`;
    return (
      <div className="banner result">
        {text} <b>{game.result === '1/2-1/2' ? '½–½' : game.result.replace('-', '–')}</b>
      </div>
    );
  };

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
            atLiveEdge={atLiveEdge}
            captured={material ? (top === 'white' ? material.capturedByWhite : material.capturedByBlack) : []}
            lead={material ? (top === 'white' ? material.diff : -material.diff) : 0}
          />
          <div className="board-row">
            <EvalBar evaluation={settings.engine ? evaluation : undefined} orientation={orientation} />
            <Board fen={fen} lastMove={lastMove} check={!!ply?.check} orientation={orientation} arrow={arrow} />
          </div>
          <PlayerBar
            game={game}
            color={bottom}
            player={game[bottom]}
            shown={shown}
            atLiveEdge={atLiveEdge}
            captured={material ? (bottom === 'white' ? material.capturedByWhite : material.capturedByBlack) : []}
            lead={material ? (bottom === 'white' ? material.diff : -material.diff) : 0}
          />
          <div className="controls">
            <button onClick={() => setViewPly(0)} disabled={shown === 0} aria-label={t.first} title={t.first}>
              ⏮
            </button>
            <button onClick={() => step(-1)} disabled={shown === 0} aria-label={t.prev} title={t.prev}>
              ◀
            </button>
            <button onClick={() => step(1)} disabled={atLiveEdge} aria-label={t.next} title={t.next}>
              ▶
            </button>
            <button onClick={() => setViewPly(null)} disabled={atLiveEdge} aria-label={t.last} title={t.last}>
              ⏭
            </button>
            <button onClick={toggleFlip} aria-label={t.flip} title={t.flip}>
              ⇅
            </button>
            {!atLiveEdge && (
              <button className="go-live" onClick={() => setViewPly(null)}>
                <i className="pulse" /> {t.backToLive}
              </button>
            )}
          </div>
          {resultBanner()}
          {revealed === 0 && !resultVisible && <div className="banner">{t.notStarted}</div>}
        </>
      ) : (
        <div className="board-skeleton">{loadError ? t.loadError : ''}</div>
      )}
    </section>
  );

  const sideColumn = (
    <section className="side-col">
      <StreamPanel />
      <div className="tabs" role="tablist">
        {(['analysis', 'match', 'settings'] as Tab[]).map(id => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {id === 'analysis' ? t.tabAnalysis : id === 'match' ? t.tabMatch : t.tabSettings}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === 'analysis' && game && fen && <AnalysisPanel game={game} fen={fen} shown={shown} evaluation={evaluation} />}
        {tab === 'match' && <MatchPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </section>
  );

  return (
    <div className="app">
      <Header />
      <main className="layout" ref={layoutRef} style={layoutStyle}>
        {boardColumn}
        {!isMobile && <div className="divider" onPointerDown={startDrag} role="separator" aria-orientation="vertical" />}
        {sideColumn}
      </main>
      <footer className="foot">
        {t.footer}{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          {t.source}
        </a>
      </footer>
    </div>
  );
}
