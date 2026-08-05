import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { encodeAnswerMeta, siteName, type AnswerSource } from "./answer-meta";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };
type Msg = {
  role: "system" | "user" | "assistant";
  content: string | ContentBlock[];
};

const RunInput = z.object({
  conversationId: z.string().uuid(),
  language: z.string().min(1).max(40),
  webSearch: z.boolean().default(false),
  userMessage: z.string().min(1),
  meshModel: z.string().max(120).optional(),
  attachment: z
    .object({
      kind: z.enum(["image", "file", "text"]),
      filename: z.string().max(200).optional(),
      mime: z.string().max(120).optional(),
      dataUrl: z.string().max(20_000_000).optional(),
      text: z.string().max(500_000).optional(),
    })
    .optional(),
});

// Heuristic language detection from a user message. Returns the detected
// language id (matching src/lib/languages.ts ids) when the message clearly
// names another language, otherwise null so we keep the chip default.
const LANG_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "python", re: /\b(python|py|pandas|numpy|django|flask|pytorch|tensorflow)\b/i },
  { id: "typescript", re: /\b(typescript|\.ts|tsx)\b/i },
  { id: "javascript", re: /\b(javascript|js|node\.?js|react|vue|nextjs|express)\b/i },
  { id: "html", re: /\b(html|css|tailwind|webpage|website|landing page)\b/i },
  { id: "java", re: /\bjava\b(?!\s*script)/i },
  { id: "cpp", re: /\b(c\+\+|cpp)\b/i },
  { id: "csharp", re: /\b(c#|csharp|\.net|dotnet)\b/i },
  { id: "c", re: /\bc\s+(program|code|language)|\bin\s+c\b/i },
  { id: "go", re: /\b(golang|\bgo\s+(lang|program|code))\b/i },
  { id: "rust", re: /\brust\b/i },
  { id: "ruby", re: /\b(ruby|rails)\b/i },
  { id: "php", re: /\b(php|laravel)\b/i },
  { id: "swift", re: /\bswift\b/i },
  { id: "kotlin", re: /\bkotlin\b/i },
  { id: "sql", re: /\b(sql|postgres|mysql|sqlite)\b/i },
  { id: "bash", re: /\b(bash|shell|zsh|\bsh\s+script)\b/i },
];

function detectLanguage(text: string): string | null {
  for (const { id, re } of LANG_PATTERNS) {
    if (re.test(text)) return id;
  }
  return null;
}

async function tavilySearch(apiKey: string, query: string) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5,
      search_depth: "basic",
      include_answer: true,
    }),
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    answer?: string;
    results?: Array<{ title: string; url: string; content: string }>;
  };
  const results = data.results ?? [];
  const lines: string[] = [];
  if (data.answer) lines.push(`Summary: ${data.answer}`);
  results.forEach((r, i) => {
    lines.push(`[${i + 1}] ${r.title} (${r.url})\n  ${r.content?.slice(0, 400)}`);
  });
  const sources: AnswerSource[] = results.map((r) => ({
    title: r.title,
    url: r.url,
    site: siteName(r.url),
  }));
  return { context: lines.join("\n"), sources };
}

// Run a search and never throw: a failed search should not kill the answer.
async function safeSearch(query: string): Promise<{ context: string; sources: AnswerSource[] }> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { context: "", sources: [] };
  try {
    return await tavilySearch(key, query);
  } catch (e) {
    return { context: `Web search failed: ${(e as Error).message}`, sources: [] };
  }
}

// Pull the trailing "FOLLOWUPS:" line the model emits for search answers.
function extractFollowups(reply: string): { body: string; followups: string[] } {
  const m = reply.match(/\n\s*FOLLOWUPS:\s*(.+)\s*$/i);
  if (!m) return { body: reply, followups: [] };
  const followups = m[1]
    .split("|")
    .map((s) => s.replace(/^[-•\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
  return { body: reply.slice(0, m.index).trimEnd(), followups };
}

function buildSystemPrompt(language: string, searchContext: string) {
  return `You are Nepali Cooding AI — a premium expert programming assistant made in Nepal, built for professional developers as well as beginners. The user's default topic is ${language.toUpperCase()}, but if they ask about another language answer in that language instead.

Rules:
1. Start with a short, plain-English explanation of the approach (2-4 sentences max).
2. Give complete, runnable, production-quality code in a fenced block with the correct language tag (\`\`\`python, \`\`\`c, \`\`\`html, ...). Never leave "..." placeholders. One concern per code block.
3. NEVER invent or narrate program output. You cannot execute code — the app has a real "Run Code" button for that. Do not print fake terminal output or claim a result you did not compute.
4. For debugging: identify the root cause first, then show the minimal corrected code, then explain why the fix works. Point out complexity, edge cases, security issues, and performance traps when relevant.
5. Prefer idiomatic style, clear naming, error handling, and comments only where they add value.
6. Be warm, direct and concise. Use markdown, and respond in Nepali/Nenglish if the user writes that way.${
    searchContext
      ? `\n\nLive web search results (numbered sources):\n${searchContext}

Web-answer rules (search was used for this turn):
- Cite sources inline with bracketed numbers like [1] or [2] placed immediately after the specific sentence or claim they support. Use only the numbers listed above. Do not add a "Sources" list at the bottom — the app renders source cards.
- End your entire reply with one final line in exactly this format:
FOLLOWUPS: question one | question two | question three`
      : ""
  }`;
}

function providerError(label: string, status: number, body: string) {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    message = parsed.error?.message ?? parsed.message ?? body;
  } catch {
    // Keep the raw body when the provider did not return JSON.
  }

  const compact = message.replace(/\s+/g, " ").trim();
  if (label === "OpenRouter" && status === 402) {
    return `OpenRouter credit limit: ${compact}. Try google/gemini-2.5-flash, openai/gpt-4o-mini, or add OpenRouter credits.`;
  }
  if (label === "OpenRouter" && status === 404) {
    return `OpenRouter model not found: ${compact}. Check the model ID in Settings.`;
  }
  return `${label} error ${status}: ${compact}`;
}

async function callOpenAI(apiKey: string, model: string, messages: Msg[], maxTokens?: number) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.3, ...(maxTokens ? { max_tokens: maxTokens } : {}) }),
  });
  if (!res.ok) throw new Error(providerError("OpenAI", res.status, await res.text()));
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "";
}

async function callAnthropic(apiKey: string, model: string, messages: Msg[], maxTokens = 2048) {
  const system = messages.find((m) => m.role === "system")?.content;
  const rest = messages.filter((m) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: rest }),
  });
  if (!res.ok) throw new Error(providerError("Anthropic", res.status, await res.text()));
  const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function callOpenAICompatible(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: Msg[],
  options: { label?: string; extraHeaders?: Record<string, string>; maxTokens?: number; auth?: "bearer" | "lovable" } = {},
) {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.auth === "lovable"
        ? { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }
        : { Authorization: `Bearer ${apiKey}` }),
      ...options.extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
  });
  if (!res.ok) throw new Error(providerError(options.label ?? "AI", res.status, await res.text()));
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "";
}

const TestInput = z.object({
  provider: z.enum(["mesh", "lovable", "openai", "anthropic", "openrouter"]),
  model: z.string().min(1),
  apiKey: z.string().optional(),
});

export const testProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TestInput.parse(data))
  .handler(async ({ data }) => {
    const started = Date.now();
    const messages: Msg[] = [
      { role: "system", content: "Reply with only the word: pong" },
      { role: "user", content: "ping" },
    ];
    try {
      let reply = "";
      if (data.provider === "mesh") {
        const providers = await import("./providers.server");
        const out = await providers.chatComplete(messages, data.model, { maxTokens: 16 });
        reply = out.reply;
      } else if (data.provider === "lovable") {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) throw new Error("Lovable AI is not configured.");
        reply = await callOpenAICompatible("https://ai.gateway.lovable.dev/v1", key, data.model, messages, { label: "Lovable AI", maxTokens: 16, auth: "lovable" });
      } else if (data.provider === "anthropic") {
        if (!data.apiKey) throw new Error("Missing API key.");
        reply = await callAnthropic(data.apiKey, data.model, messages, 16);
      } else if (data.provider === "openrouter") {
        if (!data.apiKey) throw new Error("Missing API key.");
        reply = await callOpenAICompatible("https://openrouter.ai/api/v1", data.apiKey, data.model, messages, {
          label: "OpenRouter",
          maxTokens: 16,
          extraHeaders: {
            "HTTP-Referer": "https://lovable.dev",
            "X-Title": "Nepali Cooding AI",
          },
        });
      } else {
        if (!data.apiKey) throw new Error("Missing API key.");
        reply = await callOpenAI(data.apiKey, data.model, messages, 16);
      }
      return { ok: true, ms: Date.now() - started, reply: reply.trim().slice(0, 200) };
    } catch (e) {
      return { ok: false, ms: Date.now() - started, error: (e as Error).message.slice(0, 500) };
    }
  });

export const runChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RunInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: history, error: hErr } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (hErr) throw new Error(hErr.message);

    // Persist the user message
    const attachmentNote = data.attachment
      ? `\n\n[Attachment: ${data.attachment.filename ?? data.attachment.kind}]`
      : "";
    const { error: insErr } = await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      user_id: userId,
      role: "user",
      content: data.userMessage + attachmentNote,
    });
    if (insErr) throw new Error(insErr.message);

    // Optional web search context
    let searchContext = "";
    if (data.webSearch) {
      const tavilyKey = process.env.TAVILY_API_KEY;
      if (!tavilyKey) throw new Error("Web search is not configured.");
      try {
        searchContext = await tavilySearch(tavilyKey, data.userMessage);
      } catch (e) {
        searchContext = `Web search failed: ${(e as Error).message}`;
      }
    }

    // If the user explicitly names another language, follow that instead of the chip.
    const detected = detectLanguage(data.userMessage);
    const effectiveLang = detected ?? data.language;
    const system = buildSystemPrompt(effectiveLang, searchContext);

    // Build the last user turn. When there's an attachment, use multimodal
    // content blocks; inline extracted text for parsed files.
    let lastUserContent: string | ContentBlock[] = data.userMessage;
    if (data.attachment) {
      const a = data.attachment;
      const blocks: ContentBlock[] = [
        { type: "text", text: data.userMessage || "Please analyze this attachment." },
      ];
      if (a.kind === "image" && a.dataUrl) {
        blocks.push({ type: "image_url", image_url: { url: a.dataUrl } });
      } else if (a.kind === "file" && a.dataUrl) {
        blocks.push({
          type: "file",
          file: { filename: a.filename ?? "file", file_data: a.dataUrl },
        });
      } else if (a.kind === "text" && a.text) {
        blocks[0] = {
          type: "text",
          text: `${data.userMessage}\n\n--- Attached file: ${a.filename ?? "file"} ---\n${a.text.slice(0, 200_000)}`,
        };
      }
      lastUserContent = blocks;
    }

    const messages: Msg[] = [
      { role: "system", content: system },
      ...((history ?? []) as Msg[]),
      { role: "user", content: lastUserContent },
    ];

    const providers = await import("./providers.server");
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_tier, selected_model")
      .eq("user_id", userId)
      .maybeSingle();
    const tier = (profile?.subscription_tier as string | undefined) ?? "free";
    const requested = data.meshModel ?? (profile?.selected_model as string | null) ?? null;

    // Server-side Pro gate: never trust the client's model choice.
    if (requested && tier !== "pro" && !providers.isFreeModelId(requested)) {
      const mesh = await import("./mesh.server");
      if (!(await mesh.isMeshModelFree(requested))) {
        throw new Error("This is a Pro model. Please upgrade your subscription.");
      }
    }
    const { reply } = await providers.chatComplete(messages, requested);

    await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      user_id: userId,
      role: "assistant",
      content: reply,
    });

    // Touch conversation, auto-title first exchange
    const patch: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
    if ((history ?? []).length === 0) patch.title = data.userMessage.slice(0, 60);
    await supabase.from("conversations").update(patch).eq("id", data.conversationId);

    return { reply, language: effectiveLang, detected: detected !== null };
  });

// Regenerate: delete the last assistant reply for this conversation and
// call the model again with the remaining history.
const RegenInput = z.object({
  conversationId: z.string().uuid(),
  language: z.string().min(1).max(40),
  webSearch: z.boolean().default(false),
});

export const regenerateLast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RegenInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: history, error: hErr } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (hErr) throw new Error(hErr.message);
    const rows = history ?? [];

    // Drop trailing assistant messages so we regenerate from the last user turn.
    let cutIdx = rows.length;
    while (cutIdx > 0 && rows[cutIdx - 1].role === "assistant") cutIdx -= 1;
    const toDelete = rows.slice(cutIdx).map((r) => r.id);
    if (toDelete.length > 0) {
      await supabase.from("messages").delete().in("id", toDelete);
    }
    const remaining = rows.slice(0, cutIdx);
    const lastUser = [...remaining].reverse().find((r) => r.role === "user");
    if (!lastUser) throw new Error("No user message to regenerate.");

    let searchContext = "";
    if (data.webSearch) {
      const tavilyKey = process.env.TAVILY_API_KEY;
      if (tavilyKey) {
        try { searchContext = await tavilySearch(tavilyKey, lastUser.content); }
        catch (e) { searchContext = `Web search failed: ${(e as Error).message}`; }
      }
    }
    const detected = detectLanguage(lastUser.content);
    const effectiveLang = detected ?? data.language;
    const system = buildSystemPrompt(effectiveLang, searchContext);
    const messages: Msg[] = [
      { role: "system", content: system },
      ...(remaining.map((r) => ({ role: r.role, content: r.content })) as Msg[]),
    ];

    const providers = await import("./providers.server");
    const { data: profile } = await supabase
      .from("profiles")
      .select("selected_model")
      .eq("user_id", userId)
      .maybeSingle();
    const { reply } = await providers.chatComplete(
      messages,
      (profile?.selected_model as string | null) ?? null,
    );

    await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      user_id: userId,
      role: "assistant",
      content: reply,
    });
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    return { reply };
  });

// Speech-to-text: accepts a base64-encoded audio recording (WAV recommended)
// and returns the transcript via the Lovable AI STT endpoint.
const TranscribeInput = z.object({
  audioBase64: z.string().min(100).max(30_000_000),
  mime: z.string().max(80).default("audio/wav"),
});

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TranscribeInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Speech-to-text is not configured.");
    const bin = Buffer.from(data.audioBase64, "base64");
    const extMap: Record<string, string> = {
      "audio/wav": "wav",
      "audio/wave": "wav",
      "audio/x-wav": "wav",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/webm": "webm",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
    };
    const ext = extMap[data.mime] ?? "wav";
    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", new Blob([bin], { type: data.mime }), `recording.${ext}`);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) throw new Error(providerError("Lovable STT", res.status, await res.text()));
    const json = (await res.json()) as { text?: string };
    return { text: (json.text ?? "").trim() };
  });

// Edit a prior user message: rewrite its content, drop every message that
// followed it, then regenerate the assistant reply.
const EditInput = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  newContent: z.string().min(1),
  language: z.string().min(1).max(40),
  webSearch: z.boolean().default(false),
});

export const editUserMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => EditInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: history, error: hErr } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (hErr) throw new Error(hErr.message);
    const rows = history ?? [];
    const idx = rows.findIndex((r) => r.id === data.messageId);
    if (idx < 0) throw new Error("Message not found.");
    if (rows[idx].role !== "user") throw new Error("Only user messages can be edited.");

    const toDelete = rows.slice(idx + 1).map((r) => r.id);
    if (toDelete.length > 0) {
      await supabase.from("messages").delete().in("id", toDelete);
    }
    await supabase
      .from("messages")
      .update({ content: data.newContent })
      .eq("id", data.messageId);

    const priorRows = rows.slice(0, idx);

    let searchContext = "";
    if (data.webSearch) {
      const tavilyKey = process.env.TAVILY_API_KEY;
      if (tavilyKey) {
        try { searchContext = await tavilySearch(tavilyKey, data.newContent); }
        catch (e) { searchContext = `Web search failed: ${(e as Error).message}`; }
      }
    }
    const detected = detectLanguage(data.newContent);
    const effectiveLang = detected ?? data.language;
    const system = buildSystemPrompt(effectiveLang, searchContext);
    const messages: Msg[] = [
      { role: "system", content: system },
      ...(priorRows.map((r) => ({ role: r.role, content: r.content })) as Msg[]),
      { role: "user", content: data.newContent },
    ];

    const providers = await import("./providers.server");
    const { data: profile } = await supabase
      .from("profiles")
      .select("selected_model")
      .eq("user_id", userId)
      .maybeSingle();
    const { reply } = await providers.chatComplete(
      messages,
      (profile?.selected_model as string | null) ?? null,
    );

    await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      user_id: userId,
      role: "assistant",
      content: reply,
    });
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    return { reply };
  });

// ---- Mesh model marketplace ----
// Models are loaded live from Mesh; unavailable models drop out automatically.
export const listMeshModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const providers = await import("./providers.server");
    return providers.listAllModels();
  });

// ---- Subscription tier ----
export const getSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("profiles")
      .select("subscription_tier, selected_model")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      tier: (data?.subscription_tier as "free" | "pro" | undefined) ?? "free",
      selectedModel: (data?.selected_model as string | null) ?? null,
    };
  });

const SetTierInput = z.object({ tier: z.enum(["free", "pro"]) });
export const setSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SetTierInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("profiles")
      .upsert({ user_id: userId, subscription_tier: data.tier }, { onConflict: "user_id" });
    return { ok: true, tier: data.tier };
  });

const SetModelInput = z.object({ model: z.string().max(120).nullable() });
export const setSelectedModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SetModelInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("profiles")
      .upsert({ user_id: userId, selected_model: data.model }, { onConflict: "user_id" });
    return { ok: true };
  });

// ---- Piston code execution ----
// Map our language ids to Piston-supported runtimes.
const PISTON_LANG: Record<string, { language: string; version: string; filename: string }> = {
  python: { language: "python", version: "3.10.0", filename: "main.py" },
  py: { language: "python", version: "3.10.0", filename: "main.py" },
  javascript: { language: "javascript", version: "18.15.0", filename: "main.js" },
  js: { language: "javascript", version: "18.15.0", filename: "main.js" },
  typescript: { language: "typescript", version: "5.0.3", filename: "main.ts" },
  ts: { language: "typescript", version: "5.0.3", filename: "main.ts" },
  java: { language: "java", version: "15.0.2", filename: "Main.java" },
  c: { language: "c", version: "10.2.0", filename: "main.c" },
  cpp: { language: "c++", version: "10.2.0", filename: "main.cpp" },
  "c++": { language: "c++", version: "10.2.0", filename: "main.cpp" },
  csharp: { language: "csharp.net", version: "5.0.201", filename: "main.cs" },
  "c#": { language: "csharp.net", version: "5.0.201", filename: "main.cs" },
  go: { language: "go", version: "1.16.2", filename: "main.go" },
  rust: { language: "rust", version: "1.68.2", filename: "main.rs" },
  ruby: { language: "ruby", version: "3.0.1", filename: "main.rb" },
  php: { language: "php", version: "8.2.3", filename: "main.php" },
  swift: { language: "swift", version: "5.3.3", filename: "main.swift" },
  kotlin: { language: "kotlin", version: "1.8.20", filename: "main.kt" },
  bash: { language: "bash", version: "5.2.0", filename: "main.sh" },
  sh: { language: "bash", version: "5.2.0", filename: "main.sh" },
  sql: { language: "sqlite3", version: "3.36.0", filename: "main.sql" },
};

const ExecInput = z.object({
  language: z.string().min(1).max(40),
  code: z.string().min(1).max(200_000),
  stdin: z.string().max(50_000).optional(),
});

// Fallback runner (CodeX) used when the public Piston instance is unavailable.
const CODEX_LANG: Record<string, string> = {
  python: "py", py: "py",
  javascript: "js", js: "js",
  java: "java",
  c: "c",
  cpp: "cpp", "c++": "cpp",
  csharp: "cs", "c#": "cs",
  go: "go",
};

async function runOnPiston(data: { language: string; code: string; stdin?: string }) {
  const cfg = PISTON_LANG[data.language.toLowerCase()];
  if (!cfg) return null;
  const res = await fetch("https://emkc.org/api/v2/piston/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: cfg.language,
      version: cfg.version,
      files: [{ name: cfg.filename, content: data.code }],
      stdin: data.stdin ?? "",
      run_timeout: 8000,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    message?: string;
    run?: { stdout?: string; stderr?: string; code?: number };
    compile?: { stderr?: string };
  };
  if (json.message || !json.run) return null;
  const compileErr = json.compile?.stderr?.trim();
  const stderr = json.run.stderr ?? "";
  return {
    ok: true as const,
    stdout: json.run.stdout ?? "",
    stderr: compileErr ? `${compileErr}\n${stderr}` : stderr,
    exitCode: json.run.code ?? 0,
    runner: "piston",
  };
}

async function runOnCodex(data: { language: string; code: string; stdin?: string }) {
  const lang = CODEX_LANG[data.language.toLowerCase()];
  if (!lang) return null;
  const res = await fetch("https://codex-api.fly.dev/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: data.code, language: lang, input: data.stdin ?? "" }),
  });
  const json = (await res.json().catch(() => null)) as
    | { output?: string; error?: string; status?: number }
    | null;
  if (!json) return null;
  if (!res.ok && !json.output && !json.error) return null;
  const stderr = (json.error ?? "").trim();
  return {
    ok: true as const,
    stdout: json.output ?? "",
    stderr,
    exitCode: stderr ? 1 : 0,
    runner: "codex",
  };
}

export const executeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ExecInput.parse(data))
  .handler(async ({ data }) => {
    if (!PISTON_LANG[data.language.toLowerCase()] && !CODEX_LANG[data.language.toLowerCase()]) {
      return { ok: false, error: `Language "${data.language}" is not supported for execution.` };
    }
    try {
      const piston = await runOnPiston(data);
      if (piston) return piston;
    } catch {
      /* fall through to fallback runner */
    }
    try {
      const codex = await runOnCodex(data);
      if (codex) return codex;
    } catch {
      /* handled below */
    }
    return { ok: false, error: "Code execution service is unavailable right now. Please try again shortly." };
  });