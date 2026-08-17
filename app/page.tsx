"use client";

import { useMemo, useState } from "react";

type Course = {
  id: string;
  title: string;
  status: "进行中" | "已结束";
  progress: number;
  currentDay: string;
  goal: string;
  template: string;
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
  },
  {
    id: "creator",
    title: "自媒体起号口播专项",
    status: "进行中",
    progress: 28,
    currentDay: "专项训练",
    goal: "把选题讲得具体、可执行",
    template: "误区 + 纠偏 + 例子 + 行动任务",
  },
  {
    id: "emotion",
    title: "情绪类长口播训练",
    status: "进行中",
    progress: 15,
    currentDay: "情绪表达",
    goal: "从生活细节自然讲到观点",
    template: "场景 + 感受 + 普遍问题 + 判断 + 收尾",
  },
];

const sampleScript =
  "我最近买过最值的东西，是一个十几块钱的手机支架。它不贵，但我几乎每天都用。以前吃饭、化妆、回消息的时候，我总要找杯子或者纸巾盒把手机垫起来，角度不稳，还经常滑下来。现在支架往桌上一放，手机立住了，手也空出来了。这个东西没什么技术含量，但它确实让我每天少烦一点，所以我觉得很值。";

export default function Home() {
  const [activeCourse, setActiveCourse] = useState(courses[0]);
  const [mode, setMode] = useState<PracticeMode>("read");
  const [script, setScript] = useState(sampleScript);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [hasReport, setHasReport] = useState(false);

  const fillerStats = useMemo(() => {
    return fillerWords
      .map((word) => ({
        word,
        count: (transcript.match(new RegExp(word, "g")) || []).length,
      }))
      .filter((item) => item.count > 0);
  }, [transcript]);

  const charCount = transcript.replace(/\s/g, "").length;
  const scriptCount = Math.max(1, script.replace(/\s/g, "").length);
  const progress = Math.min(100, Math.round((charCount / scriptCount) * 100));
  const fillerTotal = fillerStats.reduce((sum, item) => sum + item.count, 0);
  const fillerDensity = charCount ? Math.round((fillerTotal / charCount) * 1000) / 10 : 0;
  const reportScore = Math.max(42, Math.min(92, Math.round((progress + 86 - fillerTotal * 5 + 78 + 82 + 80) / 5)));

  function simulatePractice() {
    const result =
      mode === "read"
        ? `${script} 然后 我觉得就是下一遍可以再说得更稳一点，嗯，所以先练完整。`
        : "很多人一开始练口播，总想先把稿子写得特别漂亮。其实新手最应该先练的是把一个简单问题说满三十秒。你先有结论，再补一个具体场景，最后说自己的感受，这样一段话才是完整的。";
    setTranscript(result);
    setIsRecording(false);
    setHasReport(true);
  }

  function finishPractice() {
    if (!transcript.trim()) {
      simulatePractice();
      return;
    }
    setIsRecording(false);
    setHasReport(true);
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
  }

  return (
    <main className="product">
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
          <div className="mode-toggle" aria-label="训练模式">
            <button className={mode === "read" ? "selected" : ""} onClick={() => setMode("read")} type="button">
              话术跟读
            </button>
            <button className={mode === "free" ? "selected" : ""} onClick={() => setMode("free")} type="button">
              脱稿演练
            </button>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="script-panel">
            <div className="panel-head">
              <div>
                <span>原稿区</span>
                <h3>{mode === "read" ? "粘贴稿件后按稿训练" : "脱稿时只保留结构提示"}</h3>
              </div>
              <button type="button" onClick={() => setScript(sampleScript)}>
                示例稿
              </button>
            </div>
            <textarea
              value={script}
              onChange={(event) => setScript(event.target.value)}
              placeholder="粘贴你的口播稿。第一版先看完整度、准确度、流畅度、表达状态和语速音量。"
            />
          </section>

          <section className="practice-panel">
            <div className="panel-head">
              <div>
                <span>实时识别</span>
                <h3>{isRecording ? "正在训练" : "准备开始"}</h3>
              </div>
              <div className="record-dot">
                <i className={isRecording ? "live" : ""} />
                {isRecording ? "录制中" : "待开始"}
              </div>
            </div>
            <div className="transcript-view">
              {transcript ? (
                <HighlightedTranscript text={transcript} />
              ) : (
                <div className="empty-copy">
                  开始后，这里显示 ASR 识别结果。命中的口头词会在文本中标红；没有真实命中时，不展示口头词列表。
                </div>
              )}
            </div>
            <div className="control-row">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setIsRecording(true);
                  setHasReport(false);
                  setTranscript("");
                }}
              >
                开始录制
              </button>
              <button type="button" onClick={() => setIsRecording(false)}>
                暂停
              </button>
              <button type="button" onClick={finishPractice}>
                结束
              </button>
              <button type="button" onClick={simulatePractice}>
                模拟跟读
              </button>
            </div>
          </section>
        </div>

        <section className="report-card">
          <div className="report-left">
            <span>训练报告</span>
            <h3>{hasReport ? `${reportScore} 分` : "完成一次训练后生成报告"}</h3>
            <p>
              {hasReport
                ? reportScore >= 50
                  ? "已达到进入脱稿演练的最低标准。"
                  : "建议先重新跟读一遍。"
                : "报告会给出下一遍最该修改的一句话，而不是泛泛打分。"}
            </p>
          </div>
          <div className="score-strip">
            <Score label="完整度" value={hasReport ? progress : undefined} />
            <Score label="准确度" value={hasReport ? Math.max(50, 92 - fillerTotal * 6) : undefined} />
            <Score label="流畅度" value={hasReport ? Math.max(48, 86 - fillerTotal * 5) : undefined} />
            <Score label="表达状态" value={hasReport ? 82 : undefined} />
            <Score label="语速音量" value={hasReport ? 80 : undefined} />
          </div>
          <div className="suggestion">
            <strong>句子级优化</strong>
            <p>
              {hasReport
                ? "下一遍先减少“然后、就是、嗯”这类连接，再补一个具体场景。优化后可以直接应用到原稿，留在当前页面继续练。"
                : "这里会在训练结束后稍微延迟出现，不打断用户正在说话。"}
            </p>
            <button type="button" disabled={!hasReport} onClick={applySuggestion}>
              应用优化稿继续练
            </button>
          </div>
        </section>
      </section>

      <aside className="feedback-rail">
        <section className="feedback-card">
          <h3>实时反馈</h3>
          <Metric label="完成进度" value={transcript ? `${progress}%` : "待开始"} />
          <Metric label="语速估算" value={transcript ? "128 字/分" : "待开始"} />
          <Metric label="口头词密度" value={transcript ? `${fillerDensity}%` : "待开始"} />
        </section>

        <section className="feedback-card">
          <h3>口头词统计</h3>
          {transcript ? (
            fillerStats.length ? (
              <div className="filler-stack">
                {fillerStats.map((item) => (
                  <Metric key={item.word} label={item.word} value={`${item.count} 次`} />
                ))}
              </div>
            ) : (
              <p className="empty-note">暂未检测到明显口头词。</p>
            )
          ) : (
            <p className="empty-note">开始训练后，只显示真实出现过的口头词。</p>
          )}
        </section>

        <section className="feedback-card camera-card">
          <h3>镜头表现</h3>
          <div className="camera-frame">
            <div className="face-outline" />
            <span>摄像头检测位</span>
          </div>
          <div className="camera-checks">
            <span>露脸</span>
            <span>居中</span>
            <span>亮度</span>
            <span>低头</span>
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
