type Child = Node | string | number | null | undefined;

type ElementOptions = {
  className?: string;
  class?: string;
  style?: Partial<CSSStyleDeclaration>;
  attrs?: Record<string, string | number | boolean>;
  on?: Record<string, (ev: Event) => void>;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: Child[] = []
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options.class || options.className) el.className = options.class || options.className || "";
  if (options.style) Object.assign(el.style, options.style);
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      el.setAttribute(k, String(v));
    });
  }
  if (options.on) {
    Object.entries(options.on).forEach(([k, handler]) => {
      el.addEventListener(k, handler);
    });
  }
  ([] as Child[]).concat(children).forEach((child) => {
    if (child === null || child === undefined) return;
    el.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  });
  return el;
}

export function setButtonDisabled(button: HTMLButtonElement, disabled: boolean): void {
  button.disabled = disabled;
  button.style.opacity = disabled ? "0.5" : "1";
  button.style.cursor = disabled ? "not-allowed" : "pointer";
}
