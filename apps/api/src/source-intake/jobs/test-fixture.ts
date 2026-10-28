// Explicit deterministic ACL reader seam for queue protocol fixtures. Never production/native Windows proof.
import type { spawnSync } from "node:child_process";
import { verifyPrivateArtifact, verifyPrivateDirectory } from "../../bot-privacy/private-acl.js";
import { createSourceJobStore as actualStore, type SourceJobStoreOptions } from "./store.js";

export const FIXTURE_SID = "S-1-5-21-111-222-333-1001";
export const fixtureAclReader = ((_command: string, args: readonly string[]) => ({
  pid: 0, status: 0, signal: null, stderr: "", output: ["", "", ""], stdout: JSON.stringify({
    path: args.at(-1), currentSid: FIXTURE_SID, ownerSid: FIXTURE_SID,
    rules: [{ sid: FIXTURE_SID, type: "Allow", rights: 2032127 }],
  }),
})) as typeof spawnSync;
export const queueFixtureStore = (root: string, options: SourceJobStoreOptions = {}) => actualStore(root, {
  ...options, ...(process.platform === "win32" && !options.verifier ? { verifier: {
    directory: (path: string) => verifyPrivateDirectory(path, fixtureAclReader),
    artifact: (path: string) => verifyPrivateArtifact(path, fixtureAclReader),
  } } : {}),
});
