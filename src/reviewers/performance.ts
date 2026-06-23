import Groq from "groq-sdk";
import type { FileDiff } from "../diffParser";
import type { ReviewerResult } from "./style";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function performanceReviewer(file: FileDiff): Promise<ReviewerResult> {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `
            You are a performance reviewer. Review the given addedlines.
            (nested loops over large data, repeated expensive calls inside loops, unnecessary re-computation, blocking operations that should be async, N+1 query patterns, etc.)

            If you cannot point to a specific line with a specific issues,
            return an empty issues array. Silence is the correct output for valid code.

            Return structured issues, strictly in this JSON format given below, no markdown, no backticks:
            {
                "filename": "${file.filename}",
                "issues": [
                    { "type": "<category>", "message": "<specific issue>", "line": <line number in addedLines> }
                ]
            }

            Filename: ${file.filename}
            Added lines:${file.addedLines.join("\n")}
        `,
      },
    ],
  });

  const msg = response.choices[0]?.message?.content ?? "{}";
  const cleanMsg = msg.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleanMsg);
}
