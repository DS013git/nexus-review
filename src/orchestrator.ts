import fs from "fs/promises";
import Groq from "groq-sdk";
import { writeReviewComment } from "./aggregator";
import { criticReview, type CriticVerdict } from "./critic";
import { parseDiff, type FileDiff } from "./diffParser";
import { performanceReviewer } from "./reviewers/performance";
import { securityReviewer } from "./reviewers/security";
import { styleReviewer, type ReviewerResult } from "./reviewers/style";
import { testCoverageReviewer } from "./reviewers/testCoverage";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

type ReviewerName = "style" | "security" | "performance" | "tests";

type ReviewPlan = {
  filename: string;
  applicableReviewers: ReviewerName[];
};

async function planReview(file: FileDiff): Promise<ReviewPlan> {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `
            You are a Planner agent. given the filename and a snippet of content, decide which reviewers make sense.
            a .md file -> probably just style
            a .ts file with API calls -> security + performance + style
            a test file -> just style + tests (no need for security review on test mocks),etc.

            Return structured plan, strictly in this JSON format given below, no markdown, no backticks:
            {
                "filename": "${file.filename}",
                "applicableReviewers": [<"style" | "security" | "performance" | "tests">]
            }

            Filename: ${file.filename}
            code snippets: ${file.addedLines}
        `,
      },
    ],
  });

  const msg = response.choices[0]?.message?.content ?? "{}";
  const cleanMsg = msg.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleanMsg);
}

async function reviewFile(file: FileDiff, allFiles: FileDiff[]): Promise<CriticVerdict> {
  const plan = await planReview(file);
  console.log(`\n${file.filename} -> running: ${plan.applicableReviewers.join(", ")}`);

  const reviewPromises: Promise<ReviewerResult>[] = [];

  if (plan.applicableReviewers.includes("style")) {
    reviewPromises.push(styleReviewer(file));
  }

  if (plan.applicableReviewers.includes("security")) {
    reviewPromises.push(securityReviewer(file));
  }

  if (plan.applicableReviewers.includes("performance")) {
    reviewPromises.push(performanceReviewer(file));
  }

  if (plan.applicableReviewers.includes("tests")) {
    reviewPromises.push(testCoverageReviewer(file, allFiles));
  }

  const results = await Promise.all(reviewPromises);
  const flatIssues = results.flatMap((r) => r.issues ?? []);
  const criticVerdict = await criticReview(file, flatIssues);

  console.log(criticVerdict);
  return criticVerdict;
}

async function postPRComment(comment: string) {
  const repo = process.env.GITHUB_REPOSITORY; // "owner/repo", auto-set by Actions
  const prNumber = process.env.PR_NUMBER;      // you'll pass this in
  const token = process.env.GITHUB_TOKEN;

  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({ body: comment }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to post comment: ${response.status} ${await response.text()}`);
  }
}

async function main(): Promise<void> {
  const diffPath = process.argv[2] ?? "tests/sample.diff";
  const diff = await fs.readFile(diffPath, "utf-8");
  const files = parseDiff(diff);
  const allCriticVerdicts: CriticVerdict[] = [];

  for (const file of files) {
    allCriticVerdicts.push(await reviewFile(file, files));
  }

  const comment = await writeReviewComment(allCriticVerdicts);
  console.log("\n=== FINAL PR COMMENT ===\n");
  console.log(comment);

  if (process.env.GITHUB_ACTIONS === "true") {
    await postPRComment(comment);
    console.log("\n✓ Comment posted to PR");
  } else {
    console.log("\n(local run — skipping PR comment post)");
  }
}

await main().catch((err) => {
  console.error("Nexus review failed:", err);
  process.exit(1);
});
