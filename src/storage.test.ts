import { describe, expect, test } from "vitest";
import { computeTrustStats, makeSnippet, type TrustLogEntry } from "./storage";

function entry(overrides: Partial<TrustLogEntry>): TrustLogEntry {
  return {
    at: 0,
    before: 3,
    after: 3,
    engine: "on-device",
    flaggedTypes: [],
    snippet: "",
    ...overrides,
  };
}

describe("computeTrustStats", () => {
  test("returns zeros for an empty log", () => {
    expect(computeTrustStats([])).toEqual({
      total: 0,
      dropped: 0,
      raised: 0,
      unchanged: 0,
      averageChange: 0,
      flaggedByType: [],
    });
  });

  test("counts drops, rises and unchanged checks", () => {
    const stats = computeTrustStats([
      entry({ before: 5, after: 2 }),
      entry({ before: 4, after: 3 }),
      entry({ before: 2, after: 4 }),
      entry({ before: 3, after: 3 }),
    ]);

    expect(stats.total).toBe(4);
    expect(stats.dropped).toBe(2);
    expect(stats.raised).toBe(1);
    expect(stats.unchanged).toBe(1);
    expect(stats.averageChange).toBe(-0.5);
  });

  test("ranks flagged claim types, most flagged first", () => {
    const stats = computeTrustStats([
      entry({ flaggedTypes: ["number", "citation", "citation"] }),
      entry({ flaggedTypes: ["citation", "fact"] }),
      entry({ flaggedTypes: ["number"] }),
    ]);

    expect(stats.flaggedByType).toEqual([
      ["citation", 3],
      ["number", 2],
      ["fact", 1],
    ]);
  });
});

describe("makeSnippet", () => {
  test("collapses whitespace and keeps short text whole", () => {
    expect(makeSnippet("  The  study\nfound 43%  ")).toBe("The study found 43%");
  });

  test("cuts long text and marks the cut", () => {
    const snippet = makeSnippet("word ".repeat(60));

    expect(snippet.length).toBeLessThanOrEqual(81);
    expect(snippet.endsWith("…")).toBe(true);
  });
});
