/**
 * Server-only Mistral chat client (no SDK — raw fetch).
 * Requires process.env.MISTRAL_API_KEY.
 */

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

export type MistralMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type MistralChatOpts = {
  messages: MistralMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Force JSON object response (planner / auditor) */
  json?: boolean;
  signal?: AbortSignal;
};

export function getMistralApiKey(): string | null {
  const key = process.env.MISTRAL_API_KEY?.trim();
  return key ? key : null;
}

export function isDemoPipelineEnv(): boolean {
  return (
    process.env.DEMO_PIPELINE === "true" ||
    process.env.VITE_DEMO_PIPELINE === "true"
  );
}

export class MistralHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string,
  ) {
    super(message);
    this.name = "MistralHttpError";
  }
}

/** Non-streaming completion */
export async function mistralChat(opts: MistralChatOpts): Promise<string> {
  const key = getMistralApiKey();
  if (!key) {
    throw new MistralHttpError(503, "MISTRAL_API_KEY is not configured");
  }

  const model =
    opts.model ??
    process.env.MISTRAL_MODEL ??
    (opts.json ? "mistral-small-latest" : "codestral-latest");

  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: opts.signal,
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 4096,
      stream: false,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new MistralHttpError(
      res.status,
      `Mistral ${res.status}: ${body.slice(0, 280) || res.statusText}`,
      body,
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new MistralHttpError(502, "Mistral returned empty content");
  }
  return content;
}

/** Streaming completion — yields text deltas */
export async function* mistralChatStream(
  opts: MistralChatOpts,
): AsyncGenerator<string, string, unknown> {
  const key = getMistralApiKey();
  if (!key) {
    throw new MistralHttpError(503, "MISTRAL_API_KEY is not configured");
  }

  const model =
    opts.model ?? process.env.MISTRAL_MODEL_CODE ?? process.env.MISTRAL_MODEL ?? "codestral-latest";

  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: opts.signal,
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.25,
      max_tokens: opts.maxTokens ?? 8192,
      stream: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new MistralHttpError(
      res.status,
      `Mistral stream ${res.status}: ${body.slice(0, 280) || res.statusText}`,
      body,
    );
  }

  if (!res.body) {
    throw new MistralHttpError(502, "Mistral stream body missing");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    if (opts.signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException("Aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        return full;
      }
      try {
        const parsed = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          yield delta;
        }
      } catch {
        // skip partial JSON
      }
    }
  }

  return full;
}
