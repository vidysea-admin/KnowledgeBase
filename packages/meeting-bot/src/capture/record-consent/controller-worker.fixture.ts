/** Cross-process fixture: actual IPC listener and disk receipt; never starts a browser/provider. */
import { createRecordConsent } from "./context.js";
import { writeRecordConsent } from "./receipt-store.js";
import { installPrivateCaptureControl } from "./privacy.js";
const startedAt=Date.now(),directory=process.env.T011_FIXTURE_DIR!;
const owner={tenantId:process.env.T011_FIXTURE_TENANT??"owned",sessionId:process.env.T011_FIXTURE_SESSION??"capture",meetingUrl:"https://example.invalid/meeting"};
const receipt=createRecordConsent([],owner,{LKB_CAPTURE_RECORDED_BY:"fixture",LKB_CAPTURE_APPROVED_BY:"fixture",LKB_CAPTURE_APPROVAL_REF:"fixture",LKB_CAPTURE_CONTROL_GENERATION:process.env.LKB_CAPTURE_CONTROL_GENERATION},new Date(startedAt));
writeRecordConsent(directory,receipt);
const control=installPrivateCaptureControl(receipt,startedAt,current=>{
  if(process.env.T011_FIXTURE_FAIL_WRITE==="1" && current.privateWindows.length)throw new Error("fixture disk failure");
  writeRecordConsent(directory,current);
});
if(process.env.T011_FIXTURE_NO_MEDIA_CLOCK!=="1")control.onCaptureEvent({event:"capture-started",mediaStartedAt:startedAt});
// Test-only readiness beacon: a cold tsx start under shared CPU can exceed the publisher's 5s status window.
process.send?.({type:"t011-fixture-ready"},()=>{});
process.once("disconnect",()=>{try{control.dispose();}catch{}process.exit(0);});
