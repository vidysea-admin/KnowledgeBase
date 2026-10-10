import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { createMongoWhatsAppDeps, type WhatsAppStoreOptions } from "./store.js";
const A="111111111111111111111111", B="222222222222222222222222";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
function fixture(fetchMessages:NonNullable<WhatsAppStoreOptions["fetchMessages"]>,beforeWrite?:()=>void) {
 const rows:Array<{name:string;row:any}>=[];
 const appDb=()=>({collection:(name:string)=>({replaceOne:async (_filter:unknown,row:unknown)=>{beforeWrite?.();rows.push({name,row})},bulkWrite:async(ops:any[])=>{for(const op of ops)rows.push({name,row:op.replaceOne.replacement})}})}) as unknown as Db;
 const store=createMongoWhatsAppDeps(undefined,{resolveOwner:async tenant=>tenant==="a"?A:B,listGroups:async owner=>[{groupJid:"same",ownerUserId:owner,subject:"Fixture",trackedPersonCount:2}],fetchMessages,appDb});
 return {store,rows};
}
const message=(id:string,text:string,person:string,ts:string)=>({messageId:id,text,personId:person,displayName:person,ts});
test("one archive read keeps exact IDs/text/speaker/time despite advertised second-read reorder",async()=>{
 const raw=[message("first","first text","speaker1","2026-10-09T01:00:00Z"),message("second","second text","speaker2","2026-10-09T01:01:00Z")];let calls=0;
 const f=fixture(async()=>++calls===1?raw:[raw[1]!,raw[0]!]);const result=await f.store.ingestGroup("a","same");assert.equal(calls,1);
 const turns=f.rows.filter(r=>r.name==="turns").map(r=>r.row);
 for(let i=0;i<raw.length;i++){assert.equal(turns[i]._id,hash(`${result.sessionId}:${raw[i]!.messageId}`));assert.equal(turns[i].text,raw[i]!.text);assert.equal(turns[i].speakerRef,raw[i]!.personId);assert.equal(turns[i].occurredAt,new Date(raw[i]!.ts).toISOString())}
 assert.deepEqual(turns.map(t=>t.tStart),[0,60]);
});
test("interleaved owners use separate request-local snapshots",async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let calls=0;
 const f=fixture(async(_group,owner)=>{calls++;if(owner===A)await gate;else release();return [message(owner,`text-${owner}`,owner,"2026-10-09T01:00:00Z")]});
 await Promise.all([f.store.ingestGroup("a","same"),f.store.ingestGroup("b","same")]);assert.equal(calls,2);
 const turns=f.rows.filter(r=>r.name==="turns").map(r=>r.row);assert.equal(turns.length,2);for(const t of turns){const owner=t.tenantId==="a"?A:B;assert.equal(t.speakerRef,owner);assert.equal(t.text,`text-${owner}`)}
});
test("raw fields and mutable Date/identifier changes after await cannot change snapshot",async()=>{
 const date=new Date("2026-10-09T01:00:00Z");let id="original-id",person="original-person";
 const raw:any={messageId:{toString:()=>id},personId:{toString:()=>person},displayName:"original-label",text:"original-text",ts:date};let mutated=false,calls=0;
 const f=fixture(async()=>{calls++;return [raw]},()=>{if(!mutated){mutated=true;id="changed-id";person="changed-person";raw.text="changed-text";raw.displayName="changed-label";date.setUTCFullYear(2030)}});
 const result=await f.store.ingestGroup("a","same");assert.equal(calls,1);const t=f.rows.find(r=>r.name==="turns")!.row;assert.equal(t._id,hash(`${result.sessionId}:original-id`));assert.equal(t.speakerRef,"original-person");assert.equal(t.speakerLabel,"original-label");assert.equal(t.text,"original-text");assert.equal(t.occurredAt,"2026-10-09T01:00:00.000Z");assert.equal(f.rows.find(r=>r.name==="sessions")!.row.date,"2026-10-09");
});
