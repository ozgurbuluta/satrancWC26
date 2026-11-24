import { useMemo, useState } from 'react';
import { STREAM_PRESETS } from '../config';
import { useT } from '../hooks';
import { useStore } from '../store';

interface Embed {
  src: string;
  url: string;
}

const host = () => window.location.hostname || 'localhost';

const youtubeChannel = (id: string): string => `https://www.youtube.com/embed/live_stream?channel=${id}`;
const youtubeVideo = (id: string): string => `https://www.youtube.com/embed/${id}`;
const twitch = (name: string): string => `https://player.twitch.tv/?channel=${name}&parent=${host()}&autoplay=false`;
const kick = (name: string): string => `https://player.kick.com/${name}`;

/** Turns a pasted YouTube/Twitch/Kick link into an embeddable player URL. */
export const parseStreamLink = (input: string): Embed | undefined => {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return undefined;
  }
  const h = u.hostname.replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  const okId = (s: string | null | undefined): s is string => !!s && /^[\w-]{6,}$/.test(s);
  if (h === 'youtu.be' && okId(parts[0])) return { src: youtubeVideo(parts[0]), url: u.href };
  if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (okId(v)) return { src: youtubeVideo(v), url: u.href };
    if (['live', 'embed', 'shorts'].includes(parts[0]) && okId(parts[1])) return { src: youtubeVideo(parts[1]), url: u.href };
    if (parts[0] === 'channel' && /^UC[\w-]{22}$/.test(parts[1] ?? '')) return { src: youtubeChannel(parts[1]), url: u.href };
    return undefined;
  }
  if (h === 'twitch.tv' && parts[0] && /^\w+$/.test(parts[0])) return { src: twitch(parts[0]), url: u.href };
  if (h === 'kick.com' && parts[0] && /^[\w-]+$/.test(parts[0])) return { src: kick(parts[0]), url: u.href };
  return undefined;
};

const DELAY_STEPS = [0, 5, 10, 15, 20, 30, 45];

export function StreamPanel() {
  const t = useT();
  const streamId = useStore(s => s.settings.streamId);
  const customStream = useStore(s => s.settings.customStream);
  const hidden = useStore(s => s.settings.streamHidden);
  const delaySec = useStore(s => s.settings.delaySec);
  const setSetting = useStore(s => s.setSetting);
  const [draft, setDraft] = useState(customStream);
  const [bad, setBad] = useState(false);
  const [showPaste, setShowPaste] = useState(false);

  const embed = useMemo<Embed | undefined>(() => {
    if (streamId === 'custom') return parseStreamLink(customStream);
    const p = STREAM_PRESETS.find(x => x.id === streamId) ?? STREAM_PRESETS[0];
    const src = p.kind === 'youtube-channel' ? youtubeChannel(p.ref) : p.kind === 'twitch' ? twitch(p.ref) : kick(p.ref);
    return { src, url: p.url };
  }, [streamId, customStream]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseStreamLink(draft);
    setBad(!parsed);
    if (!parsed) return;
    setSetting('customStream', draft.trim());
    setSetting('streamId', 'custom');
    setShowPaste(false);
  };

  return (
    <section className={`stream ${hidden ? 'is-hidden' : ''}`}>
      <div className="stream-top">
        <div className="chips" role="tablist" aria-label={t.stream}>
          {STREAM_PRESETS.map(p => (
            <button
              key={p.id}
              role="tab"
              aria-selected={streamId === p.id}
              className={`chip ${streamId === p.id ? 'active' : ''}`}
              onClick={() => {
                setSetting('streamId', p.id);
                if (hidden) setSetting('streamHidden', false);
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            className={`chip ${streamId === 'custom' ? 'active' : ''}`}
            aria-expanded={showPaste}
            onClick={() => setShowPaste(v => !v)}
          >
            + {t.customStream}
          </button>
        </div>
        {embed && !hidden && (
          <a className="icon-btn" href={embed.url} target="_blank" rel="noreferrer" title={t.openInTab} aria-label={t.openInTab}>
            ↗
          </a>
        )}
        <button className="icon-btn" onClick={() => setSetting('streamHidden', !hidden)}>
          {hidden ? t.showStream : t.hideStream}
        </button>
      </div>

      {showPaste && (
        <form className="paste" onSubmit={submit}>
          <input
            value={draft}
            onChange={e => {
              setDraft(e.target.value);
              setBad(false);
            }}
            placeholder={t.pasteLink}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={bad}
          />
          <button type="submit" className="btn">
            {t.open}
          </button>
          {bad ? <p className="error">{t.badLink}</p> : <p className="muted small hint">{t.streamHint}</p>}
        </form>
      )}

      {!hidden && (
        <div className="player">
          {embed ? (
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
    </section>
  );
}
