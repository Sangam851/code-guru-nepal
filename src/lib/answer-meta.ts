// Metadata footer embedded in stored assistant messages so web-search
// sources / follow-ups survive a reload without a schema change.
export type AnswerSource = { title: string; url: string; site: string };
export type AnswerMeta = { sources: AnswerSource[]; followups: string[] };

const META_RE = /\n*<!--PPLX (\{[\s\S]*?\})-->\s*$/;

export function encodeAnswerMeta(meta: AnswerMeta): string {
  return `\n\n<!--PPLX ${JSON.stringify(meta)}-->`;
}

export function parseAnswer(content: string): { body: string; meta: AnswerMeta | null } {
  const m = content.match(META_RE);
  if (!m) return { body: content, meta: null };
  try {
    const parsed = JSON.parse(m[1]) as AnswerMeta;
    return {
      body: content.replace(META_RE, "").trim(),
      meta: {
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        followups: Array.isArray(parsed.followups) ? parsed.followups : [],
      },
    };
  } catch {
    return { body: content.replace(META_RE, "").trim(), meta: null };
  }
}

export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function faviconUrl(url: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(siteName(url))}`;
}
