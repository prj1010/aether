import type { Candidate, Citation, Conflict, MemoryItem } from "./types";
import { completeChat } from "./llm";
import { getActiveSystemPrompt, wrapUntrusted } from "./security";
import { snippet } from "./text";

export interface GenerateInput {
  query: string;
  selected: Candidate[];
  citations: Citation[];
  contradictions: Conflict[];
  memory: MemoryItem[];
  confidenceBand: string;
  skipLlm?: boolean;
  systemPrompt?: string;
}

export interface GenerateOutput {
  answer: string;
  model: string;
  usedLlm: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  followups: string[];
}

export async function generateAnswer(input: GenerateInput): Promise<GenerateOutput> {
  const started = Date.now();
  if (input.confidenceBand === "insufficient" || input.selected.length === 0) {
    return {
      answer:
        "I couldn't find enough evidence in the available enterprise knowledge base to answer this reliably. Try a more specific policy name, or inspect retrieval to see what was considered.",
      model: "extractive",
      usedLlm: false,
      inputTokens: 0,
      outputTokens: 40,
      latencyMs: Date.now() - started,
      followups: [
        "What documents are in the knowledge base?",
        "Show the retrieval inspector for this query",
      ],
    };
  }

  if (input.skipLlm) {
    return extractive(input, Date.now() - started);
  }

  const user = buildUserPrompt(input);
  const llm = await completeChat({
    system: input.systemPrompt || getActiveSystemPrompt(),
    user,
    temperature: 0.1,
    maxTokens: 700,
  });

  if (!llm) {
    return extractive(input, Date.now() - started);
  }

  const { answer, followups } = splitFollowups(llm.text);
  return {
    answer,
    model: llm.model,
    usedLlm: true,
    inputTokens: llm.inputTokens,
    outputTokens: llm.outputTokens,
    latencyMs: Date.now() - started,
    followups,
  };
}

function buildUserPrompt(input: GenerateInput): string {
  const docs = input.selected
    .map((c, i) => {
      const head = `[${i + 1}] ${c.chunk.docTitle} · ${c.chunk.section} · p.${c.chunk.page} · v${c.chunk.version} · valid_from ${c.chunk.validFrom}${c.chunk.validTo ? ` valid_to ${c.chunk.validTo}` : ""} · ${c.chunk.status}`;
      return `${head}\n${wrapUntrusted(c.chunk.content, c.chunk.sourceUri)}`;
    })
    .join("\n\n");
  const mem =
    input.memory.length === 0
      ? ""
      : `\n<memory>\n${input.memory
          .slice(0, 8)
          .map((m) => `${m.layer} ${m.wing}/${m.room}: ${m.content}`)
          .join("\n")}\n</memory>\n`;
  const conflicts =
    input.contradictions.length === 0
      ? ""
      : `\nKnown conflicts:\n${input.contradictions
          .map((c) => `- ${c.topic}: ${c.resolution}`)
          .join("\n")}\n`;
  return `Question:\n${input.query}\n${mem}\nEvidence:\n${docs}${conflicts}\n\nWrite the answer with citations like [1].`;
}

function extractive(input: GenerateInput, latencyMs: number): GenerateOutput {
  const top = input.selected.slice(0, 3);
  const lines = top.map((c, i) => {
    const n = i + 1;
    return `${snippet(c.chunk.content, 220)} [${n}]`;
  });
  let answer = lines.join("\n\n");
  if (input.contradictions[0]) {
    answer += `\n\nConflict detected. ${input.contradictions[0].resolution}`;
  }
  return {
    answer,
    model: "extractive",
    usedLlm: false,
    inputTokens: 0,
    outputTokens: Math.ceil(answer.length / 4),
    latencyMs,
    followups: [],
  };
}

function splitFollowups(text: string): { answer: string; followups: string[] } {
  const followups: string[] = [];
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:Follow-up:\s*)(.+)/i);
    if (m?.[1]) followups.push(m[1].trim().replace(/^[-*]\s*/, ""));
    else kept.push(line);
  }
  return { answer: kept.join("\n").trim(), followups: followups.slice(0, 3) };
}
