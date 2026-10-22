export type DiffLine = {
  type: "unchanged" | "added" | "removed";
  text: string;
};
const lines = (text: string) =>
  text === "" ? [] : text.replace(/\r\n?/g, "\n").split("\n");

// Longest common subsequence of lines. A cell limit bounds memory for documents
// containing thousands of short lines; the middle then becomes one replacement.
export function compareLines(original: string, draft: string): DiffLine[] {
  const before = lines(original);
  const after = lines(draft);
  const result: DiffLine[] = [];
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) {
    result.push({ type: "unchanged", text: before[start++] });
  }
  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore--;
    endAfter--;
  }
  const left = before.slice(start, endBefore);
  const right = after.slice(start, endAfter);
  const width = right.length + 1;
  if ((left.length + 1) * width > 250_000) {
    result.push(
      ...left.map((text): DiffLine => ({ type: "removed", text })),
      ...right.map((text): DiffLine => ({ type: "added", text })),
    );
  } else {
    const lengths = new Uint32Array((left.length + 1) * width);
    for (let i = left.length - 1; i >= 0; i--)
      for (let j = right.length - 1; j >= 0; j--)
        lengths[i * width + j] =
          left[i] === right[j]
            ? 1 + lengths[(i + 1) * width + j + 1]
            : Math.max(
                lengths[(i + 1) * width + j],
                lengths[i * width + j + 1],
              );
    let i = 0;
    let j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) {
        result.push({ type: "unchanged", text: left[i++] });
        j++;
      } else if (
        i < left.length &&
        (j >= right.length ||
          lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])
      ) {
        result.push({ type: "removed", text: left[i++] });
      } else result.push({ type: "added", text: right[j++] });
    }
  }
  for (const text of before.slice(endBefore))
    result.push({ type: "unchanged", text });
  return result;
}
