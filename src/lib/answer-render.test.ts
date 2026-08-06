import { describe, expect, it } from "vitest";
import { linkCitations, splitSegments } from "./answer-render";
import { encodeAnswerMeta, parseAnswer, siteName, faviconUrl } from "./answer-meta";
import type { AnswerSource } from "./answer-meta";

const sources: AnswerSource[] = [
  { title: "Python docs", url: "https://docs.python.org/3/", site: "docs.python.org" },
  { title: "MDN", url: "https://developer.mozilla.org/en-US/", site: "developer.mozilla.org" },
  { title: "Go blog", url: "https://go.dev/blog/", site: "go.dev" },
];

describe("inline citations", () => {
  it("links every [n] marker to the matching source URL", () => {
    const out = linkCitations("A [1] and B [2] and C [3].", sources);
    expect(out).toBe(
      "A [1](https://docs.python.org/3/) and B [2](https://developer.mozilla.org/en-US/) and C [3](https://go.dev/blog/).",
    );
  });

  it("maps each marker to the source at index n-1 for every source", () => {
    sources.forEach((src, i) => {
      const n = i + 1;
      expect(linkCitations(`x [${n}] y`, sources)).toBe(`x [${n}](${src.url}) y`);
    });
  });

  it("leaves out-of-range markers untouched", () => {
    expect(linkCitations("see [9]", sources)).toBe("see [9]");
    expect(linkCitations("see [0]", sources)).toBe("see [0]");
  });

  it("does not double-link markers that are already markdown links", () => {
    const already = "see [1](https://docs.python.org/3/)";
    expect(linkCitations(already, sources)).toBe(already);
  });

  it("handles repeated markers and no-source answers", () => {
    expect(linkCitations("[1] then [1]", sources)).toBe(
      "[1](https://docs.python.org/3/) then [1](https://docs.python.org/3/)",
    );
    expect(linkCitations("[1] alone", [])).toBe("[1] alone");
  });
});

describe("answer metadata round-trip", () => {
  it("survives encode -> parse so cards/followups persist after reload", () => {
    const content = `Answer body [1].${encodeAnswerMeta({ sources, followups: ["Why?", "How?"] })}`;
    const parsed = parseAnswer(content);
    expect(parsed.body).toBe("Answer body [1].");
    expect(parsed.meta?.sources).toHaveLength(3);
    expect(parsed.meta?.sources[0].url).toBe(sources[0].url);
    expect(parsed.meta?.followups).toEqual(["Why?", "How?"]);
  });

  it("returns null meta for plain answers", () => {
    expect(parseAnswer("just text").meta).toBeNull();
  });

  it("derives site name and favicon from a URL", () => {
    expect(siteName("https://www.go.dev/blog")).toBe("go.dev");
    expect(faviconUrl("https://www.go.dev/blog")).toContain("go.dev");
  });
});

describe("segment splitting", () => {
  it("separates explanation text from fenced code blocks", () => {
    const segs = splitSegments("Intro\n\n```python\nprint(1)\n```\n\nOutro");
    expect(segs.map((s) => s.type)).toEqual(["text", "code", "text"]);
    expect(segs[1]).toMatchObject({ type: "code", lang: "python", value: "print(1)" });
  });

  it("returns a single text segment when there is no code", () => {
    expect(splitSegments("plain")).toEqual([{ type: "text", value: "plain" }]);
  });
});