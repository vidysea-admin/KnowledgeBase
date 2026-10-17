// Compatibility re-export: the checker-owned third-await probe (qa/evidence/goal-u25-consumer/third-await.test.ts,
// sha256 731E373B...) imports this legacy path; the implementation lives in ./persistence/decisions-persist.ts.
export * from "./persistence/decisions-persist.js";
