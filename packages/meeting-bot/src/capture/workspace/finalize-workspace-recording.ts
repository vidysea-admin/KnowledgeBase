import { finalizeRecordingWith } from "../record-finalize.js";
import type { GapWindow } from "../reconnect-gaps.js";
import { createTelegramNotifier, type TelegramNotifier } from "../notify/telegram-alerts.js";
export async function finalizeRecording(
  video:string,sessionId:string,title:string,platform:string,transcribe:boolean,gaps:GapWindow[]=[],
  telegram:TelegramNotifier=createTelegramNotifier(),durationSec?:number,tenantId?:string,recordDir?:string,lean=false,originalVideo?:string,
):Promise<string> {
  return finalizeRecordingWith({tenantId,recordDir,lean,originalVideo},video,sessionId,title,platform,transcribe,gaps,telegram,durationSec);
}
/** A void fixture callback may bypass the provider; production always consumes the verified public derivative. */
export function finalizedCaptureVideo(result:string|void,original:string,fixture:boolean):string {
  if(typeof result==="string"&&result)return result;
  if(fixture&&result===undefined)return original;
  throw new Error("Finalizer did not return its verified public recording");
}
