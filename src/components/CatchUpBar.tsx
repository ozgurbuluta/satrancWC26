import { useT } from '../hooks';
import { useStore } from '../store';

const SPEEDS = [0, 1500, 3000, 6000];

/** Spoiler-free catch-up: shown while the board is paused behind the live game. */
export function CatchUpBar({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const pausePly = useStore(s => s.pausePly);
  const autoplayMs = useStore(s => s.autoplayMs);
  const revealNext = useStore(s => s.revealNext);
  const restart = useStore(s => s.restart);
  const resume = useStore(s => s.resume);
  const setAutoplay = useStore(s => s.setAutoplay);

  return (
    <div className={`catchup ${embedded ? 'embedded' : ''}`} role="region" aria-label={t.pausedPill}>
      <div className="catchup-head">
        <span className="catchup-icon" aria-hidden="true">
          ⏸
        </span>
        <div>
          <strong>{pausePly > 0 ? t.pausedAt.replace('{n}', String(Math.ceil(pausePly / 2))) : t.pausedStart}</strong>
          <p>{t.pausedHelp}</p>
        </div>
      </div>
      <div className="catchup-actions">
        <button className="btn" onClick={revealNext}>
          {t.revealNext} ▶
        </button>
        <div className="seg small" role="group" aria-label={t.autoplay}>
          <span className="seg-label">{t.autoplay}</span>
          {SPEEDS.map(ms => (
            <button key={ms} className={autoplayMs === ms ? 'active' : ''} aria-pressed={autoplayMs === ms} onClick={() => setAutoplay(ms)}>
              {ms === 0 ? t.off : `${ms / 1000} ${t.seconds}`}
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={restart} disabled={pausePly === 0}>
          ⏮ {t.fromStart}
        </button>
        <button className="btn ghost danger" onClick={resume}>
          {t.showAll}
        </button>
      </div>
    </div>
  );
}
