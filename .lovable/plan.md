
# Level Up — Nepali Coding AI

This is a large scope (9 feature areas, some overlapping). I'll ship it in **four phases** so you can review each before we move on. Nothing here changes the fact that Lovable AI + Tavily are the built-in providers (locked, per your earlier request).

---

## Phase 1 — Core chat UX (fixes the most-used surface)

1. **Auto language detection** — parse each user message; if it names Python/C/Java/etc., answer in that language regardless of the selected chip. The chip becomes a *default*, not a lock. Multi-language convo supported.
2. **Live preview pane** — when the assistant returns HTML/CSS/JS, render it in a sandboxed `<iframe srcdoc>` beside the code, updating when the block finishes streaming. Split-pane, resizable, collapsible.
3. **Message actions** — copy full response, regenerate last answer, edit previous user message (re-runs from that point).
4. **Explanation vs. code separation** — already in place; will keep and integrate with preview pane.

## Phase 2 — Composer & inputs

5. **Attach file** — PDF/DOCX/image/code parsed server-side (Lovable AI multimodal for images/PDF, text extraction for code/docx), injected as context.
6. **Camera** — mobile capture → same pipeline as attach (image → vision model).
7. **Microphone** — tap-to-talk using Lovable AI `openai/gpt-4o-mini-transcribe` STT endpoint; transcript fills the composer.

## Phase 3 — History, settings, theme

8. **Conversation history sidebar** — Supabase-backed `conversations` + `messages` tables (RLS scoped to `auth.uid()`), with search, rename, delete, pin. Sidebar collapsible; separate from the language chip menu. Each thread becomes `/chat/$threadId`.
9. **Light/Dark theme toggle** in Settings (persist in `localStorage`, respects system by default).
10. **Settings polish** — fill empty space with: theme toggle, provider transparency card (model name + "Standard tier via Lovable AI"), usage/credit hint (best-effort — no per-user cap API exists, so we show workspace-level guidance), bilingual mode toggle.

## Phase 4 — Differentiators (Nepali-specific value)

11. **Bilingual explanations** — Nepali / English / Mixed toggle wired into the system prompt.
12. **Root-cause bug mode** — debug requests get a "Why it broke → Fix → Prevention" structure enforced via prompt.
13. **Execution tracer** — for "explain this code", prompt the model to emit a step-by-step variable-state table rendered as a nice component.
14. **Curriculum mode** — TU/NEB topic-tagged practice sets. Seed ~30 problems across DSA, OOP, DBMS, Web via migration; picker in sidebar.
15. **Daily micro-challenge + streak** — one problem/day on welcome screen, streak stored in `user_streaks` table, visible counter.

## Deferred / honest trade-offs

- **Non-browser code execution (Python/C/Java "Run")** — a real sandboxed runner needs a third-party service (Judge0, Piston, etc.). I'll wire it to the free public **Piston API** (`emkc.org/api/v2/piston`) as an MVP. If you want production-grade, we'd add a paid runner later.
- **"X messages left today"** — Lovable AI doesn't expose a per-user quota endpoint. I'll show the model tier + a link to workspace billing rather than fake a countdown.

---

## Technical notes

- **DB tables (Phase 3):** `conversations(id, user_id, title, pinned, created_at, updated_at)`, `messages(id, conversation_id, role, content, language, created_at)`, `user_streaks(user_id, current_streak, last_completed_at)`, `challenges(id, title, prompt, difficulty, topic, language)`, `challenge_attempts(id, user_id, challenge_id, passed, created_at)`. All with RLS + GRANTs per project rules.
- **Routing:** move chat under `/_authenticated/chat/$threadId` with `_authenticated/chat/index.tsx` creating + redirecting to a new thread.
- **STT:** browser records PCM → WAV → server function → `ai.gateway.lovable.dev/v1/audio/transcriptions`.
- **File parsing:** PDFs/images sent as `image_url`/`file` content blocks to Gemini in chat call; DOCX parsed with `mammoth`; code files inlined as text.
- **Preview iframe:** `sandbox="allow-scripts"` only, srcdoc built from streamed HTML/CSS/JS code fences.
- **Piston runner:** server function proxies to Piston to keep CORS clean and hide any future key.

---

**Reply "go" to start Phase 1**, or tell me to reorder / drop anything. I'd recommend doing phases in order because Phase 3's DB migration reshapes how messages are stored, and doing it after Phase 4 would mean rewriting streak/curriculum code.
