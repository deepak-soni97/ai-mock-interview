"use client";

import { useState } from "react";
import InterviewScreen from "./componenets/InterviewScreen";
import FeedbackScreen from "./componenets/FeedbackScreen";

interface Message { role: "user" | "assistant"; content: string; }

export interface InterviewConfig {
  timeLimit: number;
  topic: string;
  level: "fresher" | "junior" | "mid" | "senior";
  strictTopic: boolean;
}

type Phase = "landing" | "interview" | "feedback";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [messages, setMessages] = useState<Message[]>([]);
  const [config, setConfig] = useState<InterviewConfig>({
    timeLimit: 10, topic: "Mixed", level: "mid", strictTopic: true,
  });

  return (
    <main className="app-main">
      {phase === "landing" && (
        <LandingScreen
          onStart={(cfg) => { setConfig(cfg); setPhase("interview"); }}
        />
      )}
      {phase === "interview" && (
        <InterviewScreen
          config={config}
          onComplete={(msgs) => { setMessages(msgs); setPhase("feedback"); }}
        />
      )}
      {phase === "feedback" && (
        <FeedbackScreen
          messages={messages}
          onRestart={() => { setMessages([]); setPhase("landing"); }}
        />
      )}
    </main>
  );
}

function LandingScreen({ onStart }: { onStart: (cfg: InterviewConfig) => void }) {
  const [timeLimit, setTimeLimit] = useState(10);
  const [topic, setTopic] = useState("Mixed");
  const [level, setLevel] = useState<InterviewConfig["level"]>("mid");
  const [strictTopic, setStrictTopic] = useState(true);

  const timeLimits = [5, 10, 15, 20];
  const topics = ["Mixed", "Node.js", "React", "System Design"];
  const levels: { value: InterviewConfig["level"]; label: string; desc: string }[] = [
    { value: "fresher", label: "Fresher",   desc: "0 exp — basics" },
    { value: "junior",  label: "Junior",    desc: "0–2 years" },
    { value: "mid",     label: "Mid-Level", desc: "2–5 years" },
    { value: "senior",  label: "Senior",    desc: "5+ years" },
  ];

  return (
    <div className="landing">
      <div className="landing-glow" />
      <div className="landing-content">

        <div className="aria-logo">
          <div className="logo-ring" />
          <div className="logo-inner">ARIA</div>
        </div>

        <h1 className="landing-title">
          AI MOCK<br />
          <span className="title-accent">INTERVIEW</span>
        </h1>

        <p className="landing-desc">
          Face ARIA — AI interviewer powered by LLaMA3.<br />
          Real questions. Real feedback. Zero mercy.
        </p>

        <div className="config-panel">

          {/* Level */}
          <div className="config-section">
            <div className="config-label">🎯 EXPERIENCE LEVEL</div>
            <div className="config-options">
              {levels.map((l) => (
                <button
                  key={l.value}
                  className={`config-btn level-btn ${level === l.value ? "active" : ""}`}
                  onClick={() => setLevel(l.value)}
                >
                  <span className="level-name">{l.label}</span>
                  <span className="level-desc">{l.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Topic */}
          <div className="config-section">
            <div className="config-label">📚 TOPIC</div>
            <div className="config-options">
              {topics.map((tp) => (
                <button
                  key={tp}
                  className={`config-btn ${topic === tp ? "active" : ""}`}
                  onClick={() => setTopic(tp)}
                >
                  {tp}
                </button>
              ))}
            </div>
            {topic !== "Mixed" && (
              <div className="strict-toggle" onClick={() => setStrictTopic(!strictTopic)}>
                <div className={`toggle-box ${strictTopic ? "on" : "off"}`}>
                  {strictTopic ? "✓" : "✕"}
                </div>
                <span className="toggle-label">
                  {strictTopic
                    ? `Strict: Only ${topic} questions — AI won't change topic`
                    : `Flexible: User can request topic change`}
                </span>
              </div>
            )}
          </div>

          {/* Time */}
          <div className="config-section">
            <div className="config-label">⏱ TIME LIMIT</div>
            <div className="config-options">
              {timeLimits.map((t) => (
                <button
                  key={t}
                  className={`config-btn ${timeLimit === t ? "active" : ""}`}
                  onClick={() => setTimeLimit(t)}
                >
                  {t}m
                </button>
              ))}
            </div>
          </div>

        </div>

        <div className="features-list">
          <div className="feature">🎙 Voice</div>
          <div className="feature">📹 Camera</div>
          <div className="feature">⚡ Streaming</div>
          <div className="feature">📊 Report</div>
        </div>

        <button
          className="start-btn"
          onClick={() => onStart({ timeLimit, topic, level, strictTopic })}
        >
          <span>BEGIN INTERVIEW</span>
          <span className="btn-arrow">→</span>
        </button>

        <p className="landing-note">Allow microphone & camera access when prompted</p>
      </div>
    </div>
  );
}