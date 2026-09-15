import { SYSTEM_PROMPT } from "../security";
import type { DeclaredFacts } from "./types";

/** Organisation facts about this desk. Evaluators cannot observe these. */
export const NORTHSTAR_DECLARED: DeclaredFacts = {
  applicationName: "Aether",
  purpose:
    "Advisory enterprise knowledge retrieval for Northstar Systems employees. Answers are cited from the corpus; a person decides what to do with them.",
  intendedUseKind: "advisory_retrieval",
  operator: "Northstar knowledge desk",
  humanOversight: true,
  autonomousAction: false,
  socialScoring: false,
  biometricId: false,
  manipulation: false,
  transparencyToUser: true,
  riskClass: "limited",
  annexIiiUse: false,
  accountableDesk: "Northstar knowledge desk",
};

export function untrustedBoundaryPresent(): boolean {
  return /untrusted data/i.test(SYSTEM_PROMPT);
}

export function systemPromptRequiresCitations(): boolean {
  return /cite every factual claim/i.test(SYSTEM_PROMPT);
}
