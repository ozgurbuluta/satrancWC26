import { useMemo, useState } from 'react';
import { IS_MATCH, STREAM_PRESETS } from '../config';
import { useT } from '../hooks';
import { track, trackOutbound } from '../lib/analytics';
import { parseStreamLink, youtubeChannel, youtubeVideo, type Embed } from '../lib/streamLinks';
import { pickVideo } from '../lib/streams';
import { selectRoundNo, useStore } from '../store';
import { CatchUpBar } from './CatchUpBar';

const DELAY_STEPS = [0, 5, 10, 15, 20, 30, 45];

/** `live` is false in the puzzle corner: the video stays, the controls that act on the live board go. */
export function StreamPanel({ live = true }: { live?: boolean }) {
  const t = useT();
  const streamId = useStore(s => s.settings.streamId);
  const customStream = useStore(s => s.settings.customStream);
  const hidden = useStore(s => s.settings.streamHidden);
  const delaySec = useStore(s => s.settings.delaySec);
  const paused = useStore(s => s.paused);
  const roundNo = useStore(selectRoundNo);
  const round = useStore(s => s.rounds.find(r => r.id === s.roundId));
  const feeds = useStore(s => s.streamFeeds);
  const setSetting = useStore(s => s.setSetting);
  const [draft, setDraft] = useState(customStream);
  const [bad, setBad] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const uncovered = useStore(s => s.streamUncovered);
  const setUncovered = useStore(s => s.setStreamUncovered);

  const preset = STREAM_PRESETS.find(x => x.id === streamId);
  const embed = useMemo<Embed | undefined>(() => {
    if (streamId === 'custom') return parseStreamLink(customStream);
    const p = preset ?? STREAM_PRESETS[0];
    // The exact video for this game when it is known or can be found, else whatever the channel is streaming live.
    const video = IS_MATCH ? (p.videos?.[roundNo] ?? pickVideo(feeds[p.channelId], roundNo, round, p.exclude)) : undefined;
    return video
      ? { src: youtubeVideo(video), url: `https://www.youtube.com/watch?v=${video}` }
      : { src: youtubeChannel(p.channelId), url: p.url };
  }, [streamId, customStream, preset, roundNo, round, feeds]);

  const submit = () => {
    const parsed = parseStreamLink(draft);
    setBad(!parsed);
    if (!parsed) return;
    setSetting('customStream', draft.trim());
    setSetting('streamId', 'custom');
    track('stream_link_paste', { platform: /twitch/.test(parsed.src) ? 'twitch' : /kick/.test(parsed.src) ? 'kick' : 'youtube' });
    setShowPaste(false);
  };

  const covered = paused && !uncovered;

  return (
    <section className={`stream ${hidden ? 'is-hidden' : ''}`}>
      <div className="stream-top">
        <div className="chips" role="tablist" aria-label={t.stream}>
          {STREAM_PRESETS.map(p => (
            <button
              key={p.id}
              role="tab"
              aria-selected={(preset?.id ?? STREAM_PRESETS[0].id) === p.id && streamId !== 'custom'}
              className={`chip ${(preset?.id ?? STREAM_PRESETS[0].id) === p.id && streamId !== 'custom' ? 'active' : ''}`}
              onClick={() => {
                setSetting('streamId', p.id);
                if (hidden) setSetting('streamHidden', false);
              }}
            >
              {p.label}
            </button>
          ))}
          <button className={`chip ${streamId === 'custom' ? 'active' : ''}`} aria-expanded={showPaste} onClick={() => setShowPaste(v => !v)}>
            + {t.customStream}
          </button>
        </div>
        {embed && !hidden && (
          <a
            className="icon-btn"
            href={embed.url}
            target="_blank"
            rel="noreferrer"
            title={t.openInTab}
            aria-label={t.openInTab}
            onClick={() => trackOutbound(embed.url)}
          >
            ↗
          </a>
        )}
        <button className="icon-btn" onClick={() => setSetting('streamHidden', !hidden)}>
          {hidden ? t.showStream : t.hideStream}
        </button>
      </div>

      {showPaste && (
        <div className="paste" role="group" aria-label={t.pasteLink}>
          <input
            value={draft}
            onChange={e => {
              setDraft(e.target.value);
              setBad(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={t.pasteLink}
            aria-label={t.pasteLink}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={bad}
          />
          <button type="button" className="btn" onClick={submit}>
            {t.open}
          </button>
          {bad ? (
            <p className="error" role="alert">
              {t.badLink}
            </p>
          ) : (
            <p className="muted small hint">{t.streamHint}</p>
          )}
        </div>
      )}

      {!hidden && (
        <div className={`player ${covered ? 'covered' : ''}`}>
          {covered ? (
            <div className="cover">
              {live && <CatchUpBar embedded />}
              <p className="cover-note">
                {t.streamCovered}{' '}
                <button className="link" onClick={() => setUncovered(true)}>
                  {t.showStreamAnyway}
                </button>
              </p>
            </div>
          ) : embed ? (
            <iframe
              key={embed.src}
              src={embed.src}
              title={t.stream}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="player-empty">{t.badLink}</div>
          )}
        </div>
      )}

      {!paused && live && (
        <div className="sync" title={t.syncHelp}>
          <div className="sync-head">
            <strong>{t.syncTitle}</strong>
            <span className="muted small sync-help">{t.syncShort}</span>
            <span className={`sync-value ${delaySec > 0 ? 'on' : ''}`}>{delaySec > 0 ? `${delaySec} ${t.seconds}` : t.syncOff}</span>
          </div>
          <div className="sync-row">
            <input
              type="range"
              min={0}
              max={90}
              step={1}
              value={delaySec}
              onChange={e => setSetting('delaySec', Number(e.target.value))}
              aria-label={t.syncTitle}
            />
            <div className="sync-steps">
              {DELAY_STEPS.map(n => (
                <button key={n} className={`step ${delaySec === n ? 'active' : ''}`} onClick={() => setSetting('delaySec', n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
