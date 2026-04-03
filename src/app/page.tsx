// "use client";

// import { useState } from "react";
// import InterviewScreen from "./componenets/InterviewScreen";
// import FeedbackScreen from "./componenets/FeedbackScreen";

// export default function Home() {
//   const [messages, setMessages] = useState<any[]>([]);
//   const [finished, setFinished] = useState(false);

//   return (
//     <div className="h-screen flex gap-4 p-4">

//       {/* LEFT */}
//       <div className="w-2/3">
//         <InterviewScreen
//           onFinish={(msgs: any) => {
//             setMessages(msgs);
//             setFinished(true);
//           }}
//         />
//       </div>

//       {/* RIGHT */}
//       <div className="w-1/3">
//         {finished && <FeedbackScreen messages={messages} />}
//       </div>

//     </div>
//   );
// }
"use client";

import { useState } from "react";
import InterviewScreen from "./componenets/InterviewScreen";
import FeedbackScreen from "./componenets/FeedbackScreen";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface InterviewConfig {
  timeLimit: number; // minutes
  topic: string;
}

type Phase = "landing" | "interview" | "feedback";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [messages, setMessages] = useState<Message[]>([]);
  const [config, setConfig] = useState<InterviewConfig>({ timeLimit: 10, topic: "Mixed" });

  const handleStart = (cfg: InterviewConfig) => {
    setConfig(cfg);
    setPhase("interview");
  };

  const handleComplete = (msgs: Message[]) => {
    setMessages(msgs);
    setPhase("feedback");
  };

  const handleRestart = () => {
    setMessages([]);
    setPhase("landing");
  };

  return (
    <main className="app-main">
      {phase === "landing" && <LandingScreen onStart={handleStart} />}
      {phase === "interview" && (
        <InterviewScreen config={config} onComplete={handleComplete} />
      )}
      {phase === "feedback" && (
        <FeedbackScreen messages={messages} onRestart={handleRestart} />
      )}
    </main>
  );
}

function LandingScreen({ onStart }: { onStart: (cfg: InterviewConfig) => void }) {
  const [timeLimit, setTimeLimit] = useState(10);
  const [topic, setTopic] = useState("Mixed");

  const timeLimits = [5, 10, 15, 20];
  const topics = ["Mixed", "Node.js", "React", "System Design"];

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
          Face ARIA — our AI interviewer.<br />
          Real questions. Real feedback. Zero mercy.
        </p>

        {/* Config Panel */}
        <div className="config-panel">
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
          </div>
        </div>

        <div className="features-list">
          <div className="feature">🎙 Voice</div>
          <div className="feature">📹 Camera</div>
          <div className="feature">⚡ Streaming</div>
          <div className="feature">📊 Report</div>
        </div>

        <button className="start-btn" onClick={() => onStart({ timeLimit, topic })}>
          <span>BEGIN INTERVIEW</span>
          <span className="btn-arrow">→</span>
        </button>
        <p className="landing-note">Allow microphone & camera access when prompted</p>
      </div>
    </div>
  );
}