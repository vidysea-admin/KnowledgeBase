import { createRecordConsent, recordProvidedFirstWarning } from "./context.js";
import { installPrivateCaptureControl } from "./privacy.js";
import { readRecordConsent, writeRecordConsent } from "./receipt-store.js";
import { installCaptureControl } from "../reconnect-gaps.js";

/** Real recorder hook: authorization/receipt/warning precede every browser and capture side effect. */
export function prepareRecordConsent(args: string[], owner: {tenantId: string; sessionId: string; meetingUrl: string},
  recordDir: string, startedAt: number, env: NodeJS.ProcessEnv = process.env, warn: (message: string) => void = console.warn) {
  const receipt = createRecordConsent(args, owner, env, new Date(startedAt));
  try {
    const prior = readRecordConsent(recordDir, {...owner, meetingHash: receipt.meetingHash});
    if(!prior.generation)throw new Error("Historical capture has no attempt generation; preserve it and use a new capture session");
    if(env.LKB_CAPTURE_CONTROL_GENERATION !== undefined && receipt.generation !== prior.generation)throw new Error("Capture attempt generation cannot be replaced on retry");
    if (prior.mediaStartedAt !== undefined || prior.privateWindows.length) throw new Error("Prior capture has media or privacy evidence; use recovery or a new capture session");
    if (prior.operationalApproval.approvedBy !== receipt.operationalApproval.approvedBy || prior.operationalApproval.reference !== receipt.operationalApproval.reference ||
      prior.organizerConsent !== receipt.organizerConsent || JSON.stringify(prior.consent) !== JSON.stringify(receipt.consent)) {
      throw new Error("Capture consent facts cannot be replaced on retry");
    }
    receipt.operationalApproval.appliedAt = prior.operationalApproval.appliedAt;
    receipt.generation=prior.generation;
  } catch (error) {if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;}
  writeRecordConsent(recordDir, receipt);
  const warning = recordProvidedFirstWarning(receipt);
  if (warning) warn(`[bot] ${warning}`);
  const privacy = installPrivateCaptureControl(receipt, startedAt, current => writeRecordConsent(recordDir, current));
  return {receipt, privacy};
}

/** Single initializer prevents partial IPC-listener ownership when either control fails. */
export function prepareCaptureConsentControls(args: string[], owner: {tenantId: string; sessionId: string; meetingUrl: string; until: number; startedAt: number},
  recordDir: string, env: NodeJS.ProcessEnv = process.env, warn: (message: string) => void = console.warn) {
  const prepared = prepareRecordConsent(args, owner, recordDir, owner.startedAt, env, warn);
  try { return {...prepared, captureControl: installCaptureControl(owner)}; }
  catch (error) {prepared.privacy.dispose(); throw error;}
}
