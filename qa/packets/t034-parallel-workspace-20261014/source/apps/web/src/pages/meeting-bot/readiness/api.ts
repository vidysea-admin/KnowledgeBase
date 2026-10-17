import { apiFetch } from "../../../api/client.js";
export interface CaptureObservation {
  slot:string;platform:string;sessionId:string;generation:string;evidenceHash:string;hostId:string;
  observedAt:string;mediaStartedAt:number;admittedAt:number;evidenceKind:"browser";
}
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9-]{36}$/;
export async function listCaptureObservations(apiKey:string):Promise<CaptureObservation[]> {
  const result=await apiFetch<{observations:unknown}>("/meeting-bot/capture-readiness",apiKey);
  if(!result||!Array.isArray(result.observations)||result.observations.length>256)throw new Error("Invalid capture observations");
  return result.observations.map((row:CaptureObservation)=>{
    if(!row||row.evidenceKind!=="browser"||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.slot)||!/^[a-z][a-z0-9-]{0,39}$/.test(row.platform)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(row.sessionId)||!UUID.test(row.generation)||!HASH.test(row.evidenceHash)||!HASH.test(row.hostId)||
      !Number.isFinite(Date.parse(row.observedAt))||!Number.isFinite(row.mediaStartedAt)||!Number.isFinite(row.admittedAt)||row.mediaStartedAt<=0||row.admittedAt<=0)throw new Error("Invalid capture observation");
    return {slot:row.slot,platform:row.platform,sessionId:row.sessionId,generation:row.generation,evidenceHash:row.evidenceHash,hostId:row.hostId,observedAt:row.observedAt,mediaStartedAt:row.mediaStartedAt,admittedAt:row.admittedAt,evidenceKind:row.evidenceKind};
  });
}
export async function reviewCaptureObservation(apiKey:string,row:CaptureObservation,action:"review"|"revoke"):Promise<void> {
  const result=await apiFetch<{acceptance?:{id?:unknown;acceptedAt?:unknown;operatorKeyId?:unknown;evidenceHash?:unknown;generation?:unknown};status?:unknown}>(`/meeting-bot/capture-readiness/${action}`,apiKey,
    {method:"POST",body:{slot:row.slot,platform:row.platform,generation:row.generation,evidenceHash:row.evidenceHash}});
  if(action==="revoke"){if(result?.status!=="revoked")throw new Error("Host did not confirm revocation");return;}
  const accepted=result?.acceptance;
  if(!accepted||typeof accepted.id!=="string"||!UUID.test(accepted.id)||typeof accepted.acceptedAt!=="string"||!Number.isFinite(Date.parse(accepted.acceptedAt))||typeof accepted.operatorKeyId!=="string"||!accepted.operatorKeyId||accepted.evidenceHash!==row.evidenceHash||accepted.generation!==row.generation)throw new Error("Host did not confirm operator review");
}
