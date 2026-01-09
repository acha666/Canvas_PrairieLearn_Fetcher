import { GM_addStyle, GM_xmlhttpRequest } from "$";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "HEAD";

export function gmAddStyle(css: string): void {
  if (!css) return;
  if (typeof GM_addStyle === "function") {
    GM_addStyle(css);
    return;
  }
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

export async function gmRequestJson<T>(opts: {
  method?: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<T> {
  const { method = "GET", url, headers = {}, timeoutMs = 30_000 } = opts;
  if (typeof GM_xmlhttpRequest !== "function") {
    const resp = await fetch(url, { method, headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${await resp.text()}`);
    return (await resp.json()) as T;
  }
  return await new Promise<T>((resolve, reject) => {
    GM_xmlhttpRequest({
      method,
      url,
      headers,
      timeout: timeoutMs,
      onload: (resp) => {
        if (resp.status < 200 || resp.status >= 300) {
          reject(
            new Error(
              `HTTP ${resp.status} ${resp.statusText}: ${resp.responseText?.slice?.(0, 300) ?? ""}`
            )
          );
          return;
        }
        try {
          resolve(JSON.parse(resp.responseText) as T);
        } catch (err) {
          reject(new Error(`JSON parse failed: ${(err as Error)?.message || err}`));
        }
      },
      onerror: () => reject(new Error("Network error")),
      ontimeout: () => reject(new Error("Timeout")),
    });
  });
}
