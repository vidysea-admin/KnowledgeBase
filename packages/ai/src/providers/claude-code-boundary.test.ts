import {test} from "node:test";
import assert from "node:assert/strict";
import {ClaudeCodeProvider} from "./claude-code.js";
import {fakeTransport} from "../testUtils.js";
const job={kind:"test",messages:[{role:"user" as const,content:"public $() & text"}]};
test("Claude preserves literal stdin and removes ambient capabilities", async()=>{
 const transport=fakeTransport({status:0,body:{result:"OK",subtype:"success"}});
 assert.equal((await new ClaudeCodeProvider(transport).complete(job)).text,"OK");
 const call=transport.calls[0]!;
 assert.equal(call.command,"claude"); assert.equal(call.stdin,"[user] public $() & text");
 assert.deepEqual(call.args,["-p","--model","sonnet","--output-format","json","--safe-mode","--restricted","--no-chrome","--tools","","--disable-slash-commands","--strict-mcp-config","--mcp-config",'{"mcpServers":{}}',"--setting-sources","","--no-session-persistence","--permission-prompts","none"]);
});
for (const body of [{is_error:true,result:"SECRET"},{subtype:"error_max_turns",result:"SECRET"},{result:""},{result:42},"SECRET"])
 test("Claude rejects unsuccessful or malformed result "+JSON.stringify(body),async()=>{
  await assert.rejects(new ClaudeCodeProvider(fakeTransport({status:0,body})).complete(job), e=> e instanceof Error && !e.message.includes("SECRET"));
 });
test("Claude nonzero exit excludes raw response",async()=>{
 await assert.rejects(new ClaudeCodeProvider(fakeTransport({status:1,body:{},text:"SECRET"})).complete(job),e=>e instanceof Error&&!e.message.includes("SECRET"));
});
