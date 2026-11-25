// Helpers for when the site is shown inside a page of another site (an iframe).

/** Address visitors should see and share, when it differs from this deployment's own. */
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim() || undefined;

export const isFramed = (): boolean => {
  try {
    return window.top !== window.self;
  } catch {
    return true; // a cross-origin parent refuses the comparison: we are framed
  }
};

/**
 * Every site in the embedding chain, innermost first. Twitch's player refuses
 * to load unless each of them is named in its `parent` parameters.
 */
export const embedHosts = (): string[] => {
  const hosts = new Set<string>([window.location.hostname || 'localhost']);
  const ancestors = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  for (let i = 0; i < (ancestors?.length ?? 0); i++) {
    try {
      hosts.add(new URL(ancestors!.item(i)!).hostname);
    } catch {
      // ignore an origin that is not a web address
    }
  }
  // Firefox has no ancestorOrigins; the public address names the embedding site there.
  if (isFramed() && PUBLIC_URL) {
    try {
      hosts.add(new URL(PUBLIC_URL).hostname);
    } catch {
      // ignore
    }
  }
  return [...hosts];
};

/** Tells search engines which address is the real one when this deployment sits behind another page. */
export const declareCanonical = () => {
  if (!PUBLIC_URL) return;
  const link = document.createElement('link');
  link.rel = 'canonical';
  link.href = PUBLIC_URL;
  document.head.appendChild(link);
};
