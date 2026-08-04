// Multi-provider chat dispatcher (server-only).
// Free-for-users models run on the Lovable AI Gateway (no user key needed);
// everything else goes to Mesh.

import type { MeshMsg } from "./mesh.server";

export type ChatMsg = MeshMsg;
export type CatalogModel = { id: string; free: boolean; label: string; provider: "lovable" | "mesh" };

export const LOVABLE_PREFIX = "lovable:";

/** Free models every user can access, served through the Lovable AI Gateway. */
const LOVABLE_FREE: Array<{ model: string; label: string }> = [
  { model: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { model: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { model: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { model: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
  { model: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { model: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { model: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { model: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { model: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { model: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { model: "openai/gpt-5.4-nano", label: "GPT-5.4 Nano" },
  { model: "openai/gpt-5-mini", label: "GPT-5 Mini" },
];

export function lovableCatalog(): CatalogModel[] {
  if (!process.env.LOVABLE_API_KEY) return [];
  return LOVABLE_FREE.map((m) => ({
    id: `${LOVABLE_PREFIX}${m.model}`,
    label: m.label,
    free: true,
    provider: "lovable" as const,
  }));
}

export function isLovableModel(id?: string | null): boolean {
  return typeof id === "string" && id.startsWith(LOVABLE_PREFIX);
}

export function isFreeModelId(id?: string | null): boolean {
  return isLovableModel(id);
}

async function callLovable(model: string, messages: ChatMsg[], maxTokens?: number): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("The free AI models are not configured right now.");
  const isGpt5 = model.startsWith("openai/gpt-5");
  const body: Record<string, unknown> = { model, messages };
  if (!isGpt5) {
    body.temperature = 0.3;
    if (maxTokens) body.max_tokens = maxTokens;
  } else {
    if (maxTokens) body.max_completion_tokens = maxTokens;
    if (model.startsWith("openai/gpt-5.6")) body.reasoning_effort = "none";
  }
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Free AI models are rate limited right now. Please retry in a moment.");
    if (res.status === 402) throw new Error("The free AI allowance is used up. Please try again later or pick another model.");
    throw new Error(`AI error ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const reply = data.choices?.[0]?.message?.content ?? "";
  if (!reply.trim()) throw new Error("The AI returned an empty response. Please try again.");
  return reply;
}

/** Route a chat completion to the right provider based on the model id. */
export async function chatComplete(
  messages: ChatMsg[],
  requested: string | null | undefined,
  options: { maxTokens?: number } = {},
): Promise<{ reply: string; model: string }> {
  if (isLovableModel(requested)) {
    const model = requested!.slice(LOVABLE_PREFIX.length);
    return { reply: await callLovable(model, messages, options.maxTokens), model: requested! };
  }
  const mesh = await import("./mesh.server");
  try {
    return await mesh.meshChat(messages, { model: requested ?? null, maxTokens: options.maxTokens });
  } catch (e) {
    // Keep the app usable when Mesh is down/unconfigured: fall back to a free model.
    if (!process.env.LOVABLE_API_KEY) throw e;
    const fallback = "google/gemini-3.6-flash";
    return {
      reply: await callLovable(fallback, messages, options.maxTokens),
      model: `${LOVABLE_PREFIX}${fallback}`,
    };
  }
}

/** Full catalog: free Lovable models first, then whatever Mesh serves. */
export async function listAllModels(): Promise<{ free: CatalogModel[]; pro: CatalogModel[]; error?: string }> {
  const lovable = lovableCatalog();
  let meshFree: CatalogModel[] = [];
  let meshPro: CatalogModel[] = [];
  let error: string | undefined;
  try {
    const mesh = await import("./mesh.server");
    const out = await mesh.listMeshModelsSafe();
    error = out.error;
    meshFree = out.free.map((m) => ({ ...m, provider: "mesh" as const }));
    meshPro = out.pro.map((m) => ({ ...m, provider: "mesh" as const }));
  } catch (e) {
    error = (e as Error).message;
  }
  return { free: [...lovable, ...meshFree], pro: meshPro, ...(error ? { error } : {}) };
}
