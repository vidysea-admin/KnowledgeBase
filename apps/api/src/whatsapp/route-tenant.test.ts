import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeWhatsAppDeps } from "../fixtures.js";
import { createMongoWhatsAppDeps } from "./store.js";
import { createLinkBackedWhatsAppOwnerResolver, type ActiveLinkRow } from "./owner-config.js";
test("group listing forwards verified key tenant, ignoring injected query owner/tenant",async()=>{
 const received:string[]=[];const server=await startTestServer(buildTestDeps({keyStore:fakeKeyStore({key:{tenantId:"verified-a",scopes:["whatsapp"]}}),whatsapp:fakeWhatsAppDeps({listGroups:async tenant=>{received.push(tenant);return []}})}));
 try{const res=await fetch(`${server.baseUrl}/whatsapp/groups?tenantId=foreign&ownerUserId=foreign`,{headers:{authorization:"Bearer key"}});assert.equal(res.status,200);assert.deepEqual(received,["verified-a"])}finally{await server.close()}
});

// W4 (R-25): over HTTP a Bearer key resolves legacy links only; a member's link and other tenants' links never answer; no key falls back to all owners.
test("key-authenticated group listing resolves the legacy owner only; member links and other tenants' links never answer",async()=>{
 const OL="c".repeat(24),OM="a".repeat(24),OT="e".repeat(24);
 const rows:ActiveLinkRow[]=[
  {_id:"1".repeat(24),tenantId:"t1",userId:null,state:"active",archiverOwnerId:OL},
  {_id:"2".repeat(24),tenantId:"t1",userId:"u1",state:"active",archiverOwnerId:OM},
  {_id:"3".repeat(24),tenantId:"t2",userId:"u9",state:"active",archiverOwnerId:OT}];
 const queried:string[]=[];
 const whatsapp=createMongoWhatsAppDeps(undefined,{resolveOwners:createLinkBackedWhatsAppOwnerResolver(async t=>rows.filter(r=>r.tenantId===t)),
  listGroups:async owner=>{queried.push(owner);return [{groupJid:"g",ownerUserId:owner,subject:"s",trackedPersonCount:1}]}});
 const server=await startTestServer(buildTestDeps({keyStore:fakeKeyStore({k1:{tenantId:"t1",scopes:["whatsapp"]},k2:{tenantId:"t2",scopes:["whatsapp"]},k3:{tenantId:"t3",scopes:["whatsapp"]}}),whatsapp}));
 try{
  const get=(k:string)=>fetch(`${server.baseUrl}/whatsapp/groups?ownerUserId=${OM}`,{headers:{authorization:`Bearer ${k}`}});
  const r1=await get("k1");assert.equal(r1.status,200);
  // W7 (R-30): a non-admin caller never receives the archiver owner id; it sees the link id instead.
  assert.deepEqual(((await r1.json()) as {groups:{ownerUserId?:string;linkId:string|null}[]}).groups,[{groupJid:"g",subject:"s",trackedPersonCount:1,linkId:"1".repeat(24)}]);
  for(const k of ["k2","k3"]){const r=await get(k);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"not_configured",feature:"whatsapp"})}
  assert.deepEqual(queried,[OL]);
 }finally{await server.close()}
});
