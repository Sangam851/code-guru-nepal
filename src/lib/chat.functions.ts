import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Msg = { role: "system" | "user" | "assistant"; content: string };

const RunInput = z.object({
  conversationId: z.string().uuid(),
  language: z.string().min(1).max(40),
  webSearch: z.boolean().default(false),
  userMessage: z.string().min(1),
});

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

async function callOpenAI(apiKey: string, model: string, messages: Msg[]) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "";
}

async function callAnthropic(apiKey: string, model: string, messages: Msg[]) {
  const system = messages.find((m) => m.role === "system")?.content;
  const rest = messages.filter((m) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 2048, system, messages: rest }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function callOpenAICompatible(baseURL: string, apiKey: string, model: string, messages: Msg[], extraHeaders: Record<string, string> = {}) {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "";
}

export const runChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RunInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: settings, error: sErr }, { data: history, error: hErr }] = await Promise.all([
      supabase.from("user_settings").select("provider, model, ai_api_key, tavily_api_key").eq("user_id", userId).maybeSingle(),
      supabase.from("messages").select("role, content").eq("conversation_id", data.conversationId).order("created_at", { ascending: true }),
    ]);
    if (sErr) throw new Error(sErr.message);
    if (hErr) throw new Error(hErr.message);
    const provider = settings?.provider ?? "lovable";
    const needsUserKey = provider === "openai" || provider === "anthropic" || provider === "openrouter";
    if (needsUserKey && !settings?.ai_api_key) {
      throw new Error("Add your AI API key in Settings first, or switch to the built-in Lovable AI provider.");
    }

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
      if (!settings.tavily_api_key) throw new Error("Add your Tavily API key in Settings to use web search.");
      try {
        searchContext = await tavilySearch(settings.tavily_api_key, data.userMessage);
      } catch (e) {
        searchContext = `Web search failed: ${(e as Error).message}`;
      }
    }

    const system = `You are Nepali Cooding AI — a premium expert programming assistant made in Nepal. Currently focused on ${data.language.toUpperCase()}, but you can help with any language on request. Always: 1) explain briefly, 2) provide clean runnable code in fenced blocks with the correct language tag, 3) mention edge cases, 4) be warm and concise. Use markdown.${
      searchContext ? `\n\nLive web search results (use if useful):\n${searchContext}` : ""
    }`;

    const messages: Msg[] = [
      { role: "system", content: system },
      ...((history ?? []) as Msg[]),
      { role: "user", content: data.userMessage },
    ];

    const defaultModels: Record<string, string> = {
      lovable: "google/gemini-3.5-flash",
      openai: "gpt-4o-mini",
      anthropic: "claude-3-5-sonnet-latest",
      openrouter: "anthropic/claude-3.5-sonnet",
    };
    const model = settings?.model || defaultModels[provider] || "google/gemini-3.5-flash";

    let reply: string;
    if (provider === "anthropic") {
      reply = await callAnthropic(settings!.ai_api_key!, model, messages);
    } else if (provider === "openrouter") {
      reply = await callOpenAICompatible("https://openrouter.ai/api/v1", settings!.ai_api_key!, model, messages, {
        "HTTP-Referer": "https://lovable.dev",
        "X-Title": "Nepali Cooding AI",
      });
    } else if (provider === "lovable") {
      const key = process.env.LOVABLE_API_KEY;
      if (!key) throw new Error("Lovable AI is not configured. Please contact support.");
      reply = await callOpenAICompatible("https://ai.gateway.lovable.dev/v1", key, model, messages);
    } else {
      reply = await callOpenAI(settings!.ai_api_key!, model, messages);
    }

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

    return { reply };
  });