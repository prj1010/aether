import { context, metrics, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

export const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME?.trim() || "aether";
export const OTEL_SERVICE_VERSION = "1.0.0";

export interface OtelSpanView {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  status: "UNSET" | "OK" | "ERROR";
  statusMessage?: string;
  attributes: Record<string, string | number | boolean>;
}

export interface OtelTraceView {
  traceId: string;
  name: string;
  startMs: number;
  durationMs: number;
  spanCount: number;
  status: OtelSpanView["status"];
  attributes: Record<string, string | number | boolean>;
  spans: OtelSpanView[];
}

export interface OtelSnapshot {
  service: { name: string; version: string };
  exporter: {
    traces: "otlp+in-process" | "in-process";
    metrics: "otlp+in-process" | "in-process";
    endpoint: string | null;
  };
  traces: OtelTraceView[];
  metrics: {
    asks: number;
    ingests: number;
    errors: number;
    p50Ms: number;
    p95Ms: number;
    tokens: number;
    llmAsks: number;
  };
}

type Instruments = {
  askDuration: ReturnType<ReturnType<typeof metrics.getMeter>["createHistogram"]>;
  askCount: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  askTokens: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  ingestCount: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  errorCount: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
};

type OtelState = {
  started: boolean;
  ring: RingSpanExporter;
  instruments: Instruments;
  otlpEndpoint: string | null;
};

const globalRef = globalThis as typeof globalThis & { __aetherOtel__?: OtelState };

function otlpEndpoint(): string | null {
  const raw =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() ||
    "";
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

function otlpHeaders(): Record<string, string> | undefined {
  const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS?.trim();
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return Object.keys(out).length ? out : undefined;
}

function hrToMs(hr: [number, number] | number): number {
  if (typeof hr === "number") return hr;
  return hr[0] * 1_000 + hr[1] / 1e6;
}

function flattenAttrs(
  attrs: ReadableSpan["attributes"],
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

function serialize(span: ReadableSpan): OtelSpanView {
  const ctx = span.spanContext();
  const parent =
    span.parentSpanContext?.spanId && span.parentSpanContext.spanId !== "0000000000000000"
      ? span.parentSpanContext.spanId
      : null;
  const startMs = hrToMs(span.startTime as [number, number]);
  const endMs = hrToMs(span.endTime as [number, number]);
  const code = span.status.code;
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: parent,
    name: span.name,
    kind: span.kind,
    startMs,
    endMs,
    durationMs: Math.max(0, endMs - startMs),
    status: code === 2 ? "ERROR" : code === 1 ? "OK" : "UNSET",
    statusMessage: span.status.message || undefined,
    attributes: flattenAttrs(span.attributes),
  };
}

class RingSpanExporter implements SpanExporter {
  private readonly spans: OtelSpanView[] = [];
  constructor(
    private readonly max: number,
    private readonly next?: SpanExporter,
  ) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    for (const s of spans) this.spans.push(serialize(s));
    if (this.spans.length > this.max) this.spans.splice(0, this.spans.length - this.max);
    if (this.next) {
      this.next.export(spans, resultCallback);
      return;
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return this.next?.shutdown() ?? Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return this.next?.forceFlush?.() ?? Promise.resolve();
  }

  list(): OtelSpanView[] {
    return this.spans.slice();
  }
}

function groupTraces(spans: OtelSpanView[]): OtelTraceView[] {
  const by = new Map<string, OtelSpanView[]>();
  for (const s of spans) {
    const list = by.get(s.traceId) ?? [];
    list.push(s);
    by.set(s.traceId, list);
  }
  const traces: OtelTraceView[] = [];
  for (const [traceId, list] of by) {
    list.sort((a, b) => a.startMs - b.startMs);
    const root = list.find((s) => !s.parentSpanId) ?? list[0]!;
    const startMs = Math.min(...list.map((s) => s.startMs));
    const endMs = Math.max(...list.map((s) => s.endMs));
    traces.push({
      traceId,
      name: root.name,
      startMs,
      durationMs: Math.max(0, endMs - startMs),
      spanCount: list.length,
      status: list.some((s) => s.status === "ERROR") ? "ERROR" : root.status,
      attributes: root.attributes,
      spans: list,
    });
  }
  traces.sort((a, b) => b.startMs - a.startMs);
  return traces.slice(0, 80);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] ?? 0;
}

export function ensureOtel(): OtelState {
  if (globalRef.__aetherOtel__?.started) return globalRef.__aetherOtel__;

  try {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager());
  } catch {
    /* already registered */
  }

  const endpoint = otlpEndpoint();
  const headers = otlpHeaders();
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: OTEL_SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: OTEL_SERVICE_VERSION,
    "service.namespace": "knowledge-desk",
  });

  const otlpTraces = endpoint
    ? new OTLPTraceExporter({
        url: endpoint.endsWith("/v1/traces") ? endpoint : `${endpoint}/v1/traces`,
        headers,
      })
    : undefined;
  const ring = new RingSpanExporter(500, otlpTraces);

  const tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(ring)],
  });
  trace.setGlobalTracerProvider(tracerProvider);

  const metricReaders = [
    new PeriodicExportingMetricReader({
      exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
      exportIntervalMillis: 60_000,
    }),
  ];
  if (endpoint) {
    metricReaders.push(
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: endpoint.endsWith("/v1/metrics") ? endpoint : `${endpoint}/v1/metrics`,
          headers,
        }),
        exportIntervalMillis: 15_000,
      }),
    );
  }
  const meterProvider = new MeterProvider({ resource, readers: metricReaders });
  metrics.setGlobalMeterProvider(meterProvider);

  const meter = metrics.getMeter("aether", OTEL_SERVICE_VERSION);
  const instruments: Instruments = {
    askDuration: meter.createHistogram("aether.ask.duration", {
      unit: "ms",
      description: "End-to-end ask latency",
    }),
    askCount: meter.createCounter("aether.ask.count", { description: "Asks handled" }),
    askTokens: meter.createCounter("aether.ask.tokens", { description: "Generator tokens" }),
    ingestCount: meter.createCounter("aether.ingest.count", { description: "Documents indexed" }),
    errorCount: meter.createCounter("aether.error.count", { description: "Failed operations" }),
  };

  const state: OtelState = {
    started: true,
    ring,
    instruments,
    otlpEndpoint: endpoint,
  };
  globalRef.__aetherOtel__ = state;
  return state;
}

export function otelSnapshot(): OtelSnapshot {
  const state = ensureOtel();
  const traces = groupTraces(state.ring.list());
  const asks = traces.filter((t) => t.name === "aether.ask");
  const durs = asks.map((t) => t.durationMs);
  const tokens = asks.reduce((s, t) => s + (Number(t.attributes["aether.gen.tokens"]) || 0), 0);
  const llmAsks = asks.filter((t) => t.attributes["aether.gen.used_llm"] === true).length;
  const ingests = traces.filter((t) => t.name === "aether.ingest").length;
  const errors = traces.filter((t) => t.status === "ERROR").length;
  return {
    service: { name: OTEL_SERVICE_NAME, version: OTEL_SERVICE_VERSION },
    exporter: {
      traces: state.otlpEndpoint ? "otlp+in-process" : "in-process",
      metrics: state.otlpEndpoint ? "otlp+in-process" : "in-process",
      endpoint: state.otlpEndpoint,
    },
    traces,
    metrics: {
      asks: asks.length,
      ingests,
      errors,
      p50Ms: Math.round(percentile(durs, 0.5)),
      p95Ms: Math.round(percentile(durs, 0.95)),
      tokens,
      llmAsks,
    },
  };
}

export function getInstruments(): Instruments {
  return ensureOtel().instruments;
}
