import { AsyncLocalStorage } from "node:async_hooks";
import {
  SpanStatusCode,
  context,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import { ensureOtel, getInstruments } from "./sdk";

const parentStore = new AsyncLocalStorage<Span>();

export function getTracer() {
  ensureOtel();
  return trace.getTracer("aether", "1.0.0");
}

export async function withSpan<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, { attributes: attrs }, async (span) => {
    return parentStore.run(span, async () => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        getInstruments().errorCount.add(1, { "aether.span": name });
        throw err;
      } finally {
        span.end();
      }
    });
  });
}

export function childSpan(name: string, startMs: number, attrs?: Attributes): void {
  const tracer = getTracer();
  const parent = parentStore.getStore();
  const ctx = parent ? trace.setSpan(context.active(), parent) : context.active();
  const span = tracer.startSpan(name, { startTime: startMs, attributes: attrs }, ctx);
  span.end();
}

export function activeTraceId(): string | null {
  const span = parentStore.getStore() ?? trace.getSpan(context.active());
  return span ? span.spanContext().traceId : null;
}
