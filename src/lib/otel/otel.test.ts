import assert from "node:assert/strict";
import { test } from "node:test";
import { askEngine, resetEngine } from "../rag/engine.ts";
import { otelSnapshot } from "./sdk.ts";

test("askEngine records an OpenTelemetry aether.ask span", async () => {
  resetEngine();
  await askEngine({
    query: "What is the vacation policy?",
    forcePath: "fast",
    forceExtractive: true,
    recordTrace: false,
  });
  const snap = otelSnapshot();
  assert.equal(snap.service.name, "aether");
  const asks = snap.traces.filter((t) => t.name === "aether.ask");
  assert.ok(asks.length >= 1, "expected aether.ask traces");
  const last = asks[0]!;
  assert.ok(last.spanCount >= 2, `expected child spans, got ${last.spanCount}`);
  assert.ok(last.spans.some((s) => s.name === "query.classify"));
  assert.equal(typeof last.traceId, "string");
  assert.equal(last.traceId.length, 32);
  assert.ok(last.attributes["aether.query.kind"]);
});
