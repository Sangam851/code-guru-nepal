// Mesh API provider — the primary AI backend.
// Server-only: the MESH_API_KEY never leaves this module.

const MESH_BASE_URL = "https://api.meshapi.ai/v1";
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 2;

export type MeshContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type MeshMsg = {
  role: "system" | "user" | "assistant";
  content: string | MeshContentBlock[];
};

export type MeshModel = { id: string; free: boolean; label: string };

export class MeshError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "MeshError";
    this.status = status;
  }
}

export function getMeshKey(): string | null {
  return process.env.MESH_API_KEY ?? null;
}

export function requireMeshKey(): string {
  const key = getMeshKey();
  if (!key) {
    throw new MeshError(
      "The AI service is not configured (missing Mesh API key). Please contact support.",
      0,
    );
  }
  return key;
}

function friendlyError(status: number, body: string): string {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    message = parsed.error?.message ?? parsed.message ?? body;
  } catch {
    // non-JSON body — keep raw
  }
  const compact = message.replace(/\s+/g, " ").trim().slice(0, 400);
  if (/insufficient balance|spend_limit/i.test(compact)) {
    return `This model requires paid credits. Please pick a free model. (${compact})`;
  }
  if (status === 401 || status === 403) return `Mesh authentication failed. Please contact support. (${compact})`;
  if (status === 402) return `Mesh account has insufficient credits. ${compact}`;
  if (status === 404) return `That model is no longer available on Mesh. Pick another model. (${compact})`;
  if (status === 429) return `Mesh is rate limiting requests. Please retry in a moment.`;
  if (status >= 500) return `Mesh is temporarily unavailable (${status}). Please try again.`;
  return `Mesh error ${status}: ${compact}`;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

async function meshFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const key = requireMeshKey();
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${MESH_BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": "https://code-guru-nepal.lovable.app",
          "X-Title": "Nepali Cooding AI",
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      if (res.ok) return res;

      const body = await res.text();
      if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
        lastError = new MeshError(friendlyError(res.status, body), res.status);
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      throw new MeshError(friendlyError(res.status, body), res.status);
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof MeshError && !RETRYABLE.has(e.status)) throw e;
      const err = e as Error;
      const isAbort = err.name === "AbortError";
      lastError = isAbort
        ? new MeshError("The AI request timed out. Please try again.", 408)
        : (err instanceof MeshError ? err : new MeshError(`Cannot reach the AI service: ${err.message}`, 0));
      if (attempt >= MAX_RETRIES) throw lastError;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new MeshError("The AI service is unavailable. Please try again.", 0);
}

// ---- Models ----

// Mesh flags free models with `is_free`; these ids are only a safety net.
const FREE_MESH_IDS = new Set<string>(["minimax/m2-her", "tencent/hy3"]);

const FALLBACK_MODEL = "minimax/m2-her";

let modelCache: { at: number; models: MeshModel[] } | null = null;
const MODEL_TTL_MS = 5 * 60_000;

export async function fetchMeshModels(force = false): Promise<MeshModel[]> {
  if (!force && modelCache && Date.now() - modelCache.at < MODEL_TTL_MS) {
    return modelCache.models;
  }
  const res = await meshFetch("/models", { method: "GET", timeoutMs: 20_000 });
  const json = (await res.json()) as
    | Array<{ id: string; name?: string; is_free?: boolean }>
    | { data?: Array<{ id: string; name?: string; is_free?: boolean }> };
  const raw = Array.isArray(json) ? json : (json.data ?? []);
  const models = raw
    .filter((m) => typeof m.id === "string" && m.id.length > 0)
    // Preserve the official Mesh model name — never rename.
    .map<MeshModel>((m) => ({
      id: m.id,
      free: m.is_free === true || /:free$/i.test(m.id) || FREE_MESH_IDS.has(m.id),
      label: m.name ?? m.id,
    }));
  modelCache = { at: Date.now(), models };
  return models;
}

export async function listMeshModelsSafe(): Promise<{ free: MeshModel[]; pro: MeshModel[]; error?: string }> {
  try {
    const all = await fetchMeshModels();
    let free = all.filter((m) => m.free);
    let pro = all.filter((m) => !m.free);
    if (free.length === 0 && pro.length > 0) {
      free = pro.slice(0, 4).map((m) => ({ ...m, free: true }));
      pro = pro.slice(4);
    }
    return { free, pro };
  } catch (e) {
    return { free: [], pro: [], error: (e as Error).message };
  }
}

/** Resolve the model to use: keeps the requested one when Mesh still serves it. */
export async function resolveMeshModel(requested?: string | null): Promise<string> {
  let models: MeshModel[] = [];
  try {
    models = await fetchMeshModels();
  } catch {
    return requested ?? FALLBACK_MODEL;
  }
  if (requested && models.some((m) => m.id === requested)) return requested;
  const firstFree = models.find((m) => m.free);
  return firstFree?.id ?? models[0]?.id ?? FALLBACK_MODEL;
}

export async function isMeshModelFree(modelId: string): Promise<boolean> {
  if (/:free$/i.test(modelId) || FREE_MESH_IDS.has(modelId)) return true;
  try {
    const models = await fetchMeshModels();
    return models.find((m) => m.id === modelId)?.free ?? false;
  } catch {
    return false;
  }
}

// ---- Chat completion ----

export async function meshChat(
  messages: MeshMsg[],
  options: { model?: string | null; maxTokens?: number; temperature?: number } = {},
): Promise<{ reply: string; model: string }> {
  const model = await resolveMeshModel(options.model);
  const res = await meshFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.3,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
  });
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const reply = data.choices?.[0]?.message?.content ?? "";
  if (!reply.trim()) {
    throw new MeshError("The AI returned an empty response. Please try again.", 0);
  }
  return { reply, model };
}

/** Streaming variant — Mesh is OpenAI-compatible, so SSE deltas are forwarded. */
export async function meshChatStream(
  messages: MeshMsg[],
  options: { model?: string | null; maxTokens?: number; temperature?: number } = {},
): Promise<{ stream: ReadableStream<Uint8Array>; model: string }> {
  const model = await resolveMeshModel(options.model);
  const res = await meshFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.3,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
  });
  if (!res.body) throw new MeshError("Mesh returned no response stream.", 0);
  return { stream: res.body, model };
}
