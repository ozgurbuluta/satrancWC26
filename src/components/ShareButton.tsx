import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../hooks';
import { track } from '../lib/analytics';
import { copyText } from '../lib/clipboard';
import { PUBLIC_URL } from '../lib/embed';
import { buildShareUrl, type ShareTarget } from '../lib/share';

interface Props {
  target: ShareTarget;
  /** Says what the link leads to, for the panel and for screen readers. */
  describe: string;
  /** Icon only (the name stays available to screen readers). For tight rows on phones. */
  compact?: boolean;
  /** Where to show the link panel when the button sits in a row with no room under it. */
  panelHost?: HTMLElement | null;
}

/**
 * Copies a link to what is on screen. The link is always shown as well, in a
 * field that can be selected: when copying is refused (as it can be inside a
 * frame), that field is focused with its text selected, so the visitor can
 * still copy it by hand.
 */
export function ShareButton({ target, describe, compact = false, panelHost }: Props) {
  const t = useT();
  const panelId = useId();
  const fieldId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // What was last shared. The panel keeps showing that link and its description, even if the board moves on.
  const [shared, setShared] = useState<{ url: string; label: string; copied: boolean } | null>(null);

  // When copying failed, hand the visitor the link ready to copy.
  useEffect(() => {
    if (shared && !shared.copied) {
      field.current?.focus();
      field.current?.select();
    }
  }, [shared]);

  const close = () => {
    setShared(null);
    button.current?.focus();
  };

  const share = async () => {
    // Built from the public address and the position only, never from the address in the browser.
    const url = buildShareUrl(target, PUBLIC_URL, { origin: window.location.origin, basePath: import.meta.env.BASE_URL });
    // A second press on the same position closes the panel; after a step on the board it shares the new position.
    if (shared?.url === url) {
      close();
      return;
    }
    const copied = await copyText(url);
    setShared({ url, label: describe, copied });
    track('share_link', { kind: target.view === 'puzzles' ? 'puzzles' : 'position', copied });
  };

  const copyAgain = async () => {
    if (!shared) return;
    const copied = await copyText(shared.url);
    setShared({ ...shared, copied });
  };

  return (
    <div
      className="share"
      onKeyDown={e => {
        if (e.key === 'Escape' && shared) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className={`share-btn ${compact ? 'compact' : ''}`}
        aria-expanded={!!shared}
        aria-controls={shared ? panelId : undefined}
        aria-label={compact ? t.share : undefined}
        title={t.share}
        onClick={() => void share()}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path
            d="M10.6 13.4a4 4 0 0 0 5.66 0l3.54-3.54a4 4 0 1 0-5.66-5.66l-1.06 1.06M13.4 10.6a4 4 0 0 0-5.66 0L4.2 14.14a4 4 0 1 0 5.66 5.66l1.06-1.06"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        {!compact && <span>{t.share}</span>}
      </button>
      {shared &&
        (() => {
          const panel = (
            <div className="share-panel" id={panelId} role="group" aria-label={shared.label}>
              <p className={shared.copied ? 'ok' : 'manual'} role="status" aria-live="polite">
                {shared.copied ? t.shareCopied : t.shareManual}
              </p>
              <label htmlFor={fieldId}>{shared.label}</label>
              <div className="share-row">
                <input
                  id={fieldId}
                  ref={field}
                  value={shared.url}
                  readOnly
                  onFocus={e => e.currentTarget.select()}
                  onClick={e => e.currentTarget.select()}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <button type="button" className="btn" onClick={() => void copyAgain()}>
                  {t.copyLink}
                </button>
                <button type="button" className="btn ghost" onClick={close}>
                  {t.close}
                </button>
              </div>
            </div>
          );
          return panelHost ? createPortal(panel, panelHost) : panel;
        })()}
    </div>
  );
}
