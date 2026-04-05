"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { InterviewConfig } from "../page";

interface Message { role: "user" | "assistant"; content: string; }
interface QAPair { question: string; answer: string; score: number | null; timestamp: number; }

// Voices async loader — browser mein pehli baar getVoices() empty hota hai
function getVoiceAsync(): Promise<SpeechSynthesisVoice | null> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    if (voices.length > 0) {
      const preferred =
        voices.find((v) => v.name.includes("Google") && v.lang === "en-US") ||
        voices.find((v) => v.lang.startsWith("en")) ||
        voices[0];
      return resolve(preferred || null);
    }
    let resolved = false;
    synth.onvoiceschanged = () => {
      if (resolved) return;
      resolved = true;
      const v2 = synth.getVoices();
      const preferred =
        v2.find((v) => v.name.includes("Google") && v.lang === "en-US") ||
        v2.find((v) => v.lang.startsWith("en")) ||
        v2[0];
      resolve(preferred || null);
    };
    setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, 3000);
  });
}

export default function InterviewScreen({
  config,
  onComplete,
}: {
  config: InterviewConfig;
  onComplete: (messages: Message[]) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [status, setStatus] = useState("INITIALIZING...");
  const [qaPairs, setQAPairs] = useState<QAPair[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState("");
  const [answerReady, setAnswerReady] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [silenceWarning, setSilenceWarning] = useState(false);

  const [timeLeft, setTimeLeft] = useState(config.timeLimit * 60);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const SILENCE_TIMEOUT = 10000;

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortSpeakRef = useRef(false);
  const lastSpokenTextRef = useRef("");
  const isCompletingRef = useRef(false);

  const totalSeconds = config.timeLimit * 60;
  const timePercent = (timeLeft / totalSeconds) * 100;
  const scoredPairs = qaPairs.filter((q) => q.score !== null);
  const avgScore =
    scoredPairs.length > 0
      ? Math.round(scoredPairs.reduce((a, b) => a + (b.score ?? 0), 0) / scoredPairs.length)
      : 0;

  // ── Timer ──
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) { clearInterval(timerRef.current!); handleTimeUp(); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current!);
  }, [timerActive]);

  // ── Init ──
  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    // Preload voices
    synthRef.current.getVoices();
    if (synthRef.current.onvoiceschanged !== undefined) {
      synthRef.current.onvoiceschanged = () => synthRef.current?.getVoices();
    }
    initSpeechRecognition();
    startInterview();
    return () => {
      synthRef.current?.cancel();
      recognitionRef.current?.abort();
      stopCamera();
      clearSilenceTimer();
      clearInterval(timerRef.current!);
    };
  }, []);

  // ── Camera stream connect ──
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  // ── Auto scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaPairs, aiResponse]);

  const handleTimeUp = () => {
    synthRef.current?.cancel();
    recognitionRef.current?.abort();
    setStatus("TIME UP — GENERATING REPORT...");
    setTimeout(() => onComplete(messages), 1500);
  };

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setSilenceWarning(false);
  };

  const startSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => setSilenceWarning(true), SILENCE_TIMEOUT);
  };

  const initSpeechRecognition = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      clearSilenceTimer();
      setSilenceWarning(false);
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript;
      setTranscript(text);
      if (result.isFinal) {
        setPendingAnswer((prev) => (prev ? prev + " " + text : text).trim());
        setTranscript("");
        setIsListening(false);
        setAnswerReady(true);
        setStatus("ANSWER READY — SUBMIT OR KEEP ADDING");
      }
    };
    recognition.onerror = () => { setIsListening(false); clearSilenceTimer(); };
    recognition.onend = () => { setIsListening(false); };
    recognitionRef.current = recognition;
  };

  // ── Camera ──
  const toggleCamera = async () => {
    if (cameraOn) { stopCamera(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      setCameraError(false);
    } catch { setCameraError(true); }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  // ── AI Stop ──
  const stopAI = () => {
    abortSpeakRef.current = true;
    synthRef.current?.cancel();
    setIsAISpeaking(false);
    setStatus("YOUR TURN — SPEAK OR TYPE");
  };

  // ── Replay last question ──
  const replayQuestion = () => {
    if (lastSpokenTextRef.current && !isAISpeaking && !isLoading) {
      speak(lastSpokenTextRef.current);
    }
  };

  // ── Speak — fixed voice loading ──
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise(async (resolve) => {
      if (!synthRef.current) return resolve();
      abortSpeakRef.current = false;
      synthRef.current.cancel();

      const cleanText = text.replace(/INTERVIEW_COMPLETE/g, "").trim();
      if (!cleanText) return resolve();

      lastSpokenTextRef.current = cleanText;

      // Wait for voices to be ready
      const voice = await getVoiceAsync();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      if (voice) utterance.voice = voice;
      utterance.rate = 0.92;
      utterance.pitch = 0.85;
      utterance.volume = 1;

      let checkInterval: ReturnType<typeof setInterval>;
      let finished = false;

      const done = () => {
        if (finished) return;
        finished = true;
        clearInterval(checkInterval);
        setIsAISpeaking(false);
        resolve();
      };

      utterance.onstart = () => setIsAISpeaking(true);
      utterance.onend = done;
      utterance.onerror = done;

      checkInterval = setInterval(() => {
        if (abortSpeakRef.current) {
          synthRef.current?.cancel();
          done();
        }
      }, 100);

      synthRef.current.speak(utterance);

      // Chrome bug — if speech doesn't start in 1.5s, retry
      setTimeout(() => {
        if (!finished && !synthRef.current?.speaking) {
          synthRef.current?.cancel();
          const u2 = new SpeechSynthesisUtterance(cleanText);
          if (voice) u2.voice = voice;
          u2.rate = 0.92; u2.pitch = 0.85; u2.volume = 1;
          u2.onstart = () => setIsAISpeaking(true);
          u2.onend = done;
          u2.onerror = done;
          synthRef.current?.speak(u2);
        }
      }, 1500);
    });
  }, []);

  // ── Score answer ──
  const scoreAnswer = async (question: string, answer: string): Promise<number> => {
    if (!answer || answer.trim().length < 5) return 0;
    try {
      const res = await fetch("/api/interview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, level: config.level }),
      });
      const data = await res.json();
      return data.score ?? 0;
    } catch { return 0; }
  };

  // ── Stream AI response ──
  const streamAIResponse = async (currentMessages: Message[]) => {
    setIsLoading(true);
    setStatus("AI THINKING...");
    setAiResponse("");
    setAnswerReady(false);
    setPendingAnswer("");
    setSubmitError("");
    clearSilenceTimer();
    setSilenceWarning(false);
    let fullResponse = "";

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages,
          topic: config.topic,
          level: config.level,
          strictTopic: config.strictTopic,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullResponse += data.text;
                setAiResponse(fullResponse);
              }
            } catch {}
          }
        }
      }

      const cleanQuestion = fullResponse.replace("INTERVIEW_COMPLETE", "").trim();

      // Guard: empty response
      if (!cleanQuestion && !fullResponse.includes("INTERVIEW_COMPLETE")) {
        setIsLoading(false);
        setStatus("YOUR TURN — SPEAK OR TYPE");
        return;
      }

      setCurrentQuestion(cleanQuestion);
      const newMessages: Message[] = [
        ...currentMessages,
        { role: "assistant", content: fullResponse },
      ];
      setMessages(newMessages);
      setAiResponse("");
      setQuestionCount((q) => q + 1);

      // Add QA pair — only if question is valid and not duplicate
      if (!fullResponse.includes("INTERVIEW_COMPLETE") && cleanQuestion.length > 5) {
        setQAPairs((prev) => {
          const alreadyExists = prev.some((p) => p.question === cleanQuestion);
          if (alreadyExists) return prev;
          return [...prev, { question: cleanQuestion, answer: "", score: null, timestamp: Date.now() }];
        });
      }

      // Interview complete
      if (fullResponse.includes("INTERVIEW_COMPLETE")) {
        if (isCompletingRef.current) return;
        isCompletingRef.current = true;
        setStatus("INTERVIEW COMPLETE — GENERATING REPORT...");
        setIsLoading(false);
        await speak(cleanQuestion);
        setTimeout(() => onComplete(newMessages), 1500);
        return;
      }

      setIsLoading(false);
      setStatus("AI SPEAKING... (⏹ TO STOP)");
      await speak(cleanQuestion);

      setStatus("YOUR TURN — SPEAK OR TYPE");
      if (!timerActive) setTimerActive(true);
      startSilenceTimer();
    } catch (err) {
      console.error("streamAIResponse error:", err);
      setIsLoading(false);
      setStatus("ERROR — PLEASE RETRY");
    }
  };
 const interviewStartedRef = useRef(false);
  const startInterview = async () => {
    if (interviewStartedRef.current) return; // double call block
    interviewStartedRef.current = true;
    setStatus("CONNECTING TO ARIA...");
    await new Promise((r) => setTimeout(r, 800));
    await streamAIResponse([]);
  };

  // ── Submit answer ──
  const submitAnswer = async () => {
    const finalAnswer = pendingAnswer.trim();
    if (!finalAnswer || finalAnswer.length < 3) {
      setSubmitError("⚠ Please answer first — cannot submit blank!");
      setTimeout(() => setSubmitError(""), 3000);
      return;
    }

    if (isLoading) return;
    setSubmitError("");
    setAnswerReady(false);
    setPendingAnswer("");
    clearSilenceTimer();
    setSilenceWarning(false);
    setStatus("PROCESSING YOUR ANSWER...");

    const userMessage: Message = { role: "user", content: finalAnswer };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    const lastQ = currentQuestion;
    setQAPairs((prev) => {
      const updated = [...prev];
      if (updated.length > 0) updated[updated.length - 1].answer = finalAnswer;
      return updated;
    });

    scoreAnswer(lastQ, finalAnswer).then((score) => {
      setQAPairs((prev) => {
        const updated = [...prev];
        const idx = updated.findLastIndex((p) => p.answer === finalAnswer);
        const realIdx = idx !== -1 ? updated.length - 1 - idx : -1
        if (idx !== -1) updated[realIdx].score = score;
        return updated;
      });
    });

    await streamAIResponse(updatedMessages);
  };

  const startListening = () => {
    if (isListening || isAISpeaking || isLoading) return;
    synthRef.current?.cancel();
    setSilenceWarning(false);
    setIsListening(true);
    setSubmitError("");
    setStatus("LISTENING... SPEAK NOW");
    startSilenceTimer();
    try { recognitionRef.current?.start(); } catch {}
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    clearSilenceTimer();
  };

  const typeAnswer = () => {
    const input = window.prompt("Type your answer:");
    if (input && input.trim().length >= 3) {
      setPendingAnswer((prev) => (prev ? prev + " " + input.trim() : input.trim()));
      setAnswerReady(true);
      setSubmitError("");
      setStatus("ANSWER READY — PRESS SUBMIT");
    } else if (input !== null) {
      setSubmitError("⚠ Please type something — blank answer not allowed!");
      setTimeout(() => setSubmitError(""), 3000);
    }
  };

  const clearAnswer = () => {
    setPendingAnswer("");
    setAnswerReady(false);
    setSubmitError("");
    setStatus("YOUR TURN — SPEAK OR TYPE");
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const timerDanger = timeLeft < 60;
  const timerWarn = timeLeft < 180;
  const circumference = 2 * Math.PI * 36;

  const levelColors: Record<string, string> = {
    fresher: "var(--green)",
    junior: "var(--cyan)",
    mid: "var(--yellow)",
    senior: "var(--red)",
  };

  return (
    <div className="interview-layout">
      {/* ── SIDE PANEL ── */}
      <div className="side-panel">

        {/* Timer */}
        <div className={`timer-card ${timerDanger ? "danger" : timerWarn ? "warn" : ""}`}>
          <div className="timer-label">TIME LEFT</div>
          <div className="timer-ring-wrap">
            <svg viewBox="0 0 80 80" className="timer-svg">
              <circle cx="40" cy="40" r="36" className="timer-ring-bg" />
              <circle
                cx="40" cy="40" r="36"
                className="timer-ring-fill"
                strokeDasharray={`${(timePercent / 100) * circumference} ${circumference}`}
                transform="rotate(-90 40 40)"
              />
            </svg>
            <div className="timer-display">
              <span className="timer-time">{formatTime(timeLeft)}</span>
            </div>
          </div>
          <div className="timer-limit">{config.timeLimit}m LIMIT</div>
        </div>

        {/* Level Badge */}
        <div className="level-badge-card">
          <div className="level-badge-label">LEVEL</div>
          <div className="level-badge-value" style={{ color: levelColors[config.level] }}>
            {config.level.toUpperCase()}
          </div>
          <div className="level-badge-sub">
            {config.level === "fresher" && "0 exp"}
            {config.level === "junior" && "0–2 yrs"}
            {config.level === "mid" && "2–5 yrs"}
            {config.level === "senior" && "5+ yrs"}
          </div>
        </div>

        {/* Stats */}
        <div className="stats-card">
          <div className="stat-item">
            <div className="stat-value">{questionCount}</div>
            <div className="stat-label">QUESTIONS</div>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <div className="stat-value" style={{
              color: avgScore >= 70 ? "var(--green)" : avgScore >= 50 ? "var(--yellow)" : avgScore > 0 ? "var(--red)" : "var(--text-dim)",
            }}>
              {avgScore || "—"}
            </div>
            <div className="stat-label">AVG SCORE</div>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <div className="stat-value">{config.topic.slice(0, 4).toUpperCase()}</div>
            <div className="stat-label">TOPIC</div>
          </div>
        </div>

        {/* Camera */}
        <div className="camera-card">
          <div className="camera-header">
            <span className="camera-label">📹 CAMERA</span>
            <button className={`camera-toggle ${cameraOn ? "on" : "off"}`} onClick={toggleCamera}>
              {cameraOn ? "ON" : "OFF"}
            </button>
          </div>
          <div className="camera-view">
            {cameraOn ? (
              <video
                ref={(el) => {
                  videoRef.current = el;
                  if (el && streamRef.current) {
                    el.srcObject = streamRef.current;
                    el.play().catch(() => {});
                  }
                }}
                autoPlay muted playsInline className="camera-feed"
              />
            ) : (
              <div className="camera-placeholder">
                {cameraError ? "⚠ ACCESS DENIED" : "CAMERA OFF"}
              </div>
            )}
            {cameraOn && <div className="camera-rec"><span className="rec-dot" />REC</div>}
          </div>
        </div>

        {/* Progress dots */}
        <div className="progress-card">
          <div className="progress-label">QUESTIONS COMPLETED</div>
          <div className="q-dots">
            {qaPairs.map((pair, i) => {
              const done = !!pair.answer;
              const score = pair.score;
              return (
                <div
                  key={i}
                  className={`q-dot ${done ? "done" : i === qaPairs.length - 1 ? "active" : ""}`}
                  style={
                    score !== null && score !== undefined
                      ? {
                          background: score >= 70 ? "var(--green)" : score >= 50 ? "var(--yellow)" : "var(--red)",
                          borderColor: score >= 70 ? "var(--green)" : score >= 50 ? "var(--yellow)" : "var(--red)",
                          color: "var(--bg)",
                        }
                      : {}
                  }
                  title={score !== null && score !== undefined ? `Q${i + 1}: ${score}/100` : `Q${i + 1}`}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── MAIN PANEL ── */}
      <div className="interview-main">

        {/* Header */}
        <div className="interview-header">
          <div className="aria-badge">
            <span className="aria-dot" />
            ARIA — AI INTERVIEWER
          </div>
          <div className="status-bar">
            <span className="status-text">{status}</span>
          </div>
        </div>

        {/* Visualizer */}
        <div className="visualizer">
          <ARIAVisualizer isActive={isAISpeaking} isListening={isListening} />
          <div className="viz-actions">
            {isAISpeaking && (
              <button className="viz-action-btn stop-btn" onClick={stopAI}>
                ⏹ STOP AI
              </button>
            )}
            {!isAISpeaking && !isLoading && lastSpokenTextRef.current && (
              <button className="viz-action-btn replay-btn" onClick={replayQuestion}>
                🔁 REPLAY QUESTION
              </button>
            )}
          </div>
        </div>

        {/* Silence warning */}
        {silenceWarning && !isAISpeaking && !isLoading && (
          <div className="silence-warning">
            ⏳ No answer detected — speak or type. Press 🔁 to replay the question.
          </div>
        )}

        {/* Answer preview */}
        {pendingAnswer && (
          <div className="answer-preview">
            <div className="answer-preview-header">
              <span>▶ YOUR ANSWER (PREVIEW)</span>
              <button className="clear-btn" onClick={clearAnswer}>✕ CLEAR</button>
            </div>
            <p className="answer-preview-text">{pendingAnswer}</p>
          </div>
        )}

        {/* Submit error */}
        {submitError && <div className="submit-error">{submitError}</div>}

        {/* Q&A Log */}
        <div className="qa-log">
          {qaPairs.map((pair, i) => (
            <div key={i} className="qa-pair">
              <div className="qa-number">Q{i + 1}</div>
              <div className="qa-content">
                <div className="qa-question">
                  <span className="qa-q-label">▶ ARIA</span>
                  <p>{pair.question}</p>
                </div>
                {pair.answer ? (
                  <div className="qa-answer">
                    <span className="qa-a-label">▶ YOU</span>
                    <p>{pair.answer}</p>
                    {pair.score !== null && (
                      <div
                        className="qa-score"
                        style={{
                          color: pair.score >= 70 ? "var(--green)" : pair.score >= 50 ? "var(--yellow)" : "var(--red)",
                          borderColor: pair.score >= 70 ? "var(--green)" : pair.score >= 50 ? "var(--yellow)" : "var(--red)",
                        }}
                      >
                        {pair.score}/100
                      </div>
                    )}
                  </div>
                ) : i === qaPairs.length - 1 ? (
                  <div className="qa-answer pending">
                    <span className="qa-a-label">▶ YOU</span>
                    <p className="pending-text">
                      {pendingAnswer ? (
                        pendingAnswer
                      ) : transcript ? (
                        <>
                          <span style={{ color: "var(--cyan)" }}>{transcript}</span>
                          <span className="cursor-blink"> █</span>
                        </>
                      ) : (
                        <span className="waiting-text">
                          Waiting for your answer
                          <span className="dots-anim">...</span>
                        </span>
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {/* Streaming AI response */}
          {aiResponse && (
            <div className="qa-pair streaming-pair">
              <div className="qa-number">Q{qaPairs.length + 1}</div>
              <div className="qa-content">
                <div className="qa-question">
                  <span className="qa-q-label">▶ ARIA</span>
                  <p>{aiResponse}<span className="cursor-blink">█</span></p>
                </div>
              </div>
            </div>
          )}

          {isLoading && !aiResponse && (
            <div className="qa-thinking">
              <span>ARIA THINKING</span>
              <span className="dots-anim">...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Controls */}
        <div className="controls">
          <button
            className={`mic-btn ${isListening ? "active" : ""} ${isAISpeaking || isLoading ? "disabled" : ""}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isAISpeaking || isLoading}
          >
            {isListening ? <><span>⏹</span> STOP MIC</> : <><span>🎙</span> SPEAK</>}
          </button>
          <button className="text-btn" onClick={typeAnswer} disabled={isAISpeaking || isLoading}>
            ⌨ TYPE
          </button>
          {answerReady && (
            <button className="submit-btn" onClick={submitAnswer}>
              ✓ SUBMIT
            </button>
          )}
          <button className="skip-btn" onClick={() => onComplete(messages)} disabled={isLoading}>
            ⏭ END
          </button>
        </div>

      </div>
    </div>
  );
}

function ARIAVisualizer({ isActive, isListening }: { isActive: boolean; isListening: boolean }) {
  return (
    <div className={`aria-viz ${isActive ? "speaking" : ""} ${isListening ? "listening" : ""}`}>
      <div className="viz-bars">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="viz-bar" style={{ animationDelay: `${(i * 0.05) % 1}s` }} />
        ))}
      </div>
      <div className="viz-label">
        {isActive ? "ARIA SPEAKING" : isListening ? "LISTENING" : "STANDBY"}
      </div>
    </div>
  );
}