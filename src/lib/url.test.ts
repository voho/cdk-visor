import { afterEach, describe, expect, it, vi } from "vitest";
import { formatHash, parseHash } from "@/lib/url";

function withHash(hash: string) {
  vi.stubGlobal("window", { location: { hash } });
}

afterEach(() => vi.unstubAllGlobals());

describe("formatHash", () => {
  it("encodes focus and selected paths", () => {
    expect(formatHash({ focus: "A/B", selected: "A/B/C" })).toBe(
      "#f=A%2FB&s=A%2FB%2FC",
    );
  });
});

describe("parseHash", () => {
  it("returns null when there is no hash", () => {
    withHash("");
    expect(parseHash()).toBeNull();
  });

  it("round-trips a formatted hash", () => {
    withHash(formatHash({ focus: "A/B", selected: "A/B/C" }));
    expect(parseHash()).toEqual({ focus: "A/B", selected: "A/B/C" });
  });

  it("defaults selected to focus when only focus is present", () => {
    withHash("#f=Stack");
    expect(parseHash()).toEqual({ focus: "Stack", selected: "Stack" });
  });
});
