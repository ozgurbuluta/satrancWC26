import { useState } from 'react';
import { useT } from '../hooks';
import { analyticsConfigured, isOptedOut, setOptedOut } from '../lib/analytics';
import { storagePersistent } from '../lib/storage';
import { useStore } from '../store';

/**
 * One setting: its name and control on a row, and what it does under them.
 * The rule between settings is drawn above each one, so a note always stays
 * with the row it explains.
 */
function Setting({ label, control, children }: { label: string; control?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-row">
        <span>{label}</span>
        {control}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange, on, off, children }: { label: string; value: boolean; onChange: (v: boolean) => void; on: string; off: string; children?: React.ReactNode }) {
  return (
    <Setting
      label={label}
      control={
        <div className="seg" role="group" aria-label={label}>
          <button className={value ? 'active' : ''} aria-pressed={value} onClick={() => onChange(true)}>
            {on}
          </button>
          <button className={!value ? 'active' : ''} aria-pressed={!value} onClick={() => onChange(false)}>
            {off}
          </button>
        </div>
      }
    >
      {children}
    </Setting>
  );
}

export function SettingsPanel() {
  const t = useT();
  const settings = useStore(s => s.settings);
  const setSetting = useStore(s => s.setSetting);
  const [statsOff, setStatsOff] = useState(isOptedOut);
  const [statsRemembered, setStatsRemembered] = useState(true);
  return (
    <div className="settings">
      {!storagePersistent() && (
        <p className="notice small" role="status">
          {t.notPersistent}
        </p>
      )}
      <Setting
        label={t.language}
        control={
          <div className="seg" role="group" aria-label={t.language}>
            <button className={settings.lang === 'tr' ? 'active' : ''} aria-pressed={settings.lang === 'tr'} onClick={() => setSetting('lang', 'tr')}>
              Türkçe
            </button>
            <button className={settings.lang === 'en' ? 'active' : ''} aria-pressed={settings.lang === 'en'} onClick={() => setSetting('lang', 'en')}>
              English
            </button>
          </div>
        }
      />
      <Setting
        label={t.notation}
        control={
          <div className="seg" role="group" aria-label={t.notation}>
            <button className={settings.notation === 'tr' ? 'active' : ''} aria-pressed={settings.notation === 'tr'} onClick={() => setSetting('notation', 'tr')}>
              {t.notationTr}
            </button>
            <button className={settings.notation === 'en' ? 'active' : ''} aria-pressed={settings.notation === 'en'} onClick={() => setSetting('notation', 'en')}>
              {t.notationEn}
            </button>
          </div>
        }
      />
      <Toggle label={t.engineSetting} value={settings.engine} onChange={v => setSetting('engine', v)} on={t.on} off={t.off} />
      <Toggle label={t.arrowSetting} value={settings.arrow} onChange={v => setSetting('arrow', v)} on={t.on} off={t.off} />
      <Toggle label={t.sound} value={settings.sound} onChange={v => setSetting('sound', v)} on={t.on} off={t.off} />
      <Toggle label={t.spoilerShield} value={settings.spoilerShield} onChange={v => setSetting('spoilerShield', v)} on={t.on} off={t.off}>
        <p className="muted small">{t.spoilerShieldHelp}</p>
      </Toggle>
      <Setting label={t.shortcuts}>
        <p className="muted small">{t.shortcutsHelp}</p>
      </Setting>
      {analyticsConfigured && (
        <Toggle
          label={t.stats}
          value={!statsOff}
          onChange={v => {
            setStatsRemembered(setOptedOut(!v).persisted);
            setStatsOff(!v);
          }}
          on={t.statsOn}
          off={t.statsOff}
        >
          <p className="muted small">{t.statsHelp}</p>
          {statsOff && !statsRemembered && (
            <p className="muted small" role="status">
              {t.statsNotRemembered}
            </p>
          )}
        </Toggle>
      )}
    </div>
  );
}
