import { create } from "zustand";
import type {
  AnswerResult,
  Citation,
  Confidence,
  MemoryItem,
  QueryPath,
  RetrievalTrace,
} from "@/lib/rag/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  confidence?: Confidence;
  path?: QueryPath;
  kind?: string;
  latencyMs?: number;
  followups?: string[];
  refused?: boolean;
  contradictions?: AnswerResult["contradictions"];
  traceId?: string;
  createdAt: number;
}

const SEED_MEMORY: MemoryItem[] = [
  {
    id: "m-l0",
    layer: "L0",
    wing: "identity",
    room: "self",
    closet: "role",
    content: "Knowledge worker at Northstar Systems. Prefers concise answers with citations.",
    createdAt: new Date().toISOString(),
    lastAccess: new Date().toISOString(),
  },
  {
    id: "m-l1",
    layer: "L1",
    wing: "story",
    room: "now",
    closet: "brief",
    content: "Evaluating Aether as the office knowledge engine against policy and architecture corpora.",
    createdAt: new Date().toISOString(),
    lastAccess: new Date().toISOString(),
  },
];

interface AetherState {
  messages: ChatMessage[];
  lastTrace: RetrievalTrace | null;
  traces: RetrievalTrace[];
  memory: MemoryItem[];
  forcePath: "adaptive" | "fast" | "deep";
  asking: boolean;
  activeCitation: Citation | null;
  setForcePath: (p: AetherState["forcePath"]) => void;
  setAsking: (v: boolean) => void;
  setActiveCitation: (c: Citation | null) => void;
  pushUser: (content: string) => string;
  pushAssistant: (result: AnswerResult) => void;
  remember: (item: Omit<MemoryItem, "id" | "createdAt" | "lastAccess">) => void;
  clearChat: () => void;
}

export const useAether = create<AetherState>((set) => ({
  messages: [],
  lastTrace: null,
  traces: [],
  memory: SEED_MEMORY,
  forcePath: "adaptive",
  asking: false,
  activeCitation: null,
  setForcePath: (forcePath) => set({ forcePath }),
  setAsking: (asking) => set({ asking }),
  setActiveCitation: (activeCitation) => set({ activeCitation }),
  pushUser: (content) => {
    const id = `u_${Date.now().toString(36)}`;
    set((s) => ({
      messages: [
        ...s.messages,
        { id, role: "user", content, createdAt: Date.now() },
      ],
    }));
    return id;
  },
  pushAssistant: (result) => {
    const id = `a_${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const drawer: MemoryItem = {
      id: `m-${id}`,
      layer: "L3",
      wing: "sessions",
      room: now.slice(0, 10),
      closet: result.kind,
      content: result.answer.slice(0, 400),
      createdAt: now,
      lastAccess: now,
    };
    const topic: MemoryItem = {
      id: `m-l2-${result.kind}`,
      layer: "L2",
      wing: "topics",
      room: result.kind,
      closet: result.path,
      content: `Last ${result.kind} question used the ${result.path} path with confidence ${result.confidence.band}.`,
      createdAt: now,
      lastAccess: now,
    };
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id,
          role: "assistant",
          content: result.answer,
          citations: result.citations,
          confidence: result.confidence,
          path: result.path,
          kind: result.kind,
          latencyMs: result.latencyMs,
          followups: result.followups,
          refused: result.refused,
          contradictions: result.contradictions,
          traceId: result.trace.id,
          createdAt: Date.now(),
        },
      ],
      lastTrace: result.trace,
      traces: [result.trace, ...s.traces].slice(0, 40),
      memory: [
        ...s.memory.filter((m) => m.id !== topic.id),
        topic,
        drawer,
      ].slice(0, 80),
    }));
  },
  remember: (item) =>
    set((s) => ({
      memory: [
        ...s.memory,
        {
          ...item,
          id: `m_${Date.now().toString(36)}`,
          createdAt: new Date().toISOString(),
          lastAccess: new Date().toISOString(),
        },
      ],
    })),
  clearChat: () => set({ messages: [], lastTrace: null }),
}));
