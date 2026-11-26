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

  it('calls the engine by its name, Stockfish, and never "motor"', () => {
    for (const [key, text] of Object.entries(STRINGS.tr)) expect(text, key).not.toMatch(/motor/i);
    for (const [key, text] of Object.entries(STRINGS.en)) expect(text, key).not.toMatch(/\bengine\b/i);
    expect(STRINGS.tr.engine).toBe('Stockfish');
    expect(STRINGS.tr.engineSuggests).toBe('Stockfish ne öneriyor?');
    expect(STRINGS.tr.engineSays).toContain("Stockfish'e göre");
  });

  it('keeps the footer to two short sentences, and leaves the removed explanations out', () => {
    expect(STRINGS.tr.footer).toBe("Hamleler Lichess'ten, analiz Stockfish'ten. Bağımsız bir hayran sitesi.");
    expect(STRINGS.en.footer).toBe('Moves from Lichess, analysis by Stockfish. An independent fan site.');
    expect(STRINGS.tr.guessModeHelp).toBe('Sıradaki hamleyi oynanmadan önce tahmin et.');
    const all = Object.values(STRINGS.tr).join(' | ');
    expect(all).not.toContain('usta ve motor bilgileri');
    expect(all).not.toContain('olasılık değil');
    expect(all).not.toContain('en güçlü bulduğu');
    expect(all).not.toContain('birkaç iyi hamle');
    // no dot between two facts on one line
    expect(all).not.toContain(' · ');
  });

  it('says what a new move is without repeating the move', () => {
    expect(STRINGS.tr.novelty).toBe('Yeni hamle');
    expect(STRINGS.tr.noveltyText).toBe('usta oyunlarında daha önce oynanmamış.');
    expect(STRINGS.tr.noveltyText).not.toContain('{move}');
    expect(STRINGS.tr.noveltyBefore).toBe('Ondan önceki konum {n} usta oyununda görülmüş.');
  });

  it('both languages have the same strings', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.tr).sort());
    for (const [key, text] of Object.entries(STRINGS.en)) expect(text.trim(), key).not.toBe('');
  });
});
