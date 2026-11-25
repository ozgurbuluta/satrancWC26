import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/i18n';

describe('Turkish wording', () => {
  it('says oyun, never parti, in everything the viewer can read', () => {
    for (const [key, text] of Object.entries(STRINGS.tr)) {
      expect(text, key).not.toMatch(/parti/i);
    }
    expect(STRINGS.tr.game).toBe('Oyun');
    expect(STRINGS.tr.sharePosition).toContain('{g}. oyun');
    expect(STRINGS.tr.nextStarted).toBe('{n}. oyun başladı');
    expect(STRINGS.tr.backToGame).toBe('Oyuna dön');
  });

  it('both languages have the same strings', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.tr).sort());
    for (const [key, text] of Object.entries(STRINGS.en)) expect(text.trim(), key).not.toBe('');
  });
});
