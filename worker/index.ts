/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractMessageContent(raw: string): string {
  try {
    const data = JSON.parse(raw) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

function parseParts(content: string): { label: string; text: string }[] | null {
  const cleaned = content.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      parts?: { label?: string; name?: string; text?: string; content?: string }[];
    };
    const parts = parsed.parts ?? (parsed as unknown as { label?: string; text?: string }[]);
    if (Array.isArray(parts)) {
      const mapped = parts
        .map((part) => ({
          label: String(part.label ?? part.name ?? "部分"),
          text: String(part.text ?? part.content ?? ""),
        }))
        .filter((part) => part.text.trim());
      if (mapped.length > 0) return mapped;
    }
  } catch {
    return null;
  }
  return null;
}

function parseReport(content: string): Record<string, unknown> | null {
  const cleaned = content.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function handleTestKey(request: Request): Promise<Response> {
  const body = await readJson(request);
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const model = typeof body.model === "string" ? body.model : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
  if (!apiKey || !model || !baseUrl) {
    return Response.json({ ok: false, message: "请填写完整的模型配置" });
  }
  const response = await fetch(chatCompletionsUrl(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
    }),
  });
  const text = await response.text();
  return Response.json({
    ok: response.ok,
    status: response.status,
    message: response.ok ? "连接成功" : text.slice(0, 500),
  });
}

async function handleOptimize(request: Request): Promise<Response> {
  const body = await readJson(request);
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const model = typeof body.model === "string" ? body.model : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
  const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : "";
  const structure = typeof body.structure === "string" ? body.structure : "";
  const labels = Array.isArray(body.labels) ? body.labels.map(String) : [];
  if (!apiKey || !model || !baseUrl || !source) {
    return Response.json({ ok: false, message: "请先配置模型并完成一次训练" });
  }
  const prompt = `你是中文口播教练。请把下面的口播内容优化成结构清楚、口语自然、适合直接朗读的稿件。结构要求：${structure}。必须严格按这些部分拆分：${labels.join("、")}。只返回 JSON，格式为 {"parts":[{"label":"部分名","text":"优化后的内容"}]}，不要返回其他文字。\n\n原文：\n${source}`;
  const response = await fetch(chatCompletionsUrl(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    return Response.json({ ok: false, message: text.slice(0, 500) });
  }
  const parts = parseParts(extractMessageContent(text));
  if (!parts) {
    return Response.json({ ok: false, message: "模型没有返回可识别的优化结果，请重试" });
  }
  return Response.json({ ok: true, parts });
}

async function handleReport(request: Request): Promise<Response> {
  const body = await readJson(request);
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const model = typeof body.model === "string" ? body.model : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  const lesson =
    typeof body.lesson === "object" && body.lesson
      ? (body.lesson as Record<string, unknown>)
      : {};
  const metrics =
    typeof body.metrics === "object" && body.metrics
      ? (body.metrics as Record<string, unknown>)
      : {};
  if (!apiKey || !model || !baseUrl || !transcript) {
    return Response.json({ ok: false, message: "请先配置模型并完成一次训练" });
  }
  const prompt = `你是一名资深中文口播教练。现在要为学员生成一次口播训练报告。

课程信息：
- 课程名称：${lesson.title ?? ""}
- 当前节：${lesson.day ?? ""}
- 学习目标：${lesson.goal ?? ""}
- 核心结构：${lesson.template ?? ""}
- 训练题目：${lesson.question ?? ""}

学员逐字稿：
${transcript}

实时指标：
- 完整度：${metrics.completeness ?? ""}
- 流畅度：${metrics.fluency ?? ""}
- 表达状态：${metrics.expression ?? ""}
- 语速：${metrics.pace ?? ""}
- 音量：${metrics.averageVolume ?? ""}

请按以下顺序生成报告：
1. 总分，并附一句对整段话的核心判断。
2. 整段话分析：核心内容是否讲清楚，整体表达怎么样，有没有贴近核心结构，和目标对比还需要优化什么。
3. 讲得好的地方：具体到哪几句，好在哪，方便复盘。
4. 逐句优化：每一句给出原句、改写句和修改原因。
5. 高频用词分析：列出高频词、出现次数、优化或去掉的方法。
6. 本次重点问题与优化方向：只给 1-3 个最影响表达的问题，并给出可执行方向。
7. 下一步建议：建议进入下一节课，还是重复当前课程；如果重复，下一遍重点练什么。

只返回 JSON，不要返回其他文字，格式如下：
{"score":0,"summary":"整段话的核心判断","strengths":["讲得好的地方"],"sentence_fixes":[{"original":"原句","rewritten":"改写句","reason":"修改原因"}],"high_frequency_words":[{"word":"高频词","count":0,"suggestion":"优化方式"}],"key_issues":["重点问题"],"optimization_direction":"优化方向","next_step":"进入下一课 / 重复当前课程"}`;
  const response = await fetch(chatCompletionsUrl(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    return Response.json({ ok: false, message: text.slice(0, 500) });
  }
  const report = parseReport(extractMessageContent(text));
  if (!report) {
    const content = extractMessageContent(text).trim();
    if (content) {
      return Response.json({ ok: true, report: { summary: content } });
    }
    return Response.json({ ok: false, message: "模型没有返回可识别的报告，请重试" });
  }
  return Response.json({ ok: true, report });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/test-key" && request.method === "POST") {
      return handleTestKey(request);
    }
    if (url.pathname === "/api/optimize" && request.method === "POST") {
      return handleOptimize(request);
    }
    if (url.pathname === "/api/report" && request.method === "POST") {
      return handleReport(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
