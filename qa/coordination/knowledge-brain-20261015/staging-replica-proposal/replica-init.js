// PROPOSAL ONLY. This writes replica-set metadata in the dedicated new staging container.
// Called only after explicit activation approval; no external network or production URI accepted.
const fs = require("fs");
const username = process.env.LKB_STAGING_MONGO_ROOT_USERNAME;
const password = fs.readFileSync("/run/secrets/root-password", "utf8").replace(/\r?\n$/, "");
if (!username || !password) throw new Error("Staging credential files/configuration required");
const admin = db.getSiblingDB("admin");
let authenticated = false;
for (let n = 0; n < 30; n++) {
  try { const result = admin.auth(username, password); authenticated = result === 1 || result?.ok === 1; } catch {}
  if (authenticated) break;
  sleep(1000);
}
if (!authenticated) throw new Error("Dedicated staging authentication unavailable");
let config;
try { config = admin.runCommand({replSetGetConfig: 1}); }
catch (error) {
  if (error?.code === 94) config = {ok: 0, code: 94};
  else throw new Error("Replica configuration unavailable; refusing initialization");
}
if (config?.ok === 1) {
  const c = config.config;
  if (c._id !== "lkb-staging-rs" || c.members?.length !== 1 || c.members[0].host !== "mongo-staging:27017") {
    throw new Error("Unexpected replica configuration; refusing changes");
  }
} else {
  if (config?.code !== 94) throw new Error("Replica configuration not safely uninitialized");
  const hello = admin.runCommand({hello: 1});
  if (hello.setName && hello.setName !== "lkb-staging-rs") throw new Error("Unexpected replica identity");
  const result = admin.runCommand({replSetInitiate: {_id: "lkb-staging-rs", members: [{_id: 0, host: "mongo-staging:27017"}]}});
  if (result.ok !== 1) throw new Error("Dedicated staging initialization refused");
}
let primary = false;
for (let n = 0; n < 30; n++) {
  if (admin.runCommand({hello: 1}).isWritablePrimary === true) { primary = true; break; }
  sleep(1000);
}
if (!primary) throw new Error("Dedicated staging primary unavailable");
// A separate restricted credential is the only proposed application/fixture identity.
const fixtureUsername = process.env.LKB_STAGING_FIXTURE_USERNAME;
const fixturePassword = fs.readFileSync("/run/secrets/fixture-password", "utf8").replace(/\r?\n$/, "");
if (!fixtureUsername || fixtureUsername === username || !fixturePassword) throw new Error("Distinct staging fixture credentials required");
const staging = db.getSiblingDB("lkb_staging");
const existing = staging.getUser(fixtureUsername);
if (existing) {
  if (existing.customData?.owner !== "knowledge-brain-staging-proposal" || existing.roles?.length !== 1 ||
      existing.roles[0].role !== "readWrite" || existing.roles[0].db !== "lkb_staging") {
    throw new Error("Unexpected fixture authority; refusing changes");
  }
} else {
  staging.createUser({user: fixtureUsername, pwd: fixturePassword,
    roles: [{role: "readWrite", db: "lkb_staging"}], customData: {owner: "knowledge-brain-staging-proposal"}});
}
print(JSON.stringify({replicaSet: "lkb-staging-rs", primary: true, databaseTarget: "lkb_staging", fixtureRole: "readWrite:lkb_staging", corpusWrites: false}));
