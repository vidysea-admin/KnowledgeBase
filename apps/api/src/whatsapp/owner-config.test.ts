import { test } from "node:test";
import assert from "node:assert/strict";
import { createConfiguredWhatsAppOwnerResolver as createResolver } from "./owner-config.js";
const A = "111111111111111111111111", B = "222222222222222222222222";
test("missing mapping denies, exact authenticated tenant resolves only explicit owner", async () => {
  for (const raw of [undefined, "", "  ", "[]"]) assert.equal(await createResolver(raw)("a"), null);
  const resolve = createResolver(JSON.stringify([{tenantId:"a",ownerUserId:A},{tenantId:"b",ownerUserId:B}]));
  assert.equal(await resolve("a"),A); assert.equal(await resolve("b"),B);
  assert.equal(await resolve("unknown"),null); assert.equal(await resolve(" a"),null);
});
test("invalid grants and duplicate owners refuse without echoing configuration", () => {
  const invalid: unknown[] = [null, {}, [null], [{tenantId:"",ownerUserId:A}], [{tenantId:" a",ownerUserId:A}], [{tenantId:"a",ownerUserId:1}], [{tenantId:"a",ownerUserId:"invalid"}], [{tenantId:"a",ownerUserId:A,extra:true}], [{tenantId:"a",ownerUserId:A},{tenantId:"a",ownerUserId:B}], [{tenantId:"a",ownerUserId:A},{tenantId:"b",ownerUserId:A}]];
  for (const value of invalid) assert.throws(()=>createResolver(JSON.stringify(value)),{message:"Invalid WHATSAPP_TENANT_OWNER_MAP configuration"});
  assert.throws(()=>createResolver("{"),{message:"Invalid WHATSAPP_TENANT_OWNER_MAP configuration"});
  const owner="ABCDEFABCDEFABCDEFABCDEF";
  assert.throws(()=>createResolver(JSON.stringify([{tenantId:"a",ownerUserId:owner},{tenantId:"b",ownerUserId:owner.toLowerCase()}])));
});
