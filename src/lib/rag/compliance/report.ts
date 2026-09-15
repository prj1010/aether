import { FRAMEWORKS } from "./types";
import type { ComplianceReport } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

export function renderMarkdown(report: ComplianceReport): string {
  const { contract, results, summary } = report;
  const lines: string[] = [];
  lines.push(`# Aether compliance report`);
  lines.push("");
  lines.push(`- Id: \`${report.id}\``);
  lines.push(`- Date: ${report.createdAt}`);
  lines.push(`- Regulations set: ${report.regulationsSet}`);
  lines.push(`- Application: ${contract.application.name} ${contract.application.modelVersion}`);
  lines.push(`- Generator: ${contract.application.modelName} · ${contract.measured.generatorLabel}`);
  lines.push(
    `- Verdicts: ${summary.allow} allow · ${summary.deny} deny · ${summary.notApplicable} not applicable · pass ${(summary.passRate * 100).toFixed(0)}%`,
  );
  lines.push("");
  lines.push(`This is evidence against Aether’s own obligations for an advisory knowledge desk.`);
  lines.push(`It is not a legal opinion or a notified-body conformity assessment.`);
  lines.push("");
  lines.push(`## Contract`);
  lines.push("");
  lines.push(`### Declared`);
  lines.push("");
  lines.push(`- Purpose: ${contract.declared.purpose}`);
  lines.push(`- Intended use: ${contract.declared.intendedUseKind}`);
  lines.push(`- Risk class: ${contract.declared.riskClass}`);
  lines.push(`- Human oversight: ${contract.declared.humanOversight}`);
  lines.push(`- Autonomous action: ${contract.declared.autonomousAction}`);
  lines.push(`- Social scoring / biometrics / manipulation: ${contract.declared.socialScoring} / ${contract.declared.biometricId} / ${contract.declared.manipulation}`);
  lines.push("");
  lines.push(`### Measured`);
  lines.push("");
  lines.push(`- Corpus: ${contract.measured.documents} documents · ${contract.measured.chunks} chunks · ${contract.measured.shards} shards`);
  lines.push(`- Provenance complete: ${contract.measured.provenanceComplete}`);
  lines.push(`- Untrusted boundary: ${contract.measured.untrustedBoundary}`);
  lines.push(`- Sharded recall: ${contract.measured.recallAt5.toFixed(3)} (baseline ${contract.measured.baselineRecallAt5.toFixed(3)})`);
  lines.push(`- MRR: ${contract.measured.mrr.toFixed(2)}`);
  lines.push("");
  lines.push(`### Interactions`);
  lines.push("");
  for (const p of report.interactions) {
    lines.push(`#### ${p.metadata.id} (${p.kind})`);
    lines.push("");
    lines.push(`- Input: ${p.inputText}`);
    lines.push(`- Output: ${p.outputText.replace(/\s+/g, " ").slice(0, 280)}`);
    lines.push(
      `- Band ${p.metadata.confidenceBand} · citations ${p.metadata.citationCount} · grounded ${p.metadata.grounded} · flags ${p.metadata.injectionFlags.join(", ") || "none"} · bait in context ${p.metadata.baitInContext} · refused ${p.metadata.refused}`,
    );
    lines.push("");
  }
  for (const fw of FRAMEWORKS.filter((f) => report.frameworks.includes(f.id))) {
    lines.push(`## ${fw.title}`);
    lines.push("");
    for (const r of results.filter((x) => x.framework === fw.id)) {
      const tag = r.verdict.toUpperCase();
      lines.push(`### ${tag} · ${r.article} · ${r.title}`);
      lines.push("");
      lines.push(r.obligation);
      lines.push("");
      for (const e of r.evidence) lines.push(`- ${e}`);
      for (const m of r.missing) lines.push(`- Missing: ${m}`);
      lines.push("");
    }
  }
  lines.push(`## Method`);
  lines.push("");
  lines.push(
    `Five-step loop: create a regulations set, select targets, wrap the application, evaluate live interactions, get the report.`,
  );
  lines.push(
    `Inspired by AICertify’s compliance-as-code loop (Apache-2.0) and GOPAL’s executable policy idea. Original Aether rules; GOPAL Rego is not copied. Open Policy Agent is not required at runtime.`,
  );
  lines.push("");
  return lines.join("\n");
}

export function renderHtml(report: ComplianceReport): string {
  const { contract, results, summary } = report;
  const pct = `${(summary.passRate * 100).toFixed(0)}%`;
  const fwBlocks = FRAMEWORKS.filter((f) => report.frameworks.includes(f.id))
    .map((fw) => {
      const items = results
        .filter((x) => x.framework === fw.id)
        .map((r) => {
          const ev = [...r.evidence.map((e) => `<li>${escapeHtml(e)}</li>`), ...r.missing.map((m) => `<li class="miss">${escapeHtml(m)}</li>`)].join("");
          return `<article class="tile ${r.verdict}">
            <p class="kicker">${escapeHtml(r.article)} · ${escapeHtml(r.verdict.replace("_", " "))}</p>
            <h3>${escapeHtml(r.title)}</h3>
            <p class="obl">${escapeHtml(r.obligation)}</p>
            <ul>${ev}</ul>
          </article>`;
        })
        .join("\n");
      return `<section><h2>${escapeHtml(fw.title)}</h2><div class="grid">${items}</div></section>`;
    })
    .join("\n");

  const interactions = report.interactions
    .map((p) => {
      return `<article class="tile">
        <p class="kicker">${escapeHtml(p.kind)} · ${escapeHtml(p.metadata.id)}</p>
        <h3>${escapeHtml(p.inputText)}</h3>
        <p class="obl">${escapeHtml(p.outputText.replace(/\s+/g, " ").slice(0, 360))}</p>
        <p class="meta">${escapeHtml(p.metadata.confidenceBand)} · ${p.metadata.citationCount} citations · ${p.metadata.grounded ? "grounded" : "ungrounded"}${p.metadata.refused ? " · refused" : ""}</p>
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Aether compliance report ${escapeHtml(report.id)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400&family=Instrument+Serif:ital@0;1&display=swap" />
  <style>
    :root { color-scheme: dark; --bg:#09090b; --surface:#121214; --fg:#f4f4f0; --muted:#a1a1aa; --dim:#71717a; --accent:#c8ccd4; --ok:#7d9a7e; --danger:#c07a76; --border:rgba(244,244,240,.12); }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 "IBM Plex Sans", system-ui, sans-serif; }
    main { max-width: 920px; margin: 0 auto; padding: 48px 24px 80px; }
    h1 { font-family: "Instrument Serif", serif; font-style: italic; font-weight: 400; font-size: 40px; letter-spacing: -.03em; margin: 8px 0 12px; }
    h2 { font-size: 14px; font-weight: 500; margin: 40px 0 12px; }
    h3 { font-size: 15px; font-weight: 500; margin: 8px 0; }
    .kicker { font-family: "IBM Plex Mono", monospace; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: var(--dim); margin: 0; }
    .lede { color: var(--muted); max-width: 42em; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 28px 0; }
    .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
    .kpi b { display: block; font-family: "Instrument Serif", serif; font-style: italic; font-size: 28px; font-weight: 400; margin-top: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
    .tile.deny { border-color: color-mix(in oklab, var(--danger) 50%, var(--border)); }
    .tile.allow { border-color: color-mix(in oklab, var(--ok) 40%, var(--border)); }
    .obl, .meta { color: var(--muted); font-size: 13px; margin: 0; }
    ul { margin: 8px 0 0; padding-left: 16px; color: var(--muted); font-size: 13px; }
    .miss { color: var(--danger); }
    footer { margin-top: 48px; color: var(--dim); font-size: 12px; max-width: 42em; }
    @media (max-width: 720px) { .kpis, .grid { grid-template-columns: 1fr 1fr; } }
    @media print { body { background: #fff; color: #111; } .tile, .kpi { border-color: #ddd; background: #fff; } }
  </style>
</head>
<body>
  <main>
    <p class="kicker">Governance · ${escapeHtml(report.regulationsSet)}</p>
    <h1>Compliance report</h1>
    <p class="lede">${escapeHtml(contract.application.name)} ${escapeHtml(contract.application.modelVersion)} · ${escapeHtml(contract.application.modelName)} · ${escapeHtml(report.createdAt)} · ${escapeHtml(report.id)}</p>
    <div class="kpis">
      <div class="kpi"><p class="kicker">Allow</p><b>${summary.allow}</b></div>
      <div class="kpi"><p class="kicker">Deny</p><b>${summary.deny}</b></div>
      <div class="kpi"><p class="kicker">Not applicable</p><b>${summary.notApplicable}</b></div>
      <div class="kpi"><p class="kicker">Pass rate</p><b>${pct}</b></div>
    </div>
    <section>
      <h2>Application</h2>
      <p class="lede">${escapeHtml(contract.declared.purpose)}</p>
      <p class="meta">Intended use ${escapeHtml(contract.declared.intendedUseKind)} · risk ${escapeHtml(contract.declared.riskClass)} · oversight ${contract.declared.humanOversight ? "yes" : "no"} · autonomous ${contract.declared.autonomousAction ? "yes" : "no"} · ${contract.measured.documents} documents · ${contract.measured.chunks} chunks · recall ${contract.measured.recallAt5.toFixed(2)}</p>
    </section>
    <section>
      <h2>Interactions</h2>
      <div class="grid">${interactions}</div>
    </section>
    ${fwBlocks}
    <footer>
      Evidence against Aether’s own obligations for an advisory knowledge desk. Not CE marking, not a notified-body assessment, and not legal advice.
      Inspired by AICertify (Apache-2.0). Original Aether rules; GOPAL Rego is not copied. Open Policy Agent is not required at runtime.
    </footer>
  </main>
</body>
</html>`;
}

export function renderJson(report: ComplianceReport): string {
  return JSON.stringify(
    {
      id: report.id,
      createdAt: report.createdAt,
      regulationsSet: report.regulationsSet,
      frameworks: report.frameworks,
      summary: report.summary,
      application: report.contract.application,
      declared: report.contract.declared,
      measured: {
        ...report.contract.measured,
        probes: report.contract.measured.probes.map((p) => ({
          ...p,
          output: p.output.slice(0, 400),
        })),
      },
      interactions: report.interactions.map((i) => ({
        input_text: i.inputText,
        output_text: i.outputText.slice(0, 400),
        kind: i.kind,
        metadata: i.metadata,
      })),
      results: report.results,
    },
    null,
    2,
  );
}
