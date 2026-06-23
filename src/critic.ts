import Groq from "groq-sdk";
import type { FileDiff } from "./diffParser";
import type { ReviewIssue } from "./reviewers/style";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export type CriticVerdict = {
  filename: string;
  trustworthyIssues: ReviewIssue[];
  rejectedIssues: (ReviewIssue & { reason: string })[];
};

export async function criticReview(
  file: FileDiff,
  allIssues: ReviewIssue[],
): Promise<CriticVerdict> {
  const issuesText = JSON.stringify(allIssues, null, 2);
  const codeText = file.addedLines.join("\n");

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `
            You are a critic agent. given the actual added lines AND the reviewers' raw findings, verify each finding is actually grounded in the real code, reject anything that references code/imports/lines not actually present
            A finding can reference real code that exists in the added lines, but still be
            UNTRUSTWORTHY if its conclusion isn't actually verifiable from what's shown.
            For example: "function X is imported but not tested" is NOT verifiable just
            because X appears in an import statement -- the reviewer has no way to know if
            X is tested elsewhere unless a test for X is also visible in the added lines.
            Reject claims that assume something is missing/wrong based only on absence in
            a partial view of the code, not absence in the full codebase.

            Return structured data, strictly in this JSON format given below, no markdown, no backticks:
            {
                "filename": "${file.filename}",
                "trustworthyIssues": [{ "type": "string", "message": "string", "line": number }],
                "rejectedIssues": [{ "type": "string", "message": "string", "line": number, "reason": "string" }]
            }

            Filename: ${file.filename}
            addedlines: ${codeText}
            reviewersfindings: ${issuesText}
        `,
      },
    ],
  });

  const msg = response.choices[0]?.message?.content ?? "{}";
  const cleanMsg = msg.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleanMsg);
}
