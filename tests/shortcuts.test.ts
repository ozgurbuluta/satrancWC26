import { afterEach, describe, expect, it } from 'vitest';
import { STRINGS } from '../src/i18n';
import { shortcutFor } from '../src/lib/shortcuts';

const press = (key: string, target: EventTarget | null = document.body, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
  shortcutFor({ key, target, metaKey: false, ctrlKey: false, altKey: false, ...mods }, false);
const inside = (html: string, selector: string): Element => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host.querySelector(selector)!;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('keyboard shortcuts of the board', () => {
  it('the up arrow returns to the live position, and Home is the beginning', () => {
    expect(press('ArrowUp')).toBe('live');
    expect(press('End')).toBe('live');
    expect(press('ArrowDown')).toBe('live');
    expect(press('Home')).toBe('start');
    expect(press('ArrowLeft')).toBe('back');
    expect(press('ArrowRight')).toBe('forward');
    expect(press('f')).toBe('flip');
    expect(press('Escape')).toBe('closePreview');
    expect(press('a')).toBeUndefined();
    expect(press('Enter')).toBeUndefined();
  });

  it('nothing happens with a modifier held', () => {
    for (const mod of ['metaKey', 'ctrlKey', 'altKey'] as const) {
      expect(press('ArrowUp', document.body, { [mod]: true })).toBeUndefined();
      expect(press('ArrowLeft', document.body, { [mod]: true })).toBeUndefined();
    }
  });

  it('keys typed into a field stay with the field', () => {
    for (const [html, selector] of [
      ['<input type="text" />', 'input'],
      ['<textarea></textarea>', 'textarea'],
      ['<select><option>1</option></select>', 'select'],
      ['<div contenteditable="true"><b>text</b></div>', 'b'],
      ['<div contenteditable=""><span>text</span></div>', 'span'],
    ] as const) {
      const el = inside(html, selector);
      for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'f']) expect(press(key, el)).toBeUndefined();
    }
    // an element that only says it is not editable is an ordinary one
    expect(press('ArrowUp', inside('<div contenteditable="false"><i>x</i></div>', 'i'))).toBe('live');
  });

  it('keys pressed inside a dialog stay with the dialog', () => {
    const promotion = inside('<div class="promo" role="dialog"><button>Vezir</button></div>', 'button');
    const drawer = inside('<dialog open><button>3. oyun</button></dialog>', 'button');
    for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'Escape']) {
      expect(press(key, promotion)).toBeUndefined();
      expect(press(key, drawer)).toBeUndefined();
    }
  });

  it('nothing moves while a pawn waits for its promotion piece, wherever the focus is', () => {
    for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(shortcutFor({ key, target: document.body, metaKey: false, ctrlKey: false, altKey: false }, true)).toBeUndefined();
    }
  });

  it('the mapping is written where the viewer can read it, in both languages', () => {
    for (const lang of ['tr', 'en'] as const) {
      const help = STRINGS[lang].shortcutsHelp;
      for (const key of ['←', '→', '↑', 'End', 'Home', 'F']) expect(help).toContain(key);
    }
    expect(STRINGS.tr.shortcutsHelp).toMatch(/↑ ya da End canlı konuma döner/);
    expect(STRINGS.tr.backToLive).toBe('Canlı konuma dön');
  });
});
