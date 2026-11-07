// Gọi Groq (OpenAI-compatible). Chỉ là lớp vận chuyển; prompt/kiểm tra kết quả nằm ở core/ai.ts.
import type { AiRequest } from '@safechat/core/ai';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 20_000;

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function callGroq(req: AiRequest, apiKey: string, model: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      }),
    });
  } catch (e) {
    throw new GroqError((e as Error).name === 'AbortError' ? 'Hết thời gian chờ Groq' : 'Không kết nối được Groq');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new GroqError('Groq báo vượt hạn mức (429) — sẽ thử lại sau', 429);
  if (res.status === 401) throw new GroqError('API key Groq không hợp lệ (401)', 401);
  if (!res.ok) throw new GroqError(`Groq trả lỗi HTTP ${res.status}`, res.status);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new GroqError('Groq không trả nội dung');
  return content;
}
