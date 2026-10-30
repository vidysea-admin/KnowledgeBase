import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createMongoWhatsAppDeps, type WhatsAppStoreOptions } from "./store.js";
import { createConfiguredWhatsAppOwnerResolver, WhatsAppAmbiguousLinkError, WhatsAppNotConfiguredError, type WhatsAppCaller, type WhatsAppOwnersResolver } from "./owner-config.js";
const A="111111111111111111111111", B="222222222222222222222222";
function fixture(poison=false) {
  const effects={archive:0,fetch:0,write:0,index:0};
  const rows: Array<{name:string; value:any}> = [];
  const groups=[{groupJid:"same",ownerUserId:A,subject:"A",trackedPersonCount:1},{groupJid:"same",ownerUserId:B,subject:"B",trackedPersonCount:1},{groupJid:"foreign",ownerUserId:B,subject:"B",trackedPersonCount:1}];
  const appDb=()=>({collection:(name:string)=>({findOne:async()=>null,updateOne:async (_filter:unknown,update:any)=>{effects.write++;rows.push({name,value:update.$setOnInsert})},replaceOne:async (_filter:unknown,value:unknown)=>{effects.write++;rows.push({name,value})},bulkWrite:async(value:unknown)=>{effects.write++;rows.push({name,value})}})}) as unknown as Db;
  const options:WhatsAppStoreOptions={resolveOwner:createConfiguredWhatsAppOwnerResolver(JSON.stringify([{tenantId:"a",ownerUserId:A},{tenantId:"b",ownerUserId:B}])),appDb,
    listGroups:async owner=>{effects.archive++;return poison?groups.filter(g=>g.ownerUserId===B):groups.filter(g=>g.ownerUserId===owner)},
    fetchMessages:async (_group,owner)=>{effects.fetch++;return [{messageId:`message-${owner}`,personId:`person-${owner}`,displayName:"Fixture",text:"synthetic literal",ts:"2026-10-09T01:02:03.000Z"}]}};
  const indexer=async()=>{effects.index++;return {chunks:{}} as any};
  return {effects,rows,options,indexer,store:createMongoWhatsAppDeps(indexer,options)};
}
test("same group JID maps two authenticated tenants to separate owners and source identities",async()=>{
 const f=fixture(); assert.deepEqual((await f.store.listGroups("a")).map(g=>g.ownerUserId),[A]);assert.ok((await f.store.listGroups("b")).every(g=>g.ownerUserId===B));
 const a=await f.store.ingestGroup("a","same"),b=await f.store.ingestGroup("b","same");assert.notEqual(a.sourceId,b.sourceId);
 const turns=f.rows.filter(r=>r.name==="turns").map(r=>r.value[0].replaceOne.replacement);
 assert.deepEqual(turns.map(t=>t.tenantId),["a","b"]);assert.deepEqual(turns.map(t=>t.speakerRef),[`person-${A}`,`person-${B}`]);
 for(const t of turns){assert.equal(t.text,"synthetic literal");assert.equal(t.speakerLabel,"Fixture");assert.equal(t.occurredAt,"2026-10-09T01:02:03.000Z");assert.equal(t.tStart,0)}
});
test("missing/unmapped/malformed owner authorization has zero archive/write/index effects",async()=>{
 for(const resolveOwner of [undefined,async()=>null,async()=>"bad-owner"]){const f=fixture();const deps=createMongoWhatsAppDeps(f.indexer,{...f.options,resolveOwner});await assert.rejects(()=>deps.listGroups("a"));await assert.rejects(()=>deps.ingestGroup("a","same"));assert.deepEqual(f.effects,{archive:0,fetch:0,write:0,index:0})}
 const f=fixture();await assert.rejects(()=>f.store.ingestGroup("unknown","same"));assert.deepEqual(f.effects,{archive:0,fetch:0,write:0,index:0});
});
test("foreign group or poisoned owner group cannot fetch/write/index",async()=>{
 for(const poison of [false,true]){const f=fixture(poison);await assert.rejects(()=>f.store.ingestGroup("a",poison?"same":"foreign"));assert.equal(f.effects.fetch,0);assert.equal(f.effects.write,0);assert.equal(f.effects.index,0)}
});

// ---- W4 wa-owner-resolver: the store works from a permitted owner SET (R-24/R-25) ----
const C="333333333333333333333333", L1="a".repeat(24), L2="b".repeat(24);
type Grant={linkId:string|null;ownerUserId:string};
function setFixture(grantsFor:(caller?:WhatsAppCaller)=>Grant[]) {
  const f=fixture(); const listed:string[]=[], fetched:string[]=[], callers:Array<WhatsAppCaller|undefined>=[];
  const groups=[{groupJid:"only-a",ownerUserId:A},{groupJid:"both",ownerUserId:A},{groupJid:"both",ownerUserId:B},{groupJid:"only-b",ownerUserId:B},{groupJid:"only-c",ownerUserId:C}]
    .map(g=>({...g,subject:g.groupJid,trackedPersonCount:1}));
  const resolveOwners:WhatsAppOwnersResolver=async(_tenant,caller)=>{callers.push(caller);const g=grantsFor(caller);if(g.length===0)throw new WhatsAppNotConfiguredError();return g};
  const options:WhatsAppStoreOptions={...f.options,resolveOwner:undefined,resolveOwners,
    listGroups:async owner=>{listed.push(owner);f.effects.archive++;return groups.filter(g=>g.ownerUserId===owner)},
    fetchMessages:async(_g,owner)=>{fetched.push(owner);f.effects.fetch++;return [{messageId:`m-${owner}`,personId:`p-${owner}`,displayName:"X",text:"t",ts:"2026-10-09T01:02:03.000Z"}]}};
  return {...f,options,listed,fetched,callers,store:createMongoWhatsAppDeps(f.indexer,options)};
}
const ADMIN:WhatsAppCaller={kind:"session",userId:"boss",admin:true}, MEMBER:WhatsAppCaller={kind:"session",userId:"u1",admin:false};
const grantsBy=(caller?:WhatsAppCaller):Grant[]=>caller?.admin?[{linkId:L1,ownerUserId:A},{linkId:L2,ownerUserId:B}]:caller?.kind==="session"&&caller.userId==="u1"?[{linkId:L1,ownerUserId:A}]:[];
const zero=(e:{fetch:number;write:number;index:number})=>assert.deepEqual([e.fetch,e.write,e.index],[0,0,0]);

test("W4: admin lists groups of every permitted owner (each carrying its owner); a member only its own; owner C (not permitted) never appears",async()=>{
 const f=setFixture(grantsBy);
 const admin=await f.store.listGroups("t",{caller:ADMIN});
 assert.deepEqual(admin.map(g=>`${g.ownerUserId}:${g.groupJid}`).sort(),[`${A}:both`,`${A}:only-a`,`${B}:both`,`${B}:only-b`].sort());
 const member=await f.store.listGroups("t",{caller:MEMBER});
 assert.ok(member.length===2&&member.every(g=>g.ownerUserId===A));
 assert.ok(!f.listed.includes(C),"no archive query ever carried owner C");
 assert.deepEqual(f.callers,[ADMIN,MEMBER]);
});
test("W4: a member's archive queries never carry another owner's id, for list or ingest",async()=>{
 const f=setFixture(grantsBy);
 await f.store.listGroups("t",{caller:MEMBER}); await f.store.ingestGroup("t","both",{caller:MEMBER});
 assert.ok(f.listed.every(o=>o===A)); assert.deepEqual(f.fetched,[A]);
});
test("W4: an empty permitted set is refused with zero archive/write/index effects, never widened to all owners",async()=>{
 const f=setFixture(grantsBy); const nobody:WhatsAppCaller={kind:"session",userId:"nobody",admin:false};
 await assert.rejects(()=>f.store.listGroups("t",{caller:nobody}),WhatsAppNotConfiguredError);
 await assert.rejects(()=>f.store.ingestGroup("t","only-a",{caller:nobody}),WhatsAppNotConfiguredError);
 await assert.rejects(()=>f.store.listGroups("t"),WhatsAppNotConfiguredError); // no caller: the resolver decides, and this one grants none
 assert.deepEqual(f.effects,{archive:0,fetch:0,write:0,index:0});
});
test("W4: ingest by jid resolves the one permitted owner; a jid marked only by an unpermitted owner is absent, no fetch/write/index",async()=>{
 const f=setFixture(grantsBy);
 const res=await f.store.ingestGroup("t","only-b",{caller:ADMIN}); assert.equal(res.turnCount,1); assert.deepEqual(f.fetched,[B]);
 const g=setFixture(grantsBy);
 for(const jid of ["only-c","only-b","does-not-exist"]) await assert.rejects(()=>g.store.ingestGroup("t",jid,{caller:MEMBER}),/no tracked WhatsApp group/);
 zero(g.effects);
 const h=setFixture(grantsBy); // owner C is not in even the admin's set
 await assert.rejects(()=>h.store.ingestGroup("t","only-c",{caller:ADMIN}),/no tracked WhatsApp group/); zero(h.effects);
});
test("W4: a jid marked by two permitted links needs linkId (ambiguous_link, 409, no effects); a linkId outside the permitted set is treated as absent",async()=>{
 const f=setFixture(grantsBy);
 const err=await f.store.ingestGroup("t","both",{caller:ADMIN}).then(()=>null,(e:unknown)=>e) as WhatsAppAmbiguousLinkError;
 assert.ok(err instanceof WhatsAppAmbiguousLinkError); assert.equal(err.status,409); assert.equal(err.code,"ambiguous_link");
 zero(f.effects);
 await f.store.ingestGroup("t","both",{caller:ADMIN,linkId:L2}); assert.deepEqual(f.fetched,[B]);
 const g=setFixture(grantsBy);
 for(const linkId of ["c".repeat(24),L2,"",null as unknown as string]) await assert.rejects(()=>g.store.ingestGroup("t","both",{caller:MEMBER,linkId}),/no tracked WhatsApp group/);
 zero(g.effects);
});
test("W4: a poisoned archive returning another owner's group under a permitted owner is dropped and cannot be fetched or written",async()=>{
 const f=setFixture(grantsBy);
 const poisoned=createMongoWhatsAppDeps(f.indexer,{...f.options,listGroups:async()=>[{groupJid:"x",ownerUserId:B,subject:"x",trackedPersonCount:1}]});
 assert.deepEqual(await poisoned.listGroups("t",{caller:MEMBER}),[]);
 await assert.rejects(()=>poisoned.ingestGroup("t","x",{caller:MEMBER}),/no tracked WhatsApp group/);
 zero(f.effects);
});
test("W4: the legacy single-owner resolveOwner option still grants exactly that one owner, with or without a caller",async()=>{
 const f=fixture();
 for(const scope of [undefined,{caller:MEMBER},{caller:ADMIN}]) assert.ok((await f.store.listGroups("a",scope)).every(g=>g.ownerUserId===A));
});
