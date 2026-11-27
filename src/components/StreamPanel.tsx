import { useMemo } from 'react';
import { IS_MATCH, STREAM_PRESETS } from '../config';
import { useT } from '../hooks';
import { youtubeChannel, youtubeVideo, type Embed } from '../lib/streamLinks';
import { pickVideo } from '../lib/streams';
import { selectRoundNo, useStore } from '../store';
import { CatchUpBar } from './CatchUpBar';

/** `live` is false in the puzzle corner: the video stays, the controls that act on the live board go. */
export function StreamPanel({ live = true }: { live?: boolean }) {
  const t = useT();
  const streamId = useStore(s => s.settings.streamId);
  const hidden = useStore(s => s.settings.streamHidden);
  const paused = useStore(s => s.paused);
  const roundNo = useStore(selectRoundNo);
  const round = useStore(s => s.rounds.find(r => r.id === s.roundId));
  const feeds = useStore(s => s.streamFeeds);
  const setSetting = useStore(s => s.setSetting);
  const uncovered = useStore(s => s.streamUncovered);
  const setUncovered = useStore(s => s.setStreamUncovered);

  // A channel that is no longer listed (or a link of the viewer's own from an earlier version) falls back to the first one.
  const preset = STREAM_PRESETS.find(x => x.id === streamId) ?? STREAM_PRESETS[0];
  const embed = useMemo<Embed>(() => {
    const p = preset;
    // The exact video for this game when it is known or can be found, else whatever the channel is streaming live.
    const video = IS_MATCH ? (p.videos?.[roundNo] ?? pickVideo(feeds[p.channelId], roundNo, round, p.exclude)) : undefined;
    return video
      ? { src: youtubeVideo(video), url: `https://www.youtube.com/watch?v=${video}` }
      : { src: youtubeChannel(p.channelId), url: p.url };
  }, [preset, roundNo, round, feeds]);

  const covered = paused && !uncovered;

  return (
    <section className={`stream ${hidden ? 'is-hidden' : ''}`}>
      <div className="stream-top">
        <label className="stream-pick">
          <span className="eyebrow">{t.stream}</span>
          <select
            value={preset.id}
            onChange={e => {
              setSetting('streamId', e.target.value);
              if (hidden) setSetting('streamHidden', false);
            }}
          >
            {STREAM_PRESETS.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-btn" onClick={() => setSetting('streamHidden', !hidden)}>
          {hidden ? t.showStream : t.hideStream}
        </button>
      </div>

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
          ) : (
            // The frame keeps the video 16:9 and rounds its corners; the video inside it is a plain rectangle.
            <div className="player-frame">
              <iframe
                key={embed.src}
                src={embed.src}
                title={t.stream}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          )}
        </div>
      )}

    </section>
  );
}
