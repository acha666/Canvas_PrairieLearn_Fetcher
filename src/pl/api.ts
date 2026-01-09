import { gmRequestJson } from "../platform/gm";
import type { PrairieLearnAssessmentInstance, PrairieLearnSubmission } from "../core/types";

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

export async function plRequestJson<T>(opts: {
  baseUrl: string;
  token: string;
  path: string;
}): Promise<T> {
  const url = buildUrl(opts.baseUrl, opts.path);
  return gmRequestJson<T>({
    method: "GET",
    url,
    headers: {
      "Private-Token": opts.token,
      Accept: "application/json",
    },
  });
}

export async function fetchAssessmentInstances(params: {
  baseUrl: string;
  token: string;
  courseInstanceId: string;
  assessmentId: string;
}): Promise<PrairieLearnAssessmentInstance[]> {
  const { baseUrl, token, courseInstanceId, assessmentId } = params;
  const path = `/pl/api/v1/course_instances/${encodeURIComponent(courseInstanceId)}/assessments/${encodeURIComponent(assessmentId)}/assessment_instances`;
  return plRequestJson<PrairieLearnAssessmentInstance[]>({ baseUrl, token, path });
}

export async function fetchSubmissions(params: {
  baseUrl: string;
  token: string;
  courseInstanceId: string;
  assessmentInstanceId: string;
}): Promise<PrairieLearnSubmission[]> {
  const { baseUrl, token, courseInstanceId, assessmentInstanceId } = params;
  const path = `/pl/api/v1/course_instances/${encodeURIComponent(courseInstanceId)}/assessment_instances/${encodeURIComponent(assessmentInstanceId)}/submissions`;
  return plRequestJson<PrairieLearnSubmission[]>({ baseUrl, token, path });
}
