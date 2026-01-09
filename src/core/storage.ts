import JSON5 from "json5";
import type {
  AssessmentInstanceCache,
  Config,
  ParserConfig,
  ProcessorConfig,
  ProcessorParams,
  Student,
  UiState,
} from "./types";

export const LS_PREFIX = "pl_canvas_grader_v1";
export const LS = {
  CONFIG: `${LS_PREFIX}.config`,
  STUDENTS: `${LS_PREFIX}.students`,
  PARSERS: `${LS_PREFIX}.parsers`,
  UI: `${LS_PREFIX}.ui`,
  AI_CACHE: (courseInstanceId: string, assessmentId: string) =>
    `${LS_PREFIX}.ai_cache.${courseInstanceId}.${assessmentId}`,
} as const;

export function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  const text = String(raw).trim();
  if (!text || text === "null" || text === "undefined") return fallback;

  try {
    const value = JSON5.parse(text) as T;
    return value === null || value === undefined ? fallback : value;
  } catch {
    // continue
  }

  try {
    const value = JSON.parse(text) as T;
    return value === null || value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function defaultConfig(): Config {
  return {
    plBaseUrl: "https://us.prairielearn.com",
    apiKey: "",
    courseInstanceId: "",
    includeOutputHeader: true,
  };
}

export function loadConfigRaw(): Record<string, unknown> {
  const parsed = safeJsonParse<Record<string, unknown>>(localStorage.getItem(LS.CONFIG), {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

export function loadConfig(): Config {
  const raw = loadConfigRaw();
  const cfg = defaultConfig();

  const read = <T extends keyof Config>(key: T, fallback: Config[T]): Config[T] => {
    const value = raw[key];
    if (value === undefined || value === null) return fallback;
    if (typeof fallback === "boolean") return Boolean(value) as Config[T];
    return String(value) as Config[T];
  };

  return {
    plBaseUrl: read("plBaseUrl", cfg.plBaseUrl),
    apiKey: read("apiKey", cfg.apiKey),
    courseInstanceId: read("courseInstanceId", cfg.courseInstanceId),
    includeOutputHeader: read("includeOutputHeader", cfg.includeOutputHeader),
  };
}

export function saveConfig(cfg: Config): void {
  const minimal: Config = {
    plBaseUrl: String(cfg.plBaseUrl || "").trim(),
    apiKey: String(cfg.apiKey || "").trim(),
    courseInstanceId: String(cfg.courseInstanceId || "").trim(),
    includeOutputHeader: Boolean(cfg.includeOutputHeader),
  };
  localStorage.setItem(LS.CONFIG, JSON.stringify(minimal));
}

export function loadUiState(): UiState {
  const def: UiState = { x: 20, y: 80, w: 420, h: 520 };
  const raw = safeJsonParse<Partial<UiState>>(localStorage.getItem(LS.UI), {});
  return {
    x: Number(raw?.x ?? def.x),
    y: Number(raw?.y ?? def.y),
    w: Number(raw?.w ?? def.w),
    h: Number(raw?.h ?? def.h),
  };
}

export function saveUiState(state: UiState): void {
  localStorage.setItem(LS.UI, JSON.stringify(state));
}

function normalizeStudent(raw: unknown): Student | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const read = (keys: string[]): string => {
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined || v === null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
    return "";
  };

  const name = read(["name"]);
  const canvasId = read(["canvasId", "canvas_id", "id"]);
  const sisUserId = read(["sisUserId", "sis_user_id"]);
  const sisLoginId = read(["sisLoginId", "sis_login_id", "user_uin"]);

  if (!name || !canvasId || !sisUserId || !sisLoginId) return null;
  return { name, canvasId, sisUserId, sisLoginId };
}

export function loadStudents(): Student[] {
  const parsed = safeJsonParse<unknown>(localStorage.getItem(LS.STUDENTS), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => normalizeStudent(entry))
    .filter((s): s is Student => Boolean(s));
}

export function saveStudents(students: Student[]): void {
  localStorage.setItem(
    LS.STUDENTS,
    JSON.stringify(
      students.map((s) => ({
        name: s.name,
        canvasId: s.canvasId,
        sisUserId: s.sisUserId,
        sisLoginId: s.sisLoginId,
      }))
    )
  );
}

function normalizeProcessorConfig(raw: unknown): ProcessorConfig {
  const obj = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as {
    type?: unknown;
    params?: unknown;
    file_index?: unknown;
  };

  const params: ProcessorParams = {};
  if (obj.params && typeof obj.params === "object") {
    Object.entries(obj.params).forEach(([k, v]) => {
      params[k] = typeof v === "number" || typeof v === "boolean" ? v : String(v ?? "");
    });
  }

  if (obj.file_index !== undefined && params.file_index === undefined) {
    params.file_index = obj.file_index as ProcessorParams[keyof ProcessorParams];
  }

  return {
    type: (String(obj.type || "file").trim() || "file") as ProcessorConfig["type"],
    params,
  };
}

function normalizeParser(raw: unknown): ParserConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const questionId = String(obj.questionId ?? obj.question_id ?? "").trim();
  const assessmentId = String(obj.assessmentId ?? obj.assessment_id ?? "").trim();
  const multiSubmissions = String(obj.multiSubmissions ?? obj.multi_submissions ?? "latest").trim() || "latest";

  if (!questionId || !assessmentId) return null;

  return {
    questionId,
    assessmentId,
    multiSubmissions: multiSubmissions === "latest" ? "latest" : "latest",
    processor: normalizeProcessorConfig(obj.processor),
  };
}

export function loadParsers(): ParserConfig[] {
  const parsed = safeJsonParse<unknown>(localStorage.getItem(LS.PARSERS), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeParser(item))
    .filter((p): p is ParserConfig => Boolean(p));
}

export function saveParsers(parsers: ParserConfig[]): void {
  localStorage.setItem(
    LS.PARSERS,
    JSON.stringify(
      parsers.map((p) => ({
        questionId: p.questionId,
        assessmentId: p.assessmentId,
        multiSubmissions: p.multiSubmissions,
        processor: p.processor,
      }))
    )
  );
}

export function loadAssessmentInstanceCache(
  courseInstanceId: string,
  assessmentId: string
): AssessmentInstanceCache {
  const aid = String(assessmentId || "").trim();
  if (!aid) return { map: new Map(), loadedAt: null };
  const cid = String(courseInstanceId || "").trim();
  if (!cid) return { map: new Map(), loadedAt: null };

  const raw = localStorage.getItem(LS.AI_CACHE(cid, aid));
  if (!raw) return { map: new Map(), loadedAt: null };
  const parsed = safeJsonParse<{ loadedAt?: string; pairs?: [string, string][] }>(raw, {});

  return {
    map: new Map(parsed?.pairs || []),
    loadedAt: parsed?.loadedAt ?? null,
  };
}

export function saveAssessmentInstanceCache(
  courseInstanceId: string,
  assessmentId: string,
  cache: AssessmentInstanceCache
): void {
  const aid = String(assessmentId || "").trim();
  const cid = String(courseInstanceId || "").trim();
  if (!aid || !cid) return;
  localStorage.setItem(
    LS.AI_CACHE(cid, aid),
    JSON.stringify({ loadedAt: cache.loadedAt, pairs: Array.from(cache.map.entries()) })
  );
}

export function clearAssessmentInstanceCache(): void {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(`${LS_PREFIX}.ai_cache.`))
    .forEach((k) => localStorage.removeItem(k));
}
