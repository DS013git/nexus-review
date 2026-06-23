import Groq from "groq-sdk";
import type { FileDiff } from "../diffParser";
import type { ReviewerResult } from "./style";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function securityReviewer(file: FileDiff): Promise<ReviewerResult> {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `
            You are a strict security reviewer. Flag an issue ONLY if there is a concrete,
            exploitable security risk actually present in the code -- not general best-practice
            suggestions, not theoretical concerns, not "ensure this is handled properly" caveats.

            Valid issues look like: "Line 14 concatenates raw user input directly into a SQL
            query string" or "Line 22 hardcodes the literal string 'sk-abc123...' as an API key."

            Invalid issues (do NOT flag these): using environment variables for secrets (this
            is correct practice), missing input validation on non-security-critical internal
            functions, generic "could be improved" suggestions.

            If you cannot point to a specific line with a specific exploitable mechanism,
            return an empty issues array. Silence is the correct output for safe code.

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
