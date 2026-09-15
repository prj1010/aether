import assert from "node:assert/strict";
import { test } from "node:test";
import { resetEngine } from "./engine.ts";
import { FRAMEWORKS, POLICIES, runCompliance } from "./compliance/index.ts";
import { application } from "./compliance/application.ts";
import { NORTHSTAR_DECLARED } from "./compliance/contract.ts";
import { regulations } from "./compliance/regulations.ts";

test("compliance suite allows EU, NIST, and operational rules on Northstar", async () => {
  resetEngine();
  const report = await runCompliance();
  const ooc = report.contract.measured.probes.find((p) => p.kind === "ooc");
  const denies = report.results.filter((r) => r.verdict === "deny");
  assert.equal(report.summary.deny, 0, JSON.stringify({ denies, ooc }, null, 2));
  assert.ok(report.summary.allow >= 16, `expected many allows, got ${report.summary.allow}`);
  assert.ok(report.summary.passRate >= 0.999);
  assert.equal(report.contract.declared.intendedUseKind, "advisory_retrieval");
  assert.equal(report.contract.measured.provenanceComplete, true);
  assert.equal(report.contract.measured.recallHolds, true);
  const inj = report.contract.measured.probes.find((p) => p.kind === "injection");
  assert.ok(inj);
  assert.ok(inj!.injectionFlags.length > 0);
  assert.equal(inj!.baitInContext, false);
  const policy = report.contract.measured.probes.find((p) => p.kind === "policy");
  assert.ok(policy && policy.citationCount > 0 && policy.grounded);
  assert.ok(policy!.output.length > 0);
  assert.ok(ooc && ooc.grounded === false);
  const fair = report.contract.measured.probes.find((p) => p.kind === "fairness");
  assert.ok(fair && fair.grounded === false);
  assert.ok(report.markdown.includes("EU AI Act"));
  assert.ok(report.markdown.includes("NIST AI RMF"));
  assert.ok(report.html.includes("Compliance report"));
  assert.ok(report.json.includes("\"input_text\""));
  assert.equal(report.interactions.length >= 5, true);
});

test("each catalogued framework has executable policies", () => {
  for (const fw of FRAMEWORKS) {
    const n = POLICIES.filter((p) => p.framework === fw.id).length;
    assert.ok(n >= 3, `${fw.id} has ${n} policies`);
  }
  assert.equal(NORTHSTAR_DECLARED.autonomousAction, false);
  assert.equal(NORTHSTAR_DECLARED.socialScoring, false);
});

test("five-step API: regulations set, application, evaluate, report", async () => {
  resetEngine();
  const set = regulations.create("my_regulations");
  const available = set.listAvailable().map((r) => r.id).sort();
  assert.deepEqual(available, ["eu_ai_act", "nist_ai_rmf", "operational"]);
  set.add("eu_ai_act");
  set.add("nist_ai_rmf");
  set.add("operational");
  assert.equal(set.getRegulations().length, 3);
  assert.throws(() => set.add("healthcare"));
  const app = application.create({
    name: "Aether",
    modelName: "extractive",
    modelVersion: "1.0",
    modelMetadata: { purpose: "Demonstration" },
  });
  const report = await app.evaluate({ regulations: set, reportFormat: "html" });
  assert.equal(report.regulationsSet, "my_regulations");
  assert.equal(report.contract.application.name, "Aether");
  assert.equal(report.summary.deny, 0);
  const files = app.getReport();
  assert.ok(files.html.includes("<!doctype html>"));
  assert.ok(files.markdown.includes("Aether compliance report"));
});
