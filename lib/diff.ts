/** Tiny word-level diff (LCS) for the master-vs-tailored side-by-side view. */
export type DiffOp = { type: "same" | "add" | "del"; text: string };

export function wordDiff(a: string, b: string): DiffOp[] {
  const A = a.split(/(\s+)/).filter((t) => t.length > 0);
  const B = b.split(/(\s+)/).filter((t) => t.length > 0);
  const n = A.length;
  const m = B.length;
  // LCS table (small inputs — bullets are one or two lines).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  const push = (type: DiffOp["type"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push("same", A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", A[i]);
      i++;
    } else {
      push("add", B[j]);
      j++;
    }
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("add", B[j++]);
  return ops;
}
