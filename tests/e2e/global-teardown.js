export default async function globalTeardown() {
  try {
    const response = await fetch("http://127.0.0.1:4174/__test/shutdown", { method: "POST", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`test server shutdown returned HTTP ${response.status}`);
    await response.text();
  } catch (error) {
    if (error?.cause?.code !== "ECONNREFUSED") console.error("Unable to request clean E2E server shutdown:", error.message);
  }
}
