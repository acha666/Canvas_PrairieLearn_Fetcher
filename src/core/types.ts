export type ProcessorType = "file" | "template";

export type ProcessorParamsValue = string | number | boolean;
export type ProcessorParams = Record<string, ProcessorParamsValue>;

export interface ProcessorField {
  key: string;
  label: string;
  type: "text" | "number" | "textarea";
  placeholder?: string;
  helperText?: string;
}

export interface ProcessorRunResult {
  text?: string;
  fileName?: string;
  error?: string;
}

export interface ProcessorDescriptor<TParams extends ProcessorParams = ProcessorParams> {
  type: ProcessorType;
  label: string;
  defaultParams: () => TParams;
  normalize: (params: ProcessorParams) => TParams;
  summary: (params: TParams) => string;
  validate?: (params: TParams) => string[];
  run: (submission: PrairieLearnSubmission, params: TParams) => ProcessorRunResult;
  fields: ProcessorField[];
}

export interface ProcessorConfig<TParams extends ProcessorParams = ProcessorParams> {
  type: ProcessorType;
  params: TParams;
}

export interface ParserConfig {
  questionId: string;
  assessmentId: string;
  multiSubmissions: "latest" | "best" | "api-best";
  processor: ProcessorConfig;
}

export interface Config {
  plBaseUrl: string;
  apiKey: string;
  courseInstanceId: string;
  includeOutputHeader: "off" | "top" | "bottom";
}

export interface UiState {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Student {
  name: string;
  canvasId: string;
  sisUserId: string;
  sisLoginId: string;
}

export interface AssessmentInstanceCache {
  map: Map<string, string>;
  loadedAt: string | null;
}

export interface PrairieLearnAssessmentInstance {
  assessment_instance_id: string;
  user_uin: string;
}

export interface PrairieLearnSubmissionFile {
  name: string;
  contents: string;
}

export interface PrairieLearnSubmission {
  submission_id: string;
  question_id: string;
  date?: string;
  submitted_answer?: {
    _files?: PrairieLearnSubmissionFile[];
    [key: string]: unknown;
  };
  instance_question_points?: number;
  instance_question_auto_points?: number;
  instance_question_manual_points?: number;
  assessment_question_max_points?: number;
  assessment_question_max_auto_points?: number;
  assessment_question_max_manual_points?: number;
  score: number;
  feedback: {
    results?: {
      score?: number;
      points?: number;
      max_points?: number;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface FetchContext {
  config: Config;
  parser: ParserConfig;
  student: Student;
  assessmentInstanceId: string;
}
