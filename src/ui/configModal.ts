import { h } from "./components/dom";
import type { Config, ParserConfig, Student } from "../core/types";
import { parseStudentsFromCsv } from "../core/students";
import {
  normalizeProcessorConfig,
  processorSummary,
  validateProcessorConfig,
} from "../pl/processors";
import { createProcessorEditor } from "./processorConfig";

export interface ConfigModalSnapshot {
  config: Config;
  parsers: ParserConfig[];
  students: Student[];
}

export interface ConfigModalHandlers {
  onSave: (snapshot: ConfigModalSnapshot) => void;
  onClose?: () => void;
}

export function createConfigModal(handlers: ConfigModalHandlers) {
  const backdrop = h("div", { attrs: { id: "plcg-config-backdrop" } });
  const modal = h("div", { attrs: { id: "plcg-config" } });
  backdrop.appendChild(modal);

  const processorEditor = createProcessorEditor({
    onSave: (proc) => {
      if (editingParserIndex === null) return;
      parsers[editingParserIndex].processor = proc;
      renderParsers();
    },
  });
  modal.appendChild(processorEditor.backdrop);

  let editingParserIndex: number | null = null;
  let config: Config;
  let parsers: ParserConfig[];
  let students: Student[];
  let parserContainerRef: HTMLElement | null = null;

  const close = () => {
    backdrop.style.display = "none";
    modal.innerHTML = "";
    processorEditor.close();
    if (handlers.onClose) handlers.onClose();
  };

  const openProcessor = (index: number): void => {
    editingParserIndex = index;
    processorEditor.open(parsers[index].processor, `Processor (#${index + 1})`);
  };

  const renderParsers = (container: HTMLElement | null = parserContainerRef): void => {
    if (!container) return;
    parserContainerRef = container;
    container.innerHTML = "";

    const table = h("table", { className: "plcg-table" });
    const thead = h("thead", {}, [
      h("tr", {}, [
        h("th", {}, ["#"]),
        h("th", {}, ["question_id"]),
        h("th", {}, ["assessment_id"]),
        h("th", {}, ["multi_submissions"]),
        h("th", {}, ["processor"]),
      ]),
    ]);
    const tbody = h("tbody");

    parsers.forEach((p, idx) => {
      const qInput = h("input", { attrs: { value: p.questionId, placeholder: "e.g. 9270541" } });
      const aInput = h("input", { attrs: { value: p.assessmentId, placeholder: "e.g. 2630582" } });
      const multiSelect = h("select", {}, [h("option", { attrs: { value: "latest" } }, ["latest"])]);
      multiSelect.value = p.multiSubmissions;

      const procBtn = h(
        "button",
        { className: "plcg-mini-btn", on: { click: () => openProcessor(idx) }, attrs: { title: "Edit" } },
        [processorSummary(p.processor)]
      );
      const delBtn = h(
        "button",
        {
          className: "plcg-mini-btn",
          on: {
            click: () => {
              parsers.splice(idx, 1);
              renderParsers(parserContainerRef);
            },
          },
        },
        ["Del"]
      );

      const sync = () => {
        p.questionId = String(qInput.value || "").trim();
        p.assessmentId = String(aInput.value || "").trim();
        p.multiSubmissions = String(multiSelect.value || "latest") as ParserConfig["multiSubmissions"];
        p.processor = normalizeProcessorConfig(p.processor);
      };

      qInput.addEventListener("input", sync);
      aInput.addEventListener("input", sync);
      multiSelect.addEventListener("change", sync);

      const tr = h("tr", {}, [
        h("td", {}, [h("span", {}, [String(idx + 1)]), delBtn]),
        h("td", {}, [qInput]),
        h("td", {}, [aInput]),
        h("td", {}, [multiSelect]),
        h("td", {}, [procBtn]),
      ]);
      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);

    const addBtn = h(
      "button",
      {
        className: "plcg-btn",
        on: {
          click: () => {
            parsers.push({
              questionId: "",
              assessmentId: "",
              multiSubmissions: "latest",
              processor: normalizeProcessorConfig({ type: "file", params: { file_index: 0 } }),
            });
            renderParsers(parserContainerRef);
          },
        },
      },
      ["Add parser"]
    );

    container.appendChild(table);
    container.appendChild(h("div", { className: "plcg-inline", style: { marginTop: "10px" } }, [addBtn]));
  };

  const render = () => {
    modal.innerHTML = "";
    modal.appendChild(processorEditor.backdrop);

    const baseUrlInput = h("input", { attrs: { value: config.plBaseUrl, placeholder: "https://us.prairielearn.com" } });
    const apiKeyInput = h("input", { attrs: { value: config.apiKey, placeholder: "Personal Access Token", type: "password" } });
    const courseInput = h("input", { attrs: { value: config.courseInstanceId, placeholder: "e.g. 29832" } });
    const includeHeaderCheckbox = h("input", { attrs: { type: "checkbox" } });
    includeHeaderCheckbox.checked = Boolean(config.includeOutputHeader);

    const handleSave = () => {
      const nextConfig: Config = {
        plBaseUrl: String(baseUrlInput.value || "").trim(),
        apiKey: String(apiKeyInput.value || "").trim(),
        courseInstanceId: String(courseInput.value || "").trim(),
        includeOutputHeader: Boolean(includeHeaderCheckbox.checked),
      };

      const errors: string[] = [];
      if (!nextConfig.plBaseUrl) errors.push("PrairieLearn Base URL is empty");
      if (!/^https?:\/\//i.test(nextConfig.plBaseUrl)) errors.push("PrairieLearn Base URL must start with http(s)://");
      if (!nextConfig.apiKey) errors.push("API Key is empty");
      if (!nextConfig.courseInstanceId) errors.push("Course Instance ID is empty");

      const parserErrors: string[] = [];
      parsers.forEach((p, i) => {
        if (!p.questionId) parserErrors.push(`Parser #${i + 1}: question_id empty`);
        if (!p.assessmentId) parserErrors.push(`Parser #${i + 1}: assessment_id empty`);
        if ((p.multiSubmissions || "latest") !== "latest") parserErrors.push(`Parser #${i + 1}: only multi_submissions=latest supported`);
        p.processor = normalizeProcessorConfig(p.processor);
        const procErrs = validateProcessorConfig(p.processor);
        if (procErrs.length) parserErrors.push(`Parser #${i + 1}: ${procErrs.join("; ")}`);
      });

      if (errors.length || parserErrors.length) {
        alert(`Save failed:\n- ${errors.concat(parserErrors).join("\n- ")}`);
        return;
      }

      handlers.onSave({ config: nextConfig, parsers: [...parsers], students: [...students] });
      close();
    };

    const header = h("div", { attrs: { id: "plcg-config-header" } }, [
      h("div", {}, ["Configuration"]),
      h("div", { className: "plcg-inline plcg-inline-nowrap" }, [
        h("button", { className: "plcg-btn", on: { click: close } }, ["Close"]),
        h("button", { className: "plcg-btn", on: { click: handleSave } }, ["Save"]),
      ]),
    ]);

    const body = h("div", { attrs: { id: "plcg-config-body" } });

    body.appendChild(
      h("div", { className: "plcg-field" }, [h("div", {}, ["PrairieLearn Base URL"]), h("div", {}, [baseUrlInput])])
    );
    body.appendChild(
      h("div", { className: "plcg-field" }, [h("div", {}, ["PrairieLearn API Key"]), h("div", {}, [apiKeyInput])])
    );
    body.appendChild(
      h("div", { className: "plcg-field" }, [h("div", {}, ["Course Instance ID"]), h("div", {}, [courseInput])])
    );
    body.appendChild(
      h("div", { className: "plcg-field" }, [
        h("div", {}, ["Include output header"]),
        h("div", {}, [h("div", { className: "plcg-inline plcg-inline-nowrap" }, [includeHeaderCheckbox, h("span", { className: "plcg-muted" }, ["Write a C/C++ block comment header"])])]),
      ])
    );

    const studentTa = h("textarea", {
      attrs: {
        placeholder:
          "Paste Canvas Gradebook CSV export (columns: Student, ID, SIS User ID, SIS Login ID)\n\nOr paste 4-column CSV:\nName,Canvas ID,SIS User ID,SIS Login ID",
      },
    });

    const importBtn = h(
      "button",
      {
        className: "plcg-btn",
        on: {
          click: () => {
            const raw = studentTa.value || "";
            const { students: parsed, errors } = parseStudentsFromCsv(raw);
            if (errors.length) {
              alert(`Import failed:\n- ${errors.join("\n- ")}`);
              return;
            }
            students = parsed;
            alert(`Import OK: ${students.length} entries (overwrote previous data)`);
            render();
          },
        },
      },
      ["Import & overwrite"]
    );

    body.appendChild(
      h("div", { className: "plcg-field plcg-align-top" }, [
        h("div", {}, ["Import students (CSV)"]),
        h("div", {}, [
          studentTa,
          h("div", { className: "plcg-inline plcg-inline-nowrap", style: { marginTop: "8px" } }, [
            importBtn,
            h("div", { className: "plcg-help plcg-help-inline" }, [`Saved: ${students.length} entries`]),
          ]),
        ]),
      ])
    );

    const parserContainer = h("div", { attrs: { id: "plcg-parser-container" } });
    parserContainerRef = parserContainer;
    body.appendChild(
      h("div", { className: "plcg-field plcg-align-top" }, [h("div", {}, ["Parser configuration"]), h("div", {}, [parserContainer])])
    );

    renderParsers(parserContainer);

    modal.appendChild(header);
    modal.appendChild(body);
  };

  return {
    backdrop,
    open(snapshot: ConfigModalSnapshot) {
      config = { ...snapshot.config };
      parsers = snapshot.parsers.map((p) => ({ ...p, processor: normalizeProcessorConfig(p.processor) }));
      students = [...snapshot.students];
      backdrop.style.display = "flex";
      render();
    },
  };
}
