import Papa from "papaparse";
import JSON5 from "json5";
import { Base64 } from "js-base64";

/***********************
 * Utilities
 ***********************/
const LS_PREFIX = "pl_canvas_grader_v1";
const LS = {
  CONFIG: `${LS_PREFIX}.config`,
  STUDENTS: `${LS_PREFIX}.students`,
  PARSERS: `${LS_PREFIX}.parsers`,
  UI: `${LS_PREFIX}.ui`,
  AI_CACHE: (courseInstanceId, assessmentId) =>
    `${LS_PREFIX}.ai_cache.${courseInstanceId}.${assessmentId}`,
};

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse(str, fallback) {
  if (str === null || str === undefined) return fallback;
  const s = String(str).trim();
  if (!s || s === "null" || s === "undefined") return fallback;

  try {
    if (typeof JSON5 !== "undefined" && JSON5?.parse) {
      const v = JSON5.parse(s);
      return v === null || v === undefined ? fallback : v;
    }
  } catch {
    // fall through
  }

  try {
    const v = JSON.parse(s);
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

function normName(s) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function canonicalizeName(name) {
  // Convert "Last, First Middle" -> "First Middle Last"
  // Keep "First Last" unchanged.
  const raw = String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!raw) return "";
  const m = raw.match(/^([^,]+),\s*(.+)$/);
  if (!m) return raw;
  const last = String(m[1] || "").trim();
  const rest = String(m[2] || "").trim();
  if (!last || !rest) return raw;
  return `${rest} ${last}`.replace(/\s+/g, " ").trim();
}

function stripEllipsis(s) {
  return String(s ?? "")
    .replace(/\u2026/g, "")
    .replace(/\.{3,}\s*$/g, "")
    .trim();
}

function canonicalizeForCompare(name) {
  return normName(canonicalizeName(name));
}

function namesMatch(uiName, csvName) {
  const uiCanon = canonicalizeForCompare(uiName);
  const csvCanon = canonicalizeForCompare(csvName);
  if (!uiCanon || !csvCanon) return false;
  if (uiCanon === csvCanon) return true;

  // Handle SpeedGrader UI truncation (ellipsis) or prefix display.
  const uiRawCanon = canonicalizeName(uiName);
  const csvRawCanon = canonicalizeName(csvName);

  const uiHasEllipsis =
    /[\u2026]/.test(uiRawCanon) || /\.{3,}\s*$/.test(uiRawCanon);
  const uiStripped = normName(stripEllipsis(uiRawCanon));
  const csvNorm = normName(csvRawCanon);

  if (uiHasEllipsis) {
    if (uiStripped && csvNorm.startsWith(uiStripped)) return true;

    const uiTokens = uiStripped.split(" ").filter(Boolean);
    const csvTokens = csvNorm.split(" ").filter(Boolean);
    if (
      uiTokens.length &&
      csvTokens.length &&
      uiTokens.length <= csvTokens.length
    ) {
      let ok = true;
      for (let i = 0; i < uiTokens.length; i++) {
        const ut = uiTokens[i];
        const ct = csvTokens[i] || "";
        if (i === uiTokens.length - 1) {
          if (!ct.startsWith(ut)) {
            ok = false;
            break;
          }
        } else {
          if (ut !== ct) {
            ok = false;
            break;
          }
        }
      }
      if (ok) return true;
    }
  }

  if (uiCanon.length >= 10 && csvCanon.startsWith(uiCanon)) return true;

  return false;
}

function getQueryParam(name) {
  try {
    const u = new URL(location.href);
    return u.searchParams.get(name);
  } catch {
    return null;
  }
}

function setBtnDisabled(btn, disabled) {
  btn.disabled = !!disabled;
  btn.style.opacity = disabled ? "0.5" : "1";
  btn.style.cursor = disabled ? "not-allowed" : "pointer";
}

function base64ToUtf8(b64) {
  const s = String(b64 || "").trim();
  try {
    if (typeof Base64 !== "undefined" && Base64?.toUint8Array) {
      const bytes = Base64.toUint8Array(s);
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
  } catch {
    // fall through
  }

  // Fallback (manual)
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = t.length % 4;
  if (pad === 2) t += "==";
  else if (pad === 3) t += "=";

  const bin = atob(t);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function")
      node.addEventListener(k.slice(2), v);
    else if (k === "class") node.className = v;
    else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function loadConfigRaw() {
  const v = safeJsonParse(localStorage.getItem(LS.CONFIG), {});
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function loadConfig() {
  const def = {
    plBaseUrl: "https://us.prairielearn.com",
    apiKey: "",
    courseInstanceId: "",
    includeOutputHeader: true,
  };
  const v = loadConfigRaw();
  const merged = Object.assign(def, v || {});
  merged.includeOutputHeader = !!merged.includeOutputHeader;
  return merged;
}

function saveConfig(cfg) {
  const minimal = {
    plBaseUrl: String(cfg.plBaseUrl || "").trim(),
    apiKey: String(cfg.apiKey || "").trim(),
    courseInstanceId: String(cfg.courseInstanceId || "").trim(),
    includeOutputHeader: !!cfg.includeOutputHeader,
  };
  localStorage.setItem(LS.CONFIG, JSON.stringify(minimal));
}

function loadStudents() {
  const v = safeJsonParse(localStorage.getItem(LS.STUDENTS), []);
  return Array.isArray(v) ? v : [];
}

function saveStudents(students) {
  localStorage.setItem(LS.STUDENTS, JSON.stringify(students));
}

function loadParsers() {
  const v = safeJsonParse(localStorage.getItem(LS.PARSERS), []);
  return Array.isArray(v) ? v : [];
}

function saveParsers(parsers) {
  localStorage.setItem(LS.PARSERS, JSON.stringify(parsers));
}

function loadUiState() {
  const def = { x: 20, y: 80, w: 420, h: 520 };
  const v = safeJsonParse(localStorage.getItem(LS.UI), {});
  return v && typeof v === "object" && !Array.isArray(v)
    ? Object.assign(def, v)
    : def;
}

function saveUiState(st) {
  localStorage.setItem(LS.UI, JSON.stringify(st));
}

function formatLoadedAt(iso) {
  if (!iso) return "not loaded";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

/***********************
 * CSV Import (Canvas Gradebook export compatible)
 ***********************/
function parseWithPapa(text, opts) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    if (typeof Papa !== "undefined" && Papa?.parse) {
      return Papa.parse(raw, opts);
    }
  } catch {
    return null;
  }
  return null;
}

function isNumericId(x) {
  return /^\d+$/.test(String(x || "").trim());
}

function detectGradebookHeader(text) {
  const preview = parseWithPapa(text, {
    header: false,
    skipEmptyLines: true,
    preview: 3,
    dynamicTyping: false,
  });
  const row0 = Array.isArray(preview?.data?.[0]) ? preview.data[0] : [];
  const lower = row0.map((s) =>
    String(s || "")
      .trim()
      .toLowerCase()
  );
  const hasStudent = lower.includes("student");
  const hasId = lower.includes("id");
  const hasSisUser = lower.includes("sis user id");
  const hasSisLogin = lower.includes("sis login id");
  return hasStudent && hasId && hasSisUser && hasSisLogin;
}

function pickFieldFromObject(obj, candidates) {
  const keys = Object.keys(obj || {});
  const map = new Map(keys.map((k) => [String(k).trim().toLowerCase(), k]));
  for (const c of candidates) {
    const hit = map.get(String(c).trim().toLowerCase());
    if (hit) return obj[hit];
  }
  return undefined;
}

function parseStudentsFromCsv(text) {
  const raw = String(text || "").trim();
  if (!raw) return { students: [], errors: ["Empty CSV"] };

  const errors = [];
  const out = [];

  const isGradebook = detectGradebookHeader(raw);

  if (isGradebook) {
    const res = parseWithPapa(raw, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (h) => String(h || "").trim(),
    });

    const rows = Array.isArray(res?.data) ? res.data : [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const student = pickFieldFromObject(r, ["Student"]);
      const id = pickFieldFromObject(r, ["ID"]);
      const sisUserId = pickFieldFromObject(r, ["SIS User ID"]);
      const sisLoginId = pickFieldFromObject(r, ["SIS Login ID"]);

      // Skip non-student rows like "Manual Posting" / "Points Possible"
      if (!isNumericId(id)) continue;

      const name = canonicalizeName(student);
      if (!name) {
        errors.push(`Row ${i + 2}: empty Student`);
        continue;
      }
      if (!sisUserId || !sisLoginId) {
        errors.push(`Row ${i + 2}: empty SIS User ID or SIS Login ID`);
        continue;
      }

      out.push({
        name: String(name).trim(),
        canvas_id: String(id).trim(),
        sis_user_id: String(sisUserId).trim(),
        sis_login_id: String(sisLoginId).trim(),
      });
    }

    if (!out.length && !errors.length) {
      errors.push("No valid student rows found");
    }
    return { students: out, errors };
  }

  // Legacy/simple 4-column mode:
  // Name,Canvas ID,SIS User ID,SIS Login ID
  const res = parseWithPapa(raw, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const rows = Array.isArray(res?.data) ? res.data : [];
  for (let i = 0; i < rows.length; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    if (!row.some((x) => String(x ?? "").trim())) continue;

    // Skip header-ish rows
    const c0 = String(row[0] ?? "")
      .trim()
      .toLowerCase();
    const c1 = String(row[1] ?? "")
      .trim()
      .toLowerCase();
    if (c0 === "name" && (c1.includes("canvas") || c1 === "canvas id"))
      continue;

    if (row.length < 4) {
      errors.push(`Row ${i + 1}: expected 4 columns`);
      continue;
    }

    const nameRaw = row[0];
    const canvasId = row[1];
    const sisUserId = row[2];
    const sisLoginId = row[3];

    const name = canonicalizeName(nameRaw);

    if (!name || !canvasId || !sisUserId || !sisLoginId) {
      errors.push(`Row ${i + 1}: empty field`);
      continue;
    }
    if (!isNumericId(canvasId)) {
      errors.push(`Row ${i + 1}: Canvas ID not numeric: ${canvasId}`);
      continue;
    }

    out.push({
      name: String(name).trim(),
      canvas_id: String(canvasId).trim(),
      sis_user_id: String(sisUserId).trim(),
      sis_login_id: String(sisLoginId).trim(),
    });
  }

  if (!out.length && !errors.length) {
    errors.push("No valid student rows found");
  }
  return { students: out, errors };
}

/***********************
 * Processor helpers (extensible key-value params)
 ***********************/
function normalizeProcessor(p) {
  const o = Object.assign({}, p || {});
  if (!o.type) o.type = "file";

  // Legacy migration: { type, file_index } -> { type, params: { file_index } }
  if (!o.params || typeof o.params !== "object" || Array.isArray(o.params)) {
    o.params = {};
  }
  if (o.file_index !== undefined && o.params.file_index === undefined) {
    o.params.file_index = o.file_index;
    delete o.file_index;
  }
  return o;
}

function getProcParam(proc, key, fallback) {
  const p = normalizeProcessor(proc);
  const v = p?.params ? p.params[key] : undefined;
  return v === undefined || v === null || v === "" ? fallback : v;
}

function processorSummary(proc) {
  const p = normalizeProcessor(proc);
  const type = String(p.type || "file").trim() || "file";
  if (type === "file") {
    const idx = Number(getProcParam(p, "file_index", 0));
    return `file (${Number.isFinite(idx) ? idx : 0})`;
  }
  return `${type}`;
}

/***********************
 * PrairieLearn API via GM_xmlhttpRequest (CORS-safe)
 ***********************/
function plRequestJson({ baseUrl, token, path }) {
  const url = baseUrl.replace(/\/+$/, "") + path;
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      headers: {
        "Private-Token": token,
        Accept: "application/json",
      },
      onload: (resp) => {
        if (resp.status < 200 || resp.status >= 300) {
          reject(
            new Error(
              `HTTP ${resp.status} ${resp.statusText}: ${
                resp.responseText?.slice?.(0, 300) || ""
              }`
            )
          );
          return;
        }
        try {
          resolve(JSON.parse(resp.responseText));
        } catch (e) {
          reject(new Error(`JSON parse failed: ${e?.message || e}`));
        }
      },
      onerror: () => reject(new Error("Network error")),
      ontimeout: () => reject(new Error("Timeout")),
      timeout: 30000,
    });
  });
}

/***********************
 * SpeedGrader DOM: current student name
 ***********************/
function getSpeedGraderDisplayedName() {
  const a = document.querySelector('[data-testid="selected-student"]');
  if (a && a.textContent) return a.textContent.trim();

  const spans = Array.from(document.querySelectorAll("span"));
  for (const s of spans) {
    if (s.getAttribute("data-testid") === "selected-student" && s.textContent)
      return s.textContent.trim();
  }
  return "";
}

function isSpeedGraderProbablyReady() {
  const sid = getQueryParam("student_id");
  const name = getSpeedGraderDisplayedName();
  return !!sid && !!name;
}

async function refreshWhenSpeedGraderReady(reason = "auto") {
  const started = Date.now();
  let delay = 250;
  while (Date.now() - started < 25000) {
    if (isSpeedGraderProbablyReady()) break;
    await sleep(delay);
    delay = Math.min(2000, Math.round(delay * 1.35));
  }
  setStatus(`UI refreshed (${reason})`, "muted");
  renderMain();
}

/***********************
 * UI Styles
 ***********************/
GM_addStyle(`
  #plcg-root {
    position: fixed;
    z-index: 2147483647;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
    background: rgba(20,20,24,0.90);
    color: #f3f4f6;
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    overflow: hidden;
    resize: both;
    min-width: 320px;
    min-height: 260px;
  }
  #plcg-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    cursor: move;
    user-select: none;
    background: rgba(255,255,255,0.06);
    border-bottom: 1px solid rgba(255,255,255,0.10);
  }
  #plcg-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2px;
  }
  #plcg-body {
    padding: 10px 12px 12px 12px;
    font-size: 12px;
    line-height: 1.35;
    overflow: auto;
    height: calc(100% - 44px);
  }
  .plcg-row { margin: 8px 0; }
  .plcg-muted { color: rgba(243,244,246,0.70); }
  .plcg-err { color: #fecaca; }
  .plcg-ok { color: #bbf7d0; }
  .plcg-btn {
    background: rgba(255,255,255,0.10);
    color: #f9fafb;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 10px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    margin-right: 6px;
  }
  .plcg-btn:hover { background: rgba(255,255,255,0.16); }
  .plcg-btn:disabled { background: rgba(255,255,255,0.06); }
  .plcg-kv {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 6px 10px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 10px;
  }
  .plcg-k { color: rgba(243,244,246,0.70); }
  .plcg-v { word-break: break-word; }
  #plcg-config-backdrop {
    position: fixed;
    z-index: 2147483647;
    left: 0; top: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.50);
    display: none;
    align-items: center;
    justify-content: center;
  }
  #plcg-config {
    width: min(920px, 92vw);
    height: min(780px, 92vh);
    background: rgba(20,20,24,0.96);
    color: #f3f4f6;
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 14px;
    box-shadow: 0 14px 44px rgba(0,0,0,0.45);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  #plcg-config-header {
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255,255,255,0.06);
    border-bottom: 1px solid rgba(255,255,255,0.10);
    font-weight: 700;
    font-size: 13px;
  }
  #plcg-config-body {
    padding: 12px 14px;
    overflow: auto;
    flex: 1;
    font-size: 12px;
  }
  .plcg-field {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 8px 10px;
    align-items: start;
    margin: 10px 0;
  }
  .plcg-field > div:first-child {
    white-space: normal;
    word-break: break-word;
    line-height: 1.25;
    color: rgba(243,244,246,0.86);
  }
  .plcg-field input, .plcg-field textarea, .plcg-field select {
    width: 100%;
    background: rgba(255,255,255,0.07);
    color: #f9fafb;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 10px;
    padding: 8px 10px;
    outline: none;
    font-size: 12px;
    box-sizing: border-box;
  }
  .plcg-field textarea { min-height: 140px; resize: vertical; }
  .plcg-help { color: rgba(243,244,246,0.70); margin-top: 6px; }
  .plcg-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 12px;
  }
  .plcg-table th, .plcg-table td {
    border: 1px solid rgba(255,255,255,0.12);
    padding: 8px 8px;
    vertical-align: top;
  }
  .plcg-table th { background: rgba(255,255,255,0.06); text-align: left; }
  .plcg-inline {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  }
  .plcg-mini-btn {
    background: rgba(255,255,255,0.08);
    color: rgba(249,250,251,0.92);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .plcg-mini-btn:hover { background: rgba(255,255,255,0.14); }

  .plcg-parser-row {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 6px;
  }
  .plcg-parser-refresh {
    width: 34px;
    min-width: 34px;
    padding: 6px 0;
    text-align: center;
    border-radius: 10px;
  }
  .plcg-parser-fetch {
    flex: 1;
    margin-right: 0;
  }

  /* Processor editor (in-config modal) */
  #plcg-proc-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.55);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 5;
  }
  #plcg-proc-modal {
    width: min(760px, 92%);
    height: min(560px, 92%);
    background: rgba(20,20,24,0.98);
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 14px;
    box-shadow: 0 14px 44px rgba(0,0,0,0.45);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  #plcg-proc-header {
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255,255,255,0.06);
    border-bottom: 1px solid rgba(255,255,255,0.10);
    font-weight: 700;
    font-size: 13px;
  }
  #plcg-proc-body {
    padding: 12px 14px;
    overflow: auto;
    flex: 1;
    font-size: 12px;
  }
  .plcg-kv-grid {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 8px;
    align-items: center;
  }
  .plcg-kv-grid input {
    width: 100%;
    background: rgba(255,255,255,0.07);
    color: #f9fafb;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 10px;
    padding: 8px 10px;
    outline: none;
    font-size: 12px;
    box-sizing: border-box;
  }
  `);

const uiState = loadUiState();
const root = el("div", {
  id: "plcg-root",
  style: {
    left: `${uiState.x}px`,
    top: `${uiState.y}px`,
    width: `${uiState.w}px`,
    height: `${uiState.h}px`,
  },
});

const headerBar = el("div", { id: "plcg-header" }, [
  el("div", { id: "plcg-title" }, ["PL Code Fetcher (SpeedGrader)"]),
  el("div", {}, [
    el(
      "button",
      {
        class: "plcg-btn",
        id: "plcg-ui-refresh",
        title: "Refresh SpeedGrader state",
      },
      ["↻"]
    ),
    el("button", { class: "plcg-btn", id: "plcg-config-open" }, ["Config"]),
  ]),
]);

const body = el("div", { id: "plcg-body" });

// Config modal
const cfgBackdrop = el("div", { id: "plcg-config-backdrop" });
const cfgModal = el("div", { id: "plcg-config" });
cfgBackdrop.appendChild(cfgModal);

/***********************
 * Runtime State
 ***********************/
let cfg = loadConfig();
let students = loadStudents();
let parsers = loadParsers();

// assessment_id -> { map: Map(user_uin -> assessment_instance_id), loadedAt: iso }
const aiCacheByAssessmentId = new Map();

let currentStudentId = null; // Canvas numeric student_id from URL
let currentStudentRecord = null;

let outputFileHandle = null; // session only
let lastWriteStatus = "No output file selected";

/***********************
 * File System Access
 ***********************/
async function pickOutputFile() {
  const openPicker =
    typeof unsafeWindow !== "undefined" && unsafeWindow?.showOpenFilePicker
      ? unsafeWindow.showOpenFilePicker.bind(unsafeWindow)
      : window.showOpenFilePicker?.bind(window);

  if (!openPicker) {
    lastWriteStatus = "File System Access API is not supported.";
    renderMain();
    return;
  }

  try {
    const [handle] = await openPicker({
      multiple: false,
      types: [
        {
          description: "Text",
          accept: { "text/plain": [".txt", ".md", ".log", ".c", ".cpp"] },
        },
      ],
      excludeAcceptAllOption: false,
    });
    outputFileHandle = handle;
    lastWriteStatus = "File selected (open picker).";
  } catch (e) {
    console.error("[PLCG] showOpenFilePicker failed:", e);
    lastWriteStatus = `Picker failed: ${e?.name || "Error"}${
      e?.message ? `: ${e.message}` : ""
    }`;
  }
  renderMain();
}

async function ensureFilePermission(handle) {
  if (!handle) return false;
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const q = await handle.queryPermission({ mode: "readwrite" });
  if (q === "granted") return true;
  const r = await handle.requestPermission({ mode: "readwrite" });
  return r === "granted";
}

async function writeTextToFile(text) {
  if (!outputFileHandle) throw new Error("No output file selected");
  const ok = await ensureFilePermission(outputFileHandle);
  if (!ok) throw new Error("Permission not granted for the output file");
  const writable = await outputFileHandle.createWritable();
  await writable.write(text);
  await writable.close();
  lastWriteStatus = `Write OK: ${new Date().toLocaleString()}`;
}

/***********************
 * Per-assessment instance cache
 ***********************/
function getAiCache(assessmentId) {
  const aid = String(assessmentId || "").trim();
  if (!aid) return { map: new Map(), loadedAt: null };
  if (aiCacheByAssessmentId.has(aid)) return aiCacheByAssessmentId.get(aid);

  const courseId = String(cfg.courseInstanceId || "").trim();
  if (!courseId) {
    const empty = { map: new Map(), loadedAt: null };
    aiCacheByAssessmentId.set(aid, empty);
    return empty;
  }

  const raw = localStorage.getItem(LS.AI_CACHE(courseId, aid));
  if (raw) {
    const obj = safeJsonParse(raw, null);
    if (obj?.pairs && Array.isArray(obj.pairs)) {
      const cached = {
        map: new Map(obj.pairs),
        loadedAt: obj.loadedAt || null,
      };
      aiCacheByAssessmentId.set(aid, cached);
      return cached;
    }
  }

  const fresh = { map: new Map(), loadedAt: null };
  aiCacheByAssessmentId.set(aid, fresh);
  return fresh;
}

function setAiCache(assessmentId, map, loadedAt) {
  const aid = String(assessmentId || "").trim();
  if (!aid) return;
  const entry = { map, loadedAt };
  aiCacheByAssessmentId.set(aid, entry);

  const courseId = String(cfg.courseInstanceId || "").trim();
  if (!courseId) return;

  localStorage.setItem(
    LS.AI_CACHE(courseId, aid),
    JSON.stringify({
      loadedAt,
      pairs: Array.from(map.entries()),
    })
  );
}

function configReadyErrorsBase() {
  const errs = [];
  if (!cfg.plBaseUrl) errs.push("PrairieLearn Base URL is not set");
  if (!cfg.apiKey) errs.push("PrairieLearn API Key is not set");
  if (!cfg.courseInstanceId) errs.push("Course Instance ID is not set");
  return errs;
}

function configReadyErrorsForAssessment(assessmentId) {
  const errs = configReadyErrorsBase();
  if (!String(assessmentId || "").trim())
    errs.push("Assessment ID is not set for this parser");
  return errs;
}

async function refreshAssessmentInstancesFor(assessmentId) {
  const aid = String(assessmentId || "").trim();
  const errs = configReadyErrorsForAssessment(aid);
  if (errs.length) {
    setStatus(`Cannot refresh: ${errs.join("; ")}`, "err");
    renderMain();
    return;
  }

  setStatus(`Refreshing instances (assessment_id=${aid})...`, "muted");
  renderMain();

  try {
    const path = `/pl/api/v1/course_instances/${encodeURIComponent(
      cfg.courseInstanceId
    )}/assessments/${encodeURIComponent(aid)}/assessment_instances`;
    const data = await plRequestJson({
      baseUrl: cfg.plBaseUrl,
      token: cfg.apiKey,
      path,
    });
    const map = new Map();
    for (const it of data || []) {
      if (!it) continue;
      const uin = String(it.user_uin ?? "").trim();
      const ai = String(it.assessment_instance_id ?? "").trim();
      if (uin && ai) map.set(uin, ai);
    }

    const loadedAt = nowIso();
    setAiCache(aid, map, loadedAt);

    setStatus(`Loaded ${map.size} instances (assessment_id=${aid}).`, "ok");
  } catch (e) {
    setStatus(`Refresh failed: ${e.message || e}`, "err");
  }
  renderMain();
}

/***********************
 * PrairieLearn Operations
 ***********************/
async function fetchSubmissions(assessmentInstanceId) {
  const path = `/pl/api/v1/course_instances/${encodeURIComponent(
    cfg.courseInstanceId
  )}/assessment_instances/${encodeURIComponent(
    assessmentInstanceId
  )}/submissions`;
  return await plRequestJson({
    baseUrl: cfg.plBaseUrl,
    token: cfg.apiKey,
    path,
  });
}

function selectSubmission(submissions, parser) {
  const qid = String(parser.question_id ?? "").trim();
  const hits = (submissions || []).filter(
    (s) => String(s.question_id ?? "").trim() === qid
  );
  if (!hits.length) return { error: `No submission for question_id=${qid}` };

  if ((parser.multi_submissions || "latest") !== "latest") {
    return {
      error: `multi_submissions=${parser.multi_submissions} is not supported (only 'latest')`,
    };
  }

  let best = hits[0];
  let bestT = Date.parse(best.date || "") || 0;
  for (const h of hits) {
    const t = Date.parse(h.date || "") || 0;
    if (t >= bestT) {
      best = h;
      bestT = t;
    }
  }
  return { submission: best, candidates: hits.length };
}

function processFileSubmission(submission, processor) {
  if (
    !submission?.submitted_answer?._files ||
    !Array.isArray(submission.submitted_answer._files)
  ) {
    return {
      error: "submitted_answer._files missing (not a file-upload question?)",
    };
  }

  const proc = normalizeProcessor(processor);
  if ((proc?.type || "") !== "file")
    return { error: `processor.type=${proc?.type} not supported` };

  const idx = Number(getProcParam(proc, "file_index", 0));
  const files = submission.submitted_answer._files;
  if (!Number.isFinite(idx) || idx < 0 || idx >= files.length) {
    return {
      error: `file_index=${idx} out of range (files=${files.length})`,
    };
  }
  const f = files[idx];
  const name = f?.name ?? `file_${idx}`;
  const contentsB64 = f?.contents ?? "";
  if (!contentsB64) return { error: "File contents empty" };

  let text = "";
  try {
    text = base64ToUtf8(contentsB64);
  } catch (e) {
    return { error: `Base64 decode failed: ${e?.message || e}` };
  }
  return { text, fileName: name };
}

/***********************
 * Student Matching (identity only)
 ***********************/
function resolveStudentIdentity() {
  const stList = Array.isArray(students) ? students : [];
  students = stList;

  const sid = getQueryParam("student_id");
  currentStudentId = sid ? String(sid).trim() : null;

  const uiName = getSpeedGraderDisplayedName();

  currentStudentRecord = null;

  if (!currentStudentId) {
    return { ok: false, errors: ["student_id not found in URL"], uiName };
  }

  const rec = stList.find(
    (s) => String(s?.canvas_id ?? "") === currentStudentId
  );
  if (!rec) {
    return {
      ok: false,
      errors: [`Canvas ID=${currentStudentId} not found in CSV`],
      uiName,
    };
  }

  const dbName = rec.name ?? "";
  if (uiName && !namesMatch(uiName, dbName)) {
    return {
      ok: false,
      errors: ["Name mismatch", `UI: ${uiName}`, `CSV: ${dbName}`],
      uiName,
      rec,
    };
  }

  const userUin = String(rec.sis_login_id ?? "").trim();
  if (!userUin) {
    return {
      ok: false,
      errors: ["Empty SIS Login ID (used as PrairieLearn user_uin)"],
      uiName,
      rec,
    };
  }

  currentStudentRecord = rec;
  return { ok: true, uiName, rec, userUin };
}

/***********************
 * Output header formatter (C/C++ block comment)
 ***********************/
function buildOutputHeaderBlock({ rec, aid, ai, parser, picked, proc }) {
  const lines = [
    "PrairieLearn Submission Export",
    `Time: ${new Date().toLocaleString()}`,
    `Student: ${rec.name}`,
    `Canvas ID: ${rec.canvas_id}`,
    `SIS User ID: ${rec.sis_user_id}`,
    `SIS Login ID (user_uin): ${rec.sis_login_id}`,
    `assessment_id: ${aid}`,
    `assessment_instance_id: ${ai}`,
    `question_id: ${parser.question_id}`,
    `selected_submission_id: ${picked.submission.submission_id} (candidates=${picked.candidates}, strategy=latest)`,
    `submission_date: ${picked.submission.date || ""}`,
    `file: ${proc.fileName}`,
  ];

  return "/**\n" + lines.map((l) => ` * ${l}`).join("\n") + "\n */\n\n";
}

/***********************
 * Main action: Fetch Answer
 ***********************/
async function onClickFetch(parser, index) {
  const identity = resolveStudentIdentity();
  if (!identity.ok) {
    setStatus(`Cannot fetch: ${identity.errors.join("; ")}`, "err");
    renderMain();
    return;
  }

  const aid = String(parser?.assessment_id ?? "").trim();
  const cfgErrs = configReadyErrorsForAssessment(aid);
  if (cfgErrs.length) {
    setStatus(`Cannot fetch: ${cfgErrs.join("; ")}`, "err");
    renderMain();
    return;
  }

  if (!outputFileHandle) {
    setStatus("No output file selected", "err");
    renderMain();
    return;
  }

  const cache = getAiCache(aid);
  const ai = cache.map.get(identity.userUin);
  if (!ai) {
    setStatus(
      `No instance for user_uin=${identity.userUin} (assessment_id=${aid})`,
      "err"
    );
    renderMain();
    return;
  }

  const qid = String(parser?.question_id ?? "").trim();
  setStatus(`Fetching ${qid || `#${index + 1}`}...`, "muted");
  renderMain();

  try {
    const submissions = await fetchSubmissions(ai);
    const picked = selectSubmission(submissions, parser);
    if (picked.error) throw new Error(picked.error);

    const proc = processFileSubmission(picked.submission, parser.processor);
    if (proc.error) throw new Error(proc.error);

    const rec = identity.rec;

    const headerBlock = cfg.includeOutputHeader
      ? buildOutputHeaderBlock({
          rec,
          aid,
          ai,
          parser,
          picked,
          proc,
        })
      : "";

    const outText = headerBlock + proc.text + "\n";
    await writeTextToFile(outText);

    setStatus(`Done: wrote ${proc.fileName}`, "ok");
  } catch (e) {
    setStatus(`Failed: ${e.message || e}`, "err");
  }
  renderMain();
}

/***********************
 * Status + Rendering
 ***********************/
let statusText = "";
let statusKind = "muted"; // muted | ok | err
function setStatus(t, kind = "muted") {
  statusText = String(t || "");
  statusKind = kind;
}

function renderMain() {
  try {
    body.innerHTML = "";

    if (!Array.isArray(students)) students = [];
    if (!Array.isArray(parsers)) parsers = [];

    const fileName = outputFileHandle?.name || "not selected";
    const rowFile = el("div", { class: "plcg-row" }, [
      el("div", { class: "plcg-inline" }, [
        el("span", { class: "plcg-muted" }, [`Output file: ${fileName}`]),
        el("button", { class: "plcg-btn", onclick: pickOutputFile }, [
          "Choose file",
        ]),
      ]),
      el("div", { class: "plcg-muted", style: { marginTop: "6px" } }, [
        `${lastWriteStatus}`,
      ]),
    ]);

    const identity = resolveStudentIdentity();
    const kv = el("div", { class: "plcg-kv plcg-row" });

    const putKV = (k, v, vClass = "") => {
      kv.appendChild(el("div", { class: "plcg-k" }, [k]));
      kv.appendChild(el("div", { class: `plcg-v ${vClass}`.trim() }, [v]));
    };

    const uiName = getSpeedGraderDisplayedName() || "(unavailable)";
    putKV("Name", uiName, "");

    if (identity.ok) {
      const rec = identity.rec;
      putKV("CSV Name", rec.name || "", "plcg-ok");
      putKV("Canvas ID", String(rec.canvas_id || ""), "plcg-ok");
      putKV("SIS User ID", String(rec.sis_user_id || ""), "plcg-ok");
      putKV("SIS Login ID", String(rec.sis_login_id || ""), "plcg-ok");
    } else {
      putKV("Error", identity.errors.join("; "), "plcg-err");
      if (identity.rec) {
        const rec = identity.rec;
        putKV("CSV Name", rec.name || "", "plcg-muted");
        putKV("Canvas ID", String(rec.canvas_id || ""), "plcg-muted");
        putKV("SIS User ID", String(rec.sis_user_id || ""), "plcg-muted");
        putKV("SIS Login ID", String(rec.sis_login_id || ""), "plcg-muted");
      } else {
        putKV(
          "Canvas student_id",
          String(currentStudentId || ""),
          "plcg-muted"
        );
      }
    }

    const parsersBlock = el("div", { class: "plcg-row" }, [
      el("div", { class: "plcg-muted", style: { marginBottom: "6px" } }, [
        "Parsers:",
      ]),
    ]);

    const baseCfgErrs = configReadyErrorsBase();

    if (!parsers.length) {
      parsersBlock.appendChild(
        el("div", { class: "plcg-muted" }, [
          '(No parsers. Open "Config" to add.)',
        ])
      );
    } else {
      parsers.forEach((p, i) => {
        const qid = String(p?.question_id ?? "").trim();
        const aid = String(p?.assessment_id ?? "").trim();

        const cache = getAiCache(aid);
        const loadedCount = cache?.map?.size || 0;
        const loadedAtText = formatLoadedAt(cache?.loadedAt);

        const label = qid
          ? `Fetch ${qid} (${loadedCount})`
          : `Fetch #${i + 1} (${loadedCount})`;

        const row = el("div", { class: "plcg-parser-row" });

        const refreshBtn = el(
          "button",
          {
            class: "plcg-btn plcg-parser-refresh",
            onclick: () => refreshAssessmentInstancesFor(aid),
            title: aid
              ? `Refresh instances (assessment_id=${aid})\nLast: ${loadedAtText}`
              : "Refresh instances (missing assessment_id)",
          },
          ["↻"]
        );

        let canFetch = true;
        const reasons = [];

        if (!identity.ok) {
          canFetch = false;
          reasons.push("student info / matching error");
        }
        if (!outputFileHandle) {
          canFetch = false;
          reasons.push("no output file selected");
        }
        if (baseCfgErrs.length) {
          canFetch = false;
          reasons.push("incomplete configuration");
        }
        if (!aid) {
          canFetch = false;
          reasons.push("missing assessment_id");
        }

        let instanceId = null;
        if (canFetch && identity.ok && aid) {
          instanceId = cache.map.get(identity.userUin) || null;
          if (!instanceId) {
            canFetch = false;
            reasons.push(`no instance for user_uin`);
          }
        }

        const fetchTitleLines = [];
        if (aid) fetchTitleLines.push(`assessment_id=${aid}`);
        fetchTitleLines.push(`instances=${loadedCount}`);
        fetchTitleLines.push(`loaded_at=${loadedAtText}`);
        if (identity.ok) fetchTitleLines.push(`user_uin=${identity.userUin}`);
        if (instanceId)
          fetchTitleLines.push(`assessment_instance_id=${instanceId}`);
        if (!canFetch && reasons.length)
          fetchTitleLines.push(`disabled: ${reasons.join("; ")}`);

        const fetchBtn = el(
          "button",
          {
            class: "plcg-btn plcg-parser-fetch",
            onclick: () => onClickFetch(p, i),
            title: fetchTitleLines.join("\n"),
          },
          [label]
        );

        setBtnDisabled(fetchBtn, !canFetch);

        row.appendChild(refreshBtn);
        row.appendChild(fetchBtn);

        parsersBlock.appendChild(row);

        if (
          identity.ok &&
          outputFileHandle &&
          !baseCfgErrs.length &&
          aid &&
          !instanceId
        ) {
          parsersBlock.appendChild(
            el(
              "div",
              { class: "plcg-err", style: { margin: "2px 0 8px 40px" } },
              [`Err: no instance for user_uin (assessment_id=${aid})`]
            )
          );
        }
      });
    }

    const footer = el("div", {
      class: "plcg-row",
      style: { marginTop: "10px" },
    });

    const globalDisableReasons = [];
    if (!identity.ok)
      globalDisableReasons.push("student info / matching error");
    if (!outputFileHandle) globalDisableReasons.push("no output file selected");
    if (baseCfgErrs.length)
      globalDisableReasons.push("incomplete configuration");

    if (globalDisableReasons.length) {
      footer.appendChild(
        el("div", { class: "plcg-err" }, [
          `Err: ${globalDisableReasons.join("; ")}`,
        ])
      );
    }

    if (statusText) {
      const statusClass =
        statusKind === "ok"
          ? "plcg-ok"
          : statusKind === "err"
          ? "plcg-err"
          : "plcg-muted";
      footer.appendChild(
        el(
          "div",
          {
            class: statusClass,
            style: { marginTop: globalDisableReasons.length ? "6px" : "0" },
          },
          [statusText]
        )
      );
    }

    body.appendChild(rowFile);
    body.appendChild(kv);
    body.appendChild(parsersBlock);
    body.appendChild(footer);
  } catch (e) {
    body.innerHTML = "";
    const msg = e && (e.stack || e.message) ? e.stack || e.message : String(e);
    body.appendChild(
      el("div", { class: "plcg-row plcg-err" }, ["UI render error (caught):"])
    );
    body.appendChild(
      el(
        "pre",
        {
          style: {
            whiteSpace: "pre-wrap",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "10px",
            padding: "10px",
            margin: "8px 0",
            maxHeight: "240px",
            overflow: "auto",
          },
        },
        [msg]
      )
    );
  }
}

/***********************
 * Legacy migration: global assessmentId -> per-parser assessment_id
 ***********************/
function migrateLegacyAssessmentIdIfNeeded() {
  const rawCfg = loadConfigRaw();
  const legacyAssessmentId = String(rawCfg?.assessmentId ?? "").trim();
  if (!legacyAssessmentId) return;

  const ps = loadParsers();
  let changed = false;
  for (const p of ps) {
    if (!p) continue;
    if (!String(p.assessment_id || "").trim()) {
      p.assessment_id = legacyAssessmentId;
      changed = true;
    }
  }
  if (changed) saveParsers(ps);

  const cleaned = Object.assign({}, rawCfg);
  delete cleaned.assessmentId;
  localStorage.setItem(LS.CONFIG, JSON.stringify(cleaned));
}

/***********************
 * Config Modal + Processor Editor (in-page)
 ***********************/
let procBackdrop = null;
let procModal = null;
let procEditingIndex = null;

function ensureProcessorEditorUi() {
  if (procBackdrop && procModal) return;

  procBackdrop = el("div", { id: "plcg-proc-backdrop" });
  procModal = el("div", { id: "plcg-proc-modal" });
  procBackdrop.appendChild(procModal);

  procBackdrop.addEventListener("click", (e) => {
    if (e.target === procBackdrop) closeProcessorEditor();
  });

  cfgModal.appendChild(procBackdrop);
}

function closeProcessorEditor() {
  if (!procBackdrop) return;
  procBackdrop.style.display = "none";
  procModal.innerHTML = "";
  procEditingIndex = null;
}

function openProcessorEditor(parserIndex, onSaved) {
  ensureProcessorEditorUi();

  procEditingIndex = parserIndex;
  const p = parsers?.[parserIndex];
  if (!p) return;

  const current = normalizeProcessor(p.processor);

  const typeInput = el("input", {
    value: String(current.type || "").trim() || "file",
    placeholder: "type",
  });

  // Convert params object -> editable rows
  const rows = [];
  const params =
    current.params && typeof current.params === "object" ? current.params : {};
  for (const [k, v] of Object.entries(params)) {
    rows.push({ key: String(k), value: String(v ?? "") });
  }
  if (!rows.length) rows.push({ key: "", value: "" });

  const rowsContainer = el("div", { style: { marginTop: "10px" } });

  function renderRows() {
    rowsContainer.innerHTML = "";

    const header = el(
      "div",
      { class: "plcg-kv-grid", style: { marginBottom: "8px" } },
      [
        el("div", { class: "plcg-muted" }, ["key"]),
        el("div", { class: "plcg-muted" }, ["value"]),
        el("div", { class: "plcg-muted", style: { textAlign: "right" } }, [""]),
      ]
    );
    rowsContainer.appendChild(header);

    rows.forEach((r, idx) => {
      const keyInput = el("input", { value: r.key, placeholder: "key" });
      const valInput = el("input", { value: r.value, placeholder: "value" });

      keyInput.addEventListener("input", () => {
        r.key = String(keyInput.value || "");
      });
      valInput.addEventListener("input", () => {
        r.value = String(valInput.value || "");
      });

      const delBtn = el(
        "button",
        {
          class: "plcg-mini-btn",
          onclick: () => {
            rows.splice(idx, 1);
            if (!rows.length) rows.push({ key: "", value: "" });
            renderRows();
          },
          title: "Delete",
        },
        ["Del"]
      );

      const line = el(
        "div",
        { class: "plcg-kv-grid", style: { marginBottom: "8px" } },
        [
          keyInput,
          valInput,
          el("div", { style: { textAlign: "right" } }, [delBtn]),
        ]
      );

      rowsContainer.appendChild(line);
    });

    const addBtn = el(
      "button",
      {
        class: "plcg-btn",
        onclick: () => {
          rows.push({ key: "", value: "" });
          renderRows();
        },
      },
      ["Add"]
    );

    rowsContainer.appendChild(
      el("div", { style: { marginTop: "10px" } }, [addBtn])
    );
  }

  renderRows();

  function collectProcessor() {
    const type = String(typeInput.value || "").trim() || "file";
    const obj = {};
    for (const r of rows) {
      const k = String(r.key || "").trim();
      if (!k) continue;
      obj[k] = String(r.value ?? "");
    }
    return { type, params: obj };
  }

  const header = el("div", { id: "plcg-proc-header" }, [
    el("div", {}, [`Processor (#${parserIndex + 1})`]),
    el("div", {}, [
      el("button", { class: "plcg-btn", onclick: closeProcessorEditor }, [
        "Close",
      ]),
    ]),
  ]);

  const body = el("div", { id: "plcg-proc-body" }, [
    el("div", { class: "plcg-field" }, [
      el("div", {}, ["type"]),
      el("div", {}, [typeInput]),
    ]),
    rowsContainer,
    el("div", { class: "plcg-inline", style: { marginTop: "12px" } }, [
      el(
        "button",
        {
          class: "plcg-btn",
          onclick: () => {
            const next = collectProcessor();
            if (!Array.isArray(parsers) || !parsers[parserIndex]) return;
            parsers[parserIndex].processor = next;
            if (typeof onSaved === "function") onSaved(next);
            closeProcessorEditor();
          },
        },
        ["Save"]
      ),
      el("button", { class: "plcg-btn", onclick: closeProcessorEditor }, [
        "Cancel",
      ]),
    ]),
  ]);

  procModal.innerHTML = "";
  procModal.appendChild(header);
  procModal.appendChild(body);

  procBackdrop.style.display = "flex";
}

function renderConfigModal() {
  cfg = loadConfig();
  students = loadStudents();
  parsers = loadParsers();

  // Normalize parsers and processors
  parsers = (parsers || []).map((p) => {
    const o = Object.assign({}, p || {});
    o.question_id = String(o.question_id ?? "").trim();
    o.assessment_id = String(o.assessment_id ?? "").trim();
    o.multi_submissions = String(o.multi_submissions ?? "latest");
    o.processor = normalizeProcessor(
      o.processor || { type: "file", params: { file_index: 0 } }
    );
    return o;
  });

  cfgModal.innerHTML = "";
  ensureProcessorEditorUi();

  const close = () => {
    cfgBackdrop.style.display = "none";
    closeProcessorEditor();
    renderMain();
  };

  const cfgHeader = el("div", { id: "plcg-config-header" }, [
    el("div", {}, ["Configuration"]),
    el("div", {}, [
      el("button", { class: "plcg-btn", onclick: close }, ["Close"]),
    ]),
  ]);

  const cfgBody = el("div", { id: "plcg-config-body" });

  const baseUrlInput = el("input", {
    value: cfg.plBaseUrl || "",
    placeholder: "https://us.prairielearn.com",
  });
  const apiKeyInput = el("input", {
    value: cfg.apiKey || "",
    placeholder: "Personal Access Token",
    type: "password",
  });
  const courseInput = el("input", {
    value: cfg.courseInstanceId || "",
    placeholder: "e.g. 29832",
  });

  const includeHeaderCheckbox = el("input", {
    type: "checkbox",
  });
  includeHeaderCheckbox.checked = !!cfg.includeOutputHeader;

  cfgBody.appendChild(
    el("div", { class: "plcg-field" }, [
      el("div", {}, ["PrairieLearn Base URL"]),
      el("div", {}, [baseUrlInput]),
    ])
  );

  cfgBody.appendChild(
    el("div", { class: "plcg-field" }, [
      el("div", {}, ["PrairieLearn API Key"]),
      el("div", {}, [apiKeyInput]),
    ])
  );

  cfgBody.appendChild(
    el("div", { class: "plcg-field" }, [
      el("div", {}, ["Course Instance ID"]),
      el("div", {}, [courseInput]),
    ])
  );

  cfgBody.appendChild(
    el("div", { class: "plcg-field" }, [
      el("div", {}, ["Include output header"]),
      el("div", {}, [
        el("div", { class: "plcg-inline" }, [
          includeHeaderCheckbox,
          el("span", { class: "plcg-muted" }, [
            "Write a C/C++ block comment header",
          ]),
        ]),
      ]),
    ])
  );

  // Students import
  const studentTa = el("textarea", {
    placeholder:
      "Paste Canvas Gradebook CSV export (must include columns: Student, ID, SIS User ID, SIS Login ID)\n\nOr paste 4-column CSV:\nName,Canvas ID,SIS User ID,SIS Login ID",
  });

  const importBtn = el(
    "button",
    {
      class: "plcg-btn",
      onclick: () => {
        const raw = studentTa.value || "";
        const { students: parsed, errors } = parseStudentsFromCsv(raw);

        if (errors.length) {
          alert(`Import failed:\n- ${errors.join("\n- ")}`);
          return;
        }
        saveStudents(parsed);
        students = parsed;
        alert(
          `Import OK: ${students.length} entries (overwrote previous data)`
        );
        renderConfigModal();
      },
    },
    ["Import & overwrite"]
  );

  cfgBody.appendChild(
    el("div", { class: "plcg-field" }, [
      el("div", {}, ["Import students (CSV)"]),
      el("div", {}, [
        studentTa,
        el("div", { class: "plcg-inline", style: { marginTop: "8px" } }, [
          importBtn,
        ]),
        el("div", { class: "plcg-help" }, [
          `Saved: ${students.length} entries`,
        ]),
      ]),
    ])
  );

  // Parsers editor
  const parsersContainer = el("div", {});
  function renderParsersEditor() {
    parsersContainer.innerHTML = "";

    const table = el("table", { class: "plcg-table" });
    const thead = el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["#"]),
        el("th", {}, ["question_id"]),
        el("th", {}, ["assessment_id"]),
        el("th", {}, ["multi_submissions"]),
        el("th", {}, ["processor"]),
      ]),
    ]);
    const tbody = el("tbody");

    (parsers || []).forEach((p, idx) => {
      const qInput = el("input", {
        value: p.question_id ?? "",
        placeholder: "e.g. 9270541",
      });
      const aInput = el("input", {
        value: p.assessment_id ?? "",
        placeholder: "e.g. 2630582",
      });

      const multiSel = el("select", {}, [
        el("option", { value: "latest" }, ["latest"]),
      ]);
      multiSel.value = p.multi_submissions || "latest";

      const procBtn = el(
        "button",
        {
          class: "plcg-mini-btn",
          onclick: () =>
            openProcessorEditor(idx, () => {
              renderParsersEditor();
            }),
          title: "Edit",
        },
        [processorSummary(p.processor)]
      );

      const delBtn = el(
        "button",
        {
          class: "plcg-mini-btn",
          onclick: () => {
            parsers.splice(idx, 1);
            renderParsersEditor();
          },
          style: { marginLeft: "8px" },
          title: "Delete",
        },
        ["Del"]
      );

      const indexCell = el("td", {}, [
        el("span", {}, [String(idx + 1)]),
        delBtn,
      ]);

      const tr = el("tr", {}, [
        indexCell,
        el("td", {}, [qInput]),
        el("td", {}, [aInput]),
        el("td", {}, [multiSel]),
        el("td", {}, [procBtn]),
      ]);

      const sync = () => {
        p.question_id = String(qInput.value || "").trim();
        p.assessment_id = String(aInput.value || "").trim();
        p.multi_submissions = String(multiSel.value || "latest");
        p.processor = normalizeProcessor(
          p.processor || { type: "file", params: { file_index: 0 } }
        );
      };
      qInput.addEventListener("input", sync);
      aInput.addEventListener("input", sync);
      multiSel.addEventListener("change", sync);

      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);

    const addBtn = el(
      "button",
      {
        class: "plcg-btn",
        onclick: () => {
          parsers.push({
            question_id: "",
            assessment_id: "",
            multi_submissions: "latest",
            processor: { type: "file", params: { file_index: 0 } },
          });
          renderParsersEditor();
        },
      },
      ["Add parser"]
    );

    parsersContainer.appendChild(el("div", { class: "plcg-inline" }, [addBtn]));
    parsersContainer.appendChild(table);
  }
  renderParsersEditor();

  cfgBody.appendChild(
    el("div", { class: "plcg-field" }, [
      el("div", {}, ["Parser configuration"]),
      el("div", {}, [parsersContainer]),
    ])
  );

  // Save buttons
  const saveBtn = el(
    "button",
    {
      class: "plcg-btn",
      onclick: () => {
        const newCfg = {
          plBaseUrl: String(baseUrlInput.value || "").trim(),
          apiKey: String(apiKeyInput.value || "").trim(),
          courseInstanceId: String(courseInput.value || "").trim(),
          includeOutputHeader: !!includeHeaderCheckbox.checked,
        };

        const errs = [];
        if (!newCfg.plBaseUrl) errs.push("PrairieLearn Base URL is empty");
        if (!/^https?:\/\//i.test(newCfg.plBaseUrl))
          errs.push("PrairieLearn Base URL must start with http(s)://");
        if (!newCfg.apiKey) errs.push("API Key is empty");
        if (!newCfg.courseInstanceId) errs.push("Course Instance ID is empty");

        const pErrs = [];
        (parsers || []).forEach((p, i) => {
          if (!String(p.question_id || "").trim())
            pErrs.push(`Parser #${i + 1}: question_id empty`);
          if (!String(p.assessment_id || "").trim())
            pErrs.push(`Parser #${i + 1}: assessment_id empty`);
          if ((p.multi_submissions || "latest") !== "latest")
            pErrs.push(
              `Parser #${i + 1}: only multi_submissions=latest supported`
            );
          p.processor = normalizeProcessor(p.processor || {});
          if (!String(p.processor.type || "").trim())
            pErrs.push(`Parser #${i + 1}: processor.type empty`);
        });

        if (errs.length || pErrs.length) {
          alert(`Save failed:\n- ${errs.concat(pErrs).join("\n- ")}`);
          return;
        }

        saveConfig(newCfg);
        saveParsers(parsers);

        cfg = newCfg;
        aiCacheByAssessmentId.clear();

        alert("Saved");
        close();
      },
    },
    ["Save"]
  );

  const rowBtns = el(
    "div",
    { class: "plcg-inline", style: { marginTop: "14px" } },
    [saveBtn, el("button", { class: "plcg-btn", onclick: close }, ["Close"])]
  );

  cfgBody.appendChild(rowBtns);

  cfgModal.appendChild(cfgHeader);
  cfgModal.appendChild(cfgBody);
}

/***********************
 * Dragging + Persist size/pos
 ***********************/
function attachDrag() {
  let dragging = false;
  let startX = 0,
    startY = 0;
  let startLeft = 0,
    startTop = 0;

  headerBar.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = root.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    root.style.left = `${Math.max(0, startLeft + dx)}px`;
    root.style.top = `${Math.max(0, startTop + dy)}px`;
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    persistUiState();
  });

  const ro = new ResizeObserver(() => {
    if (attachDrag._t) cancelAnimationFrame(attachDrag._t);
    attachDrag._t = requestAnimationFrame(persistUiState);
  });
  ro.observe(root);

  function persistUiState() {
    const rect = root.getBoundingClientRect();
    saveUiState({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    });
  }
}

/***********************
 * Detect URL student_id changes (SpeedGrader switches students via SPA)
 ***********************/
function hookHistory() {
  const _push = history.pushState;
  const _rep = history.replaceState;
  const emit = () => window.dispatchEvent(new Event("plcg:locationchange"));
  history.pushState = function () {
    const r = _push.apply(this, arguments);
    emit();
    return r;
  };
  history.replaceState = function () {
    const r = _rep.apply(this, arguments);
    emit();
    return r;
  };
  window.addEventListener("popstate", emit);
}

function startStudentWatcher() {
  let last = null;

  const check = async () => {
    try {
      const sid = getQueryParam("student_id");
      if (sid !== last) {
        last = sid;
        await sleep(200);
        renderMain();
      }
    } catch (e) {
      setStatus(`Watcher error: ${e.message || e}`, "err");
      renderMain();
    }
  };

  window.addEventListener("plcg:locationchange", check);
  setInterval(check, 600);
  check();
}

/***********************
 * SpeedGrader late-mount watcher
 ***********************/
function startSpeedGraderMountObserver() {
  let lastName = "";
  const mo = new MutationObserver(() => {
    const nm = getSpeedGraderDisplayedName();
    if (nm && nm !== lastName) {
      lastName = nm;
      renderMain();
    }
  });
  try {
    mo.observe(document.body, { childList: true, subtree: true });
  } catch {
    // ignore
  }
}

/***********************
 * Boot
 ***********************/
function boot() {
  migrateLegacyAssessmentIdIfNeeded();

  document.body.appendChild(root);
  document.body.appendChild(cfgBackdrop);
  root.appendChild(headerBar);
  root.appendChild(body);

  document.getElementById("plcg-config-open").addEventListener("click", () => {
    cfgBackdrop.style.display = "flex";
    renderConfigModal();
  });

  document.getElementById("plcg-ui-refresh").addEventListener("click", () => {
    refreshWhenSpeedGraderReady("manual");
  });

  cfgBackdrop.addEventListener("click", (e) => {
    if (e.target === cfgBackdrop) cfgBackdrop.style.display = "none";
  });

  attachDrag();
  hookHistory();
  startStudentWatcher();
  startSpeedGraderMountObserver();

  window.addEventListener("load", () =>
    refreshWhenSpeedGraderReady("window-load")
  );
  refreshWhenSpeedGraderReady("startup");

  setStatus("Ready.", "muted");
  renderMain();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
