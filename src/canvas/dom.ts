import { getQueryParam } from "../core/utils";

export function getSpeedGraderDisplayedName(): string {
  const selected = document.querySelector('[data-testid="selected-student"]');
  if (selected?.textContent) return selected.textContent.trim();

  const spans = Array.from(document.querySelectorAll("span"));
  for (const span of spans) {
    if (span.getAttribute("data-testid") === "selected-student" && span.textContent) {
      return span.textContent.trim();
    }
  }
  return "";
}

export function isSpeedGraderReady(): boolean {
  const sid = getQueryParam("student_id");
  const name = getSpeedGraderDisplayedName();
  return Boolean(sid && name);
}

export function watchSpeedGraderName(onChange: () => void): void {
  let last = getSpeedGraderDisplayedName();
  const observer = new MutationObserver(() => {
    const next = getSpeedGraderDisplayedName();
    if (next && next !== last) {
      last = next;
      onChange();
    }
  });

  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch {
    // Some pages block MutationObserver; fall back to no-op
  }
}
