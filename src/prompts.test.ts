import { describe, expect, test } from "vitest";
import {
  MAX_CLAIMS,
  MAX_INPUT_CHARS,
  parseQuickCheck,
  prepareInput,
} from "./prompts";

const validClaim = {
  text: "Smith et al. (2019) found a 43% drop",
  type: "citation",
  risk: "high",
  why: "The paper may not exist.",
  verify: "Search Google Scholar for the title.",
};

describe("parseQuickCheck", () => {
  test("returns claims and summary for valid JSON", () => {
    const raw = JSON.stringify({ claims: [validClaim], summary: "Check the citation." });

    const result = parseQuickCheck(raw);

    expect(result).toEqual({ claims: [validClaim], summary: "Check the citation." });
  });

  test("accepts JSON wrapped in a markdown code fence", () => {
    const raw = "```json\n" + JSON.stringify({ claims: [], summary: "Nothing to check." }) + "\n```";

    const result = parseQuickCheck(raw);

    expect(result).toEqual({ claims: [], summary: "Nothing to check." });
  });

  test("returns null when the reply is not JSON", () => {
    expect(parseQuickCheck("Here are the claims I found:")).toBeNull();
  });

  test("returns null when claims is missing", () => {
    expect(parseQuickCheck(JSON.stringify({ summary: "ok" }))).toBeNull();
  });

  test("drops claims with an unknown type or risk", () => {
    const raw = JSON.stringify({
      claims: [validClaim, { ...validClaim, risk: "extreme" }, { ...validClaim, type: "opinion" }],
      summary: "",
    });

    const result = parseQuickCheck(raw);

    expect(result?.claims).toEqual([validClaim]);
  });

  test("returns null when every returned claim is invalid", () => {
    const raw = JSON.stringify({ claims: [{ text: "x" }], summary: "" });

    expect(parseQuickCheck(raw)).toBeNull();
  });

  test("keeps at most MAX_CLAIMS claims", () => {
    const claims = Array.from({ length: MAX_CLAIMS + 3 }, () => validClaim);

    const result = parseQuickCheck(JSON.stringify({ claims, summary: "" }));

    expect(result?.claims).toHaveLength(MAX_CLAIMS);
  });
});

describe("prepareInput", () => {
  test("trims and keeps short text untouched", () => {
    expect(prepareInput("  hello  ")).toEqual({ text: "hello", wasTruncated: false });
  });

  test("truncates text longer than the limit and reports it", () => {
    const prepared = prepareInput("a".repeat(MAX_INPUT_CHARS + 50));

    expect(prepared.text).toHaveLength(MAX_INPUT_CHARS);
    expect(prepared.wasTruncated).toBe(true);
  });
});
