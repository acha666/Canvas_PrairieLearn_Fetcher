const EVENT_NAME = "plcg:locationchange";

export function hookHistory(): void {
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  const emit = () => window.dispatchEvent(new Event(EVENT_NAME));

  history.pushState = function (...args) {
    const result = originalPush.apply(this, args as unknown as Parameters<typeof history.pushState>);
    emit();
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplace.apply(this, args as unknown as Parameters<typeof history.replaceState>);
    emit();
    return result;
  };

  window.addEventListener("popstate", emit);
}

export function onLocationChange(handler: () => void): void {
  window.addEventListener(EVENT_NAME, handler);
}
