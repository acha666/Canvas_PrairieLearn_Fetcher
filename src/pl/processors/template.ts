import type {
  PrairieLearnSubmission,
  ProcessorDescriptor,
  ProcessorParams,
  ProcessorRunResult,
} from "../../core/types";

export interface TemplateProcessorParams extends ProcessorParams {
  template: string;
  separator: string;
  fallback: string;
}

/**
 * Extract value from nested object using dot-separated path
 * Example: "bin_2digit._value.0" -> submission.submitted_answer.bin_2digit._value[0]
 */
function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null) return undefined;

    // Handle array index access
    const arrayIndex = Number(part);
    if (Number.isInteger(arrayIndex) && Array.isArray(current)) {
      current = current[arrayIndex];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Convert value to string representation
 * - Arrays: join with separator
 * - Objects: JSON stringify
 * - Primitives: toString
 */
function valueToString(value: unknown, separator: string): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => valueToString(item, separator)).join(separator);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Parse template and replace ${path} placeholders with values from submitted_answer
 * Example: "Result: ${bin_2digit._value.0}" -> "Result: 0,1,2,3"
 */
function processTemplate(
  submittedAnswer: unknown,
  template: string,
  separator: string,
  fallback: string
): string {
  // Match ${...} placeholders
  const placeholderRegex = /\$\{([^}]+)\}/g;

  return template.replace(placeholderRegex, (match, path: string) => {
    const trimmedPath = path.trim();
    const value = getValueByPath(submittedAnswer, trimmedPath);

    if (value === undefined || value === null) {
      return fallback;
    }

    return valueToString(value, separator);
  });
}

export const templateProcessor: ProcessorDescriptor<TemplateProcessorParams> = {
  type: "template",
  label: "Template extractor",
  defaultParams: () => ({
    template: "",
    separator: ",",
    fallback: "[missing]",
  }),
  normalize: (params: ProcessorParams): TemplateProcessorParams => {
    return {
      template: String(params.template ?? ""),
      separator: String(params.separator ?? ","),
      fallback: String(params.fallback ?? "[missing]"),
    };
  },
  summary: () => {
    return "template";
  },
  validate: (params: TemplateProcessorParams) => {
    const errors: string[] = [];
    if (!params.template || params.template.trim().length === 0) {
      errors.push("template cannot be empty");
    }
    return errors;
  },
  run: (
    submission: PrairieLearnSubmission,
    params: TemplateProcessorParams
  ): ProcessorRunResult => {
    const submittedAnswer = submission?.submitted_answer;
    if (!submittedAnswer || typeof submittedAnswer !== "object") {
      return { error: "submitted_answer is missing or not an object" };
    }

    try {
      const text = processTemplate(
        submittedAnswer,
        params.template,
        params.separator,
        params.fallback
      );
      return { text, fileName: "submission.txt" };
    } catch (err) {
      return { error: `Template processing failed: ${(err as Error)?.message || err}` };
    }
  },
  fields: [
    {
      key: "template",
      label: "Template",
      type: "textarea",
      placeholder: "Answer: ${field_name}",
      helperText: "Use ${path.to.field} to extract values from submitted_answer. Examples: ${bin_2digit._value.0} for arrays, ${nested.field} for objects. Arrays are joined with separator.",
    },
    {
      key: "separator",
      label: "Array separator",
      type: "text",
      placeholder: ",",
      helperText: "Character(s) to join array elements (default: comma)",
    },
    {
      key: "fallback",
      label: "Missing field fallback",
      type: "text",
      placeholder: "[missing]",
      helperText: "Default value when field doesn't exist",
    },
  ],
};
