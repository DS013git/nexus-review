import Groq from "groq-sdk";
import type { CriticVerdict } from "./critic";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function writeReviewComment(allFiles: CriticVerdict[]): Promise<string> {
  const findingsText = allFiles
    .filter((f) => f.trustworthyIssues.length > 0)
    .map(
      (f) =>
        `File: ${f.filename}\nIssues:\n${JSON.stringify(f.trustworthyIssues, null, 2)}`,
    )
    .join("\n\n---\n\n");

  if (!findingsText) {
    return "No issues found across the reviewed files.";
  }

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `
            You are a PR review agent. Given trustworthy findings grouped by file below,
            write ONE coherent PR review comment. Group by file, prioritize the most
            important issues first within each file, and use clear markdown formatting.

            This applies to ANY claim of the form "X is missing/unused/untested/uncalled" where
            X exists in the visible code but its usage might simply be outside what you can see
            (e.g., used elsewhere in the file, called from another file, tested in a part of
            the test file not included in addedLines). The specific words used -- "not tested,"
            "not used," "dead code," "unused import" -- don't matter. What matters is: can you
            ACTUALLY see, in the lines provided, proof that X is genuinely absent everywhere?
            If not, reject the claim regardless of how it's phrased.

            Write only the comment text -- no JSON, no markdown code fences around the
            whole response, just the actual review comment a human would post on GitHub.

            Findings:
            ${findingsText}
        `,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "No comment generated.";
}
