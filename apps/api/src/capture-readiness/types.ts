import type { VerifiedKey } from "../auth.js";
export interface CaptureReadinessView {
  tenantId:string;slot:string;sessionId:string;generation:string;platform:string;hostId:string;
  observedAt:string;mediaStartedAt:number;admittedAt:number;evidenceKind:"browser";evidenceHash:string;
}
export interface CaptureReadinessReview {slot:string;platform:string;generation:string;evidenceHash:string}
export interface CaptureReadinessDeps {
  list(tenantId:string):Promise<CaptureReadinessView[]>;
  accept(principal:VerifiedKey & {keyId:string},review:CaptureReadinessReview):Promise<{id:string;acceptedAt:string;operatorKeyId:string;evidenceHash:string;generation:string}>;
  revoke(principal:VerifiedKey & {keyId:string},review:CaptureReadinessReview):Promise<void>;
  withPermission<T>(principal:VerifiedKey,permission:"roles:manage",callback:()=>Promise<T>):Promise<T>;
}
/** Trusted root adapter only. No producer-local capability or module path crosses the API seam. */
export interface HostCaptureReadinessAdapter extends Pick<CaptureReadinessDeps, "accept" | "revoke"> {
  list(tenantId: string, slot: string): Promise<CaptureReadinessView[]>;
}
