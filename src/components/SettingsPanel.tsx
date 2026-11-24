import { useT } from '../hooks';
import { useStore } from '../store';

function Toggle({ label, value, onChange, on, off }: { label: string; value: boolean; onChange: (v: boolean) => void; on: string; off: string }) {
  return (
    <div className="setting">
      <span>{label}</span>
      <div className="seg" role="group" aria-label={label}>
        <button className={value ? 'active' : ''} aria-pressed={value} onClick={() => onChange(true)}>
          {on}
        </button>
        <button className={!value ? 'active' : ''} aria-pressed={!value} onClick={() => onChange(false)}>
          {off}
        </button>
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const t = useT();
  const settings = useStore(s => s.settings);
  const setSetting = useStore(s => s.setSetting);
  return (
    <div className="settings">
      <div className="setting">
        <span>{t.language}</span>
        <div className="seg" role="group" aria-label={t.language}>
          <button className={settings.lang === 'tr' ? 'active' : ''} aria-pressed={settings.lang === 'tr'} onClick={() => setSetting('lang', 'tr')}>
            Türkçe
          </button>
          <button className={settings.lang === 'en' ? 'active' : ''} aria-pressed={settings.lang === 'en'} onClick={() => setSetting('lang', 'en')}>
            English
          </button>
        </div>
      </div>
      <div className="setting">
        <span>{t.notation}</span>
        <div className="seg" role="group" aria-label={t.notation}>
          <button className={settings.notation === 'tr' ? 'active' : ''} aria-pressed={settings.notation === 'tr'} onClick={() => setSetting('notation', 'tr')}>
            {t.notationTr}
          </button>
          <button className={settings.notation === 'en' ? 'active' : ''} aria-pressed={settings.notation === 'en'} onClick={() => setSetting('notation', 'en')}>
            {t.notationEn}
          </button>
        </div>
      </div>
      <Toggle label={t.engineSetting} value={settings.engine} onChange={v => setSetting('engine', v)} on={t.on} off={t.off} />
      <Toggle label={t.arrowSetting} value={settings.arrow} onChange={v => setSetting('arrow', v)} on={t.on} off={t.off} />
      <Toggle label={t.sound} value={settings.sound} onChange={v => setSetting('sound', v)} on={t.on} off={t.off} />
      <Toggle label={t.spoilerShield} value={settings.spoilerShield} onChange={v => setSetting('spoilerShield', v)} on={t.on} off={t.off} />
      <p className="muted small">{t.spoilerShieldHelp}</p>
    </div>
  );
}
