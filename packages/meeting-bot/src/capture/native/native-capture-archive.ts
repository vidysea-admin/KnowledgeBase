/** Private local admission journal. Manifest JSON is never an issuer. Trusted writer identity
 * and its ACL-verified root are the boundary; hostile processes with that identity are outside it. */
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { verifyPrivateDirectory } from "../record-consent/private-acl.js";
import { createPrivateDirectory } from "../record-consent/private-directory.js";
import { requireNativeProviderAudio, type NativeProviderAudio } from "../record-consent/native-provider-audio.js";
import { requireNativeFinalizedMedia, type NativeFinalizedMedia } from "./native-media-finalize.js";
import { fingerprintNativeFile } from "./native-media-probe.js";

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
import { admitNativeArchive, sameNativeArchiveBinding as sameBinding, type NativeArchiveStoreOptions, type NativeArchiveBinding, type NativeArchiveManifest as Manifest } from "./native-archive-authority.js";
export { requireNativeArchiveAdmission, type NativeArchiveAdmission, type NativeArchiveBinding, type NativeArchiveStoreOptions } from "./native-archive-authority.js";
type InventoryFile = Manifest["files"][number];
interface JournalRow { kind: "sealed" | "published"; id: string; manifestSha256: string; publication?: string }
/** Closed spools are read-only. Copy bytes into our exclusive writable handle rather than
 * copying that Windows attribute and then trying to reopen the destination for fsync. */
async function copyRetainedBytes(source: string, destination: string, expectedBytes: number): Promise<void> {
  const input = await fs.open(source, "r");
  try {
    const output = await fs.open(destination, "wx", 0o600);
    try {
      const buffer = Buffer.alloc(64 * 1024);
      let copied = 0;
      for (;;) {
        const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        copied += bytesRead;
        if (copied > expectedBytes) throw new Error("Native archive source grew during copy");
        let offset = 0;
        while (offset < bytesRead) {
          const { bytesWritten } = await output.write(buffer, offset, bytesRead - offset, null);
          if (!bytesWritten) throw new Error("Native archive copy write failed");
          offset += bytesWritten;
        }
      }
      if (copied !== expectedBytes) throw new Error("Native archive source truncated during copy");
      await output.sync();
    } finally { await output.close(); }
  } finally { await input.close(); }
}
export async function openNativeArchiveStore(options: NativeArchiveStoreOptions) {
  const root = path.resolve(options.root);
  if (!path.isAbsolute(options.root) || /^[/\\]{2}/.test(root) ||
    !Number.isSafeInteger(options.maxArchiveBytes) || options.maxArchiveBytes < 1 || options.maxArchiveBytes > 8 * 1024 ** 3) {
    throw new Error("Bounded local private native archive required");
  }
  const journal = path.join(root, "admissions.jsonl");
  async function checkRoot() {
    verifyPrivateDirectory(root);
    if (await fs.realpath(root) !== root || (await fs.lstat(root)).isSymbolicLink()) throw new Error("Redirected native archive root");
  }
  await checkRoot();
  async function current(binding: NativeArchiveBinding) {
    const actual = await options.readCurrentBinding(binding);
    if (!actual || !sameBinding(actual, binding)) throw new Error("Native archive current source/consent binding unavailable");
  }
  async function rows(): Promise<JournalRow[]> {
    await checkRoot();
    try {
      fingerprintNativeFile(journal, 4 * 1024 ** 2);
      const bytes = await fs.readFile(journal, "utf8");
      if (!bytes.endsWith("\n")) throw new Error("Incomplete native admission journal");
      const result = bytes.trimEnd().split("\n").map(line => JSON.parse(line) as JournalRow);
      if (result.some(row => !uuid.test(row.id) || !/^[a-f0-9]{64}$/.test(row.manifestSha256) ||
        !["sealed", "published"].includes(row.kind))) throw new Error("Invalid native admission journal");
      return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  async function append(row: JournalRow) {
    const line = `${JSON.stringify(row)}\n`;
    const existing = await rows();
    if (Buffer.byteLength(existing.map(value => JSON.stringify(value)).join("\n")) + Buffer.byteLength(line) > 4 * 1024 ** 2) {
      throw new Error("Native admission journal quota exceeded");
    }
    const handle = await fs.open(journal, "a", 0o600);
    try { await handle.writeFile(line); await handle.sync(); } finally { await handle.close(); }
  }
  async function exclusive<T>(run: () => Promise<T>): Promise<T> {
    await checkRoot();
    const lock = path.join(root, "admission.lock"), handle = await fs.open(lock, "wx", 0o600);
    try { await handle.writeFile(String(process.pid)); await handle.sync(); return await run(); }
    finally { await handle.close(); await fs.unlink(lock); }
  }
  const admit = (id: string, expected: NativeArchiveBinding) => admitNativeArchive(options, id, expected);
  async function inventory() {
    const result: { archiveId: string; binding: NativeArchiveBinding }[] = [];
    const seen = new Set<string>();
    for (const row of await rows()) {
      if (row.kind !== "sealed") continue;
      if (seen.has(row.id)) throw new Error("Duplicate native archive admission");
      seen.add(row.id);
      const file = path.join(root, row.id, "manifest.json");
      if (fingerprintNativeFile(file, 65536).sha256 !== row.manifestSha256) throw new Error("Native archive manifest changed");
      const manifest = JSON.parse(await fs.readFile(file, "utf8")) as Manifest;
      if (manifest.id !== row.id || manifest.schema !== "native-private-archive/1") throw new Error("Invalid native archive inventory");
      result.push({ archiveId: row.id, binding: { ...manifest.binding } });
    }
    return result;
  }

  return {
    async seal(input: { media: NativeFinalizedMedia; providerAudio: NativeProviderAudio;
      binding: NativeArchiveBinding; sourcePath: string; sidecarPath: string; consentPath: string;
      remainingReservationBytes?: number }): Promise<string> {
      return exclusive(async () => {
        const media = await requireNativeFinalizedMedia(input.media);
        const provider = await requireNativeProviderAudio(input.providerAudio);
        if (provider.media !== media || media.spool.identity.tenantId !== input.binding.tenantId ||
          media.spool.identity.sessionId !== input.binding.sessionId || media.spool.identity.captureGeneration !== input.binding.captureGeneration ||
          input.providerAudio.receiptSha256 !== input.binding.receiptSha256) throw new Error("Native archive live capability binding mismatch");
        await current(input.binding);
        const id = randomUUID(), directory = path.join(root, id);
        const originals = [
          ["source.vp8.ivf", media.spool.video.path], ["source.s16le", media.spool.audio.path],
          ["producer-observations.jsonl", media.spool.ledger.path], ["complete.json", path.join(path.dirname(media.spool.video.path), "complete.json")],
          ["selected-provider.wav", media.canonicalAudio.path], ["playback.webm", media.video.media.file.path],
          ["provider.wav", input.providerAudio.audioPath], ["source.json", input.sourcePath],
          ["sampler.json", input.sidecarPath], ["consent.json", input.consentPath],
          ...(input.providerAudio.maskReceiptPath ? [["provider-mask.json", input.providerAudio.maskReceiptPath]] : []),
        ];
        const remaining = input.remainingReservationBytes ?? options.maxArchiveBytes;
        if (!Number.isSafeInteger(remaining) || remaining < 1 || remaining > 8 * 1024 ** 3) throw new Error("Invalid native archive remaining reservation");
        const reservation = Math.min(remaining, options.maxArchiveBytes);
        const reserved = originals.reduce((sum, [, source]) => sum + fingerprintNativeFile(source!, options.maxArchiveBytes).byteLength, 65536);
        if (reserved > reservation) throw new Error("Native archive copy exceeds finite reservation");
        createPrivateDirectory(directory);
        const files: InventoryFile[] = []; let total = 65536;
        for (const [name, source] of originals) {
          const physical = fingerprintNativeFile(source!, options.maxArchiveBytes);
          total += physical.byteLength;
          if (total > reservation) throw new Error("Native archive copy exceeds finite reservation");
          const destination = path.join(directory, name!);
          await copyRetainedBytes(source!, destination, physical.byteLength);
          const copied = fingerprintNativeFile(destination, options.maxArchiveBytes);
          if (copied.sha256 !== physical.sha256 || fingerprintNativeFile(source!, options.maxArchiveBytes).sha256 !== physical.sha256) throw new Error("Native archive source changed during copy");
          files.push({ name: name!, sha256: copied.sha256, byteLength: copied.byteLength });
        }
        if (files.find(file => file.name === "source.json")!.sha256 !== input.binding.sourceSha256 ||
          files.find(file => file.name === "sampler.json")!.sha256 !== input.binding.sidecarSha256) throw new Error("Native archive source provenance mismatch");
        const consent = JSON.parse(await fs.readFile(path.join(directory, "consent.json"), "utf8"));
        if (digest(JSON.stringify(consent)) !== input.binding.receiptSha256 || consent.tenantId !== input.binding.tenantId ||
          consent.sessionId !== input.binding.sessionId || consent.generation !== input.binding.captureGeneration) throw new Error("Native archive consent bytes mismatch");
        const manifest: Manifest = { schema: "native-private-archive/1", id, binding: { ...input.binding }, identity: { ...media.spool.identity }, files,
          decoderSha256: media.video.decoder.sha256, inspectorSha256: media.video.inspector.sha256 };
        const bytes = Buffer.from(JSON.stringify(manifest));
        if (bytes.length > 65536) throw new Error("Native archive manifest reservation exceeded");
        const handle = await fs.open(path.join(directory, "manifest.json"), "wx", 0o600);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        await requireNativeFinalizedMedia(media); await requireNativeProviderAudio(input.providerAudio); await current(input.binding);
        await append({ kind: "sealed", id, manifestSha256: digest(bytes) });
        await admit(id, input.binding);
        return id;
      });
    },
    admit,
    async findByOwner(owner: { tenantId: string; sessionId: string; sourceId: string }) {
      const candidates = (await inventory()).filter(row => row.binding.tenantId === owner.tenantId &&
        row.binding.sessionId === owner.sessionId && row.binding.sourceId === owner.sourceId);
      const currentCandidates = [];
      for (const row of candidates) {
        const actual = await options.readCurrentBinding(owner);
        if (!actual || !sameBinding(actual, row.binding)) continue;
        await admit(row.archiveId, row.binding);
        currentCandidates.push(row);
      }
      return currentCandidates;
    },
    async pendingPage(input: { limit: number; cursor?: string }) {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000 ||
        input.cursor !== undefined && !uuid.test(input.cursor)) throw new Error("Bounded native pending cursor required");
      const entries = await inventory();
      const previous = input.cursor === undefined ? -1 : entries.findIndex(row => row.archiveId === input.cursor);
      if (input.cursor !== undefined && previous < 0) throw new Error("Unknown native pending cursor");
      const page = entries.slice(previous + 1, previous + 1 + input.limit);
      return { entries: page, pending: entries.length,
        ...(previous + 1 + page.length < entries.length ? { cursor: page.at(-1)!.archiveId } : {}) };
    },
    async pending(limit = 100) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("Bounded native pending scan required");
      const journalRows = await rows();
      // Published is only a replay hint: callers must still revalidate the authoritative binding.
      return journalRows.filter(row => row.kind === "sealed").slice(0, limit).map(row => row.id);
    },
    async markPublished(id: string, expected: NativeArchiveBinding, publication: string): Promise<void> {
      if (!/^[a-f0-9]{64}$/.test(publication)) throw new Error("Exact publication binding digest required");
      await exclusive(async () => {
        await admit(id, expected);
        const journalRows = await rows(), sealed = journalRows.find(row => row.id === id && row.kind === "sealed")!;
        if (journalRows.some(row => row.id === id && row.kind === "published" && row.publication === publication)) return;
        await current(expected);
        await append({ kind: "published", id, manifestSha256: sealed.manifestSha256, publication });
      });
    },
  };
}
