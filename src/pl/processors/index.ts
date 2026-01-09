import type {
  PrairieLearnSubmission,
  ProcessorConfig,
  ProcessorDescriptor,
  ProcessorParams,
  ProcessorRunResult,
  ProcessorType,
} from "../../core/types";
import { fileProcessor } from "./file";

const REGISTRY: Record<ProcessorType, ProcessorDescriptor<any>> = {
  file: fileProcessor,
};

function getDescriptor(type: ProcessorType): ProcessorDescriptor | undefined {
  return REGISTRY[type];
}

export function normalizeProcessorConfig(raw?: ProcessorConfig | null): ProcessorConfig {
  const type = (raw?.type || "file") as ProcessorType;
  const descriptor = getDescriptor(type) ?? fileProcessor;
  const params = descriptor.normalize(raw?.params ?? {} as ProcessorParams);
  return { type: descriptor.type, params };
}

export function processorSummary(config: ProcessorConfig): string {
  const descriptor = getDescriptor(config.type);
  if (!descriptor) return config.type;
  const params = descriptor.normalize(config.params);
  return descriptor.summary(params);
}

export function validateProcessorConfig(config: ProcessorConfig): string[] {
  const descriptor = getDescriptor(config.type);
  if (!descriptor) return [`Unknown processor type: ${config.type}`];
  const normalized = descriptor.normalize(config.params);
  return descriptor.validate ? descriptor.validate(normalized) : [];
}

export function processorFields(config: ProcessorConfig): ProcessorDescriptor["fields"] {
  const descriptor = getDescriptor(config.type) ?? fileProcessor;
  return descriptor.fields;
}

export function runProcessor(
  submission: PrairieLearnSubmission,
  config: ProcessorConfig
): ProcessorRunResult {
  const descriptor = getDescriptor(config.type);
  if (!descriptor) return { error: `processor.type=${config.type} not supported` };
  const params = descriptor.normalize(config.params);
  return descriptor.run(submission, params);
}

export function listProcessors(): ProcessorDescriptor[] {
  return Object.values(REGISTRY);
}
