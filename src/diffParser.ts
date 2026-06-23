export type FileDiff = {
  filename: string;
  isNewFile: boolean;
  addedLines: string[];
  removedLines: string[];
};

export function parseDiff(rawDiff: string): FileDiff[] {
  const files = rawDiff.split(/(?=^diff --git )/m);
  const result: FileDiff[] = [];

  for (const file of files) {
    if (!file.trim()) continue;

    const lines = file.split("\n");
    let filename = "";
    let isNewFile = false;
    const addedLines: string[] = [];
    const removedLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("+++")) {
        filename = line.replace("+++ b/", "").trim();
        continue;
      }

      if (line.startsWith("---")) {
        continue;
      }

      if (line.startsWith("new file mode")) {
        isNewFile = true;
        continue;
      }

      if (line.startsWith("+")) {
        addedLines.push(line.slice(1));
        continue;
      }

      if (line.startsWith("-")) {
        removedLines.push(line.slice(1));
      }
    }

    if (filename) {
      result.push({ filename, isNewFile, addedLines, removedLines });
    }
  }

  return result;
}
