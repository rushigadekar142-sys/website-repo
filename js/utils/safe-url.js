/** Allow only absolute HTTP(S) URLs before rendering user-supplied external links. */
export function safeExternalUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (!url.hostname || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}
