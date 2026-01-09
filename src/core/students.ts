import Papa from "papaparse";
import { canonicalizeName } from "./nameMatch";
import type { Student } from "./types";

export interface ParseStudentsResult {
  students: Student[];
  errors: string[];
}

function parseWithPapa(text: string, opts: Papa.ParseConfig): Papa.ParseResult<unknown> | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return Papa.parse(raw, opts);
  } catch {
    return null;
  }
}

function isNumericId(value: unknown): boolean {
  return /^\d+$/.test(String(value || "").trim());
}

function pickField(obj: Record<string, unknown>, candidates: string[]): string | undefined {
  const keys = Object.keys(obj || {});
  const map = new Map(keys.map((k) => [String(k).trim().toLowerCase(), k]));
  for (const c of candidates) {
    const hit = map.get(String(c).trim().toLowerCase());
    if (hit) return String(obj[hit] ?? "");
  }
  return undefined;
}

function detectGradebookHeader(text: string): boolean {
  const preview = parseWithPapa(text, {
    header: false,
    skipEmptyLines: true,
    preview: 3,
    dynamicTyping: false,
  });
  const row0 = Array.isArray(preview?.data?.[0]) ? (preview!.data![0] as unknown[]) : [];
  const lower = row0.map((s) => String(s || "").trim().toLowerCase());
  const hasStudent = lower.includes("student");
  const hasId = lower.includes("id");
  const hasSisUser = lower.includes("sis user id");
  const hasSisLogin = lower.includes("sis login id");
  return hasStudent && hasId && hasSisUser && hasSisLogin;
}

export function parseStudentsFromCsv(text: string): ParseStudentsResult {
  const raw = String(text || "").trim();
  if (!raw) return { students: [], errors: ["Empty CSV"] };

  const errors: string[] = [];
  const students: Student[] = [];

  const isGradebook = detectGradebookHeader(raw);

  if (isGradebook) {
    const res = parseWithPapa(raw, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (h) => String(h || "").trim(),
    });

    const rows = Array.isArray(res?.data) ? (res!.data as Record<string, unknown>[]) : [];
    rows.forEach((row, idx) => {
      const studentName = pickField(row, ["Student"]);
      const canvasId = pickField(row, ["ID"]);
      const sisUserId = pickField(row, ["SIS User ID"]);
      const sisLoginId = pickField(row, ["SIS Login ID"]);

      if (!isNumericId(canvasId)) return; // skip non-student rows

      const name = canonicalizeName(studentName || "");
      if (!name) {
        errors.push(`Row ${idx + 2}: empty Student`);
        return;
      }
      if (!sisUserId || !sisLoginId) {
        errors.push(`Row ${idx + 2}: empty SIS User ID or SIS Login ID`);
        return;
      }

      students.push({
        name: name.trim(),
        canvasId: String(canvasId).trim(),
        sisUserId: String(sisUserId).trim(),
        sisLoginId: String(sisLoginId).trim(),
      });
    });

    if (!students.length && !errors.length) errors.push("No valid student rows found");
    return { students, errors };
  }

  const res = parseWithPapa(raw, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const rows = Array.isArray(res?.data) ? (res!.data as unknown[][]) : [];
  rows.forEach((row, idx) => {
    const cells = Array.isArray(row) ? row : [];
    if (!cells.some((x) => String(x ?? "").trim())) return;

    const c0 = String(cells[0] ?? "").trim().toLowerCase();
    const c1 = String(cells[1] ?? "").trim().toLowerCase();
    if (c0 === "name" && (c1.includes("canvas") || c1 === "canvas id")) return;

    if (cells.length < 4) {
      errors.push(`Row ${idx + 1}: expected 4 columns`);
      return;
    }

    const [nameRaw, canvasId, sisUserId, sisLoginId] = cells;
    const name = canonicalizeName(String(nameRaw || ""));
    if (!name || !canvasId || !sisUserId || !sisLoginId) {
      errors.push(`Row ${idx + 1}: empty field`);
      return;
    }
    if (!isNumericId(canvasId)) {
      errors.push(`Row ${idx + 1}: Canvas ID not numeric: ${canvasId}`);
      return;
    }

    students.push({
      name: name.trim(),
      canvasId: String(canvasId).trim(),
      sisUserId: String(sisUserId).trim(),
      sisLoginId: String(sisLoginId).trim(),
    });
  });

  if (!students.length && !errors.length) errors.push("No valid student rows found");
  return { students, errors };
}
