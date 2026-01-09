import { Base64 } from "js-base64";
import type {
  PrairieLearnSubmission,
  ProcessorDescriptor,
  ProcessorParams,
  ProcessorRunResult,
} from "../../core/types";

export interface FileProcessorParams extends ProcessorParams {
  file_index: number;
}

function decodeBase64ToUtf8(b64: string): string {
  const bytes = Base64.toUint8Array(b64.trim());
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(bytes);
}

export const fileProcessor: ProcessorDescriptor<FileProcessorParams> = {
  type: "file",
  label: "File extractor",
  defaultParams: () => ({ file_index: 0 }),
  normalize: (params: ProcessorParams): FileProcessorParams => {
    const idxRaw = params.file_index ?? params["file_index"] ?? 0;
    const idx = Number(idxRaw);
    return { file_index: Number.isFinite(idx) ? idx : 0 };
  },
  summary: (params: FileProcessorParams) => `file (${params.file_index})`,
  validate: (params: FileProcessorParams) => {
    const errors: string[] = [];
    if (!Number.isFinite(params.file_index) || params.file_index < 0) {
      errors.push("file_index must be a non-negative number");
    }
    return errors;
  },
  run: (submission: PrairieLearnSubmission, params: FileProcessorParams): ProcessorRunResult => {
    const files = submission?.submitted_answer?._files;
    if (!Array.isArray(files)) {
      return { error: "submitted_answer._files missing (not a file-upload question?)" };
    }

    const idx = params.file_index ?? 0;
    if (!Number.isFinite(idx) || idx < 0 || idx >= files.length) {
      return { error: `file_index=${idx} out of range (files=${files.length})` };
    }

    const file = files[idx];
    const name = file?.name ?? `file_${idx}`;
    const contents = file?.contents ?? "";
    if (!contents) return { error: "File contents empty" };

    try {
      const text = decodeBase64ToUtf8(String(contents));
      return { text, fileName: name };
    } catch (err) {
      return { error: `Base64 decode failed: ${(err as Error)?.message || err}` };
    }
  },
  fields: [
    {
      key: "file_index",
      label: "file_index",
      type: "number",
      placeholder: "0",
      helperText: "Index in submitted_answer._files (0-based)",
    },
  ],
};
