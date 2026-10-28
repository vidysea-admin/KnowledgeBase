/** Private admission reproof. There is no generic capability registration/JSON issuer.
 * Only an exact sealed entry in the trusted writer's private journal can admit retained bytes. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { verifyPrivateDirectory } from "../record-consent/private-acl.js";
import { fingerprintNativeFile } from "./native-media-probe.js";
import type { NativeCaptureIdentity } from "./native-media-types.js";

export interface NativeArchiveBinding {
  readonly tenantId: string; readonly sessionId: string; readonly sourceId: string;
  readonly captureGeneration: string; readonly receiptSha256: string;
  readonly sourceSha256: string; readonly sidecarSha256: string;
}
export interface NativeArchiveManifest {
  schema: "native-private-archive/1"; id: string; binding: NativeArchiveBinding;
  identity: NativeCaptureIdentity; files: { name: string; sha256: string; byteLength: number }[];
  decoderSha256: string; inspectorSha256: string;
}
export interface NativeArchiveStoreOptions {
  /** Private administrator-selected root, never imported source/HTTP paths. */
  root: string; maxArchiveBytes: number;
  readCurrentBinding: (owner: { tenantId: string; sessionId: string; sourceId: string }) => Promise<NativeArchiveBinding | null>;
}
declare const admissionBrand: unique symbol;
export interface NativeArchiveAdmission { readonly [admissionBrand]: true }
interface AdmissionState { manifest: NativeArchiveManifest; directory: string; check: () => Promise<void> }
const admitted = new WeakMap<object, AdmissionState>();
export const sameNativeArchiveBinding = (a: NativeArchiveBinding, b: NativeArchiveBinding) =>
  ["tenantId", "sessionId", "sourceId", "captureGeneration", "receiptSha256", "sourceSha256", "sidecarSha256"]
    .every(key => a[key as keyof NativeArchiveBinding] === b[key as keyof NativeArchiveBinding]);

export async function requireNativeArchiveAdmission(cap: NativeArchiveAdmission) {
  const state = cap && admitted.get(cap);
  if (!state) throw new Error("Native archive admission capability required");
  await state.check();
  return { directory: state.directory, manifest: structuredClone(state.manifest) };
}
/** Server-only trusted-root dependency. A manifest, imported folder, or completion marker alone
 * cannot enroll itself. Journal authority presumes the existing trusted OS writer identity. */
export async function admitNativeArchive(options: NativeArchiveStoreOptions, id: string, expected: NativeArchiveBinding): Promise<NativeArchiveAdmission> {
  const root = path.resolve(options.root);
  if (!path.isAbsolute(options.root) || /^[/\\]{2}/.test(root) || !Number.isSafeInteger(options.maxArchiveBytes) ||
    options.maxArchiveBytes < 1 || options.maxArchiveBytes > 8 * 1024 ** 3 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw new Error("Bounded trusted native archive required");
  const directory = path.join(root, id), manifestPath = path.join(directory, "manifest.json"), journalPath = path.join(root, "admissions.jsonl");
  const readSeal = async () => {
    verifyPrivateDirectory(root);
    if (await fs.realpath(root) !== root || (await fs.lstat(root)).isSymbolicLink()) throw new Error("Redirected native archive root");
    fingerprintNativeFile(journalPath, 4 * 1024 ** 2);
    const journal = await fs.readFile(journalPath, "utf8");
    if (!journal.endsWith("\n")) throw new Error("Incomplete native admission journal");
    const seals = journal.trimEnd().split("\n").map(line => JSON.parse(line)).filter(row => row.kind === "sealed" && row.id === id);
    if (seals.length !== 1 || !/^[a-f0-9]{64}$/.test(seals[0].manifestSha256)) throw new Error("Native archive not privately admitted");
    return seals[0].manifestSha256 as string;
  };
  const manifestFile = fingerprintNativeFile(manifestPath, 65536);
  if (manifestFile.sha256 !== await readSeal()) throw new Error("Native archive manifest changed");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as NativeArchiveManifest;
  if (manifest.schema !== "native-private-archive/1" || manifest.id !== id || !sameNativeArchiveBinding(manifest.binding, expected) ||
    !Array.isArray(manifest.files) || manifest.files.length > 32) throw new Error("Native archive binding invalid");
  const check = async () => {
    if (await readSeal() !== manifestFile.sha256 || fingerprintNativeFile(manifestPath, 65536).sha256 !== manifestFile.sha256) throw new Error("Native archive changed");
    const current = await options.readCurrentBinding(expected);
    if (!current || !sameNativeArchiveBinding(current, expected)) throw new Error("Native archive current source/consent binding unavailable");
    let total = manifestFile.byteLength;
    const names = new Set<string>();
    for (const file of manifest.files) {
      if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(file.name) || names.has(file.name)) throw new Error("Invalid archive inventory path");
      names.add(file.name);
      const physical = fingerprintNativeFile(path.join(directory, file.name), options.maxArchiveBytes);
      if (physical.sha256 !== file.sha256 || physical.byteLength !== file.byteLength) throw new Error("Native archive bytes changed");
      total += physical.byteLength;
    }
    if (total > options.maxArchiveBytes) throw new Error("Native archive reservation exceeded");
    const listing = await fs.readdir(directory);
    if (listing.length !== names.size + 1 || listing.some(name => name !== "manifest.json" && !names.has(name))) throw new Error("Uninventoried native archive bytes");
    const after = await options.readCurrentBinding(expected);
    if (!after || !sameNativeArchiveBinding(after, expected)) throw new Error("Native archive consent changed during readback");
  };
  await check();
  const cap = Object.freeze({}) as NativeArchiveAdmission;
  admitted.set(cap, { manifest, directory, check });
  return cap;
}
