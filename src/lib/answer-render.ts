import type { AnswerSource } from "./answer-meta";

export type Segment = { type: "text"; value: string } | { type: "code"; lang?: string; value: string };

/** Turn bare [1] markers in an answer into markdown links to the matching source. */
export function linkCitations(text: string, sources: AnswerSource[]): string {
  return text.replace(/\[(\d{1,2})\](?!\()/g, (full, n: string) => {
    const src = sources[Number(n) - 1];
    return src && src.url ? `[${n}](${src.url})` : full;
  });
}

/** Split assistant content into alternating text / fenced-code segments. */
export function splitSegments(content: string): Segment[] {
  const out: Segment[] = [];
  const re = /```(\w+)?\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const text = content.slice(last, m.index).trim();
    if (text) out.push({ type: "text", value: text });
    out.push({ type: "code", lang: m[1], value: m[2].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  const tail = content.slice(last).trim();
  if (tail) out.push({ type: "text", value: tail });
  return out.length > 0 ? out : [{ type: "text", value: content }];
}