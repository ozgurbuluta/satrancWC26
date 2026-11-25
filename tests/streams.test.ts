import { describe, expect, it } from 'vitest';
import { gameNumber, pickVideo, type StreamEntry } from '../src/lib/streams';

// Real feed entries as the channels listed them on 25 November 2026.
const FIDE: StreamEntry[] = [
  { id: 'Q303vJR9W3E', published: '2026-11-24T20:57:00+00:00', title: '🇮🇳 Gukesh 🆚 Sindarov 🇺🇿 | Game 2 | Salesforce FIDE World Championship 2026 | No Commentary' },
  { id: 'i_0ELvDXYQc', published: '2026-11-24T20:48:00+00:00', title: '♟ Chess | Salesforce FIDE World Championship 2026 | Game 2 | 🇮🇳 Gukesh D 🆚 Javokhir Sindarov 🇺🇿' },
  { id: '7dyXiy2kWsw', published: '2026-11-24T18:42:00+00:00', title: '♟ Chess | Salesforce FIDE World Championship 2026 | Game 1 | 🇺🇿 Javokhir Sindarov 🆚 Gukesh D 🇮🇳' },
  { id: 'TDx2DGiBGhc', published: '2026-11-24T18:01:00+00:00', title: '🇺🇿 Javokhir Sindarov 🆚 Gukesh D 🇮🇳 | Salesforce FIDE World Championship 2026 | No Commentary' },
  { id: 'xRY3ClV_H2Y', published: '2026-11-22T17:20:00+00:00', title: 'Salesforce FIDE World Championship 2026 | Opening ceremony | 🇮🇳 Gukesh D 🆚 Javokhir Sindarov 🇺🇿' },
  { id: 'kznMoPDeWeE', published: '2026-11-22T15:34:00+00:00', title: 'Press Conference | Salesforce FIDE World Championship 2026' },
  { id: 'xL-j4UXDb08', published: '2026-09-27T12:15:00+00:00', title: '♟ FIDE Chess Olympiad 2026 | Round 11 | Sindarov, Assaubayeva, Praggnanandhaa & More' },
];
const CHESSCOM_TR: StreamEntry[] = [
  { id: '3lQTWxzFhz4', published: '2026-11-24T23:17:00+00:00', title: 'Dünya Şampiyonu Kim Olacak? | Gukesh vs Sindarov | Salesforce FIDE Dünya Satranç Şampiyonası' },
  { id: 'Q102LHSWMOg', published: '2026-11-24T18:14:00+00:00', title: 'Dünya Şampiyonu Kim Olacak? | Gukesh vs Sindarov | Salesforce FIDE Dünya Satranç Şampiyonası' },
  { id: 'pTYPlHEFxVc', published: '2026-11-20T20:55:00+00:00', title: 'ŞAMPİYON KİM OLACAK? Alireza vs Giri | Total Chess World Championship Son Gün' },
  { id: 'l8eqK8cxqQk', published: '2026-11-11T20:00:00+00:00', title: 'YENİ TURNUVA! Carlsen, Nepo, Mamedyarov, Caruana | Total Chess World Championship 1. Gün' },
];
const SILENT = /no commentary/i;
const G1 = Date.UTC(2026, 10, 24, 14);
const DAY = 86_400_000;
const start = (n: number) => G1 + (n - 1) * DAY;

describe('finding the stream for a game', () => {
  it('reads the game number from English and Turkish titles', () => {
    expect(['Game 12: X', '3. Oyun | Y', 'Round 7', '11. Gün canlı', 'Dünya Şampiyonu Kim Olacak?', 'FIDE 2026 final'].map(gameNumber)).toEqual([12, 3, 7, 11, undefined, undefined]);
  });

  it('picks the stream that names the game, and skips the one without commentary', () => {
    expect(pickVideo(FIDE, 2, { startsAt: start(2) }, SILENT)).toBe('i_0ELvDXYQc');
    expect(pickVideo(FIDE, 1, { startsAt: start(1), finished: true }, SILENT)).toBe('7dyXiy2kWsw');
  });

  it('never picks a ceremony or press conference', () => {
    for (const n of [1, 2, 3]) expect(['xRY3ClV_H2Y', 'kznMoPDeWeE']).not.toContain(pickVideo(FIDE, n, { startsAt: start(n), finished: true }));
  });

  it("does not mistake another event's numbered stream for a match game", () => {
    // "Olympiad … Round 11 … Sindarov" is from September; Game 11 is in December.
    expect(pickVideo(FIDE, 11, { startsAt: start(14) }, SILENT)).toBeUndefined();
    // "Total Chess World Championship 1. Gün" is not this match at all.
    expect(pickVideo(CHESSCOM_TR, 1, { startsAt: start(1) })).toBeUndefined();
  });

  it('for a game in progress, leaves a title without a number to the channel\'s own live stream', () => {
    expect(pickVideo(CHESSCOM_TR, 2, { startsAt: start(2) })).toBeUndefined();
  });

  it("for a finished game, finds that day's recording by date when the title has no number", () => {
    expect(pickVideo(CHESSCOM_TR, 1, { startsAt: start(1), finished: true })).toBe('Q102LHSWMOg');
  });

  it('returns nothing rather than guess when there is nothing to go on', () => {
    expect(pickVideo(undefined, 1, { startsAt: start(1) })).toBeUndefined();
    expect(pickVideo([], 1, { startsAt: start(1) })).toBeUndefined();
    expect(pickVideo(FIDE, 0, undefined)).toBeUndefined();
    expect(pickVideo(FIDE, 7, { startsAt: start(9) }, SILENT)).toBeUndefined();
  });
});
