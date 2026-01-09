import type {
  AssessmentInstanceCache,
  ParserConfig,
  Student,
  UiState,
} from "../core/types";
import { formatLoadedAt } from "../core/utils";
import { h, setButtonDisabled } from "./components/dom";

export type StatusKind = "muted" | "ok" | "err";

export interface IdentityState {
  ok: boolean;
  errors: string[];
  uiName: string;
  rec?: Student;
  userUin?: string;
  currentStudentId?: string | null;
}

export interface PanelOptions {
  initialUiState: UiState;
  onUiStateChange: (state: UiState) => void;
  onOpenConfig: () => void;
  onRefreshUi: () => void;
  onChooseFile: () => void;
  onRefreshInstances: (assessmentId: string) => void;
  onFetch: (parser: ParserConfig, index: number) => void;
}

export interface PanelRenderState {
  outputFileName: string;
  lastWriteStatus: string;
  identity: IdentityState;
  parsers: ParserConfig[];
  baseConfigErrors: string[];
  getCache: (assessmentId: string) => AssessmentInstanceCache;
  statusText: string;
  statusKind: StatusKind;
}

export class Panel {
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private headerBar: HTMLDivElement;
  private opts: PanelOptions;
  private currentUiState: UiState;

  constructor(opts: PanelOptions) {
    this.opts = opts;
    this.currentUiState = opts.initialUiState;

    this.root = h("div", {
      attrs: { id: "plcg-root" },
      style: {
        left: `${this.currentUiState.x}px`,
        top: `${this.currentUiState.y}px`,
        width: `${this.currentUiState.w}px`,
        height: `${this.currentUiState.h}px`,
      },
    });

    this.headerBar = h("div", { attrs: { id: "plcg-header" } }, [
      h("div", { attrs: { id: "plcg-title" } }, ["PL Code Fetcher"]),
      h("div", {}, [
        h(
          "button",
          {
            className: "plcg-btn",
            attrs: { id: "plcg-ui-refresh", title: "Refresh SpeedGrader state" },
            on: { click: () => this.opts.onRefreshUi() },
          },
          ["↻"]
        ),
        h(
          "button",
          {
            className: "plcg-btn",
            attrs: { id: "plcg-config-open" },
            on: { click: () => this.opts.onOpenConfig() },
          },
          ["Config"]
        ),
      ]),
    ]);

    this.body = h("div", { attrs: { id: "plcg-body" } });
    this.root.appendChild(this.headerBar);
    this.root.appendChild(this.body);
    this.attachDrag();
  }

  mount(target: HTMLElement): void {
    target.appendChild(this.root);
  }

  render(state: PanelRenderState): void {
    this.body.innerHTML = "";
    const { identity, parsers, baseConfigErrors } = state;

    const rowFile = h("div", { className: "plcg-row" }, [
      h("div", { className: "plcg-inline" }, [
        h("span", { className: "plcg-muted" }, [`Output file: ${state.outputFileName}`]),
        h("button", { className: "plcg-btn", on: { click: () => this.opts.onChooseFile() } }, ["Choose file"]),
      ]),
      h("div", { className: "plcg-muted", style: { marginTop: "6px" } }, [state.lastWriteStatus]),
    ]);

    const kv = h("div", { className: "plcg-kv plcg-row" });
    const putKV = (k: string, v: string, className = "") => {
      kv.appendChild(h("div", { className: "plcg-k" }, [k]));
      kv.appendChild(h("div", { className: `plcg-v ${className}`.trim() }, [v]));
    };

    putKV("Name", identity.uiName || "(unavailable)");

    if (identity.ok && identity.rec) {
      const rec = identity.rec;
      putKV("CSV Name", rec.name || "", "plcg-ok");
      putKV("Canvas ID", rec.canvasId || "", "plcg-ok");
      putKV("SIS User ID", rec.sisUserId || "", "plcg-ok");
      putKV("SIS Login ID", rec.sisLoginId || "", "plcg-ok");
    } else {
      putKV("Error", identity.errors.join("; "), "plcg-err");
      if (identity.rec) {
        putKV("CSV Name", identity.rec.name || "", "plcg-muted");
        putKV("Canvas ID", identity.rec.canvasId || "", "plcg-muted");
        putKV("SIS User ID", identity.rec.sisUserId || "", "plcg-muted");
        putKV("SIS Login ID", identity.rec.sisLoginId || "", "plcg-muted");
      } else {
        putKV("Canvas student_id", identity.currentStudentId || "", "plcg-muted");
      }
    }

    const parsersBlock = h("div", { className: "plcg-row" }, [
      h("div", { className: "plcg-muted", style: { marginBottom: "6px" } }, ["Parsers:"]),
    ]);

    if (!parsers.length) {
      parsersBlock.appendChild(h("div", { className: "plcg-muted" }, ['(No parsers. Open "Config" to add.)']));
    } else {
      parsers.forEach((parser, index) => {
        const cache = state.getCache(parser.assessmentId);
        const loadedCount = cache?.map?.size ?? 0;
        const loadedAtText = formatLoadedAt(cache?.loadedAt);

        const label = parser.questionId ? `Fetch ${parser.questionId} (${loadedCount})` : `Fetch #${index + 1} (${loadedCount})`;

        const row = h("div", { className: "plcg-parser-row" });

        const refreshBtn = h(
          "button",
          {
            className: "plcg-btn plcg-parser-refresh",
            attrs: {
              title: parser.assessmentId
                ? `Refresh instances (assessment_id=${parser.assessmentId})\nLast: ${loadedAtText}`
                : "Refresh instances (missing assessment_id)",
            },
            on: { click: () => this.opts.onRefreshInstances(parser.assessmentId) },
          },
          ["↻"]
        );

        let canFetch = true;
        const reasons: string[] = [];
        if (!identity.ok) {
          canFetch = false;
          reasons.push("student info / matching error");
        }
        if (!state.outputFileName || state.outputFileName === "not selected") {
          canFetch = false;
          reasons.push("no output file selected");
        }
        if (baseConfigErrors.length) {
          canFetch = false;
          reasons.push("incomplete configuration");
        }
        if (!parser.assessmentId) {
          canFetch = false;
          reasons.push("missing assessment_id");
        }

        let instanceId: string | null = null;
        if (canFetch && identity.ok && parser.assessmentId) {
          instanceId = cache?.map?.get(identity.userUin || "") ?? null;
          if (!instanceId) {
            canFetch = false;
            reasons.push("no instance for user_uin");
          }
        }

        const tooltip: string[] = [];
        if (parser.assessmentId) tooltip.push(`assessment_id=${parser.assessmentId}`);
        tooltip.push(`instances=${loadedCount}`);
        tooltip.push(`loaded_at=${loadedAtText}`);
        if (identity.ok && identity.userUin) tooltip.push(`user_uin=${identity.userUin}`);
        if (instanceId) tooltip.push(`assessment_instance_id=${instanceId}`);
        if (!canFetch && reasons.length) tooltip.push(`disabled: ${reasons.join("; ")}`);

        const fetchBtn = h(
          "button",
          {
            className: "plcg-btn plcg-parser-fetch",
            attrs: { title: tooltip.join("\n") },
            on: { click: () => this.opts.onFetch(parser, index) },
          },
          [label]
        );
        setButtonDisabled(fetchBtn as HTMLButtonElement, !canFetch);

        row.appendChild(refreshBtn);
        row.appendChild(fetchBtn);
        parsersBlock.appendChild(row);

        if (
          identity.ok &&
          state.outputFileName !== "not selected" &&
          !baseConfigErrors.length &&
          parser.assessmentId &&
          !instanceId
        ) {
          parsersBlock.appendChild(
            h("div", { className: "plcg-err", style: { margin: "2px 0 8px 40px" } }, [
              `Err: no instance for user_uin (assessment_id=${parser.assessmentId})`,
            ])
          );
        }
      });
    }

    const footer = h("div", { className: "plcg-row", style: { marginTop: "10px" } });
    const globalDisableReasons: string[] = [];
    if (!identity.ok) globalDisableReasons.push("student info / matching error");
    if (!state.outputFileName || state.outputFileName === "not selected")
      globalDisableReasons.push("no output file selected");
    if (baseConfigErrors.length) globalDisableReasons.push("incomplete configuration");

    if (globalDisableReasons.length) {
      footer.appendChild(h("div", { className: "plcg-err" }, [`Err: ${globalDisableReasons.join("; ")}`]));
    }

    if (state.statusText) {
      const statusClass = state.statusKind === "ok" ? "plcg-ok" : state.statusKind === "err" ? "plcg-err" : "plcg-muted";
      footer.appendChild(
        h("div", { className: statusClass, style: { marginTop: globalDisableReasons.length ? "6px" : "0" } }, [
          state.statusText,
        ])
      );
    }

    this.body.appendChild(rowFile);
    this.body.appendChild(kv);
    this.body.appendChild(parsersBlock);
    this.body.appendChild(footer);
  }

  private attachDrag(): void {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    this.headerBar.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.root.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.root.style.left = `${Math.max(0, startLeft + dx)}px`;
      this.root.style.top = `${Math.max(0, startTop + dy)}px`;
    });

    const persistState = () => {
      const rect = this.root.getBoundingClientRect();
      this.currentUiState = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
      this.opts.onUiStateChange(this.currentUiState);
    };

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      persistState();
    });

    let resizeToken: number | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeToken !== null) cancelAnimationFrame(resizeToken);
      resizeToken = requestAnimationFrame(persistState);
    });
    ro.observe(this.root);
  }
}
