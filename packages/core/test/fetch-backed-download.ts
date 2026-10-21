/** Stands in for opportunity-processor/download.mjs so handler tests can route downloads through a stubbed fetch. */
export async function downloadFile(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404 || res.status === 410) return null;
    throw new Error(`Download failed ${res.status}: ${res.statusText}`);
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "",
    finalUrl: res.url || url,
  };
}
