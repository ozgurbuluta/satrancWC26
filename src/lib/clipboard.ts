// Copying text, for as many situations as the browser allows.
//
// Inside a frame on another site the modern clipboard interface is refused
// unless the outer page grants it, and some browsers refuse it outright. The
// older selection-based copy often still works there. When neither does, the
// caller shows the text so it can be selected by hand.

/** Copies `text`. Resolves to whether the browser says it worked; never throws. */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // refused (frame without permission, no user gesture, old browser): try the older way
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.setAttribute('aria-hidden', 'true');
    // on screen but invisible: some browsers will not copy from a hidden or off-screen field
    area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;';
    document.body.appendChild(area);
    const previous = document.activeElement as HTMLElement | null;
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    previous?.focus?.();
    return ok;
  } catch {
    return false;
  }
};
