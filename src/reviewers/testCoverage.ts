import Groq from "groq-sdk";
import type { FileDiff } from "../diffParser";
import type { ReviewerResult } from "./style";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function testCoverageReviewer(
  file: FileDiff,
  allFiles: FileDiff[],
): Promise<ReviewerResult> {
  const testFiles = allFiles.filter(
    (f) => f.filename.includes("test") || f.filename.includes("spec"),
  );

  const testFilesContent = testFiles
    .map((f) => `File: ${f.filename}\n${f.addedLines.join("\n")}`)
    .join("\n\n---\n\n");

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `
            You are a testCoverage reviewer. Review the given addedlines.
            check does a test file exist that's plausibly related?, are the new functions/logic in targetFile covered by the test files?

            IMPORTANT: You are only shown lines newly ADDED in this PR, not the complete file.
            Do not flag pre-existing functions as "untested" just because you don't see their
            test in the new lines -- they may already be tested elsewhere in the unchanged code.
            Only flag genuinely NEW functions/logic introduced in this diff that lack
            corresponding new tests.

            You only see lines newly ADDED in this diff, not full file contents. Only flag a
            missing test if you can see a genuinely NEW function or significant new logic
            block within these added lines that has no corresponding new test block also
            present in these added lines. Do NOT comment on functions that are merely
            imported/referenced -- you have no visibility into whether they're tested elsewhere.

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
            testfiles: ${testFilesContent}
        `,
      },
    ],
  });

  const msg = response.choices[0]?.message?.content ?? "{}";
  const cleanMsg = msg.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleanMsg);
}
