import Groq from "groq-sdk";
import type { FileDiff } from "../diffParser";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export type ReviewIssue = {
  type: string;
  message: string;
  line: number;
};

export type ReviewerResult = {
  filename: string;
  issues: ReviewIssue[];
};

export async function styleReviewer(file: FileDiff): Promise<ReviewerResult> {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `
            You are a codestyle reviewer. review the added lines for style/clarity issues
            (naming, comments, dead code, overly long lines, etc.)
            Only flag issues that are ACTUALLY present in the code below. Do not invent
            issues. If there are no significant issues, return an empty issues array.

            Return structured issues, strictly in this JSON format, no markdown, no backticks:
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

  const msg = response.choices[0]?.message?.content;
  return JSON.parse(msg ?? "{}");
}
