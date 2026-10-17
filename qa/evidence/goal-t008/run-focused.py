"""Root CPU-lease-only focused fixture commands; outer deadline is 120 seconds per stage."""
import pathlib
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

root = pathlib.Path(__file__).resolve().parents[3]
stage = sys.argv[1]
if stage == "api":
    cwd = root / "apps/api"
    command = ["node", "--test", "--test-concurrency=1", "--test-timeout=30000", "--import", "tsx",
               "src/semantic-search/route.test.ts", "src/semantic-search/semantic-search-store.test.ts",
               "src/semantic-search/readiness.test.ts", "src/semantic-search/source-quote.test.ts",
               "src/semantic-search/current-corpus.test.ts",
               "src/indexing/chunk-write.test.ts", "src/indexing/session.test.ts",
               "src/indexing/chunk-integrity.test.ts",
               "src/indexing/legacy-unbound-chunks.test.ts"]
elif stage == "web":
    cwd = root / "apps/web"
    command = ["node", "node_modules/vitest/vitest.mjs", "run", "src/api/search/semanticClient.test.ts",
               "src/pages/search/semantic/SemanticResults.test.tsx",
               "src/pages/search/semantic/SemanticSearchIntegration.test.tsx", "--maxWorkers=1", "--minWorkers=1"]
else:
    raise SystemExit("stage must be api or web")
started = time.monotonic()
process = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           text=True, encoding="utf-8", errors="replace")
try:
    output, _ = process.communicate(timeout=120)
    code = process.returncode
except subprocess.TimeoutExpired:
    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, timeout=10)
    output, _ = process.communicate(timeout=10)
    code = 124
elapsed = time.monotonic() - started
receipt = f"Stage: {stage}\nCwd: {cwd}\nCommand: {' '.join(command)}\nExit: {code}\nElapsed seconds: {elapsed:.3f}\n" + output
(pathlib.Path(__file__).parent / f"{stage}-focused.txt").write_text(receipt, encoding="utf-8")
print(receipt)
sys.exit(code)
