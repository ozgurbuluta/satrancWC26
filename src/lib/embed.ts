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

interface OriginList {
  length: number;
  item(index: number): string | null;
}

/**
 * Every site in the embedding chain, innermost first: this page's host, then
 * each page around it. Browsers that expose the chain (ancestorOrigins) give
 * it exactly; Firefox does not, so there the public address names the outer site.
 */
export const embedHosts = (
  ancestors: OriginList | undefined = (window.location as Location & { ancestorOrigins?: OriginList }).ancestorOrigins,
  publicUrl: string | undefined = PUBLIC_URL,
  framed: boolean = isFramed(),
  self: string = window.location.hostname || 'localhost',
): string[] => {
  const hosts = new Set<string>([self]);
  const add = (address: string | null | undefined) => {
    if (!address) return;
    try {
      const host = new URL(address).hostname;
      if (host) hosts.add(host);
    } catch {
      // not a web address
    }
  };
  for (let i = 0; i < (ancestors?.length ?? 0); i++) add(ancestors!.item(i));
  if (framed) add(publicUrl);
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
