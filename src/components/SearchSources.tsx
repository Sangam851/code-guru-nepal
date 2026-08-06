import { ExternalLink, SearchX } from "lucide-react";
import { faviconUrl, type AnswerSource } from "@/lib/answer-meta";

/** Horizontal row of Perplexity-style source cards, shown above an answer. */
export function SourceCards({
  sources,
  loading = false,
}: {
  sources: AnswerSource[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-1.5" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground px-0.5">
          <ExternalLink className="h-3 w-3" />
          Searching the web…
        </div>
        <div className="flex gap-2 overflow-hidden pb-1 -mx-1 px-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              data-testid="source-card-skeleton"
              className="shrink-0 w-[168px] rounded-xl border border-border/60 bg-card/40 px-2.5 py-2 animate-pulse"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <div className="h-3.5 w-3.5 rounded-sm bg-muted" />
                <div className="h-2 w-16 rounded bg-muted" />
              </div>
              <div className="h-2 w-full rounded bg-muted mb-1" />
              <div className="h-2 w-2/3 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl border border-dashed border-border/60 bg-card/30 px-3 py-2 text-[11px] text-muted-foreground">
        <SearchX className="h-3.5 w-3.5" />
        No web sources found for this answer.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground px-0.5">
        <ExternalLink className="h-3 w-3" />
        {sources.length} source{sources.length === 1 ? "" : "s"}
      </div>
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1 [-webkit-overflow-scrolling:touch]">
        {sources.map((s, i) => (
          <a
            key={`${s.url}-${i}`}
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            data-testid="source-card"
            className="shrink-0 w-[168px] min-h-[56px] touch-manipulation select-none rounded-xl border border-border/60 bg-card/60 hover:bg-card active:bg-card px-2.5 py-2 transition [touch-action:manipulation]"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <img src={faviconUrl(s.url)} alt="" className="h-3.5 w-3.5 rounded-sm" loading="lazy" />
              <span className="text-[10px] text-muted-foreground truncate">{s.site}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{i + 1}</span>
            </div>
            <div className="text-[11px] leading-snug line-clamp-2 text-foreground/90">{s.title}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Small pill buttons with related follow-up questions. */
export function FollowUps({
  questions,
  onPick,
  disabled,
}: {
  questions: string[];
  onPick: (q: string) => void;
  disabled?: boolean;
}) {
  if (questions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className="rounded-full border border-border/60 bg-card/50 px-3 py-1.5 min-h-[32px] touch-manipulation text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/60 transition disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
