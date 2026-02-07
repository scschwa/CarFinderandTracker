// Optional proxy rotation utility
// Configure proxies via PROXY_LIST environment variable (comma-separated)

const proxies: string[] = (process.env.PROXY_LIST || '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

let currentIndex = 0;

export function getProxy(): string | undefined {
  if (proxies.length === 0) return undefined;
  const proxy = proxies[currentIndex % proxies.length];
  currentIndex++;
  return proxy;
}

export function hasProxies(): boolean {
  return proxies.length > 0;
}
