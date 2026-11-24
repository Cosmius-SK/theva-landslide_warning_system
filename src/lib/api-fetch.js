const DEFAULT_TIMEOUT_MS = 20_000;

export async function apiFetch(input, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error(`The request timed out after ${Math.ceil(timeoutMs / 1000)} seconds. Check the connection and try again.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
