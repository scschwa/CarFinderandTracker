export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms: ${lastError.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return delay(ms);
}
