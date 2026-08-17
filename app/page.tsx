"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

function coverageRatio(target: string, source: string): number {
  const t = target.replace(/[\s，。！？、；：""''（）【】《》,.!?;:'"()[\]]/g, "");
  const s = source.replace(/[\s，。！？、；：""''（）【】《》,.!?;:'"()[\]]/g, "");
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

type Course = {
  id: string;
  title: string;
  status: "进行中" | "已结束";
  progress: number;
  currentDay: string;
  goal: string;
  template: string;
  question: string;
  exampleParts: { label: string; text: string }[];
};

type PracticeMode = "read" | "free";

const fillerWords = ["然后", "就是", "嗯", "啊", "那个", "所以", "呃"];

const courses: Course[] = [
  {
    id: "default",
    title: "14 天口播表达系统",
    status: "进行中",
    progress: 7,
    currentDay: "Day 1",
    goal: "先把一段话说完整",
    template: "结论 + 原因 + 细节 + 感受",
    question: "最近买过最值的东西是什么？",
    exampleParts: [
      { label: "结论", text: "我最近买过最值的东西，是一个十几块钱的手机支架。" },
      { label: "原因", text: "它不贵，但我几乎每天都用。" },
      {
        label: "细节",
        text: "以前吃饭、化妆、回消息的时候，我总要找杯子或者纸巾盒把手机垫起来，角度不稳，还经常滑下来。现在支架往桌上一放，手机立住了，手也空出来了。",
      },
      {
        label: "感受",
        text: "这个东西没什么技术含量，但它确实让我每天少烦一点，所以我觉得很值。",
      },
    ],
  },
  {
    id: "creator",
    title: "自媒体起号口播专项",
    status: "进行中",
    progress: 28,
    currentDay: "专项训练",
    goal: "把选题讲得具体、可执行",
    template: "误区 + 纠偏 + 例子 + 行动任务",
    question: "新人起号最容易踩的坑是什么？",
    exampleParts: [
      { label: "误区", text: "很多人一开始练口播，总想把稿子写得特别漂亮。" },
      { label: "纠偏", text: "其实新手最应该先练的是把一个简单问题说满三十秒。" },
      { label: "例子", text: "你先有结论，再补一个具体场景，最后说自己的感受。" },
      { label: "行动任务", text: "今天只录一遍，不追求完美，先让整段话完整。" },
    ],
  },
  {
    id: "emotion",
    title: "情绪类长口播训练",
    status: "进行中",
    progress: 15,
    currentDay: "情绪表达",
    goal: "从生活细节自然讲到观点",
    template: "场景 + 感受 + 普遍问题 + 判断 + 收尾",
    question: "你有没有一件小事，让你突然理解了某个人？",
    exampleParts: [
      { label: "场景", text: "前几天我回家很晚，看到楼下便利店还亮着灯。" },
      { label: "感受", text: "那一刻我突然觉得，做这份工作的人，可能已经很多年没有按时吃过晚饭。" },
      { label: "普遍问题", text: "我们平时很少会去想，那些看起来平常的服务，背后是谁在替你撑着。" },
      { label: "判断", text: "所以现在我愿意多说一句谢谢，也多一点耐心。" },
      { label: "收尾", text: "一件小事，反而让我对人和人之间的关系有了新的理解。" },
    ],
  },
];

export default function Home() {
  const [activeCourse, setActiveCourse] = useState(courses[0]);
  const [mode, setMode] = useState<PracticeMode>("read");
  const [script, setScript] = useState("");
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

  const metrics = useMemo(() => {
    const completeness = Math.max(0, Math.min(100, progress));
    const accuracy =
      mode === "read"
        ? Math.max(0, Math.min(100, completeness - fillerDensity * 2))
        : Math.max(
            0,
            Math.min(
              100,
              100 - (Math.abs(charCount - scriptCount) / scriptCount) * 40 - fillerDensity * 2,
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
    const score = Math.round(
      completeness * 0.3 +
        accuracy * 0.2 +
        fluency * 0.2 +
        expression * 0.15 +
        paceVolume * 0.15,
    );
    return { completeness, accuracy, fluency, expression, paceVolume, score };
  }, [progress, mode, charCount, scriptCount, fillerDensity, pace, averageVolume, audioMetrics]);

  const reportSummary = hasReport
    ? metrics.score >= 70
      ? "整体表达已经稳定，可以进入脱稿演练。"
      : metrics.score >= 50
        ? "已达到进入脱稿演练的最低标准。"
        : "建议先重新跟读一遍，把内容说完整。"
    : "完成一次真实训练后，这里会给出评分和建议。";

  const reportSuggestion = useMemo(() => {
    if (!hasReport) return "训练结束后，这里会给出下一遍最该改的一句话。";
    if (fillerTotal >= 3) {
      const top = fillerStats
        .slice(0, 2)
        .map((item) => `“${item.word}”`)
        .join("、");
      return `下一遍先减少${top}这类口头词，想好下一句再开口。`;
    }
    if (metrics.completeness < 60) {
      return "识别内容只覆盖了一部分原稿，下一遍先把稿件读完整。";
    }
    if (pace > 220) return "语速偏快，下一遍放慢节奏，重点字可以稍微停顿。";
    if (pace > 0 && pace < 90) return "语速偏慢，下一遍减少停顿，让整段话更连贯。";
    if (metrics.expression < 60) return "声音状态还不够稳，下一遍先保持稳定音量，再补细节。";
    return "整体完成度不错，下一遍把最常出现的口头词换成停顿。";
  }, [hasReport, fillerTotal, fillerStats, metrics, pace]);

  async function startRecording() {
    if (isRecording) return;
    setErrorMessage("");
    setHasReport(false);
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
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
            if (result.isFinal) finalDelta += text;
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
  }

  function finishPractice() {
    if (isRecording) stopRecording();
  }

  function applySuggestion() {
    const cleaned = script
      .replaceAll("然后", "")
      .replaceAll("就是", "")
      .replaceAll("嗯", "")
      .replaceAll("啊", "")
      .replaceAll("那个", "")
      .replace(/\n{3,}/g, "\n\n");
    setScript(cleaned);
    setHasReport(false);
    setTranscript("");
    setInterimText("");
    setAudioMetrics(null);
    finalTranscriptRef.current = "";
    interimRef.current = "";
  }

  return (
    <main className="product">
      <div className="top-mode-bar" aria-label="训练模式">
        <button className={mode === "read" ? "selected" : ""} onClick={() => setMode("read")} type="button">
          话术跟练
        </button>
        <button className={mode === "free" ? "selected" : ""} onClick={() => setMode("free")} type="button">
          脱稿演练
        </button>
      </div>
      <aside className="course-rail">
        <div className="brand-block">
          <div className="brand-icon">口</div>
          <div>
            <h1>口播陪练</h1>
            <p>面向自媒体创作者的表达训练台</p>
          </div>
        </div>

        <div className="rail-section">
          <div className="section-heading">
            <span>我的课程</span>
            <button type="button">加入</button>
          </div>
          <div className="course-stack">
            {courses.map((course) => (
              <button
                type="button"
                key={course.id}
                className={`course-card ${activeCourse.id === course.id ? "active" : ""}`}
                onClick={() => setActiveCourse(course)}
              >
                <div className="course-card-top">
                  <strong>{course.title}</strong>
                  <span>{course.status}</span>
                </div>
                <p>
                  {course.currentDay} · {course.goal}
                </p>
                <div className="progress-track">
                  <div style={{ width: `${course.progress}%` }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rail-section quiet">
          <span>底层风格库</span>
          <p>对标博主风格不会展示给学员，只用于课程识别、评分和句子优化。</p>
        </div>
      </aside>

      <section className="studio">
        <header className="studio-header">
          <div>
            <div className="crumb">{activeCourse.currentDay}</div>
            <h2>{activeCourse.goal}</h2>
            <p>{activeCourse.template}</p>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="script-panel">
            <div className="panel-head">
              <div>
                <span>{mode === "read" ? "原稿区" : "训练题目"}</span>
                <h3>{activeCourse.question}</h3>
              </div>
            </div>
            {mode === "read" ? (
              <div className="script-field">
                <textarea value={script} onChange={(event) => setScript(event.target.value)} />
                {!script.trim() && (
                  <div className="script-placeholder" aria-hidden="true">
                    <div className="placeholder-guide">
                      <p>学习目标：{activeCourse.goal}</p>
                      <p>核心结构：{activeCourse.template}</p>
                      <p className="placeholder-question">题目：{activeCourse.question}</p>
                    </div>
                    <div className="placeholder-example">
                      {activeCourse.exampleParts.map((part, index) => (
                        <span key={part.label} className={`example-segment part-${index % 5}`}>
                          <b>{part.label}</b>
                          {part.text}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="free-prompt">
                <p>{activeCourse.question}</p>
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
            <h3>{hasReport ? `${metrics.score} 分` : "完成一次训练后生成报告"}</h3>
            <p>{reportSummary}</p>
          </div>
          <div className="score-strip">
            <Score label="完整度" value={hasReport ? metrics.completeness : undefined} />
            <Score label="准确度" value={hasReport ? metrics.accuracy : undefined} />
            <Score label="流畅度" value={hasReport ? metrics.fluency : undefined} />
            <Score label="表达状态" value={hasReport ? metrics.expression : undefined} />
            <Score label="语速音量" value={hasReport ? metrics.paceVolume : undefined} />
          </div>
          <div className="suggestion">
            <strong>句子级优化</strong>
            <p>{reportSuggestion}</p>
            <button type="button" disabled={!hasReport} onClick={applySuggestion}>
              应用优化稿继续练
            </button>
          </div>
        </section>
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
    </main>
  );
}

function HighlightedTranscript({ text }: { text: string }) {
  const parts = text.split(new RegExp(`(${fillerWords.join("|")})`, "g"));
  return (
    <p>
      {parts.map((part, index) =>
        fillerWords.includes(part) ? (
          <mark key={`${part}-${index}`}>{part}</mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </p>
  );
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
