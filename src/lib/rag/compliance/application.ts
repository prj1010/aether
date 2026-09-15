import { publicLlmStatus } from "../llm";
import { NORTHSTAR_DECLARED } from "./contract";
import { evaluateSet } from "./evaluate";
import type { RegulationSet } from "./regulations";
import type {
  ComplianceReport,
  Interaction,
  ProbeKind,
  ReportFormat,
} from "./types";

export interface CreateApplicationInput {
  name: string;
  modelName: string;
  modelVersion: string;
  modelMetadata?: Record<string, string>;
}

export class CertifyApplication {
  readonly name: string;
  readonly modelName: string;
  readonly modelVersion: string;
  readonly modelMetadata: Record<string, string>;
  readonly interactions: Interaction[] = [];
  private last: ComplianceReport | null = null;

  constructor(input: CreateApplicationInput) {
    this.name = input.name;
    this.modelName = input.modelName;
    this.modelVersion = input.modelVersion;
    this.modelMetadata = { ...(input.modelMetadata ?? {}) };
  }

  addInteraction(input: {
    inputText: string;
    outputText: string;
    kind?: ProbeKind;
  }): this {
    this.interactions.push({
      inputText: input.inputText,
      outputText: input.outputText,
      kind: input.kind ?? "policy",
      metadata: {
        id: `int_${this.interactions.length + 1}`,
        citationCount: 0,
        topDocuments: [],
        confidenceBand: "unknown",
        injectionFlags: [],
        baitInContext: false,
        refused: false,
        grounded: false,
        latencyMs: 0,
      },
    });
    return this;
  }

  addInteractions(
    rows: { inputText?: string; input_text?: string; outputText?: string; output_text?: string; kind?: ProbeKind }[],
  ): this {
    for (const row of rows) {
      this.addInteraction({
        inputText: row.inputText ?? row.input_text ?? "",
        outputText: row.outputText ?? row.output_text ?? "",
        kind: row.kind,
      });
    }
    return this;
  }

  async evaluate(opts: {
    regulations: RegulationSet;
    reportFormat?: ReportFormat;
  }): Promise<ComplianceReport> {
    const report = await evaluateSet(opts.regulations, {
      name: this.name,
      version: this.modelVersion,
      purpose: this.modelMetadata.purpose ?? NORTHSTAR_DECLARED.purpose,
      model: this.modelName,
      provider: publicLlmStatus().provider,
      modelName: this.modelName,
      modelVersion: this.modelVersion,
      modelMetadata: this.modelMetadata,
    });
    if (this.interactions.length) {
      report.interactions = [...report.interactions, ...this.interactions];
    }
    this.last = report;
    return report;
  }

  getReport(): Record<string, string> {
    if (!this.last) return {};
    const out: Record<string, string> = {};
    for (const fw of this.last.frameworks) {
      out[fw] = this.last.markdown;
    }
    out.html = this.last.html;
    out.markdown = this.last.markdown;
    out.json = this.last.json;
    return out;
  }
}

export const application = {
  create(input: CreateApplicationInput): CertifyApplication {
    return new CertifyApplication(input);
  },
};

export function defaultAetherApplication(): CertifyApplication {
  const llm = publicLlmStatus();
  return application.create({
    name: NORTHSTAR_DECLARED.applicationName,
    modelName: llm.model,
    modelVersion: "1.0",
    modelMetadata: {
      purpose: NORTHSTAR_DECLARED.purpose,
      operator: NORTHSTAR_DECLARED.operator,
    },
  });
}
