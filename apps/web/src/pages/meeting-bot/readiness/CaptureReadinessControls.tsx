import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthContext.js";
import { ApiError } from "../../../api/client.js";
import { listCaptureObservations, reviewCaptureObservation, type CaptureObservation } from "./api.js";
type View={owner:object;rows:CaptureObservation[];loading:boolean;busy:boolean;error?:string;outcome?:string};
const identity=(row:CaptureObservation)=>`${row.slot}:${row.platform}:${row.generation}:${row.evidenceHash}`;
function describe(error:unknown):string {
  if(error instanceof ApiError&&error.status===403)return "Your account needs permission to review capture slots.";
  if(error instanceof ApiError&&error.status===409)return "The capture observation changed or could not be approved. Refresh it and review the current host sample.";
  return "Capture review is unavailable. The host must be configured before an authorized controlled sample can be reviewed.";
}
export function CaptureReadinessControls({apiKey}:{apiKey:string|null}):React.ReactElement {
  const auth=useAuth(),key=auth.apiKey===apiKey?apiKey:null;
  const owner=useRef({key,version:auth.sessionVersion,token:{}});
  if(owner.current.key!==key||owner.current.version!==auth.sessionVersion)owner.current={key,version:auth.sessionVersion,token:{}};
  const [view,setView]=useState<View>({owner:owner.current.token,rows:[],loading:!!key,busy:false});
  const [selection,setSelection]=useState<{owner:object;id:string;reviewed:boolean}>({owner:owner.current.token,id:"",reviewed:false});
  const sequence=useRef(0),busy=useRef<object|null>(null);
  const current:View=view.owner===owner.current.token?view:{owner:owner.current.token,rows:[],loading:!!key,busy:false};
  const selected=selection.owner===owner.current.token?current.rows.find(row=>identity(row)===selection.id):undefined;
  const alive=(token:object)=>owner.current.token===token;
  async function refresh(token:object,outcome?:string):Promise<void> {
    if(!key)return;const request=++sequence.current;
    setView(previous=>({...previous,owner:token,loading:true,error:undefined}));
    try{const rows=await listCaptureObservations(key);if(!alive(token)||request!==sequence.current)return;
      setView({owner:token,rows,loading:false,busy:false,...(outcome?{outcome}:{})});setSelection({owner:token,id:"",reviewed:false});
    }catch(error){if(alive(token)&&request===sequence.current)setView({owner:token,rows:[],loading:false,busy:false,error:outcome?`${outcome} The observations could not be refreshed.`:describe(error)});}
  }
  useEffect(()=>{
    const token=owner.current.token;busy.current=null;sequence.current++;
    setView({owner:token,rows:[],loading:!!key,busy:false});setSelection({owner:token,id:"",reviewed:false});
    if(key)void refresh(token);
    return ()=>{if(alive(token)){owner.current={...owner.current,token:{}};sequence.current++;}};
  },[key,auth.sessionVersion]);
  async function change(action:"review"|"revoke"):Promise<void> {
    if(!key||!selected||busy.current===owner.current.token||action==="review"&&!selection.reviewed)return;
    const token=owner.current.token,row=selected;busy.current=token;sequence.current++;
    setView({...current,owner:token,busy:true,outcome:undefined,error:undefined});
    try{await reviewCaptureObservation(key,row,action);if(!alive(token))return;
      await refresh(token,action==="review"?"Host confirmed your review of this capture slot.":"Host confirmed revocation of this slot approval.");
    }catch(error){if(alive(token))setView({owner:token,rows:[],loading:false,busy:false,error:describe(error)});}
    finally{if(alive(token))busy.current=null;}
  }
  return <section className="card" aria-label="Capture slot review">
    <h2>Capture slot review</h2>
    <p>Review a controlled capture on its host before approving a slot for scheduled recordings. Approval covers this host, slot and meeting platform; a failed capture requires a fresh sample and review.</p>
    {!key&&<p>Sign in to review capture slots.</p>}
    {current.loading&&key&&<p role="status">Loading capture observations…</p>}
    {current.error&&<p role="alert">{current.error}</p>}
    {current.outcome&&<p role="status">{current.outcome}</p>}
    {key&&!current.loading&&!current.error&&!current.rows.length&&<p>No browser observations are available. An authorized operator must prepare the host slot and run a controlled capture before reviewing it here.</p>}
    {current.rows.map(row=><div key={identity(row)}>
      <label><input type="radio" name="capture-observation" disabled={current.busy||current.loading} checked={selected===row} onChange={()=>setSelection({owner:owner.current.token,id:identity(row),reviewed:false})}/>{row.slot} · {row.platform} · {row.sessionId}</label>
      <p>Host identity: {row.hostId.slice(0,16)} · Observed {new Date(row.observedAt).toLocaleString()}</p>
      <p>Admission {new Date(row.admittedAt).toLocaleString()} · Recorder started {new Date(row.mediaStartedAt).toLocaleString()}</p>
    </div>)}
    {selected&&<label><input type="checkbox" disabled={current.busy||current.loading} checked={selection.reviewed} onChange={event=>setSelection({...selection,reviewed:event.target.checked})}/>I reviewed the corresponding host capture for this slot and platform.</label>}
    <button disabled={!selected||!selection.reviewed||current.busy||current.loading} onClick={()=>void change("review")}>Approve reviewed slot</button>
    <button disabled={!selected||current.busy||current.loading} onClick={()=>void change("revoke")}>Revoke slot approval</button>
    {key&&<button disabled={current.busy||current.loading} onClick={()=>void refresh(owner.current.token)}>Refresh observations</button>}
  </section>;
}
