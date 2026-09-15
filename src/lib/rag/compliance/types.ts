export type FrameworkId = "eu_ai_act" | "nist_ai_rmf" | "operational";

export type Verdict = "allow" | "deny" | "not_applicable";

export type ReportFormat = "html" | "markdown" | "json";

export type ProbeKind = "policy" | "injection" | "ooc" | "fairness";

export const FRAMEWORKS: {
  id: FrameworkId;
  title: string;
  kicker: string;
  blurb: string;
}[] = [
  {
    id: "eu_ai_act",
    title: "EU AI Act",
    kicker: "Regulation 2024/1689",
    blurb: "Prohibited practices, transparency, data governance, human oversight, robustness, and GPAI documentation — as they apply to an advisory knowledge desk.",
  },
  {
    id: "nist_ai_rmf",
    title: "NIST AI RMF",
    kicker: "Govern · Map · Measure · Manage",
    blurb: "Voluntary risk functions. Aether maps purpose, measures retrieval quality, and manages injection, contradiction, and fallback.",
  },
  {
    id: "operational",
    title: "Operational policies",
    kicker: "Allow / deny",
    blurb: "OPA-style runtime rules over Aether’s own contract: citations, untrusted evidence, shard ACL, memory isolation, recall hold.",
  },
];

export const COMPLIANCE_STEPS = [
  { kicker: "01", title: "Regulations set", hint: "Create a named set. List what this desk can evaluate." },
  { kicker: "02", title: "Select targets", hint: "Add EU AI Act, NIST AI RMF, and operational allow/deny rules." },
  { kicker: "03", title: "Application", hint: "Wrap Aether: name, generator, version. Capture live interactions." },
  { kicker: "04", title: "Evaluate", hint: "Contract of declared facts plus measured retrieval evidence." },
  { kicker: "05", title: "Report", hint: "Dated HTML, markdown, and JSON. Evidence — not a legal opinion." },
] as const;

export interface ProbeResult {
  id: string;
  input: string;
  output: string;
  kind: ProbeKind;
  topDocuments: string[];
  citationCount: number;
  confidenceBand: string;
  injectionFlags: string[];
  baitInContext: boolean;
  refused: boolean;
  grounded: boolean;
  latencyMs: number;
}

/** AICertify-shaped interaction: a real ask against this desk. */
export interface Interaction {
  inputText: string;
  outputText: string;
  kind: ProbeKind;
  metadata: {
    id: string;
    citationCount: number;
    topDocuments: string[];
    confidenceBand: string;
    injectionFlags: string[];
    baitInContext: boolean;
    refused: boolean;
    grounded: boolean;
    latencyMs: number;
  };
}

export interface DeclaredFacts {
  applicationName: string;
  purpose: string;
  intendedUseKind: "advisory_retrieval";
  operator: string;
  humanOversight: boolean;
  autonomousAction: boolean;
  socialScoring: boolean;
  biometricId: boolean;
  manipulation: boolean;
  transparencyToUser: boolean;
  riskClass: "limited" | "high" | "prohibited";
  annexIiiUse: boolean;
  accountableDesk: string;
}

export interface MeasuredFacts {
  documents: number;
  chunks: number;
  shards: number;
  shardKinds: string[];
  provenanceComplete: boolean;
  untrustedBoundary: boolean;
  generatorLabel: string;
  generatorConfigured: boolean;
  recallAt5: number;
  baselineRecallAt5: number;
  recallHolds: boolean;
  mrr: number;
  probes: ProbeResult[];
  tracesRecorded: number;
  aclRestricts: boolean;
}

export interface ComplianceContract {
  application: {
    name: string;
    version: string;
    purpose: string;
    model: string;
    provider: string;
    modelName: string;
    modelVersion: string;
    modelMetadata: Record<string, string>;
  };
  declared: DeclaredFacts;
  measured: MeasuredFacts;
}

export interface PolicyResult {
  id: string;
  framework: FrameworkId;
  article: string;
  title: string;
  obligation: string;
  verdict: Verdict;
  evidence: string[];
  missing: string[];
}

export interface ComplianceReport {
  id: string;
  createdAt: string;
  regulationsSet: string;
  frameworks: FrameworkId[];
  contract: ComplianceContract;
  results: PolicyResult[];
  interactions: Interaction[];
  summary: {
    allow: number;
    deny: number;
    notApplicable: number;
    passRate: number;
  };
  markdown: string;
  html: string;
  json: string;
}

export interface Policy {
  id: string;
  framework: FrameworkId;
  article: string;
  title: string;
  obligation: string;
  run: (contract: ComplianceContract) => Pick<PolicyResult, "verdict" | "evidence" | "missing">;
}
