import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore, fakeWhatsAppDeps } from "../fixtures.js";
test("group listing forwards verified key tenant, ignoring injected query owner/tenant",async()=>{
 const received:string[]=[];const server=await startTestServer(buildTestDeps({keyStore:fakeKeyStore({key:{tenantId:"verified-a",scopes:["whatsapp"]}}),whatsapp:fakeWhatsAppDeps({listGroups:async tenant=>{received.push(tenant);return []}})}));
 try{const res=await fetch(`${server.baseUrl}/whatsapp/groups?tenantId=foreign&ownerUserId=foreign`,{headers:{authorization:"Bearer key"}});assert.equal(res.status,200);assert.deepEqual(received,["verified-a"])}finally{await server.close()}
});
