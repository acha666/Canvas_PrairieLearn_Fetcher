import type { ProcessorConfig } from "../core/types";
import { h } from "./components/dom";
import {
  listProcessors,
  normalizeProcessorConfig,
  processorFields,
  validateProcessorConfig,
} from "../pl/processors";

interface ProcessorEditorOptions {
  onSave: (config: ProcessorConfig) => void;
}

interface ProcessorEditor {
  backdrop: HTMLElement;
  open: (config: ProcessorConfig, label?: string) => void;
  close: () => void;
}

export function createProcessorEditor(opts: ProcessorEditorOptions): ProcessorEditor {
  const backdrop = h("div", { attrs: { id: "plcg-proc-backdrop" } });
  const modal = h("div", { attrs: { id: "plcg-proc-modal" } });
  backdrop.appendChild(modal);

  function close(): void {
    backdrop.style.display = "none";
    modal.innerHTML = "";
  }

  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) close();
  });

  function open(initial: ProcessorConfig, label = "Processor"): void {
    const normalized = normalizeProcessorConfig(initial);
    const processors = listProcessors();

    const typeSelect = h(
      "select",
      {},
      processors.map((p) => h("option", { attrs: { value: p.type } }, [p.label]))
    );
    typeSelect.value = normalized.type;

    const fieldsContainer = h("div");

    const renderFields = (): void => {
      fieldsContainer.innerHTML = "";
      const descriptorFields = processorFields({ type: typeSelect.value as ProcessorConfig["type"], params: normalized.params });
      descriptorFields.forEach((field) => {
        const isTextarea = field.type === "textarea";
        const inputElement = isTextarea ? "textarea" : "input";
        const input = h(inputElement, {
          attrs: {
            ...(isTextarea ? {} : { type: field.type }),
            placeholder: field.placeholder ?? "",
            value: String((normalized.params as Record<string, unknown>)[field.key] ?? ""),
          },
          on: {
            input: (ev) => {
              const target = ev.target as HTMLInputElement | HTMLTextAreaElement;
              const val = field.type === "number" ? Number(target.value) : target.value;
              (normalized.params as Record<string, unknown>)[field.key] = val;
            },
          },
        });

        const rowClass = isTextarea ? "plcg-field plcg-align-top" : "plcg-field";
        const row = h("div", { className: rowClass }, [
          h("div", {}, [field.label]),
          h("div", {}, [input, field.helperText ? h("div", { className: "plcg-help" }, [field.helperText]) : null]),
        ]);
        fieldsContainer.appendChild(row);
      });
    };

    typeSelect.addEventListener("change", () => {
      normalized.type = typeSelect.value as ProcessorConfig["type"];
      normalized.params = normalizeProcessorConfig(normalized).params;
      renderFields();
    });

    renderFields();

    const handleSave = () => {
      const next = normalizeProcessorConfig({ type: normalized.type, params: normalized.params });
      const errors = validateProcessorConfig(next);
      if (errors.length) {
        alert(`Cannot save processor:\n- ${errors.join("\n- ")}`);
        return;
      }
      opts.onSave(next);
      close();
    };

    const header = h("div", { attrs: { id: "plcg-proc-header" } }, [
      h("div", {}, [label]),
      h("div", { className: "plcg-inline plcg-inline-nowrap" }, [
        h("button", { className: "plcg-btn", on: { click: close } }, ["Close"]),
        h("button", { className: "plcg-btn", on: { click: handleSave } }, ["Save"]),
      ]),
    ]);

    const body = h("div", { attrs: { id: "plcg-proc-body" } }, [
      h("div", { className: "plcg-field" }, [
        h("div", {}, ["Processor type"]),
        h("div", {}, [typeSelect]),
      ]),
      fieldsContainer,
    ]);

    modal.innerHTML = "";
    modal.appendChild(header);
    modal.appendChild(body);

    backdrop.style.display = "flex";
  }

  return { backdrop, open, close };
}
