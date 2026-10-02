import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  throw new Error("Missing GROQ_API_KEY in environment");
}

const groq = new Groq({ apiKey });

export const QUALITY_MODEL = "openai/gpt-oss-120b";
export const FAST_MODEL = "openai/gpt-oss-20b";

export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { status?: number; code?: string; message?: string };
  if (anyErr.status === 429) return true;
  if (anyErr.code === "rate_limit_exceeded") return true;
  if (
    typeof anyErr.message === "string" &&
    /rate.?limit/i.test(anyErr.message)
  )
    return true;
  return false;
}

export async function generateCompletion(
  system: string,
  user: string,
  options?: { temperature?: number; model?: string }
): Promise<string> {
  const model = options?.model ?? QUALITY_MODEL;
  const temperature = options?.temperature ?? 0.4;
  const completion = await groq.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty completion from Groq");
  }
  return content;
}

export async function classifyResponse(
  system: string,
  user: string
): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: FAST_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty completion from Groq");
  }
  return content;
}
