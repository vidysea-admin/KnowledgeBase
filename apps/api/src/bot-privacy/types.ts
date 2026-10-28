export type BotPrivacyAction = "private-start" | "private-end";
export interface BotPrivacyCaptureView {
  /** Actual registered handle owner; route verifies and strips this from the public projection. */
  tenantId: string;
  sessionId: string;
  generation: string;
  status: "joining" | "recording" | "interrupted";
  privacy: "public" | "private" | "conservative" | "unavailable";
}
export interface BotPrivacyDeps {
  /** Only active handles for this authenticated tenant; no URLs, tokens or profile data. */
  list(tenantId: string): Promise<BotPrivacyCaptureView[]> | BotPrivacyCaptureView[];
  /** Actual current handle+generation, exact durable ACK; generation is a precondition, never authority. */
  set(tenantId: string, sessionId: string, expectedGeneration: string, action: BotPrivacyAction):
    Promise<"accepted" | "unavailable" | "stale">;
}
