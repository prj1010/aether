import type { Candidate, Citation, Conflict, MemoryItem } from "./types";
import { SYSTEM_PROMPT, wrapUntrusted } from "./security";
import { snippet } from "./text";

export interface GenerateInput {
  query: string;
  selected: Candidate[];
  citations: Citation[];
  contradictions: Conflict[];
  memory: MemoryItem[];
  confidenceBand: string;
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

  const apiKey = process.env.XAI_API_KEY;
  const user = buildUserPrompt(input);

  if (!apiKey) {
    return extractive(input, Date.now() - started);
  }

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.1,
        max_tokens: 700,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      return extractive(input, Date.now() - started);
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return extractive(input, Date.now() - started);
    const { answer, followups } = splitFollowups(text);
    return {
      answer,
      model: "grok-4.5",
      usedLlm: true,
      inputTokens: body.usage?.prompt_tokens ?? Math.ceil(user.length / 4),
      outputTokens: body.usage?.completion_tokens ?? Math.ceil(text.length / 4),
      latencyMs: Date.now() - started,
      followups,
    };
  } catch {
    return extractive(input, Date.now() - started);
  }
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
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:Follow-up:\s*)(.+)/i);
    if (m?.[1]) followups.push(m[1].trim().replace(/^[-*]\s*/, ""));
    else kept.push(line);
  }
  return { answer: kept.join("\n").trim(), followups: followups.slice(0, 3) };
}
