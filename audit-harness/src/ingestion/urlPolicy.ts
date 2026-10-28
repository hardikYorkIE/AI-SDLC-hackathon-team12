export function assertAllowedUrl(raw: string, allowedHosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }
  if (url.username || url.password) {
    throw new Error('URLs with credentials are not allowed');
  }
  const bare = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const allowed = allowedHosts.some((host) => {
    const normalized = host.toLowerCase();
    return normalized === bare || normalized === url.hostname.toLowerCase();
  });
  if (!allowed) {
    throw new Error(`Host "${url.hostname}" is not in the allowlist (${allowedHosts.join(', ')})`);
  }
  return url;
}

export function normalizeRoute(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname || '/';
}
