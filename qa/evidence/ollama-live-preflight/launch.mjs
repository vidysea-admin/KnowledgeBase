/** Catch loader/import failures before TypeScript evaluation; default is strictly offline. */
const offline = !process.argv.includes("--live-metadata");
if (offline) globalThis.fetch = async () => { throw new Error("offline network blocked"); };
try {
  const { tsImport } = await import("tsx/esm/api");
  await tsImport("./preflight.mts", import.meta.url);
} catch {
  process.exitCode = 2;
  process.stdout.write(JSON.stringify({ status: "unknown", failureClass: "loader", models: [
    { modelId: "glm-5.3-flash", available: null }, { modelId: "deepseek-v4.1-flash", available: null },
  ] }) + "\n");
}
