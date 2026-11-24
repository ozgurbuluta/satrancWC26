import { useEffect, useMemo, useState } from 'react';
import { useT } from '../hooks';
import { track } from '../lib/analytics';
import { findNovelty, getMasterPgn, getMasters, totalGames, type ExplorerData, type ExplorerGame } from '../lib/explorer';
import { localizeSan } from '../lib/format';
import { parseGame, type GameData, type Ply } from '../lib/pgn';
import { selectRoundNo, useStore } from '../store';

const samePosition = (a: string, b: string) => a.split(' ').slice(0, 3).join(' ') === b.split(' ').slice(0, 3).join(' ');
const resultText = (w: ExplorerGame['winner']) => (w === 'white' ? '1–0' : w === 'black' ? '0–1' : '½–½');
const nf = (n: number, lang: string) => new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-GB').format(n);

function ResultBar({ d }: { d: { white: number; draws: number; black: number } }) {
  const total = totalGames(d) || 1;
  const p = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="resbar" role="img" aria-label={`1–0 ${p(d.white)}, ½–½ ${p(d.draws)}, 0–1 ${p(d.black)}`}>
      <i className="w" style={{ flexGrow: d.white || 0.001 }}>
        {d.white / total > 0.14 ? p(d.white) : ''}
      </i>
      <i className="d" style={{ flexGrow: d.draws || 0.001 }}>
        {d.draws / total > 0.14 ? p(d.draws) : ''}
      </i>
      <i className="b" style={{ flexGrow: d.black || 0.001 }}>
        {d.black / total > 0.14 ? p(d.black) : ''}
      </i>
    </div>
  );
}

/** One earlier game: expands to its continuation, which can be previewed on the board. */
function MasterGame({ g, fen }: { g: ExplorerGame; fen: string }) {
  const t = useT();
  const notation = useStore(s => s.settings.notation);
  const setPreview = useStore(s => s.setPreview);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ game?: GameData; event?: string; error?: boolean }>({});

  useEffect(() => {
    if (!open || state.game || state.error) return;
    let alive = true;
    getMasterPgn(g.id)
      .then(pgn => {
        if (!alive) return;
        const parsed = parseGame(pgn, undefined, 0);
        const event = /\[Event "([^"]*)"\]/.exec(pgn)?.[1];
        setState(parsed ? { game: parsed, event } : { error: true });
      })
      .catch(() => alive && setState({ error: true }));
    return () => {
      alive = false;
    };
  }, [open, g.id, state.game, state.error]);

  const label = `${g.white.name} – ${g.black.name}, ${g.year}`;
  const continuation = useMemo(() => {
    const mg = state.game;
    if (!mg) return [] as { ply: Ply; idx: number }[];
    const at = mg.plies.findIndex(p => samePosition(p.fen, fen));
    const start = at === -1 ? (samePosition(mg.initialFen, fen) ? 0 : -1) : at + 1;
    if (start === -1) return [];
    return mg.plies.slice(start, start + 24).map((ply, k) => ({ ply, idx: start + k }));
  }, [state.game, fen]);

  return (
    <li className={`mgame ${open ? 'open' : ''}`}>
      <button
        className="mgame-head"
        onClick={() => {
          if (!open) track('similar_game_open', { year: g.year });
          setOpen(v => !v);
        }}
        aria-expanded={open}
      >
        <span className="mgame-players">
          {g.white.name} <span className="muted">{g.white.rating}</span> – {g.black.name} <span className="muted">{g.black.rating}</span>
        </span>
        <span className="mgame-meta">
          <span className="muted">{g.year}</span> <b>{resultText(g.winner)}</b>
        </span>
      </button>
      {open && (
        <div className="mgame-body">
          {state.error && <p className="muted small">{t.explorerError}</p>}
          {!state.game && !state.error && <p className="muted small">{t.loading}</p>}
          {state.game && (
            <>
              {state.event && <p className="muted small">{state.event}</p>}
              <p className="small">
                <span className="muted">{t.continuation}: </span>
                {continuation.map(({ ply, idx }) => (
                  <span className="mv" key={idx}>
                    {idx % 2 === 0 && <span className="move-num">{Math.floor(idx / 2) + 1}.</span>}
                    <button
                      className="move"
                      onClick={() => setPreview({ fen: ply.fen, lastMove: [ply.from, ply.to], label: `${label} · ${Math.floor(idx / 2) + 1}${idx % 2 === 0 ? '.' : '…'} ${localizeSan(ply.san, notation)}` })}
                    >
                      {localizeSan(ply.san, notation)}
                    </button>
                  </span>
                ))}
                {continuation.length === 0 && '–'}
              </p>
            </>
          )}
        </div>
      )}
    </li>
  );
}

interface Props {
  game: GameData;
  fen: string;
  shown: number;
}

export function SimilarPanel({ game, fen, shown }: Props) {
  const t = useT();
  const lang = useStore(s => s.settings.lang);
  const notation = useStore(s => s.settings.notation);
  const revealed = useStore(s => s.revealed);
  const matchGames = useStore(s => s.matchGames);
  const roundNo = useStore(selectRoundNo);
  const setViewPly = useStore(s => s.setViewPly);
  const paused = useStore(s => s.paused);
  const [data, setData] = useState<{ fen: string; d?: ExplorerData; error?: boolean }>({ fen });
  const [novelty, setNovelty] = useState<{ key: string; ply: number | null } | undefined>();
  const [before, setBefore] = useState<ExplorerData | undefined>();

  // Stats for the position on the board.
  useEffect(() => {
    let alive = true;
    setData({ fen });
    const id = window.setTimeout(() => {
      getMasters(fen)
        .then(d => alive && setData({ fen, d }))
        .catch(() => alive && setData({ fen, error: true }));
    }, 150);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [fen]);

  // Where the game left known territory, using only moves the viewer has seen.
  const noveltyKey = `${game.id}:${revealed}`;
  useEffect(() => {
    let alive = true;
    const fens = game.plies.slice(0, revealed).map(p => p.fen);
    findNovelty(fens, revealed)
      .then(async ply => {
        if (!alive) return;
        setNovelty({ key: noveltyKey, ply });
        if (ply !== null) {
          const prevFen = ply >= 2 ? game.plies[ply - 2].fen : game.initialFen;
          const d = await getMasters(prevFen);
          if (alive) setBefore(d);
        } else setBefore(undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noveltyKey]);

  const d = data.fen === fen ? data.d : undefined;
  const total = d ? totalGames(d) : 0;
  const nextPly = shown < revealed ? game.plies[shown] : undefined;
  const noveltyPly = novelty?.ply ?? null;
  const noveltyMove = noveltyPly ? game.plies[noveltyPly - 1] : undefined;

  // Earlier games of this match that started the same way.
  const shared = useMemo(() => {
    const mine = game.plies.slice(0, revealed).map(p => p.uci);
    return matchGames
      .filter(mg => mg.roundNo < roundNo && mg.moves.length > 0)
      .map(mg => {
        let n = 0;
        while (n < mine.length && n < mg.moves.length && mine[n] === mg.moves[n]) n++;
        return { roundNo: mg.roundNo, plies: n, opening: mg.opening };
      })
      .filter(x => x.plies >= 2);
  }, [game, revealed, matchGames, roundNo]);

  return (
    <div className="similar">
      {game.opening && !paused && (
        <p className="similar-opening">
          <span className="eco">{game.eco}</span> {game.opening}
        </p>
      )}

      {novelty && novelty.key === noveltyKey && revealed > 0 && (
        <div className={`novelty ${noveltyPly ? 'has' : ''}`}>
          {noveltyPly && noveltyMove ? (
            <>
              <span className="tag">{t.novelty}</span>
              <button className="link" onClick={() => setViewPly(noveltyPly)}>
                {Math.ceil(noveltyPly / 2)}
                {noveltyPly % 2 === 1 ? '.' : '…'} {localizeSan(noveltyMove.san, notation)}
              </button>
              <span>
                {' '}
                {t.noveltyText.replace('{move}', localizeSan(noveltyMove.san, notation))}
                {before && totalGames(before) > 0 && (
                  <span className="muted">
                    {' '}
                    ({nf(totalGames(before), lang)} {t.gamesWord})
                  </span>
                )}
              </span>
            </>
          ) : (
            <span>{t.inBook}</span>
          )}
        </div>
      )}

      <section>
        <h3>{total > 0 ? t.mastersCount.replace('{n}', nf(total, lang)) : d ? t.mastersNone : data.error ? t.explorerError : t.loading}</h3>
        {d && total > 0 && <ResultBar d={d} />}
      </section>

      {d && d.moves.length > 0 && (
        <section>
          <h3>{t.nextMoves}</h3>
          <table className="next-moves">
            <tbody>
              {d.moves.map(m => {
                const n = totalGames(m);
                const played = nextPly && nextPly.san.replace(/[+#]/g, '') === m.san.replace(/[+#]/g, '');
                return (
                  <tr key={m.uci} className={played ? 'played' : ''}>
                    <th scope="row">
                      {localizeSan(m.san, notation)}
                      {played && <span className="tag small">{t.playedHere}</span>}
                    </th>
                    <td className="num">{nf(n, lang)}</td>
                    <td className="bar">
                      <ResultBar d={m} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {d && d.topGames.length > 0 && (
        <section>
          <h3>{t.topGames}</h3>
          <ul className="mgames">
            {d.topGames.map(g => (
              <MasterGame key={g.id} g={g} fen={fen} />
            ))}
          </ul>
        </section>
      )}

      {d && total === 0 && before && before.topGames.length > 0 && noveltyPly && (
        <section>
          <h3>
            {t.topGames} ({Math.ceil((noveltyPly - 1) / 2) || 1}. {t.move.toLowerCase()})
          </h3>
          <ul className="mgames">
            {before.topGames.map(g => (
              <MasterGame key={g.id} g={g} fen={noveltyPly >= 2 ? game.plies[noveltyPly - 2].fen : game.initialFen} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>{t.matchCompare}</h3>
        {shared.length === 0 ? (
          <p className="muted small">{t.noEarlier}</p>
        ) : (
          <ul className="shared">
            {shared.map(x => (
              <li key={x.roundNo}>
                {t.sameUntil.replace('{g}', String(x.roundNo)).replace('{n}', String(Math.ceil(x.plies / 2)))}
                {x.opening && <span className="muted"> · {x.opening}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted small">{t.mastersSource}</p>
    </div>
  );
}
