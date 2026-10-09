export const gapsResponse = { gaps: [
  { _id: "gap/a", tenantId: "fixture", kind: "recording-pending", status: "open", description: "Recording not received", requestedFrom: "org:toc", requestedAt: "2026-10-01T12:00:00Z", sla: { dueAt: "2026-10-04T12:00:00Z" } },
  { _id: "gap-b", tenantId: "fixture", kind: "source-pending", status: "received", description: "Source received", sourceRef: "source:b" },
  { _id: "gap-c", tenantId: "fixture", kind: "vector-pending", status: "expired", description: "Vector request expired" },
  { _id: "gap-d", tenantId: "fixture", kind: "vector-pending", status: "open", description: "Vector not indexed", sla: { dueAt: "2026-02-30T12:00:00Z" } },
  { _id: "gap-e", tenantId: "fixture", kind: "future-kind", status: "future-status", description: "Unsupported status retained" },
] };
