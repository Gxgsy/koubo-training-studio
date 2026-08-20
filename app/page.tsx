"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { defaultCategories, type Course, type Lesson } from "./course-data";

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionResultList = ArrayLike<SpeechRecognitionResultLike>;

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorLike = {
  error: string;
  message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const api = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return api.SpeechRecognition ?? api.webkitSpeechRecognition ?? null;
}

function normalizeForCompare(value: string): string {
  return value.replace(/[\s，。！？、；：""''（）【】《》,.!?;:'"()[\]]/g, "");
}

function coverageRatio(target: string, source: string): number {
  const t = normalizeForCompare(target);
  const s = normalizeForCompare(source);
  if (!t) return 0;
  let matched = 0;
  let index = 0;
  for (const ch of s) {
    if (ch === t[index]) {
      index += 1;
      matched += 1;
      if (index === t.length) break;
    }
  }
  return matched / t.length;
}

type StructureCheck = {
  label: string;
  score: number;
  status: "完整" | "待加强" | "缺失";
};

const structureSignals: Record<string, { strong: string[]; weak: string[] }> = {
  结论: { strong: ["我觉得", "我认为", "我的答案是", "我的看法是", "我推荐", "我更喜欢", "最值", "答案是", "应该", "观点"], weak: ["是", "最", "比", "更"] },
  原因: { strong: ["因为", "为了", "由于", "之所以", "关键是", "最重要的是"], weak: ["原因", "不", "都", "每天"] },
  细节: { strong: ["以前", "现在", "的时候", "比如", "有一次", "每天", "当时", "先", "然后", "具体"], weak: ["我", "他", "她", "东西", "手机"] },
  感受: { strong: ["我觉得", "我感觉", "感受", "开心", "烦", "值", "喜欢", "感谢", "理解", "心情", "发现", "原来", "才明白", "意识到"], weak: ["很", "挺", "有点"] },
  误区: { strong: ["误区", "很多人", "总以为", "刚开始", "一开始", "以为", "遇到过"], weak: ["错误", "错", "问题"] },
  纠偏: { strong: ["其实", "应该", "正确", "不是", "真正", "先", "更建议", "区别"], weak: ["但", "要", "会"] },
  例子: { strong: ["比如", "例如", "有一次", "举个例子", "比如说", "以前"], weak: ["我", "他", "她", "一个", "每天"] },
  行动任务: { strong: ["今天", "下一步", "先", "每天", "试试", "可以", "任务", "我会", "建议", "方法", "怎么"], weak: ["去", "做", "录"] },
  场景: { strong: ["那天", "前几天", "有一次", "晚上", "早上", "家", "楼下", "的时候", "当时", "以前"], weak: ["我", "她", "他", "看到"] },
  普遍问题: { strong: ["其实", "我们", "很多人", "很少", "问题", "背后", "遇到过", "总是", "经常"], weak: ["都", "会", "总"] },
  判断: { strong: ["所以", "我觉得", "我认为", "现在", "愿意", "更喜欢"], weak: ["我", "是"] },
  收尾: { strong: ["最后", "所以", "这件事", "反而", "让我", "新的", "总结", "对我来说"], weak: ["了", "吗"] },
  人群: { strong: ["适合", "谁", "人群", "大家", "普通人", "人"], weak: ["都", "有", "会"] },
  概念: { strong: ["就是", "指的是", "简单说", "可以理解成", "本质", "意思是", "其实"], weak: ["是", "一个", "这个"] },
};

// 结构标签别名：把课程里各种写法的标签，归到上面词库对应的语义分组。
// 判断只要求语义相近，不要求字面一致。
const structureLabelAliases: Record<string, string> = {
  我的答案是: "结论",
  我认为: "结论",
  我的看法是: "结论",
  所以我的看法是: "结论",
  我推荐什么: "结论",
  明确观点: "结论",
  我想到的是: "结论",
  结果先行: "结论",
  结论先行: "结论",
  先给结论: "结论",
  直接给结论: "结论",
  为什么: "原因",
  最关键原因: "原因",
  为什么想到它: "原因",
  我为什么会这样: "原因",
  举个例子: "例子",
  举例: "例子",
  一个例子: "例子",
  一个具体例子: "例子",
  具体例子: "例子",
  生活例子: "例子",
  一句总结: "收尾",
  一句收尾: "收尾",
  自然收尾: "收尾",
  结果怎样: "收尾",
  结果: "收尾",
  抽象判断: "判断",
  进入正文: "判断",
  具体场景: "场景",
  一个具体场景: "场景",
  当时情况: "场景",
  痛点开头: "场景",
  发生了什么: "场景",
  具体动作: "行动任务",
  我做了什么: "行动任务",
  我怎么处理: "行动任务",
  后来怎么处理: "行动任务",
  方法建议: "行动任务",
  行动: "行动任务",
  遇到的问题: "普遍问题",
  当时的问题: "普遍问题",
  你有没有遇到过: "普遍问题",
  很多人会这样: "普遍问题",
  问题: "普遍问题",
  我的变化: "感受",
  我当时的感受: "感受",
  我的发现: "感受",
  得到的想法: "感受",
  但我更建议这样: "纠偏",
  区别在哪里: "纠偏",
  注意点: "纠偏",
  适合谁: "人群",
  人群: "人群",
  这个概念是什么: "概念",
  普通人怎么理解: "概念",
  我的内容: "细节",
  具体好在哪: "细节",
  有什么用: "细节",
};

function evaluateStructure(
  text: string,
  lesson: { exampleParts: { label: string; text: string }[] },
): StructureCheck[] {
  const normalized = normalizeForCompare(text);
  return lesson.exampleParts.map((part) => {
    const key = structureLabelAliases[part.label] ?? part.label;
    const signals = structureSignals[key] ?? { strong: [], weak: [] };
    const strongHits = signals.strong.filter((word) => normalized.includes(word)).length;
    const weakHits = signals.weak.filter((word) => normalized.includes(word)).length;
    const score =
      strongHits === 0 && weakHits === 0
        ? 0
        : strongHits >= 1
          ? Math.min(100, 70 + (strongHits - 1) * 15 + weakHits * 5)
          : Math.min(60, 40 + weakHits * 8);
    const status: StructureCheck["status"] = score >= 70 ? "完整" : score >= 40 ? "待加强" : "缺失";
    return { label: part.label, score, status };
  });
}

type PracticeMode = "read" | "free";

type LessonDraft = {
  title: string;
  goal: string;
  template: string;
  question: string;
  exampleText: string;
};

const fillerWords = ["然后", "就是", "嗯", "啊", "那个", "所以", "呃"];

const builtInCategoryIds = new Set(["default", "free", "emotion"]);

type ApiConfig = {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
};

type AiReport = {
  score?: number;
  summary?: string;
  strengths?: string[];
  sentence_fixes?: { original: string; rewritten: string; reason: string }[];
  high_frequency_words?: { word: string; count?: number; suggestion?: string }[];
  key_issues?: string[];
  optimization_direction?: string;
  next_step?: string;
};

const providerPresets: { id: string; name: string; baseUrl: string; model: string }[] = [
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  { id: "kimi", name: "Kimi", baseUrl: "https://api.moonshot.cn", model: "moonshot-v1-8k" },
  {
    id: "doubao",
    name: "豆包",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-pro-32k",
  },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com", model: "gpt-4o-mini" },
  { id: "custom", name: "自定义", baseUrl: "", model: "" },
];

function readStoredApiConfig(): ApiConfig {
  if (typeof window === "undefined") {
    return { provider: "deepseek", apiKey: "", model: "deepseek-chat", baseUrl: "https://api.deepseek.com" };
  }
  try {
    const raw = window.localStorage.getItem("koubo-api-config-v1");
    if (raw) {
      const parsed = JSON.parse(raw) as ApiConfig;
      if (parsed && typeof parsed.baseUrl === "string") return parsed;
    }
  } catch { /* ignore */ }
  return { provider: "deepseek", apiKey: "", model: "deepseek-chat", baseUrl: "https://api.deepseek.com" };
}

function splitScriptByStructure(
  text: string,
  labels: string[],
): { label: string; text: string }[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^。！？]+[。！？]|[^。！？]+$/g) ?? [];
  const parts = labels.map((label) => ({ label, text: "" }));
  if (!sentences.length) return parts;
  if (parts.length <= 1) {
    parts[0].text = clean;
    return parts;
  }
  if (sentences.length <= parts.length) {
    sentences.forEach((sentence, index) => {
      parts[Math.min(index, parts.length - 1)].text += sentence;
    });
    return parts;
  }
  const keywordRules: Record<string, string[]> = {
    结论: ["我觉得", "我认为", "答案是", "推荐", "最值", "应该", "想"],
    原因: ["因为", "为了", "由于", "之所以", "不贵", "方便"],
    细节: ["以前", "现在", "比如", "有一次", "的时候", "后来", "每天", "每次"],
    感受: ["我觉得", "感觉", "开心", "烦", "值", "希望", "理解", "谢谢"],
    误区: ["误区", "很多人", "总以为", "一开始", "刚开始", "以为"],
    纠偏: ["其实", "应该", "正确", "不是", "真正", "先"],
    例子: ["比如", "例如", "有一次", "举个例子", "以前", "如果"],
    行动任务: ["今天", "下一步", "先", "每天", "试试", "可以", "任务"],
    场景: ["那天", "前几天", "有一次", "晚上", "早上", "家", "楼下", "的时候"],
    普遍问题: ["其实", "我们", "很多人", "很少", "问题", "背后"],
    判断: ["所以", "我觉得", "我认为", "现在", "愿意"],
    收尾: ["最后", "所以", "这件事", "反而", "让我", "新的"],
  };
  parts[0].text = sentences[0];
  parts[parts.length - 1].text = sentences[sentences.length - 1];
  const assigned = new Set([0, sentences.length - 1]);
  const middleSentences = sentences.filter((_, index) => !assigned.has(index));
  const middleLabels = labels.slice(1, -1);
  if (middleLabels.length) {
    const buckets = middleLabels.map(() => [] as string[]);
    for (const sentence of middleSentences) {
      let placed = false;
      for (let index = 0; index < middleLabels.length; index += 1) {
        const rules = keywordRules[middleLabels[index]] ?? [];
        if (rules.some((rule) => sentence.includes(rule))) {
          buckets[index].push(sentence);
          placed = true;
          break;
        }
      }
      if (!placed) {
        const minIndex = buckets.reduce(
          (min, bucket, index) => (bucket.length < buckets[min].length ? index : min),
          0,
        );
        buckets[minIndex].push(sentence);
      }
    }
    middleLabels.forEach((label, index) => {
      parts[index + 1].text = buckets[index].join("");
    });
  }
  return parts;
}

function readStoredCategories(): Course[] {
  if (typeof window === "undefined") return defaultCategories;
  try {
    const raw = window.localStorage.getItem("koubo-courses-v1");
    if (raw) {
      const parsed = JSON.parse(raw) as Course[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 迁移规则：
        // - 保留用户对所有课程的修改与新增的课程节（不重置）
        // - 默认课程里新增的课程节自动补上
        // - 已移除的旧内置课程（如“自媒体起号口播专项”）不再出现
        // - 用户自建课程原样保留
        const defaultCourseMap = new Map(defaultCategories.map((c) => [c.id, c]));
        const storedMap = new Map(parsed.map((c) => [c.id, c]));
        const legacyBuiltInIds = new Set(["default", "creator", "emotion", "free"]);
        const merged: Course[] = [];
        for (const def of defaultCategories) {
          const stored = storedMap.get(def.id);
          if (!stored) {
            merged.push(def);
            continue;
          }
          const storedLessonIds = new Set(stored.lessons.map((l) => l.id));
          const combinedLessons = [...stored.lessons];
          for (const dl of def.lessons) {
            if (!storedLessonIds.has(dl.id)) combinedLessons.push(dl);
          }
          merged.push({ ...def, lessons: combinedLessons });
        }
        for (const course of parsed) {
          if (legacyBuiltInIds.has(course.id) || defaultCourseMap.has(course.id)) continue;
          merged.push(course);
        }
        return merged;
      }
    }
  } catch { /* ignore */ }
  return defaultCategories;
}

function examplePartsToText(parts: { label: string; text: string }[]): string {
  return parts.map((part) => `${part.label}：${part.text}`).join("\n");
}

function parseExampleText(text: string): { label: string; text: string }[] {
  const parts = text
    .split("\n")
    .map((line) => {
      const colonIndex = line.indexOf("：");
      const asciiColon = line.indexOf(":");
      const index = colonIndex >= 0 ? colonIndex : asciiColon;
      if (index <= 0) return null;
      return {
        label: line.slice(0, index).trim(),
        text: line.slice(index + 1).trim(),
      };
    })
    .filter(
      (part): part is { label: string; text: string } => Boolean(part && part.text),
    );
  if (parts.length === 0 && text.trim()) {
    parts.push({ label: "示例", text: text.trim() });
  }
  return parts;
}

// 给语音识别出的一句话补标点：连接词后补逗号，句尾补句号。
function punctuateSegment(text: string): string {
  let t = text.trim();
  if (!t) return "";
  t = t.replace(
    /(然后|但是|不过|所以|因为|如果|其实|就是|比如|比如说|例如|现在|以前|后来|当时|我觉得|我认为|说实话|首先|其次|另外|还有|而且|虽然|最后)(?!，|。|！|？|,|!|\.|\?|$)/g,
    "$1，",
  );
  if (!/[。！？.!?]$/.test(t)) t += "。";
  return t;
}

export default function Home() {
  const [categories, setCategories] = useState<Course[]>(defaultCategories);
  const [hydrated, setHydrated] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState(defaultCategories[0].id);
  const [activeLessonId, setActiveLessonId] = useState(defaultCategories[0].lessons[0].id);
  const [mode, setMode] = useState<PracticeMode>("read");
  const [script, setScript] = useState("");
  const [scriptParts, setScriptParts] = useState<{ label: string; text: string }[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [scriptTab, setScriptTab] = useState<"example" | "mine">("example");
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasReport, setHasReport] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const [micReady, setMicReady] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMetrics, setAudioMetrics] = useState<{
    averageVolume: number;
    stability: number;
  } | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [draftCategoryId, setDraftCategoryId] = useState(defaultCategories[0].id);
  const [draftLessons, setDraftLessons] = useState<LessonDraft[]>([]);
  const [expandedDraft, setExpandedDraft] = useState<number | null>(null);
  const [isNewCourse, setIsNewCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [manageCourseId, setManageCourseId] = useState<string | null>(null);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => ({
    provider: "deepseek",
    apiKey: "",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
  }));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [aiReport, setAiReport] = useState<AiReport | null>(null);
  const [testStatus, setTestStatus] = useState<{
    state: "idle" | "testing" | "ok" | "fail";
    message: string;
  }>({ state: "idle", message: "" });

  const activeCourse =
    categories.find((category) => category.id === activeCategoryId) ?? categories[0];
  const activeLesson =
    activeCourse?.lessons.find((lesson) => lesson.id === activeLessonId) ??
    activeCourse?.lessons[0];
  const activeLessonIndex = activeCourse?.lessons.findIndex(
    (lesson) => lesson.id === activeLesson?.id,
  ) ?? -1;
  const freeModule = activeCourse?.kind === "free";
  const manageCourse = categories.find((category) => category.id === manageCourseId) ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    // 首帧用默认数据渲染（与服务器一致），挂载后再读取本地保存的课程与模型配置；
    // 只有读完本地数据后才允许保存，避免默认数据覆盖用户进度。
    setCategories(readStoredCategories());
    setApiConfig(readStoredApiConfig());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return;
    try {
      window.localStorage.setItem("koubo-courses-v1", JSON.stringify(categories));
    } catch { /* ignore */ }
  }, [categories, hydrated]);

  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return;
    try {
      window.localStorage.setItem("koubo-api-config-v1", JSON.stringify(apiConfig));
    } catch { /* ignore */ }
  }, [apiConfig, hydrated]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finalTranscriptRef = useRef("");
  const interimRef = useRef("");
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const shouldRestartRef = useRef(false);
  const clockRef = useRef<number | null>(null);
  const volumeRafRef = useRef<number | null>(null);
  const volumeLoopActiveRef = useRef(false);
  const volumeSamplesRef = useRef<number[]>([]);
  const elapsedRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);

  function startVolumeLoop() {
    if (volumeLoopActiveRef.current || !analyserRef.current) return;
    volumeLoopActiveRef.current = true;
    const sample = new Uint8Array(analyserRef.current.frequencyBinCount);
    const tick = () => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      analyser.getByteTimeDomainData(sample);
      let sum = 0;
      for (const value of sample) {
        const delta = (value - 128) / 128;
        sum += delta * delta;
      }
      const rms = Math.sqrt(sum / sample.length);
      const volume = Math.min(100, Math.round(rms * 240));
      volumeSamplesRef.current.push(volume);
      setCurrentVolume(volume);
      volumeRafRef.current = window.requestAnimationFrame(tick);
    };
    volumeRafRef.current = window.requestAnimationFrame(tick);
  }

  function stopVolumeLoop() {
    volumeLoopActiveRef.current = false;
    if (volumeRafRef.current !== null) {
      window.cancelAnimationFrame(volumeRafRef.current);
      volumeRafRef.current = null;
    }
  }

  function resetPracticeView() {
    setScript("");
    setScriptParts([]);
    setPasteText("");
    setTranscript("");
    setInterimText("");
    setHasReport(false);
    setAudioMetrics(null);
    setAiReport(null);
    setIsGeneratingReport(false);
    setErrorMessage("");
  }

  function handlePasteScript(text: string) {
    const labels = activeLesson?.exampleParts.map((part) => part.label) ?? [];
    const parts =
      freeModule || labels.length === 0
        ? [{ label: "我的稿件", text: text.trim() }]
        : splitScriptByStructure(text, labels);
    setScriptParts(parts);
    setScript(parts.map((part) => part.text).join(""));
    setPasteText("");
  }

  function updateScriptPart(index: number, text: string) {
    const parts = scriptParts.map((part, partIndex) =>
      partIndex === index ? { ...part, text } : part,
    );
    setScriptParts(parts);
    setScript(parts.map((part) => part.text).join(""));
  }

  function handleProviderChange(provider: string) {
    const preset = providerPresets.find((item) => item.id === provider);
    setApiConfig((prev) => ({
      ...prev,
      provider,
      model: preset?.model ?? prev.model,
      baseUrl: preset?.baseUrl ?? prev.baseUrl,
    }));
    setTestStatus({ state: "idle", message: "" });
  }

  async function testApiConnection() {
    if (!apiConfig.apiKey.trim() || !apiConfig.model.trim() || !apiConfig.baseUrl.trim()) {
      setTestStatus({ state: "fail", message: "请先填写 API Key、模型名称和 Base URL" });
      return;
    }
    setTestStatus({ state: "testing", message: "正在测试连接…" });
    try {
      const response = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiConfig),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      setTestStatus({
        state: data.ok ? "ok" : "fail",
        message: data.message ?? "连接失败",
      });
    } catch {
      setTestStatus({ state: "fail", message: "无法连接，请检查网络" });
    }
  }

  function toggleCategory(categoryId: string) {
    setCategories((prev) =>
      prev.map((category) =>
        category.id === categoryId
          ? { ...category, expanded: !category.expanded }
          : category,
      ),
    );
  }

  function selectLesson(categoryId: string, lessonId: string) {
    setActiveCategoryId(categoryId);
    setActiveLessonId(lessonId);
    const isFree = categories.find((category) => category.id === categoryId)?.kind === "free";
    if (isFree) setScriptTab("mine");
    resetPracticeView();
    if (isFree) return;
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category;
        return {
          ...category,
          lessons: category.lessons.map((lesson) =>
            lesson.id === lessonId && lesson.status === "未开始"
              ? { ...lesson, status: "进行中" as const }
              : lesson,
          ),
        };
      }),
    );
  }

  function completeActiveLesson() {
    if (!activeCourse || !activeLesson || activeLessonIndex < 0) return;
    const nextLesson = activeCourse.lessons[activeLessonIndex + 1];
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== activeCourse.id) return category;
        return {
          ...category,
          lessons: category.lessons.map((lesson, index) => {
            if (index === activeLessonIndex) {
              return { ...lesson, status: "已完成" as const };
            }
            if (nextLesson && lesson.id === nextLesson.id) {
              return { ...lesson, status: "进行中" as const };
            }
            return lesson;
          }),
        };
      }),
    );
    if (nextLesson) {
      setActiveLessonId(nextLesson.id);
      resetPracticeView();
    }
  }

  function saveLessonScore(currentMode: PracticeMode, score: number) {
    if (!activeLesson) return;
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== activeCategoryId) return category;
        return {
          ...category,
          lessons: category.lessons.map((lesson) => {
            if (lesson.id !== activeLessonId) return lesson;
            const readScore =
              currentMode === "read"
                ? Math.max(lesson.readScore ?? 0, score)
                : lesson.readScore;
            const freeScore =
              currentMode === "free"
                ? Math.max(lesson.freeScore ?? 0, score)
                : lesson.freeScore;
            const completed = (readScore ?? 0) >= 70 && (freeScore ?? 0) >= 70;
            return {
              ...lesson,
              readScore,
              freeScore,
              status: completed ? ("已完成" as const) : ("进行中" as const),
            };
          }),
        };
      }),
    );
  }

  function switchMode(nextMode: PracticeMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    resetPracticeView();
  }

  function openNewCourseForm() {
    setDraftCategoryId("");
    setDraftLessons([{ title: "", goal: "", template: "", question: "", exampleText: "" }]);
    setExpandedDraft(0);
    setNewCourseName("");
    setIsNewCourse(true);
    setIsAdding(true);
    setErrorMessage("");
  }

  function openEditCourse(categoryId: string) {
    const category = categories.find((item) => item.id === categoryId);
    setEditingCourseId(categoryId);
    setNewCourseName(category?.title ?? "");
    setErrorMessage("");
  }

  function saveCourseRename() {
    if (!editingCourseId || !newCourseName.trim()) {
      setErrorMessage("请填写课程名称。");
      return;
    }
    setCategories((prev) =>
      prev.map((category) =>
        category.id === editingCourseId
          ? { ...category, title: newCourseName.trim() }
          : category,
      ),
    );
    setEditingCourseId(null);
    setNewCourseName("");
    setErrorMessage("");
  }

  function deleteCustomCourse(categoryId: string) {
    const remaining = categories.filter((category) => category.id !== categoryId);
    setCategories(remaining);
    if (activeCategoryId === categoryId) {
      const nextCategory = remaining[0];
      if (nextCategory) {
        setActiveCategoryId(nextCategory.id);
        setActiveLessonId(nextCategory.lessons[0]?.id ?? "");
        resetPracticeView();
      }
    }
    if (draftCategoryId === categoryId) {
      setDraftCategoryId(remaining[0]?.id ?? "");
    }
  }

  function openManageCourse(categoryId: string) {
    setManageCourseId(categoryId);
    setExpandedLessonId(null);
    setEditingCourseId(null);
    setIsAdding(false);
    setIsNewCourse(false);
    setErrorMessage("");
  }

  function closeManageCourse() {
    setManageCourseId(null);
    setExpandedLessonId(null);
  }

  function updateCourseTitle(categoryId: string, value: string) {
    setCategories((prev) =>
      prev.map((category) =>
        category.id === categoryId ? { ...category, title: value } : category,
      ),
    );
  }

  function updateLesson(
    categoryId: string,
    lessonId: string,
    field: "title" | "goal" | "template" | "question" | "exampleText",
    value: string,
  ) {
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category;
        return {
          ...category,
          lessons: category.lessons.map((lesson) => {
            if (lesson.id !== lessonId) return lesson;
            if (field === "exampleText") {
              return {
                ...lesson,
                exampleText: value,
                exampleParts: parseExampleText(value),
              };
            }
            return { ...lesson, [field]: value };
          }),
        };
      }),
    );
  }

  function addLessonToCourse(categoryId: string) {
    const id = `lesson-${Date.now()}`;
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category;
        const last = category.lessons[category.lessons.length - 1];
        return {
          ...category,
          lessons: [
            ...category.lessons,
            {
              id,
              title: `Day ${category.lessons.length + 1} · 新课程`,
              goal: last?.goal ?? "",
              template: last?.template ?? "",
              question: last?.question ?? "",
              exampleParts: last?.exampleParts
                ? last.exampleParts.map((part) => ({ ...part }))
                : [],
              exampleText: last?.exampleText ?? examplePartsToText(last?.exampleParts ?? []),
              status: "未开始" as const,
            },
          ],
        };
      }),
    );
    setExpandedLessonId(id);
  }

  function updateDraftLesson(index: number, field: keyof LessonDraft, value: string) {
    setDraftLessons((prev) =>
      prev.map((lesson, i) => (i === index ? { ...lesson, [field]: value } : lesson)),
    );
  }

  function addDraftLesson() {
    setDraftLessons((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          title: "",
          goal: last?.goal ?? "",
          template: last?.template ?? "",
          question: last?.question ?? "",
          exampleText: last?.exampleText ?? "",
        },
      ];
    });
    setExpandedDraft(draftLessons.length);
  }

  function removeDraftLesson(index: number) {
    setDraftLessons((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
    if (expandedDraft === index) setExpandedDraft(null);
  }

  function deleteLesson(categoryId: string, lessonId: string) {
    const course = categories.find((category) => category.id === categoryId);
    const remaining = (course?.lessons ?? []).filter((lesson) => lesson.id !== lessonId);
    if (remaining.length === 0) {
      setErrorMessage("至少保留一节课，可以先添加再删除。");
      return;
    }
    setCategories((prev) =>
      prev.map((category) =>
        category.id === categoryId
          ? { ...category, lessons: remaining }
          : category,
      ),
    );
    if (activeCategoryId === categoryId && activeLessonId === lessonId) {
      setActiveLessonId(remaining[0]?.id ?? "");
      resetPracticeView();
    }
    if (expandedLessonId === lessonId) setExpandedLessonId(null);
  }

  function saveLesson() {
    const name = newCourseName.trim();
    if (!name) {
      setErrorMessage("请填写课程分类名称。");
      return;
    }
    const lessons: Lesson[] = draftLessons
      .map((d, index) => {
        const title = d.title.trim() || `Day ${index + 1} · 新课程`;
        const exampleText = d.exampleText;
        return {
          id: `lesson-${Date.now()}-${index}`,
          title,
          goal: d.goal.trim(),
          template: d.template.trim(),
          question: d.question.trim(),
          exampleParts: parseExampleText(exampleText),
          exampleText,
          status: "未开始" as const,
        };
      })
      .filter(
        (lesson, index) =>
          lesson.title.trim() !== `Day ${index + 1} · 新课程` ||
          draftLessons[index].goal.trim() ||
          draftLessons[index].template.trim() ||
          draftLessons[index].question.trim() ||
          draftLessons[index].exampleText.trim(),
      );
    if (lessons.length === 0) {
      setErrorMessage("请至少填写一节课程的内容。");
      return;
    }
    const categoryId = `custom-${Date.now()}`;
    setCategories((prev) => [
      ...prev,
      {
        id: categoryId,
        title: name,
        expanded: true,
        lessons,
      },
    ]);
    setActiveCategoryId(categoryId);
    setActiveLessonId(lessons[0]?.id ?? "");
    resetPracticeView();
    setIsAdding(false);
    setIsNewCourse(false);
    setNewCourseName("");
    setDraftLessons([]);
    setExpandedDraft(null);
    setErrorMessage("");
    setIsEditorOpen(false);
  }

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      shouldRestartRef.current = false;
      if (clockRef.current !== null) window.clearInterval(clockRef.current);
      if (volumeRafRef.current !== null) {
        window.cancelAnimationFrame(volumeRafRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch { /* ignore */ }
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch { /* ignore */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const liveText = `${transcript}${interimText}`.trim();
  const charCount = liveText.replace(/\s/g, "").length;
  const scriptCount = Math.max(1, script.replace(/\s/g, "").length);

  const fillerStats = useMemo(() => {
    return fillerWords
      .map((word) => ({
        word,
        count: (liveText.match(new RegExp(word, "g")) || []).length,
      }))
      .filter((item) => item.count > 0);
  }, [liveText]);

  const fillerTotal = fillerStats.reduce((sum, item) => sum + item.count, 0);
  const fillerDensity = charCount ? Math.round((fillerTotal / charCount) * 1000) / 10 : 0;
  const progress =
    mode === "read"
      ? Math.min(100, Math.round(coverageRatio(script, liveText) * 100))
      : Math.min(100, Math.round((charCount / scriptCount) * 100));
  const pace = elapsedSeconds > 0 ? Math.round((charCount / elapsedSeconds) * 60) : 0;
  const averageVolume = audioMetrics?.averageVolume ?? currentVolume;
  const structureChecks = useMemo(
    () => evaluateStructure(liveText, activeLesson ?? { exampleParts: [] }),
    [liveText, activeLesson],
  );
  const structureCompleteness = structureChecks.length
    ? Math.round(structureChecks.reduce((sum, check) => sum + check.score, 0) / structureChecks.length)
    : 0;
  const structureIssues = structureChecks.filter((check) => check.status !== "完整");

  const metrics = useMemo(() => {
    const completeness = Math.max(
      0,
      Math.min(
        100,
        hasReport ? (structureChecks.length ? structureCompleteness : progress) : progress,
      ),
    );
    const fluency = Math.max(0, Math.min(100, 100 - fillerDensity * 8));
    const volScore =
      averageVolume === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              100,
              averageVolume >= 18 && averageVolume <= 85
                ? 100 - Math.abs(averageVolume - 48) * 0.8
                : 45,
            ),
          );
    const paceScore =
      pace === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              100,
              pace >= 90 && pace <= 220 ? 100 - Math.abs(pace - 150) * 0.4 : 50,
            ),
          );
    const stability = audioMetrics?.stability ?? 100;
    const expression = Math.round(volScore * 0.5 + paceScore * 0.3 + stability * 0.2);
    const paceVolume = Math.round(paceScore * 0.6 + volScore * 0.4);
    const rawScores = [completeness, fluency, expression, paceVolume];
    const averageScore = rawScores.reduce((sum, value) => sum + value, 0) / rawScores.length;
    const balancedScores = rawScores.map((value) =>
      Math.round(value * 0.65 + averageScore * 0.35),
    );
    const [finalCompleteness, finalFluency, finalExpression, finalPaceVolume] = balancedScores;
    const score = Math.round(
      finalCompleteness * 0.35 +
        finalFluency * 0.2 +
        finalExpression * 0.2 +
        finalPaceVolume * 0.25,
    );
    return {
      completeness: finalCompleteness,
      fluency: finalFluency,
      expression: finalExpression,
      paceVolume: finalPaceVolume,
      score,
    };
  }, [progress, hasReport, structureCompleteness, fillerDensity, pace, averageVolume, audioMetrics]);

  const reportSummary = hasReport
    ? structureIssues.length
      ? "结构还不完整，报告里已标出需要补强的部分。"
      : metrics.score >= 70
        ? "整体表达已经稳定，可以进入脱稿演练。"
        : metrics.score >= 50
          ? "已达到进入脱稿演练的最低标准。"
          : "建议先重新跟读一遍，把内容说完整。"
    : "完成一次真实训练后，这里会给出评分和建议。";

  async function startRecording() {
    if (isRecording) return;
    setErrorMessage("");
    setHasReport(false);
    setAiReport(null);
    setIsGeneratingReport(false);
    setTranscript("");
    setInterimText("");
    setAudioMetrics(null);
    setCurrentVolume(0);
    setElapsedSeconds(0);
    setMicReady(false);
    elapsedRef.current = 0;
    finalTranscriptRef.current = "";
    interimRef.current = "";
    volumeSamplesRef.current = [];
    chunksRef.current = [];
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      setAudioUrl(null);
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      const err = error as { name?: string; message?: string };
      setErrorMessage(
        err.name === "NotAllowedError" || err.name === "SecurityError"
          ? "麦克风权限被拒绝。请在浏览器地址栏允许麦克风后重试。"
          : err.name === "NotFoundError"
            ? "没有找到可用的麦克风设备。"
            : `无法打开麦克风：${err.message ?? "未知错误"}`,
      );
      return;
    }

    streamRef.current = stream;
    setMicReady(true);

    try {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor) {
        const context = new AudioCtor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        audioContextRef.current = context;
        analyserRef.current = analyser;
      }
      startVolumeLoop();

      if (typeof MediaRecorder === "undefined") {
        throw new Error("当前浏览器不支持录音");
      }
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = url;
        setAudioUrl(url);
      };
      recorder.start();

      const Constructor = getSpeechRecognitionConstructor();
      setRecognitionSupported(Boolean(Constructor));
      if (Constructor) {
        const recognition = new Constructor();
        recognitionRef.current = recognition;
        recognition.lang = "zh-CN";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
          let finalDelta = "";
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const text = result[0]?.transcript ?? "";
            if (result.isFinal) finalDelta += punctuateSegment(text);
            else interim += text;
          }
          if (finalDelta) {
            finalTranscriptRef.current += finalDelta;
            setTranscript(finalTranscriptRef.current);
          }
          interimRef.current = interim;
          setInterimText(interim);
        };
        recognition.onerror = (event) => {
          if (event.error === "aborted" || event.error === "no-speech") return;
          if (event.error === "not-allowed") {
            setErrorMessage("麦克风权限被拒绝，语音识别已停止。");
            stopRecording();
            return;
          }
          setErrorMessage(`语音识别出错：${event.error}`);
        };
        recognition.onend = () => {
          if (isRecordingRef.current && !isPausedRef.current && shouldRestartRef.current) {
            try {
              recognition.start();
            } catch { /* ignore */ }
          }
        };
        try {
          recognition.start();
        } catch { /* ignore */ }
      } else {
        setErrorMessage("当前浏览器不支持实时语音识别，请使用 Chrome 或 Edge 打开。");
      }
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const err = error as { message?: string };
      setErrorMessage(`录音启动失败：${err.message ?? "未知错误"}`);
      return;
    }

    isRecordingRef.current = true;
    isPausedRef.current = false;
    shouldRestartRef.current = true;
    setIsRecording(true);
    setIsPaused(false);
    clockRef.current = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSeconds(elapsedRef.current);
    }, 1000);
  }

  function pausePractice() {
    if (!isRecording || isPaused) return;
    isPausedRef.current = true;
    shouldRestartRef.current = false;
    setIsPaused(true);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch { /* ignore */ }
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") recorder.pause();
    stopVolumeLoop();
    if (clockRef.current !== null) {
      window.clearInterval(clockRef.current);
      clockRef.current = null;
    }
  }

  function resumePractice() {
    if (!isRecording || !isPaused) return;
    isPausedRef.current = false;
    shouldRestartRef.current = true;
    setIsPaused(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch { /* ignore */ }
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "paused") recorder.resume();
    startVolumeLoop();
    if (clockRef.current === null) {
      clockRef.current = window.setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSeconds(elapsedRef.current);
      }, 1000);
    }
  }

  async function generateAiReport(text: string) {
    if (!apiConfig.apiKey.trim() || !text.trim()) return;
    setAiReport(null);
    setIsGeneratingReport(true);
    const localCharCount = text.replace(/\s/g, "").length;
    const localPace =
      elapsedRef.current > 0
        ? Math.round((localCharCount / elapsedRef.current) * 60)
        : 0;
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiConfig.apiKey,
          model: apiConfig.model,
          baseUrl: apiConfig.baseUrl,
          transcript: text,
          lesson: {
            title: activeLesson?.title ?? "",
            day: activeLesson?.title ?? "",
            goal: activeLesson?.goal ?? "",
            template: activeLesson?.template ?? "",
            question: activeLesson?.question ?? "",
          },
          metrics: {
            completeness: metrics.completeness,
            fluency: metrics.fluency,
            expression: metrics.expression,
            pace: localPace,
            averageVolume: audioMetrics?.averageVolume ?? currentVolume,
          },
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        report?: AiReport;
        message?: string;
      };
      if (data.ok && data.report) {
        setAiReport(data.report);
      } else {
        setErrorMessage(data.message ?? "AI 报告生成失败，已显示本地报告。");
      }
    } catch {
      setErrorMessage("AI 报告生成失败，已显示本地报告。");
    }
    setIsGeneratingReport(false);
  }

  async function regenerateAiReport() {
    const text = finalTranscriptRef.current.trim() || transcript.trim();
    if (text) await generateAiReport(text);
  }

  function stopRecording() {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    shouldRestartRef.current = false;
    setIsRecording(false);
    setIsPaused(false);
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try {
        recognitionRef.current.stop();
      } catch { /* ignore */ }
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stopVolumeLoop();
    if (clockRef.current !== null) {
      window.clearInterval(clockRef.current);
      clockRef.current = null;
    }

    const text = `${finalTranscriptRef.current}${interimRef.current}`.trim();
    if (text) {
      finalTranscriptRef.current = text;
      interimRef.current = "";
      setTranscript(text);
      setInterimText("");
    }

    const samples = volumeSamplesRef.current;
    const average = samples.length
      ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
      : 0;
    const variance =
      samples.length > 1
        ? samples.reduce((sum, value) => sum + (value - average) ** 2, 0) / samples.length
        : 0;
    const stability = samples.length
      ? Math.max(0, Math.round(100 - Math.sqrt(variance) * 1.2))
      : 100;
    setAudioMetrics({ averageVolume: average, stability });

    if (!text) {
      setErrorMessage("没有识别到语音内容。请确认麦克风已开启、说话音量正常，再试一次。");
      setHasReport(false);
      return;
    }
    setErrorMessage("");
    setHasReport(true);
    const localStructureChecks = evaluateStructure(text, activeLesson ?? { exampleParts: [] });
    const localCompleteness = localStructureChecks.length
      ? Math.round(
          localStructureChecks.reduce((sum, check) => sum + check.score, 0) /
            localStructureChecks.length,
        )
      : 0;
    const localCharCount = text.replace(/\s/g, "").length;
    const localFillerTotal = fillerWords.reduce(
      (sum, word) => sum + (text.match(new RegExp(word, "g")) || []).length,
      0,
    );
    const localFillerDensity = localCharCount
      ? Math.round((localFillerTotal / localCharCount) * 1000) / 10
      : 0;
    const localFluency = Math.max(0, Math.min(100, 100 - localFillerDensity * 8));
    const localPace =
      elapsedRef.current > 0
        ? Math.round((localCharCount / elapsedRef.current) * 60)
        : 0;
    const localVolScore =
      average === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              100,
              average >= 18 && average <= 85
                ? 100 - Math.abs(average - 48) * 0.8
                : 45,
            ),
          );
    const localPaceScore =
      localPace === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              100,
              localPace >= 90 && localPace <= 220
                ? 100 - Math.abs(localPace - 150) * 0.4
                : 50,
            ),
          );
    const localExpression = Math.round(
      localVolScore * 0.5 + localPaceScore * 0.3 + stability * 0.2,
    );
    const localPaceVolume = Math.round(localPaceScore * 0.6 + localVolScore * 0.4);
    const localRawScores = [
      localCompleteness,
      localFluency,
      localExpression,
      localPaceVolume,
    ];
    const localAverage = localRawScores.reduce((sum, value) => sum + value, 0) / 4;
    const localBalanced = localRawScores.map((value) =>
      Math.round(value * 0.65 + localAverage * 0.35),
    );
    const localScore = Math.round(
      localBalanced[0] * 0.35 +
        localBalanced[1] * 0.2 +
        localBalanced[2] * 0.2 +
        localBalanced[3] * 0.25,
    );
    saveLessonScore(mode, localScore);
    if (mode === "free") {
      void generateAiReport(text);
    }
  }

  function finishPractice() {
    if (isRecording) stopRecording();
  }

  return (
    <main className="product">
      <aside className="course-rail">
        <div className="brand-block">
          <div className="brand-icon">口</div>
          <div>
            <h1>阿云的口播陪练</h1>
            <p>面向自媒体创作者的表达训练台</p>
          </div>
        </div>

        <div className="rail-section">
          <div className="section-heading">
            <span>我的课程</span>
            <button type="button" onClick={() => setIsEditorOpen(true)}>编辑</button>
          </div>
          <div className="category-stack">
            {categories.map((category) => {
              const completedCount = category.lessons.filter(
                (lesson) => lesson.status === "已完成",
              ).length;
              return (
                <div key={category.id} className="category-block">
                  <button
                    type="button"
                    className="category-head"
                    onClick={() => toggleCategory(category.id)}
                  >
                    <span className="category-title">{category.title}</span>
                    <span className="category-meta">
                      {category.kind === "free"
                        ? category.expanded
                          ? "收起"
                          : "展开"
                        : `${completedCount}/${category.lessons.length} 节 · ${
                            category.expanded ? "收起" : "展开"
                          }`}
                    </span>
                  </button>
                  {category.expanded && (
                    <div className="lesson-list">
                      {category.lessons.map((lesson) => (
                        <button
                          type="button"
                          key={lesson.id}
                          className={`lesson-row ${activeLesson?.id === lesson.id ? "active" : ""}`}
                          onClick={() => selectLesson(category.id, lesson.id)}
                        >
                          <span className="lesson-title">{lesson.title}</span>
                          {category.kind !== "free" && (
                            <span className={`lesson-status ${lesson.status}`}>{lesson.status}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </aside>

      <section className="studio">
        <header className="studio-header">
          <div>
            {freeModule ? (
              <h2>随时练习</h2>
            ) : (
              <>
                <div className="crumb">
                  {activeLesson?.title ?? ""} · 第 {Math.max(1, activeLessonIndex + 1)} /{" "}
                  {activeCourse?.lessons.length ?? 0} 节
                </div>
                <h2>{activeLesson?.goal ?? ""}</h2>
                <p>{activeLesson?.template ?? ""}</p>
              </>
            )}
          </div>
          <button type="button" className="api-settings-button" onClick={() => setIsSettingsOpen(true)}>
            {apiConfig.apiKey ? apiConfig.provider : "模型设置"}
          </button>
        </header>

        <div className="mode-tabs" aria-label="训练模式">
          <button className={mode === "read" ? "selected" : ""} onClick={() => switchMode("read")} type="button">
            话术跟练
          </button>
          <button className={mode === "free" ? "selected" : ""} onClick={() => switchMode("free")} type="button">
            脱稿演练
          </button>
        </div>

        <div className="workspace-grid">
          <section className="script-panel">
            <div className="panel-head">
              <div>
                {!freeModule && <span>{mode === "free" ? "训练题目" : ""}</span>}
                {!freeModule && <h3>{activeLesson?.question ?? ""}</h3>}
              </div>
              {mode === "read" && !freeModule && (
                <div className="script-tabs" aria-label="原稿视图">
                  <button
                    type="button"
                    className={scriptTab === "example" ? "selected" : ""}
                    onClick={() => setScriptTab("example")}
                  >
                    示例
                  </button>
                  <button
                    type="button"
                    className={scriptTab === "mine" ? "selected" : ""}
                    onClick={() => setScriptTab("mine")}
                  >
                    我的稿件
                  </button>
                </div>
              )}
            </div>
            {mode === "read" ? (
              <>
                {!freeModule && (
                  <div className="lesson-guide">
                    <p>
                      <span>学习目标</span>
                      {activeLesson?.goal ?? ""}
                    </p>
                    <p>
                      <span>核心结构</span>
                      {activeLesson?.template ?? ""}
                    </p>
                    <p className="question">
                      <span>题目</span>
                      {activeLesson?.question ?? ""}
                    </p>
                  </div>
                )}
                {!freeModule && scriptTab === "example" ? (
                  <div className="example-view">
                    {(activeLesson?.exampleParts ?? []).map((part, index) => (
                      <span key={part.label} className={`example-segment part-${index % 5}`}>
                        <b>{part.label}</b>
                        {part.text}
                      </span>
                    ))}
                  </div>
                ) : freeModule ? (
                  <div className="script-field">
                    <textarea
                      className="paste-box script-only"
                      value={script}
                      onChange={(event) => setScript(event.target.value)}
                      placeholder="在这里粘贴或输入你的口播稿"
                    />
                  </div>
                ) : (
                  <div className="script-field">
                    <div className="paste-row">
                      <textarea
                        className="paste-box"
                        value={pasteText}
                        onChange={(event) => setPasteText(event.target.value)}
                        onPaste={(event) => {
                          const pasted = event.clipboardData.getData("text");
                          if (pasted.trim()) {
                            event.preventDefault();
                            handlePasteScript(pasted);
                          }
                        }}
                        placeholder="在这里粘贴你的口播稿，系统会自动拆成结构部分"
                      />
                      <button type="button" onClick={() => handlePasteScript(pasteText)}>
                        自动拆分
                      </button>
                    </div>
                    {scriptParts.length ? (
                      <div className="part-editors">
                        {scriptParts.map((part, index) => (
                          <div key={`${part.label}-${index}`} className={`part-editor part-${index % 5}`}>
                            <label>{part.label}</label>
                            <textarea
                              value={part.text}
                              onChange={(event) => updateScriptPart(index, event.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-paste-hint">粘贴后会自动拆分，也可以在这里继续手动修改</div>
                    )}
                  </div>
                )}
              </>
            ) : freeModule ? (
              <div className="free-prompt">
                <p>围绕你的稿件自由表达，这里没有固定结构要求。</p>
              </div>
            ) : (
              <div className="free-prompt">
                <p>{activeLesson?.question ?? ""}</p>
              </div>
            )}
          </section>

          <section className="practice-panel">
            <div className="panel-head">
              <div>
                <span>实时识别</span>
                <h3>{isPaused ? "训练已暂停" : isRecording ? "正在训练" : "准备开始"}</h3>
              </div>
              <div className="record-dot">
                <i className={isRecording && !isPaused ? "live" : ""} />
                {isPaused ? "已暂停" : isRecording ? "录制中" : "待开始"}
              </div>
            </div>
            {errorMessage && <div className="browser-warning">{errorMessage}</div>}
            {!recognitionSupported && !errorMessage && (
              <div className="browser-warning">当前浏览器不支持实时语音识别，请使用 Chrome 或 Edge 打开。</div>
            )}
            <div className="transcript-view">
              {liveText ? (
                <div className="transcript-copy">
                  <HighlightedTranscript text={transcript} />
                  {interimText && <p className="interim">{interimText}</p>}
                </div>
              ) : (
                <div className="empty-copy">
                  <span>点击“开始录制”后，这里会实时显示识别结果。</span>
                </div>
              )}
            </div>
            <div className="control-row">
              <button type="button" className="primary" disabled={isRecording} onClick={startRecording}>
                开始录制
              </button>
              <button type="button" disabled={!isRecording} onClick={isPaused ? resumePractice : pausePractice}>
                {isPaused ? "继续" : "暂停"}
              </button>
              <button type="button" disabled={!isRecording} onClick={finishPractice}>
                结束
              </button>
            </div>
            {audioUrl && (
              <audio className="recording-player" src={audioUrl} controls>
                <track kind="captions" />
              </audio>
            )}
          </section>
        </div>

        <section className="report-card">
          <div className="report-left">
            <span>训练报告</span>
            <h3>
              {hasReport
                ? `${aiReport?.score ?? metrics.score} 分`
                : "完成一次训练后生成报告"}
            </h3>
            <p>{aiReport?.summary || reportSummary}</p>
            {hasReport && mode === "read" && metrics.score > 60 && (
              <p className="encouragement">不错，已经超过 60 分，进入脱稿训练再巩固一遍。</p>
            )}
            {hasReport && metrics.score <= 60 && (
              <p className="encouragement retry">再来一次会更好。</p>
            )}
            {hasReport && mode === "free" && (activeLesson?.readScore ?? 0) < 70 && (
              <p className="encouragement retry">跟读还未达到 70 分，先回去练跟读。</p>
            )}
            {hasReport && mode === "read" && (
              <p className="encouragement report-tip">完成脱稿训练才有报告哟～</p>
            )}
            {hasReport && mode === "free" && !apiConfig.apiKey && (
              <p className="report-hint">配置模型后会自动生成完整 AI 报告</p>
            )}
            {hasReport && mode === "free" && apiConfig.apiKey && !isGeneratingReport && (
              <button type="button" className="regenerate-report" onClick={regenerateAiReport}>
                重新生成 AI 报告
              </button>
              )}
            {hasReport && mode === "read" && metrics.score > 60 && (
              <button type="button" className="next-lesson" onClick={() => switchMode("free")}>
                进入脱稿训练
              </button>
            )}
            {hasReport &&
              (activeLesson?.readScore ?? 0) >= 70 &&
              (activeLesson?.freeScore ?? 0) >= 70 &&
              activeLessonIndex < (activeCourse?.lessons.length ?? 0) - 1 && (
                <button type="button" className="next-lesson" onClick={completeActiveLesson}>
                  进入下一课
                </button>
              )}
          </div>
          <div className="score-strip">
            {(activeLesson?.exampleParts ?? []).map((part, index) => (
              <Score
                key={part.label}
                label={part.label}
                value={hasReport ? structureChecks[index]?.score : undefined}
              />
            ))}
            <Score label="流畅度" value={hasReport ? metrics.fluency : undefined} />
            <Score label="语速音量" value={hasReport ? metrics.paceVolume : undefined} />
          </div>
        </section>
        {hasReport && isGeneratingReport && (
          <div className="browser-warning">AI 报告生成中…</div>
        )}
        {hasReport && aiReport && (
          <div className="ai-report">
            {aiReport.summary && (
              <section className="ai-report-section">
                <strong>整段分析</strong>
                <p>{aiReport.summary}</p>
              </section>
            )}
            {aiReport.strengths && aiReport.strengths.length > 0 && (
              <section className="ai-report-section">
                <strong>讲得好的地方</strong>
                <ul>
                  {aiReport.strengths.map((item, index) => (
                    <li key={`strength-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            )}
            {aiReport.sentence_fixes && aiReport.sentence_fixes.length > 0 && (
              <section className="ai-report-section">
                <strong>逐句优化</strong>
                <div className="fix-list">
                  {aiReport.sentence_fixes.map((fix, index) => (
                    <div key={`fix-${index}`} className="fix-item">
                      <p>原句：{fix.original}</p>
                      <p>改写：{fix.rewritten}</p>
                      {fix.reason && <p>原因：{fix.reason}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {aiReport.high_frequency_words && aiReport.high_frequency_words.length > 0 && (
              <section className="ai-report-section">
                <strong>高频用词</strong>
                <ul>
                  {aiReport.high_frequency_words.map((item, index) => (
                    <li key={`word-${index}`}>
                      {item.word}
                      {typeof item.count === "number" ? `（${item.count} 次）` : ""}：
                      {item.suggestion ?? ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {aiReport.key_issues && aiReport.key_issues.length > 0 && (
              <section className="ai-report-section">
                <strong>本次重点问题</strong>
                <ul>
                  {aiReport.key_issues.map((item, index) => (
                    <li key={`issue-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            )}
            {aiReport.optimization_direction && (
              <section className="ai-report-section">
                <strong>优化方向</strong>
                <p>{aiReport.optimization_direction}</p>
              </section>
            )}
            {aiReport.next_step && (
              <section className="ai-report-section">
                <strong>下一步建议</strong>
                <p>{aiReport.next_step}</p>
              </section>
            )}
          </div>
        )}
      </section>

      <aside className="feedback-rail">
        <section className="feedback-card">
          <h3>实时反馈</h3>
          <Metric label="完成进度" value={liveText ? `${progress}%` : "待开始"} />
          <Metric label="训练时长" value={elapsedSeconds > 0 ? `${elapsedSeconds}s` : "待开始"} />
          <Metric label="语速" value={pace > 0 ? `${pace} 字/分` : "待开始"} />
          <Metric label="音量" value={isRecording || audioMetrics ? `${averageVolume}%` : "待开始"} />
          <Metric label="口头词密度" value={charCount ? `${fillerDensity}%` : "待开始"} />
        </section>

        <section className="feedback-card">
          <h3>口头词统计</h3>
          {fillerStats.length ? (
            <div className="filler-stack">
              {fillerStats.map((item) => (
                <Metric key={item.word} label={item.word} value={`${item.count} 次`} />
              ))}
            </div>
          ) : (
            <p className="empty-note">开始训练后，这里只显示真实出现过的口头词。</p>
          )}
        </section>

        <section className="feedback-card camera-card">
          <h3>录音检查</h3>
          <div className="mic-frame">
            <div className="volume-label">
              <span>实时音量</span>
              <strong>{currentVolume}%</strong>
            </div>
            <div className="volume-meter">
              <i style={{ height: `${currentVolume}%` }} />
            </div>
          </div>
          <div className="camera-checks">
            <span className={micReady ? "ready" : ""}>麦克风</span>
            <span className={recognitionSupported ? "ready" : ""}>识别引擎</span>
          </div>
        </section>
      </aside>

      {isSettingsOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsSettingsOpen(false);
          }}
        >
          <div className="modal-panel settings-panel" role="dialog" aria-modal="true" aria-label="模型设置">
            <div className="modal-head">
              <h3>模型设置</h3>
              <button type="button" onClick={() => setIsSettingsOpen(false)}>
                关闭
              </button>
            </div>
            <div className="add-form">
              <label>
                服务商
                <select value={apiConfig.provider} onChange={(event) => handleProviderChange(event.target.value)}>
                  {providerPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                API Key
                <input
                  type="password"
                  value={apiConfig.apiKey}
                  onChange={(event) =>
                    setApiConfig((prev) => ({ ...prev, apiKey: event.target.value }))
                  }
                  placeholder="sk-..."
                />
              </label>
              <label>
                模型名称
                <input
                  value={apiConfig.model}
                  onChange={(event) =>
                    setApiConfig((prev) => ({ ...prev, model: event.target.value }))
                  }
                  placeholder="deepseek-chat"
                />
              </label>
              <label>
                Base URL
                <input
                  value={apiConfig.baseUrl}
                  onChange={(event) =>
                    setApiConfig((prev) => ({ ...prev, baseUrl: event.target.value }))
                  }
                  placeholder="https://api.deepseek.com"
                />
                <p className="field-hint">系统会自动补 /chat/completions</p>
              </label>
              {testStatus.message && (
                <div className={`test-status ${testStatus.state}`}>{testStatus.message}</div>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={testStatus.state === "testing"}
                  onClick={testApiConnection}
                >
                  {testStatus.state === "testing" ? "测试中…" : "测试连接"}
                </button>
                <button type="button" onClick={() => setIsSettingsOpen(false)}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditorOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsEditorOpen(false);
          }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label="课程管理">
            <div className="modal-head">
              <h3>{isAdding ? (isNewCourse ? "新建课程" : "添加课程") : "课程管理"}</h3>
              <div className="modal-actions">
                {!isAdding && (
                  <button type="button" className="primary" onClick={openNewCourseForm}>
                    新建课程
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsEditorOpen(false);
                    setIsAdding(false);
                    setIsNewCourse(false);
                  }}
                >
                  关闭
                </button>
              </div>
            </div>
            {errorMessage && <div className="browser-warning">{errorMessage}</div>}
            {manageCourseId ? (
              <div className="manage-list">
                <div className="manage-category">
                  <div className="manage-category-head">
                    <input
                      className="manage-course-name"
                      value={manageCourse?.title ?? ""}
                      onChange={(event) => updateCourseTitle(manageCourseId!, event.target.value)}
                      placeholder="课程名称"
                    />
                    <button type="button" onClick={closeManageCourse}>
                      返回
                    </button>
                  </div>
                  <div className="manage-lessons">
                    {manageCourse?.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={`manage-lesson ${expandedLessonId === lesson.id ? "editing" : ""}`}
                      >
                        <input
                          className="manage-lesson-title"
                          value={lesson.title}
                          onChange={(event) =>
                            updateLesson(manageCourseId!, lesson.id, "title", event.target.value)
                          }
                          placeholder="课程标题"
                        />
                        <div className="manage-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLessonId(
                                expandedLessonId === lesson.id ? null : lesson.id,
                              )
                            }
                          >
                            {expandedLessonId === lesson.id ? "收起" : "更多"}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLesson(manageCourseId!, lesson.id)}
                          >
                            删除
                          </button>
                        </div>
                        {expandedLessonId === lesson.id && (
                          <div className="manage-lesson-fields">
                            <label>
                              学习目标
                              <input
                                value={lesson.goal}
                                onChange={(event) =>
                                  updateLesson(manageCourseId!, lesson.id, "goal", event.target.value)
                                }
                                placeholder="解决什么问题（选填）"
                              />
                            </label>
                            <label>
                              核心结构
                              <input
                                value={lesson.template}
                                onChange={(event) =>
                                  updateLesson(manageCourseId!, lesson.id, "template", event.target.value)
                                }
                                placeholder="结论 + 原因 + 细节 + 感受（选填）"
                              />
                            </label>
                            <label>
                              题目
                              <input
                                value={lesson.question}
                                onChange={(event) =>
                                  updateLesson(manageCourseId!, lesson.id, "question", event.target.value)
                                }
                                placeholder="今天要回答的问题（选填）"
                              />
                            </label>
                            <label>
                              示例
                              <textarea
                                rows={6}
                                value={lesson.exampleText || examplePartsToText(lesson.exampleParts)}
                                onChange={(event) =>
                                  updateLesson(
                                    manageCourseId!,
                                    lesson.id,
                                    "exampleText",
                                    event.target.value,
                                  )
                                }
                                placeholder={"结论：示例内容\n原因：示例内容"}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => addLessonToCourse(manageCourseId!)}
                  >
                    ＋ 添加一节课
                  </button>
                </div>
              </div>
            ) : !isAdding && !editingCourseId ? (
              <div className="course-card-grid">
                {categories.map((category) => {
                  const isBuiltIn = builtInCategoryIds.has(category.id);
                  const completedCount = category.lessons.filter(
                    (lesson) => lesson.status === "已完成",
                  ).length;
                  return (
                    <div
                      key={category.id}
                      className={`manage-course-card ${isBuiltIn ? "builtin" : "custom"}`}
                    >
                      <strong>{category.title}</strong>
                      <span>{category.lessons.length} 节</span>
                      <span>{completedCount} 节已完成</span>
                      {category.kind !== "free" && (
                        <div className="course-card-actions">
                          <button type="button" onClick={() => openManageCourse(category.id)}>
                            管理课程
                          </button>
                          {!isBuiltIn && (
                            <button type="button" onClick={() => deleteCustomCourse(category.id)}>
                              删除课程
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : editingCourseId ? (
              <div className="add-form">
                <label>
                  课程名称
                  <input
                    value={newCourseName}
                    onChange={(event) => setNewCourseName(event.target.value)}
                    placeholder="课程名称"
                  />
                </label>
                <div className="form-actions">
                  <button type="button" className="primary" onClick={saveCourseRename}>
                    保存修改
                  </button>
                  <button type="button" onClick={() => setEditingCourseId(null)}>
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="add-form">
                <label>
                  课程分类名称
                  <input
                    value={newCourseName}
                    onChange={(event) => setNewCourseName(event.target.value)}
                    placeholder="例如：职场口播训练"
                  />
                </label>
                <div className="manage-list">
                  <div className="manage-category">
                    <div className="manage-category-head">
                      <strong>课程内容（每一节一课）</strong>
                    </div>
                    <div className="manage-lessons">
                      {draftLessons.map((lesson, index) => (
                        <div
                          key={index}
                          className={`manage-lesson ${expandedDraft === index ? "editing" : ""}`}
                        >
                          <input
                            className="manage-lesson-title"
                            value={lesson.title}
                            onChange={(event) =>
                              updateDraftLesson(index, "title", event.target.value)
                            }
                            placeholder={`Day ${index + 1} · 课程标题`}
                          />
                          <div className="manage-actions">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDraft(expandedDraft === index ? null : index)
                              }
                            >
                              {expandedDraft === index ? "收起" : "更多"}
                            </button>
                            <button type="button" onClick={() => removeDraftLesson(index)}>
                              删除
                            </button>
                          </div>
                          {expandedDraft === index && (
                            <div className="manage-lesson-fields">
                              <label>
                                学习目标
                                <input
                                  value={lesson.goal}
                                  onChange={(event) =>
                                    updateDraftLesson(index, "goal", event.target.value)
                                  }
                                  placeholder="解决什么问题（选填）"
                                />
                              </label>
                              <label>
                                核心结构
                                <input
                                  value={lesson.template}
                                  onChange={(event) =>
                                    updateDraftLesson(index, "template", event.target.value)
                                  }
                                  placeholder="结论 + 原因 + 细节 + 感受（选填）"
                                />
                              </label>
                              <label>
                                题目
                                <input
                                  value={lesson.question}
                                  onChange={(event) =>
                                    updateDraftLesson(index, "question", event.target.value)
                                  }
                                  placeholder="今天要回答的问题（选填）"
                                />
                              </label>
                              <label>
                                示例
                                <textarea
                                  rows={6}
                                  value={lesson.exampleText}
                                  onChange={(event) =>
                                    updateDraftLesson(index, "exampleText", event.target.value)
                                  }
                                  placeholder={"结论：示例内容\n原因：示例内容"}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="form-actions split">
                  <button type="button" onClick={addDraftLesson}>
                    ＋ 添加一节课
                  </button>
                  <div className="form-actions">
                    <button type="button" className="primary" onClick={saveLesson}>
                      保存课程
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdding(false);
                        setIsNewCourse(false);
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function HighlightedTranscript({ text }: { text: string }) {
  // 整段连续展示识别结果，不按口头词拆分句子，避免句子被切碎。
  return <p>{text}</p>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Score({ label, value }: { label: string; value?: number }) {
  return (
    <div className="score">
      <span>{label}</span>
      <strong>{typeof value === "number" ? `${Math.round(value)}分` : "--"}</strong>
      <div className="score-line">
        <i style={{ width: `${typeof value === "number" ? Math.min(100, Math.max(0, value)) : 0}%` }} />
      </div>
    </div>
  );
}
