import { createHash } from "node:crypto";
import { lstatSync, createReadStream, realpathSync } from "node:fs";
import path from "node:path";
import { validateRecordConsent, type RecordConsentReceipt } from "./context.js";
import { publicRecordCaptureIntervals, recordPrivacyMaskIntervals } from "./coverage.js";
import { requireNativeProviderAudio, type NativeProviderAudio } from "./native-provider-audio.js";
export interface PrivateProviderInput {
  receipt: RecordConsentReceipt;
  owner: {tenantId:string;sessionId:string;meetingHash?:string};
  duration: number;
  audioPath: string;
  originalAudioPath: string;
  /** Root finalizer computes this from audio extracted from the proved masked video. */
  sanitizedSha256?: string;
  /** Issued only from authenticated native finalizer media, never source JSON. */
  nativeAudio?: NativeProviderAudio;
}
/** Guard the actual provider dispatch, before upload; post-transcript filtering cannot replace it. */
export async function runPrivateCaptureProvider<T>(input: PrivateProviderInput, provider: (audioPath:string, proof:{sha256:string;receiptSha256:string})=>Promise<T>):Promise<T> {
  const receipt=validateRecordConsent(input.receipt,input.owner);
  if(input.nativeAudio!==undefined)await requireNativeProviderAudio(input.nativeAudio,input);
  if(receipt.privateWindows.length&&!receipt.generation)throw new Error("Private capture lacks actual attempt generation; provider refused");
  const windows=recordPrivacyMaskIntervals(receipt,input.owner,input.duration);
  if (!publicRecordCaptureIntervals(receipt,input.owner,{tStart:0,tEnd:input.duration},"audio").length) throw new Error("Entire capture private; provider refused");
  if (!path.isAbsolute(input.audioPath)||!path.isAbsolute(input.originalAudioPath)||/^[/\\]{2}/.test(input.audioPath)) throw new Error("Local provider artifact required");
  const stat=lstatSync(input.audioPath);
  if (!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size===0||stat.size>1024*1024*1024) throw new Error("Invalid provider artifact");
  if (windows.length && (realpathSync(input.audioPath)===realpathSync(input.originalAudioPath)||!input.sanitizedSha256||!/^[a-f0-9]{64}$/.test(input.sanitizedSha256))) throw new Error("Proved sanitized audio required before provider");
  const hash=createHash("sha256"); for await (const bytes of createReadStream(input.audioPath)) hash.update(bytes);
  const sha256=hash.digest("hex");
  if (windows.length && sha256!==input.sanitizedSha256) throw new Error("Sanitized provider artifact changed; upload refused");
  const receiptSha256=createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
  return provider(input.audioPath,{sha256,receiptSha256});
}
