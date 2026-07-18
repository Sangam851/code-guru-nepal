import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Msg = { role: "system" | "user" | "assistant"; content: string };

const RunInput = z.object({
  conversationId: z.string().uuid(),
  language: z.string().min(1).max(40),
  webSearch: z.boolean().default(false),
  userMessage: z.string().min(1),
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
  const lines: string[] = [];
  if (data.answer) lines.push(`Answer: ${data.answer}`);
  for (const r of data.results ?? []) {
    lines.push(`- ${r.title} (${r.url})\n  ${r.content?.slice(0, 400)}`);
  }
  return lines.join("\n");
}

function buildSystemPrompt(language: string, searchContext: string) {
  return `You are Nepali Cooding AI — a premium expert programming assistant made in Nepal. The user's default topic is ${language.toUpperCase()}, but if they ask about another language answer in that language instead. Always: 1) start with a short plain-English explanation, 2) provide clean runnable code in a fenced block with the correct language tag (\`\`\`python, \`\`\`html, etc.), 3) mention edge cases or gotchas, 4) be warm, direct, and concise. Use markdown.${
    searchContext ? `\n\nLive web search results (use if useful):\n${searchContext}` : ""
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
  provider: z.enum(["lovable", "openai", "anthropic", "openrouter"]),
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
      if (data.provider === "lovable") {
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
    const { error: insErr } = await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      user_id: userId,
      role: "user",
      content: data.userMessage,
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

    const messages: Msg[] = [
      { role: "system", content: system },
      ...((history ?? []) as Msg[]),
      { role: "user", content: data.userMessage },
    ];

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured. Please contact support.");
    const reply = await callOpenAICompatible(
      "https://ai.gateway.lovable.dev/v1",
      key,
      "google/gemini-3.5-flash",
      messages,
      { label: "Lovable AI", auth: "lovable" },
    );

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

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured.");
    const reply = await callOpenAICompatible(
      "https://ai.gateway.lovable.dev/v1",
      key,
      "google/gemini-3.5-flash",
      messages,
      { label: "Lovable AI", auth: "lovable" },
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

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured.");
    const reply = await callOpenAICompatible(
      "https://ai.gateway.lovable.dev/v1",
      key,
      "google/gemini-3.5-flash",
      messages,
      { label: "Lovable AI", auth: "lovable" },
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