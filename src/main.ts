import styles from "./assets/styles.css?inline";
import { gmAddStyle } from "./platform/gm";
import {
  clearAssessmentInstanceCache,
  loadAssessmentInstanceCache,
  loadConfig,
  loadConfigRaw,
  loadParsers,
  loadStudents,
  loadUiState,
  LS,
  saveAssessmentInstanceCache,
  saveConfig,
  saveParsers,
  saveStudents,
  saveUiState,
} from "./core/storage";
import type {
  AssessmentInstanceCache,
  Config,
  ParserConfig,
  PrairieLearnSubmission,
  ProcessorRunResult,
  Student,
  UiState,
} from "./core/types";
import { nowIso, sleep } from "./core/time";
import { getQueryParam } from "./core/utils";
import { namesMatch } from "./core/nameMatch";
import { fetchAssessmentInstances, fetchSubmissions } from "./pl/api";
import { normalizeProcessorConfig, runProcessor } from "./pl/processors";
import { hookHistory, onLocationChange } from "./canvas/navigation";
import { getSpeedGraderDisplayedName, isSpeedGraderReady, watchSpeedGraderName } from "./canvas/dom";
import { Panel, type IdentityState, type PanelRenderState } from "./ui/panel";
import { createConfigModal, type ConfigModalSnapshot } from "./ui/configModal";
import { fileName, OutputFileHandle, pickOutputFile, writeTextFile } from "./platform/fs";

// Inject styles early
gmAddStyle(styles);

let config: Config = loadConfig();
let students: Student[] = loadStudents();
let parsers: ParserConfig[] = loadParsers().map((p) => ({ ...p, processor: normalizeProcessorConfig(p.processor) }));
let uiState: UiState = loadUiState();
let outputFileHandle: OutputFileHandle = null;
let lastWriteStatus = "No output file selected";
let statusText = "";
let statusKind: PanelRenderState["statusKind"] = "muted";

const aiCacheByAssessmentId = new Map<string, AssessmentInstanceCache>();

function migrateLegacyAssessmentId(): void {
  const raw = loadConfigRaw();
  const legacy = String((raw as Record<string, unknown>)?.assessmentId ?? "").trim();
  if (!legacy) return;
  const ps = loadParsers();
  let changed = false;
  ps.forEach((p) => {
    if (!p.assessmentId) {
      p.assessmentId = legacy;
      changed = true;
    }
  });
  if (changed) saveParsers(ps);
  const cleaned = { ...raw } as Record<string, unknown>;
  delete cleaned.assessmentId;
  localStorage.setItem(LS.CONFIG, JSON.stringify(cleaned));
}

function setStatus(text: string, kind: PanelRenderState["statusKind"] = "muted"): void {
  statusText = text;
  statusKind = kind;
}

function getAiCache(assessmentId: string): AssessmentInstanceCache {
  const aid = String(assessmentId || "").trim();
  if (!aid) return { map: new Map(), loadedAt: null };
  if (aiCacheByAssessmentId.has(aid)) return aiCacheByAssessmentId.get(aid)!;
  const cache = loadAssessmentInstanceCache(config.courseInstanceId, aid);
  aiCacheByAssessmentId.set(aid, cache);
  return cache;
}

function setAiCache(assessmentId: string, cache: AssessmentInstanceCache): void {
  const aid = String(assessmentId || "").trim();
  if (!aid) return;
  aiCacheByAssessmentId.set(aid, cache);
  saveAssessmentInstanceCache(config.courseInstanceId, aid, cache);
}

function configReadyErrorsBase(): string[] {
  const errs: string[] = [];
  if (!config.plBaseUrl) errs.push("PrairieLearn Base URL is not set");
  if (!config.apiKey) errs.push("PrairieLearn API Key is not set");
  if (!config.courseInstanceId) errs.push("Course Instance ID is not set");
  return errs;
}

function configReadyErrorsForAssessment(assessmentId: string): string[] {
  const errs = configReadyErrorsBase();
  if (!String(assessmentId || "").trim()) errs.push("Assessment ID is not set for this parser");
  return errs;
}

function resolveIdentity(): IdentityState {
  const sid = getQueryParam("student_id");
  const uiName = getSpeedGraderDisplayedName();
  const match = students.find((s) => String(s.canvasId) === String(sid ?? ""));

  if (!sid) return { ok: false, errors: ["student_id not found in URL"], uiName, currentStudentId: sid };
  if (!match) return { ok: false, errors: [`Canvas ID=${sid} not found in CSV`], uiName, currentStudentId: sid };

  if (uiName && !namesMatch(uiName, match.name)) {
    return { ok: false, errors: ["Name mismatch", `UI: ${uiName}`, `CSV: ${match.name}`], uiName, rec: match, currentStudentId: sid };
  }

  const userUin = String(match.sisLoginId || "").trim();
  if (!userUin) {
    return { ok: false, errors: ["Empty SIS Login ID (used as PrairieLearn user_uin)"], uiName, rec: match, currentStudentId: sid };
  }

  return { ok: true, errors: [], uiName, rec: match, userUin, currentStudentId: sid };
}

function selectLatestSubmission(submissions: PrairieLearnSubmission[], questionId: string): { submission?: PrairieLearnSubmission; candidates?: number; error?: string } {
  const qid = String(questionId || "").trim();
  const hits = (submissions || []).filter((s) => String(s.question_id || "").trim() === qid);
  if (!hits.length) return { error: `No submission for question_id=${qid}` };

  let best = hits[0];
  let bestTime = Date.parse(best.date || "") || 0;
  hits.forEach((item) => {
    const t = Date.parse(item.date || "") || 0;
    if (t >= bestTime) {
      best = item;
      bestTime = t;
    }
  });
  return { submission: best, candidates: hits.length };
}

function buildOutputHeaderBlock(args: {
  student: Student;
  assessmentId: string;
  assessmentInstanceId: string;
  parser: ParserConfig;
  picked: { submission: PrairieLearnSubmission; candidates?: number };
  proc: ProcessorRunResult;
}): string {
  const lines = [
    "PrairieLearn Submission Export",
    `Time: ${new Date().toLocaleString()}`,
    `Student: ${args.student.name}`,
    `Canvas ID: ${args.student.canvasId}`,
    `SIS User ID: ${args.student.sisUserId}`,
    `SIS Login ID (user_uin): ${args.student.sisLoginId}`,
    `assessment_id: ${args.assessmentId}`,
    `assessment_instance_id: ${args.assessmentInstanceId}`,
    `question_id: ${args.parser.questionId}`,
    `selected_submission_id: ${args.picked.submission.submission_id} (candidates=${args.picked.candidates ?? 1}, strategy=latest)`,
    `submission_date: ${args.picked.submission.date || ""}`,
    `file: ${args.proc.fileName ?? ""}`,
  ];
  return "/**\n" + lines.map((l) => ` * ${l}`).join("\n") + "\n */\n\n";
}

async function refreshAssessmentInstancesFor(assessmentId: string): Promise<void> {
  const aid = String(assessmentId || "").trim();
  const errs = configReadyErrorsForAssessment(aid);
  if (errs.length) {
    setStatus(`Cannot refresh: ${errs.join("; ")}`, "err");
    render();
    return;
  }

  setStatus(`Refreshing instances (assessment_id=${aid})...`, "muted");
  render();

  try {
    const data = await fetchAssessmentInstances({
      baseUrl: config.plBaseUrl,
      token: config.apiKey,
      courseInstanceId: config.courseInstanceId,
      assessmentId: aid,
    });
    const map = new Map<string, string>();
    data.forEach((item) => {
      const uin = String(item.user_uin || "").trim();
      const ai = String(item.assessment_instance_id || "").trim();
      if (uin && ai) map.set(uin, ai);
    });
    const cache: AssessmentInstanceCache = { map, loadedAt: nowIso() };
    setAiCache(aid, cache);
    setStatus(`Loaded ${map.size} instances (assessment_id=${aid}).`, "ok");
  } catch (err) {
    setStatus(`Refresh failed: ${(err as Error)?.message || err}`, "err");
  }
  render();
}

async function handleFetch(parser: ParserConfig, index: number): Promise<void> {
  const identity = resolveIdentity();
  if (!identity.ok || !identity.rec || !identity.userUin) {
    setStatus(`Cannot fetch: ${identity.errors.join("; ")}`, "err");
    render();
    return;
  }

  const aid = String(parser.assessmentId || "").trim();
  const cfgErrs = configReadyErrorsForAssessment(aid);
  if (cfgErrs.length) {
    setStatus(`Cannot fetch: ${cfgErrs.join("; ")}`, "err");
    render();
    return;
  }

  if (!outputFileHandle) {
    setStatus("No output file selected", "err");
    render();
    return;
  }

  const cache = getAiCache(aid);
  const assessmentInstanceId = cache.map.get(identity.userUin);
  if (!assessmentInstanceId) {
    setStatus(`No instance for user_uin=${identity.userUin} (assessment_id=${aid})`, "err");
    render();
    return;
  }

  const qid = String(parser.questionId || "").trim();
  setStatus(`Fetching ${qid || `#${index + 1}`}...`, "muted");
  render();

  try {
    const submissions = await fetchSubmissions({
      baseUrl: config.plBaseUrl,
      token: config.apiKey,
      courseInstanceId: config.courseInstanceId,
      assessmentInstanceId,
    });
    const picked = selectLatestSubmission(submissions, parser.questionId);
    if (picked.error || !picked.submission) throw new Error(picked.error || "No submission selected");

    const proc = runProcessor(picked.submission, parser.processor);
    if (proc.error || !proc.text) throw new Error(proc.error || "Processor returned no text");

    const headerBlock = config.includeOutputHeader
      ? buildOutputHeaderBlock({
        student: identity.rec,
        assessmentId: aid,
        assessmentInstanceId,
        parser,
        picked: { submission: picked.submission, candidates: picked.candidates },
        proc,
      })
      : "";

    await writeTextFile(outputFileHandle, headerBlock + proc.text + "\n");
    lastWriteStatus = `Write OK: ${new Date().toLocaleString()}`;
    setStatus(`Done: wrote ${proc.fileName ?? "output"}`, "ok");
  } catch (err) {
    setStatus(`Failed: ${(err as Error)?.message || err}`, "err");
  }
  render();
}

function render(): void {
  const identity = resolveIdentity();
  const panelState: PanelRenderState = {
    outputFileName: fileName(outputFileHandle),
    lastWriteStatus,
    identity,
    parsers,
    baseConfigErrors: configReadyErrorsBase(),
    getCache: (aid: string) => getAiCache(aid),
    statusText,
    statusKind,
  };
  panel.render(panelState);
}

async function chooseOutputFile(): Promise<void> {
  const handle = await pickOutputFile();
  if (!handle) {
    lastWriteStatus = "File picker cancelled or unsupported.";
    render();
    return;
  }
  outputFileHandle = handle;
  lastWriteStatus = "File selected.";
  render();
}

function openConfigModal(): void {
  configModal.open({ config, parsers, students });
}

function handleConfigSaved(snapshot: ConfigModalSnapshot): void {
  config = snapshot.config;
  parsers = snapshot.parsers.map((p) => ({ ...p, processor: normalizeProcessorConfig(p.processor) }));
  students = snapshot.students;

  saveConfig(config);
  saveParsers(parsers);
  saveStudents(students);
  clearAssessmentInstanceCache();
  aiCacheByAssessmentId.clear();

  setStatus("Saved", "ok");
  render();
}

function watchStudentChanges(): void {
  let lastStudentId = getQueryParam("student_id");
  const check = async () => {
    const sid = getQueryParam("student_id");
    if (sid !== lastStudentId) {
      lastStudentId = sid;
      await sleep(200);
      render();
    }
  };
  onLocationChange(check);
  setInterval(check, 600);
}

async function refreshWhenReady(reason = "auto"): Promise<void> {
  const started = Date.now();
  let delay = 250;
  while (Date.now() - started < 25_000) {
    if (isSpeedGraderReady()) break;
    await sleep(delay);
    delay = Math.min(2000, Math.round(delay * 1.35));
  }
  setStatus(`UI refreshed (${reason})`, "muted");
  render();
}

function start(): void {
  migrateLegacyAssessmentId();

  document.body.appendChild(configModal.backdrop);
  panel.mount(document.body);

  hookHistory();
  watchStudentChanges();
  watchSpeedGraderName(render);

  window.addEventListener("load", () => refreshWhenReady("window-load"));
  refreshWhenReady("startup");

  setStatus("Ready.", "muted");
  render();
}

const configModal = createConfigModal({ onSave: handleConfigSaved });
const panel = new Panel({
  initialUiState: uiState,
  onUiStateChange: (state) => saveUiState(state),
  onOpenConfig: openConfigModal,
  onRefreshUi: () => refreshWhenReady("manual"),
  onChooseFile: chooseOutputFile,
  onRefreshInstances: (assessmentId) => void refreshAssessmentInstancesFor(assessmentId),
  onFetch: (parser, index) => void handleFetch(parser, index),
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
