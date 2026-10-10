import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createMongoWhatsAppDeps, type WhatsAppStoreOptions } from "./store.js";
import { createConfiguredWhatsAppOwnerResolver } from "./owner-config.js";
const A="111111111111111111111111", B="222222222222222222222222";
function fixture(poison=false) {
  const effects={archive:0,fetch:0,write:0,index:0};
  const rows: Array<{name:string; value:any}> = [];
  const groups=[{groupJid:"same",ownerUserId:A,subject:"A",trackedPersonCount:1},{groupJid:"same",ownerUserId:B,subject:"B",trackedPersonCount:1},{groupJid:"foreign",ownerUserId:B,subject:"B",trackedPersonCount:1}];
  const appDb=()=>({collection:(name:string)=>({replaceOne:async (_filter:unknown,value:unknown)=>{effects.write++;rows.push({name,value})},bulkWrite:async(value:unknown)=>{effects.write++;rows.push({name,value})}})}) as unknown as Db;
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
