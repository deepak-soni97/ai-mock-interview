"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { InterviewConfig } from "../page";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface QAPair {
  question: string;
  answer: string;
  score: number | null;
  timestamp: number;
}

interface InterviewScreenProps {
  config: InterviewConfig;
  onComplete: (messages: Message[]) => void;
}

export default function InterviewScreen({ config, onComplete }: InterviewScreenProps) {
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
  const [pendingAnswer, setPendingAnswer] = useState(""); // User ka full answer collect karo
  const [answerReady, setAnswerReady] = useState(false); // Submit button dikhane ke liye

  // Timer
  const [timeLeft, setTimeLeft] = useState(config.timeLimit * 60);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Camera
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const recognitionRef = useRef<any | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // AI ko beech mein rokne ke liye
  const abortSpeakRef = useRef(false);
  // Next question shuru hone se rokne ke liye
  const waitingForSubmitRef = useRef(false);

  const totalSeconds = config.timeLimit * 60;
  const timePercent = (timeLeft / totalSeconds) * 100;
  const scoredPairs = qaPairs.filter((q) => q.score !== null);
  const avgScore = scoredPairs.length > 0
    ? Math.round(scoredPairs.reduce((a, b) => a + (b.score ?? 0), 0) / scoredPairs.length)
    : 0;

  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current!);
            handleTimeUp();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current!);
  }, [timerActive]);

  const handleTimeUp = () => {
    synthRef.current?.cancel();
    recognitionRef.current?.abort();
    setStatus("TIME UP — GENERATING REPORT...");
    setTimeout(() => onComplete(messages), 1500);
  };

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    initSpeechRecognition();
    startInterview();
    return () => {
      synthRef.current?.cancel();
      recognitionRef.current?.abort();
      stopCamera();
    };
  }, []);

  // Camera fix — useEffect se video stream connect karo
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaPairs, aiResponse]);

  const initSpeechRecognition = () => {
    const SpeechRecognition =  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript;
      setTranscript(text);
      if (result.isFinal) {
        // Answer collect karo, submit mat karo abhi
        setPendingAnswer((prev) => (prev ? prev + " " + text : text));
        setTranscript("");
        setIsListening(false);
        setAnswerReady(true);
        waitingForSubmitRef.current = true;
        setStatus("ANSWER READY — PRESS SUBMIT OR ADD MORE");
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      if (pendingAnswer) setAnswerReady(true);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
  };

  const toggleCamera = async () => {
    if (cameraOn) {
      stopCamera();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        setCameraOn(true);
        setCameraError(false);
      } catch {
        setCameraError(true);
      }
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  // AI ko beech mein rokna
  const stopAI = () => {
    abortSpeakRef.current = true;
    synthRef.current?.cancel();
    setIsAISpeaking(false);
    setStatus("AI STOPPED — YOUR TURN");
  };

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!synthRef.current) return resolve();
      abortSpeakRef.current = false;
      synthRef.current.cancel();

      const cleanText = text.replace(/INTERVIEW_COMPLETE/g, "").trim();
      if (!cleanText) return resolve();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voices = synthRef.current.getVoices();
      const preferred =
        voices.find((v) => v.name.includes("Google") && v.lang === "en-US") ||
        voices.find((v) => v.lang === "en-US") ||
        voices[0];
      if (preferred) utterance.voice = preferred;
      utterance.rate = 0.95;
      utterance.pitch = 0.85;
      utterance.volume = 1;

      utterance.onstart = () => setIsAISpeaking(true);
      utterance.onend = () => {
        setIsAISpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsAISpeaking(false);
        resolve();
      };

      synthRef.current.speak(utterance);

      // Abort check
      const checkAbort = setInterval(() => {
        if (abortSpeakRef.current) {
          synthRef.current?.cancel();
          clearInterval(checkAbort);
          setIsAISpeaking(false);
          resolve();
        }
      }, 100);

      utterance.onend = () => {
        clearInterval(checkAbort);
        setIsAISpeaking(false);
        resolve();
      };
    });
  }, []);

  const scoreAnswer = async (question: string, answer: string): Promise<number> => {
    try {
      const res = await fetch("/api/interview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      const data = await res.json();
      return data.score ?? 60;
    } catch {
      return 60;
    }
  };

  const streamAIResponse = async (currentMessages: Message[]) => {
    setIsLoading(true);
    setStatus("AI PROCESSING...");
    setAiResponse("");
    setAnswerReady(false);
    setPendingAnswer("");
    waitingForSubmitRef.current = false;
    let fullResponse = "";

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentMessages, topic: config.topic }),
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
              fullResponse += data.text;
              setAiResponse(fullResponse);
            } catch {}
          }
        }
      }

      const cleanQuestion = fullResponse.replace("INTERVIEW_COMPLETE", "").trim();
      setCurrentQuestion(cleanQuestion);

      const newMessages: Message[] = [
        ...currentMessages,
        { role: "assistant", content: fullResponse },
      ];
      setMessages(newMessages);
      setAiResponse("");
      setQuestionCount((q) => q + 1);

      if (!fullResponse.includes("INTERVIEW_COMPLETE")) {
        setQAPairs((prev) => [
          ...prev,
          { question: cleanQuestion, answer: "", score: null, timestamp: Date.now() },
        ]);
      }

      if (fullResponse.includes("INTERVIEW_COMPLETE")) {
        setStatus("INTERVIEW COMPLETE — GENERATING REPORT...");
        setIsLoading(false);
        await speak(fullResponse);
        setTimeout(() => onComplete(newMessages), 1500);
        return;
      }

      setIsLoading(false);
      setStatus("AI SPEAKING... (STOP ⏹ TO INTERRUPT)");
      await speak(fullResponse);

      // Speaking ke baad wait karo — user ka answer aane do
      setStatus("YOUR TURN — SPEAK YOUR ANSWER");
      if (!timerActive) setTimerActive(true);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
      setStatus("ERROR — RETRY");
    }
  };

  const startInterview = async () => {
    setStatus("CONNECTING TO ARIA...");
    await new Promise((r) => setTimeout(r, 800));
    await streamAIResponse([]);
  };

  // Yeh tab call hoga jab user Submit dabayega
  const submitAnswer = async () => {
    const finalAnswer = pendingAnswer.trim();
    if (!finalAnswer) return;

    setAnswerReady(false);
    setPendingAnswer("");
    waitingForSubmitRef.current = false;
    setStatus("PROCESSING YOUR ANSWER...");

    const userMessage: Message = { role: "user", content: finalAnswer };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    // Last QA pair update karo
    const lastQ = currentQuestion;
    setQAPairs((prev) => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[updated.length - 1].answer = finalAnswer;
      }
      return updated;
    });

    // Score background mein
    scoreAnswer(lastQ, finalAnswer).then((score) => {
      setQAPairs((prev) => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[updated.length - 1].score = score;
        }
        return updated;
      });
    });

    await streamAIResponse(updatedMessages);
  };

  const startListening = () => {
    if (isListening || isAISpeaking || isLoading) return;
    synthRef.current?.cancel();
    setIsListening(true);
    setStatus("LISTENING... SPEAK NOW");
    try { recognitionRef.current?.start(); } catch {}
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const typeAnswer = () => {
    const input = window.prompt("Type your answer (yeh current answer mein add ho jaayega):");
    if (input) {
      setPendingAnswer((prev) => (prev ? prev + " " + input : input));
      setAnswerReady(true);
      waitingForSubmitRef.current = true;
      setStatus("ANSWER READY — PRESS SUBMIT");
    }
  };

  const clearAnswer = () => {
    setPendingAnswer("");
    setAnswerReady(false);
    waitingForSubmitRef.current = false;
    setStatus("YOUR TURN — SPEAK YOUR ANSWER");
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const timerDanger = timeLeft < 60;
  const timerWarn = timeLeft < 180;
  const circumference = 2 * Math.PI * 36;

  return (
    <div className="interview-layout">
      {/* LEFT SIDE PANEL */}
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

        {/* Stats */}
        <div className="stats-card">
          <div className="stat-item">
            <div className="stat-value">{questionCount}</div>
            <div className="stat-label">QUESTIONS</div>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <div className="stat-value" style={{
              color: avgScore >= 70 ? "var(--green)" : avgScore >= 50 ? "var(--yellow)" : avgScore > 0 ? "var(--red)" : "var(--text-dim)"
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
                autoPlay
                muted
                playsInline
                className="camera-feed"
              />
            ) : (
              <div className="camera-placeholder">
                {cameraError ? "⚠ ACCESS DENIED" : "CAMERA OFF"}
              </div>
            )}
            {cameraOn && (
              <div className="camera-rec"><span className="rec-dot" />REC</div>
            )}
          </div>
        </div>

        {/* Progress */}
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
                  style={score !== null && score !== undefined ? {
                    background: score >= 70 ? "var(--green)" : score >= 50 ? "var(--yellow)" : "var(--red)",
                    borderColor: score >= 70 ? "var(--green)" : score >= 50 ? "var(--yellow)" : "var(--red)",
                    color: "var(--bg)",
                  } : {}}
                  title={score !== null && score !== undefined ? `Q${i + 1}: ${score}/100` : `Q${i + 1}`}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MAIN PANEL */}
      <div className="interview-main">
        <div className="interview-header">
          <div className="aria-badge">
            <span className="aria-dot" />
            ARIA — AI INTERVIEWER
          </div>
          <div className="status-bar">
            <span className="status-text">{status}</span>
          </div>
        </div>

        {/* Visualizer + Stop AI button */}
        <div className="visualizer">
          <ARIAVisualizer isActive={isAISpeaking} isListening={isListening} />
          {isAISpeaking && (
            <button className="stop-ai-btn" onClick={stopAI}>
              ⏹ STOP AI
            </button>
          )}
        </div>

        {/* Pending Answer Preview */}
        {(pendingAnswer || answerReady) && (
          <div className="answer-preview">
            <div className="answer-preview-header">
              <span>▶ YOUR ANSWER (PREVIEW)</span>
              <button className="clear-btn" onClick={clearAnswer}>✕ CLEAR</button>
            </div>
            <p className="answer-preview-text">{pendingAnswer || "..."}</p>
          </div>
        )}

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
                      <div className="qa-score" style={{
                        color: pair.score >= 70 ? "var(--green)" : pair.score >= 50 ? "var(--yellow)" : "var(--red)",
                        borderColor: pair.score >= 70 ? "var(--green)" : pair.score >= 50 ? "var(--yellow)" : "var(--red)",
                      }}>
                        {pair.score}/100
                      </div>
                    )}
                  </div>
                ) : i === qaPairs.length - 1 ? (
                  <div className="qa-answer pending">
                    <span className="qa-a-label">▶ YOU</span>
                    <p className="pending-text">
                      {pendingAnswer
                        ? pendingAnswer
                        : transcript
                        ? <><span style={{ color: "var(--cyan)" }}>{transcript}</span><span className="cursor-blink"> █</span></>
                        : <span className="waiting-text">Waiting for your answer<span className="dots-anim">...</span></span>
                      }
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ))}

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
          {/* Mic / Stop Listening */}
          <button
            className={`mic-btn ${isListening ? "active" : ""} ${isAISpeaking || isLoading ? "disabled" : ""}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isAISpeaking || isLoading}
          >
            {isListening ? <><span>⏹</span> STOP MIC</> : <><span>🎙</span> SPEAK</>}
          </button>

          {/* Type Answer */}
          <button className="text-btn" onClick={typeAnswer} disabled={isAISpeaking || isLoading}>
            ⌨ TYPE
          </button>

          {/* SUBMIT — sirf tab dikhega jab answer ready ho */}
          {answerReady && (
            <button className="submit-btn" onClick={submitAnswer}>
              ✓ SUBMIT
            </button>
          )}

          {/* End interview */}
          <button className="skip-btn" onClick={() => onComplete(messages)} disabled={isLoading}>
            ⏭ END
          </button>
        </div>
      </div>
    </div>
  );
}

function ARIAVisualizer({ isActive, isListening }: { isActive: boolean; isListening: boolean }) {
  const bars = Array.from({ length: 24 });
  return (
    <div className={`aria-viz ${isActive ? "speaking" : ""} ${isListening ? "listening" : ""}`}>
      <div className="viz-bars">
        {bars.map((_, i) => (
          <div key={i} className="viz-bar" style={{ animationDelay: `${(i * 0.05) % 1}s` }} />
        ))}
      </div>
      <div className="viz-label">
        {isActive ? "ARIA SPEAKING" : isListening ? "LISTENING" : "STANDBY"}
      </div>
    </div>
  );
}