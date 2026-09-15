import { FRAMEWORKS, type FrameworkId } from "./types";

const AVAILABLE = new Set<string>(FRAMEWORKS.map((f) => f.id));

export class RegulationSet {
  readonly name: string;
  private readonly ids: FrameworkId[] = [];

  constructor(name: string) {
    this.name = name;
  }

  listAvailable(): { id: FrameworkId; title: string; kicker: string }[] {
    return FRAMEWORKS.map((f) => ({ id: f.id, title: f.title, kicker: f.kicker }));
  }

  add(id: string): this {
    if (!AVAILABLE.has(id)) {
      throw new Error(`Unknown regulation "${id}". Available: ${[...AVAILABLE].join(", ")}`);
    }
    const fw = id as FrameworkId;
    if (!this.ids.includes(fw)) this.ids.push(fw);
    return this;
  }

  getRegulations(): FrameworkId[] {
    return [...this.ids];
  }
}

export const regulations = {
  create(name: string): RegulationSet {
    return new RegulationSet(name);
  },
};
