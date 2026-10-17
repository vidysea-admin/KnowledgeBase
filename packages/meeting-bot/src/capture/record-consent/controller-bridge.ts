import { createServer } from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hostname } from "node:os";
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync, readFileSync, rmSync, openSync, fsyncSync, closeSync } from "node:fs";
import path from "node:path";
import type { PrivateRecordingControl } from "./controller-client.js";
import { verifyPrivateDirectory,verifyPrivateArtifact } from "./private-acl.js";
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const mac = (secret: string, domain: string, value: unknown) => createHmac("sha256", secret).update(domain + "\n" + JSON.stringify(value)).digest("hex");
function bounded<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve,reject) => {const timer=setTimeout(()=>reject(new Error("Recorder privacy deadline")),6000);
    operation.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
}
function physical(directory: string) {
  for (let current = directory; ; current = path.dirname(current)) {
    if (existsSync(current) && (lstatSync(current).isSymbolicLink() || !lstatSync(current).isDirectory() ||
      realpathSync(current).toLowerCase() !== current.toLowerCase())) throw new Error("Redirected private controller path");
    if (current === path.dirname(current)) break;
  }
}
/** Host-only private locator. Tokens never enter public job status or the wire. */
export async function publishCapturePrivacyController(input: {directory: string; tenantId: string; sessionId: string; control: PrivateRecordingControl}): Promise<() => Promise<void>> {
  const {control, tenantId, sessionId} = input;
  if (!path.isAbsolute(input.directory) || /^[/\\]{2}/.test(input.directory) || !ID.test(tenantId) || tenantId.length > 100 || !ID.test(sessionId) ||
    !UUID.test(control.generation) || typeof control.privacy !== "function" || typeof control.privacyStatus !== "function") throw new Error("Invalid private controller configuration");
  if (!await bounded(control.privacyStatus())) throw new Error("Recorder privacy listener unavailable");
  verifyPrivateDirectory(path.resolve(input.directory));
  const directory = path.join(path.resolve(input.directory), tenantId); physical(directory); mkdirSync(directory, {recursive:true, mode:0o700}); physical(directory);
  verifyPrivateDirectory(directory);
  const file = path.join(directory, `${sessionId}--${control.generation}.json`), secret = randomBytes(32).toString("hex");
  let closed = false, active = 0;
  const accepted = new Map<string, {identity: string; result: Promise<unknown>}>();
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (closed || req.method !== "POST" || req.url !== "/privacy" || active >= 16) {res.writeHead(503).end(); return;}
    active++;
    try {
      let body = ""; for await (const part of req) {body += part.toString(); if (Buffer.byteLength(body) > 2048) throw new Error("Too large");}
      const row = JSON.parse(body), fields = ["version","tenantId","sessionId","generation","requestId","at","action","mac"];
      if (!row || Object.keys(row).length !== fields.length || Object.keys(row).some(key => !fields.includes(key)) || row.version !== 1 || row.tenantId !== tenantId ||
        row.sessionId !== sessionId || row.generation !== control.generation || !UUID.test(row.requestId) || !Number.isSafeInteger(row.at) || Math.abs(Date.now()-row.at)>30000 ||
        !["status","private-start","private-end"].includes(row.action) || typeof row.mac !== "string" || !/^[a-f0-9]{64}$/.test(row.mac)) throw new Error("Invalid request");
      const payload = [1,tenantId,sessionId,control.generation,row.requestId,row.at,row.action];
      if (!timingSafeEqual(Buffer.from(row.mac), Buffer.from(mac(secret,"capture-request-v1",payload)))) throw new Error("Unauthenticated request");
      const identity = JSON.stringify(payload), prior = accepted.get(row.requestId);
      if (prior && prior.identity !== identity || !prior && accepted.size >= 2048) throw new Error("Invalid replay");
      const operation = prior?.result ?? (async () => {
        const result = row.action === "status" ? "status" : await bounded(control.privacy(row.action));
        if (result === "unavailable") throw new Error("Recorder did not persist privacy");
        const state = await bounded(control.privacyStatus());
        if (closed || !state) throw new Error("Recorder unavailable");
        const response = {version:1,requestId:row.requestId,generation:control.generation,result,status:state.status,privacy:state.privacy};
        return {...response,mac:mac(secret,"capture-response-v1",response)};
      })();
      if (!prior) accepted.set(row.requestId, {identity,result:operation});
      res.setHeader("Content-Type","application/json"); res.end(JSON.stringify(await operation));
    } catch {res.writeHead(503).end();} finally {active--;}
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  await new Promise<void>((resolve,reject) => {server.once("error",reject);server.listen(0,"127.0.0.1",()=>{server.off("error",reject);resolve();});});
  try {
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Invalid private listener");
    const descriptor = {version:1,tenantId,sessionId,generation:control.generation,host:hostname(),origin:`http://127.0.0.1:${address.port}`,secret};
    const fd = openSync(file,"wx",0o600); try {writeFileSync(fd,JSON.stringify(descriptor)); fsyncSync(fd);} finally {closeSync(fd);}
    verifyPrivateArtifact(file);
    // Recheck actual capability after publication; a recorder that exited during setup leaves no usable locator.
    if (!await bounded(control.privacyStatus())) throw new Error("Recorder exited during privacy publication");
  } catch (error) {closed = true;server.close(); try {if (JSON.parse(readFileSync(file,"utf8")).secret === secret) rmSync(file);} catch {} throw error;}
  return async () => {
    if (closed) return; closed = true;
    try {if (JSON.parse(readFileSync(file,"utf8")).secret === secret) rmSync(file);} catch {}
    server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
  };
}
