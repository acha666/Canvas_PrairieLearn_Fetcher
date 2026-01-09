export function getQueryParam(name: string): string | null {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  } catch {
    return null;
  }
}

export function formatLoadedAt(iso?: string | null): string {
  if (!iso) return "not loaded";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}
