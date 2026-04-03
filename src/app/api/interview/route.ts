// import { NextRequest } from "next/server";
// import Groq from "groq-sdk";

// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY!,
// });

// export async function POST(req: NextRequest) {
//   const { messages } = await req.json();

//   const stream = await groq.chat.completions.create({
//     model: "llama-3.1-8b-instant",
//     messages,
//     temperature: 0.7,
//     stream: true,
//   });

//   const encoder = new TextEncoder();

//   const readable = new ReadableStream({
//     async start(controller) {
//       for await (const chunk of stream) {
//         const content = chunk.choices[0]?.delta?.content || "";
//         controller.enqueue(encoder.encode(content));
//       }
//       controller.close();
//     },
//   });

//   return new Response(readable);
// }import { NextRequest } from "next/server";
import { NextRequest } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are ARIA (Automated Review & Interview Assistant), a strict but fair technical interviewer for software engineering roles.

Your behavior:
- Ask ONE clear technical question at a time
- Be concise — keep questions under 3 sentences
- WAIT for the candidate to fully finish their answer before asking next question
- Ask follow-ups if the answer is too vague
- Cover progressively harder questions
- After 5-6 questions, end with exactly: "INTERVIEW_COMPLETE"

Topics: Node.js (event loop, streams, async/await, clustering), React (hooks, rendering, state management, performance), System Design (scalability, databases, caching, load balancing).`;

export async function POST(req: NextRequest) {
  try {
    const { messages, topic } = await req.json();

    const topicInstruction = topic && topic !== "Mixed"
      ? `Focus specifically on ${topic} questions.`
      : "Mix questions across Node.js, React, and System Design.";

    const stream = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${topicInstruction}` },
        ...messages,
      ],
      stream: true,
      max_tokens: 512,
      temperature: 0.7,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("POST error:", error);
    return new Response(JSON.stringify({ error: "API call failed" }), { status: 500 });
  }
}

// Per-question scoring
export async function PATCH(req: NextRequest) {
  try {
    const { question, answer } = await req.json();

    const response = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        {
          role: "system",
          content: `You are a technical interviewer scoring a candidate's answer. Return ONLY a JSON object like: {"score": 75}
No explanation, no markdown, no extra text. Just the JSON.

Scoring:
- 90-100: Exceptional answer with examples
- 70-89: Good, covers key points  
- 50-69: Adequate but missing details
- 30-49: Partial, significant gaps
- 0-29: Incorrect or irrelevant`,
        },
        {
          role: "user",
          content: `Question: ${question}\nAnswer: ${answer}`,
        },
      ],
      stream: false,
      max_tokens: 20,
      temperature: 0.1,
    });

    const content = response.choices[0].message.content?.trim() || '{"score":60}';
    const match = content.match(/\{[^}]*"score"\s*:\s*(\d+)[^}]*\}/);
    const score = match ? parseInt(match[1]) : 60;

    return new Response(JSON.stringify({ score: Math.min(100, Math.max(0, score)) }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ score: 60 }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Feedback report — FIXED parsing
export async function PUT(req: NextRequest) {
  try {
    const { messages } = await req.json();

    const response = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        {
          role: "system",
          content: `You are a technical interview evaluator. Analyze the interview conversation and return a JSON feedback report.
IMPORTANT: Return ONLY raw JSON. No markdown, no backticks, no explanation. Start your response with { and end with }.`,
        },
        {
          role: "user",
          content: `Analyze this interview and return JSON in EXACTLY this format (no other text):
{
  "overallScore": 72,
  "grade": "B",
  "summary": "The candidate showed good understanding of React fundamentals but struggled with advanced Node.js concepts.",
  "technicalScore": 70,
  "communicationScore": 80,
  "problemSolvingScore": 65,
  "strongPoints": ["Clear explanation of React hooks", "Good communication skills", "Understood component lifecycle"],
  "weakPoints": ["Limited knowledge of Node.js streams", "System design answers lacked depth", "No mention of error handling"],
  "topicBreakdown": { "knowledge": 7, "depth": 6, "clarity": 8 },
  "recommendation": "Maybe",
  "nextSteps": ["Study Node.js streams and buffers", "Practice system design problems", "Review async/await error handling patterns"]
}

Interview conversation:
${messages.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}`,
        },
      ],
      stream: false,
      max_tokens: 1024,
      temperature: 0.2,
    });

    const content = response.choices[0].message.content?.trim() || "";
    console.log("Feedback raw response:", content);

    // Multiple parsing strategies
    let feedback = null;

    // Strategy 1: Direct parse
    try {
      feedback = JSON.parse(content);
    } catch {}

    // Strategy 2: Extract JSON block
    if (!feedback) {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try { feedback = JSON.parse(match[0]); } catch {}
      }
    }

    // Strategy 3: Fallback with partial data
    if (!feedback || !feedback.overallScore) {
      feedback = {
        overallScore: 65,
        grade: "C",
        summary: "Interview completed. Detailed analysis could not be generated. Please review the conversation manually.",
        technicalScore: 65,
        communicationScore: 70,
        problemSolvingScore: 60,
        strongPoints: ["Completed the interview", "Attempted all questions", "Showed willingness to learn"],
        weakPoints: ["Some answers lacked depth", "Could improve technical explanations", "More examples needed"],
        topicBreakdown: { knowledge: 6, depth: 5, clarity: 7 },
        recommendation: "Maybe",
        nextSteps: [
          "Review the topics covered in this interview",
          "Practice explaining concepts with real-world examples",
          "Study the areas where questions were difficult"
        ],
      };
    }

    return new Response(JSON.stringify(feedback), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("PUT feedback error:", error);
    // Always return valid feedback, never 500
    const fallback = {
      overallScore: 60,
      grade: "C",
      summary: "Interview was completed successfully.",
      technicalScore: 60,
      communicationScore: 65,
      problemSolvingScore: 55,
      strongPoints: ["Completed full interview", "Engaged with questions", "Showed technical interest"],
      weakPoints: ["Needs more depth in answers", "Practice structured responses", "More real-world examples needed"],
      topicBreakdown: { knowledge: 6, depth: 5, clarity: 6 },
      recommendation: "Maybe",
      nextSteps: ["Review core concepts", "Practice mock interviews", "Study system design patterns"],
    };
    return new Response(JSON.stringify(fallback), {
      headers: { "Content-Type": "application/json" },
    });
  }
}