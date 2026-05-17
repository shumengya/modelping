export type Protocol = "openai" | "openai_responses" | "claude";

const PROBE_TIMEOUT_MS = 45_000;
const PROBE_MAX_TOKENS = 256;
/** 存入 D1 前在 Worker 侧截断的流式输出上限 */
const STREAM_OUTPUT_CAP = 4096;
/** 非 2xx 时读取响应体截断长度（scheduler 还会再截断入库） */
const HTTP_ERROR_BODY_MAX = 6000;

function tryFormatJsonBody(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return raw;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return raw;
  }
}

async function readHttpErrorBody(res: Response): Promise<string> {
  try {
    const raw = (await res.text()).trim();
    if (!raw) return "";
    const formatted = tryFormatJsonBody(raw);
    if (formatted.length <= HTTP_ERROR_BODY_MAX) return formatted;
    return formatted.slice(0, HTTP_ERROR_BODY_MAX) + "…";
  } catch {
    return "";
  }
}

function buildHttpErrorMessage(res: Response, body: string): string {
  const line = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  if (!body) return `${line}\n（响应体为空；常见原因：网关未返回 JSON 错误详情）`;
  return `${line}\n\n${body}`;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function appendCap(base: string, add: string, max: number): string {
  if (base.length >= max) return base;
  const room = max - base.length;
  return base + (add.length <= room ? add : add.slice(0, room));
}

/** 经典 Chat Completions（/v1/chat/completions），兼容绝大多数 OpenAI 兼容网关 */
function openAiChatUrl(base: string): string {
  const b = normalizeBase(base);
  if (b.endsWith("/chat/completions")) return b;
  if (b.endsWith("/v1")) return `${b}/chat/completions`;
  return `${b}/chat/completions`;
}

/** OpenAI Responses API（/v1/responses） */
function openAiResponsesUrl(base: string): string {
  const b = normalizeBase(base);
  if (b.endsWith("/responses")) return b;
  if (b.endsWith("/v1")) return `${b}/responses`;
  return `${b}/v1/responses`;
}

function claudeUrl(base: string): string {
  const b = normalizeBase(base);
  if (b.endsWith("/messages")) return b;
  if (b.endsWith("/v1")) return `${b}/messages`;
  return `${b}/v1/messages`;
}

async function readStreamOpenAIChat(
  res: Response,
  started: number
): Promise<{ firstTokenMs: number | null; httpStatus: number; outputText: string }> {
  if (!res.ok || !res.body) {
    return { firstTokenMs: null, httpStatus: res.status, outputText: "" };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let firstTokenMs: number | null = null;
  let outputText = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") {
          return { firstTokenMs, httpStatus: res.status, outputText };
        }
        try {
          const obj = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const c = obj.choices?.[0]?.delta?.content;
          if (c != null && c !== "") {
            if (firstTokenMs == null) firstTokenMs = Math.max(0, Date.now() - started);
            outputText = appendCap(outputText, c, STREAM_OUTPUT_CAP);
          }
        } catch {
          /* ignore bad json line */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { firstTokenMs, httpStatus: res.status, outputText };
}

async function readStreamOpenAIResponses(
  res: Response,
  started: number
): Promise<{ firstTokenMs: number | null; httpStatus: number; outputText: string }> {
  if (!res.ok || !res.body) {
    return { firstTokenMs: null, httpStatus: res.status, outputText: "" };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let firstTokenMs: number | null = null;
  let outputText = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload) as { type?: string; delta?: string };
          if (obj.type === "response.output_text.delta" && obj.delta != null && obj.delta !== "") {
            if (firstTokenMs == null) firstTokenMs = Math.max(0, Date.now() - started);
            outputText = appendCap(outputText, obj.delta, STREAM_OUTPUT_CAP);
          }
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { firstTokenMs, httpStatus: res.status, outputText };
}

/** 首字可来自正文或 thinking；输出只累计 assistant 可见正文 delta.text */
function claudeStreamDeltaParts(
  data: string,
  currentEvent: string
): { outputChunk: string | null; marksFirstToken: boolean } {
  try {
    const obj = JSON.parse(data) as {
      type?: string;
      delta?: { type?: string; text?: string; thinking?: string };
    };
    const match = currentEvent === "content_block_delta" || obj.type === "content_block_delta";
    if (!match) return { outputChunk: null, marksFirstToken: false };
    const d = obj.delta;
    if (!d) return { outputChunk: null, marksFirstToken: false };
    const hasThinking = typeof d.thinking === "string" && d.thinking !== "";
    const hasText = typeof d.text === "string" && d.text !== "";
    return {
      outputChunk: hasText ? (d.text as string) : null,
      marksFirstToken: hasThinking || hasText,
    };
  } catch {
    return { outputChunk: null, marksFirstToken: false };
  }
}

async function readStreamClaude(
  res: Response,
  started: number
): Promise<{ firstTokenMs: number | null; httpStatus: number; outputText: string }> {
  if (!res.ok || !res.body) {
    return { firstTokenMs: null, httpStatus: res.status, outputText: "" };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let currentEvent = "";
  let firstTokenMs: number | null = null;
  let outputText = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line === "") {
          currentEvent = "";
          continue;
        }
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        const parts = claudeStreamDeltaParts(data, currentEvent);
        if (parts.marksFirstToken && firstTokenMs == null) {
          firstTokenMs = Math.max(0, Date.now() - started);
        }
        if (parts.outputChunk) {
          outputText = appendCap(outputText, parts.outputChunk, STREAM_OUTPUT_CAP);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { firstTokenMs, httpStatus: res.status, outputText };
}

export type ProbeResult = {
  ok: boolean;
  firstTokenMs: number | null;
  httpStatus: number | null;
  errorMessage: string | null;
  requestMessage: string;
  responseText: string | null;
};

export async function runProbe(params: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  protocol: Protocol;
  userMessage: string;
}): Promise<ProbeResult> {
  const userMessage = params.userMessage.trim() || "ping";
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
  const started = Date.now();
  try {
    if (params.protocol === "openai") {
      const url = openAiChatUrl(params.apiBaseUrl);
      const res = await fetch(url, {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          messages: [{ role: "user", content: userMessage }],
          max_tokens: PROBE_MAX_TOKENS,
          stream: true,
        }),
      });
      if (!res.ok) {
        const errBody = await readHttpErrorBody(res);
        return {
          ok: false,
          firstTokenMs: null,
          httpStatus: res.status,
          errorMessage: buildHttpErrorMessage(res, errBody),
          requestMessage: userMessage,
          responseText: null,
        };
      }
      const { firstTokenMs, httpStatus, outputText } = await readStreamOpenAIChat(res, started);
      const ok = firstTokenMs != null;
      return {
        ok,
        firstTokenMs,
        httpStatus,
        errorMessage: ok ? null : "no_stream_token",
        requestMessage: userMessage,
        responseText: outputText === "" ? null : outputText,
      };
    }
    if (params.protocol === "openai_responses") {
      const url = openAiResponsesUrl(params.apiBaseUrl);
      const res = await fetch(url, {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          input: userMessage,
          stream: true,
        }),
      });
      if (!res.ok) {
        const errBody = await readHttpErrorBody(res);
        return {
          ok: false,
          firstTokenMs: null,
          httpStatus: res.status,
          errorMessage: buildHttpErrorMessage(res, errBody),
          requestMessage: userMessage,
          responseText: null,
        };
      }
      const { firstTokenMs, httpStatus, outputText } = await readStreamOpenAIResponses(res, started);
      const ok = firstTokenMs != null;
      return {
        ok,
        firstTokenMs,
        httpStatus,
        errorMessage: ok ? null : "no_stream_token",
        requestMessage: userMessage,
        responseText: outputText === "" ? null : outputText,
      };
    }
    const url = claudeUrl(params.apiBaseUrl);
    const res = await fetch(url, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: PROBE_MAX_TOKENS,
        messages: [{ role: "user", content: userMessage }],
        stream: true,
      }),
    });
    if (!res.ok) {
      const errBody = await readHttpErrorBody(res);
      return {
        ok: false,
        firstTokenMs: null,
        httpStatus: res.status,
        errorMessage: buildHttpErrorMessage(res, errBody),
        requestMessage: userMessage,
        responseText: null,
      };
    }
    const { firstTokenMs, httpStatus, outputText } = await readStreamClaude(res, started);
    const ok = firstTokenMs != null;
    return {
      ok,
      firstTokenMs,
      httpStatus,
      errorMessage: ok ? null : "no_stream_token",
      requestMessage: userMessage,
      responseText: outputText === "" ? null : outputText,
    };
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : "unknown_error";
    return {
      ok: false,
      firstTokenMs: null,
      httpStatus: null,
      errorMessage: truncateErr(msg),
      requestMessage: userMessage,
      responseText: null,
    };
  } finally {
    clearTimeout(t);
  }
}

function truncateErr(s: string, max = 120): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}
