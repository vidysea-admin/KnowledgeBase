const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const time = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const kinds = ["recording", "document", "spreadsheet", "whatsapp-batch", "url"];
export function sourceRegistryCounts(raw: unknown) {
  if (!object(raw) || !Array.isArray(raw.sources)) throw new Error("Invalid source registry");
  const ids = new Set<string>(), counts: Record<string, number> = Object.fromEntries(kinds.map(kind => [kind, 0]));
  let unknown = 0;
  for (const row of raw.sources) {
    if (!object(row) || typeof row._id !== "string" || !row._id || ids.has(row._id) || typeof row.kind !== "string") throw new Error("Invalid source row");
    ids.add(row._id);
    if (kinds.includes(row.kind)) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
    else unknown++;
  }
  return { returned: raw.sources.length, counts, unknown };
}
export function sourceWatcherHealth(raw: unknown) {
  if (!object(raw) || !Array.isArray(raw.state) || !Array.isArray(raw.heartbeats)) throw new Error("Invalid watcher state");
  const counts = { seen: 0, ingested: 0, failed: 0 }, ids = new Set<string>();
  for (const row of raw.state) {
    if (!object(row) || typeof row.sourceType !== "string" || !["drive", "gmail", "calendar"].includes(row.sourceType) || typeof row.sourceId !== "string" || !row.sourceId || !time(row.seenAt) ||
      typeof row.status !== "string" || !["seen", "ingested", "failed"].includes(row.status)) throw new Error("Invalid watcher row");
    const id = `${row.sourceType}:${row.sourceId}`;
    if (ids.has(id)) throw new Error("Duplicate watcher state"); ids.add(id);
    counts[row.status as keyof typeof counts]++;
  }
  const types = new Set<string>();
  const heartbeats = raw.heartbeats.map((row: unknown) => {
    if (!object(row) || typeof row.sourceType !== "string" || !["drive", "gmail", "calendar"].includes(row.sourceType) || types.has(row.sourceType) || typeof row.stale !== "boolean" ||
      !(row.lastHeartbeatAt === null || time(row.lastHeartbeatAt)) || row.lastHeartbeatAt === null && !row.stale) throw new Error("Invalid watcher heartbeat");
    types.add(row.sourceType);
    return { sourceType: row.sourceType, lastHeartbeatAt: row.lastHeartbeatAt as string | null, stale: row.stale };
  });
  return { returned: raw.state.length, counts, heartbeats };
}
