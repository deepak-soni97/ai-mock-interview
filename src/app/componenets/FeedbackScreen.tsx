// "use client";

// import { useEffect, useState } from "react";
// import ScoreCard from "./ScoreCard";
// export default function FeedbackScreen({ messages }: any) {
//   const [feedback, setFeedback] = useState("");

//   useEffect(() => {
//     if (!messages.length) return;

//     const run = async () => {
//       const res = await fetch("/api/interview", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           messages: [
//             {
//               role: "system",
//               content:
//                 "Give feedback in format:\nScore:\nStrengths:\nWeakness:\nSuggestions:",
//             },
//             ...messages,
//           ],
//         }),
//       });

//       const text = await res.text();
//       setFeedback(text);
//     };

//     run();
//   }, [messages]);

//   return (
//     <div className="p-4 bg-black/40 rounded-xl mt-4">
//       <h2 className="text-xl font-bold mb-2">📊 Feedback</h2>
//       <pre className="whitespace-pre-wrap">{feedback}</pre>
//       <ScoreCard score={80} />
//     </div>
//   );
// }


"use client";

import { useEffect, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface FeedbackData {
  overallScore: number;
  grade: string;
  summary: string;
  technicalScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  strongPoints: string[];
  weakPoints: string[];
  topicBreakdown: { knowledge: number; depth: number; clarity: number };
  recommendation: string;
  nextSteps: string[];
}

interface FeedbackScreenProps {
  messages: Message[];
  onRestart: () => void;
}

export default function FeedbackScreen({ messages, onRestart }: FeedbackScreenProps) {
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    generateFeedback();
  }, []);

  const generateFeedback = async () => {
    try {
      const res = await fetch("/api/interview", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      setFeedback(data);
      setIsLoading(false);
      setTimeout(() => setAnimateIn(true), 100);
    } catch {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="feedback-loading">
        <div className="loading-text">
          <span>ANALYZING INTERVIEW DATA</span>
          <span className="dots">...</span>
        </div>
        <div className="loading-bar">
          <div className="loading-fill" />
        </div>
      </div>
    );
  }

  if (!feedback) return null;

  const getGradeColor = (grade: string) => {
    const colors: Record<string, string> = {
      A: "#00ff88", B: "#88ff00", C: "#ffcc00", D: "#ff8800", F: "#ff2200",
    };
    return colors[grade] || "#00ff88";
  };

  const getRecommendationStyle = (rec: string) => {
    if (rec?.includes("Strong Hire")) return "rec-strong";
    if (rec?.includes("Hire")) return "rec-hire";
    if (rec?.includes("Maybe")) return "rec-maybe";
    return "rec-no";
  };

  return (
    <div className={`feedback-container ${animateIn ? "animate-in" : ""}`}>
      <div className="feedback-header">
        <div className="report-title">INTERVIEW ASSESSMENT REPORT</div>
        <div className="report-subtitle">ARIA — Automated Review & Interview Assistant</div>
      </div>

      {/* Score Card */}
      <div className="score-card">
        <div className="score-circle" style={{ "--score-color": getGradeColor(feedback.grade) } as any}>
          <div className="score-number">{feedback.overallScore}</div>
          <div className="score-grade">{feedback.grade}</div>
          <svg className="score-ring" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" className="ring-bg" />
            <circle
              cx="50" cy="50" r="44"
              className="ring-fill"
              strokeDasharray={`${(feedback.overallScore / 100) * 276.5} 276.5`}
              style={{ stroke: getGradeColor(feedback.grade) }}
            />
          </svg>
        </div>
        <div className="score-details">
          <div className={`recommendation ${getRecommendationStyle(feedback.recommendation)}`}>
            {feedback.recommendation}
          </div>
          <p className="summary-text">{feedback.summary}</p>
        </div>
      </div>

      {/* Sub Scores */}
      <div className="subscores">
        {[
          { label: "TECHNICAL", score: feedback.technicalScore },
          { label: "COMMUNICATION", score: feedback.communicationScore },
          { label: "PROBLEM SOLVING", score: feedback.problemSolvingScore },
        ].map(({ label, score }) => (
          <div key={label} className="subscore-item">
            <div className="subscore-header">
              <span>{label}</span>
              <span>{score}/100</span>
            </div>
            <div className="subscore-bar">
              <div
                className="subscore-fill"
                style={{ width: `${score}%`, "--delay": Math.random() + "s" } as any}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Strong & Weak */}
      <div className="points-grid">
        <div className="points-card strong">
          <div className="points-title">▲ STRONG POINTS</div>
          {feedback.strongPoints?.map((point, i) => (
            <div key={i} className="point-item">
              <span className="point-icon">✓</span>
              <span>{point}</span>
            </div>
          ))}
        </div>
        <div className="points-card weak">
          <div className="points-title">▼ WEAK POINTS</div>
          {feedback.weakPoints?.map((point, i) => (
            <div key={i} className="point-item">
              <span className="point-icon">!</span>
              <span>{point}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Topic Breakdown */}
      <div className="breakdown-section">
        <div className="section-title">TOPIC BREAKDOWN</div>
        <div className="breakdown-grid">
          {Object.entries(feedback.topicBreakdown || {}).map(([key, val]) => (
            <div key={key} className="breakdown-item">
              <div className="breakdown-label">{key.toUpperCase()}</div>
              <div className="breakdown-bar">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className={`breakdown-cell ${i < val ? "filled" : ""}`} />
                ))}
              </div>
              <div className="breakdown-score">{val}/10</div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Steps */}
      <div className="next-steps">
        <div className="section-title">RECOMMENDED NEXT STEPS</div>
        {feedback.nextSteps?.map((step, i) => (
          <div key={i} className="next-step-item">
            <span className="step-num">0{i + 1}</span>
            <span>{step}</span>
          </div>
        ))}
      </div>

      <button className="restart-btn" onClick={onRestart}>
        ↺ START NEW INTERVIEW
      </button>
    </div>
  );
}