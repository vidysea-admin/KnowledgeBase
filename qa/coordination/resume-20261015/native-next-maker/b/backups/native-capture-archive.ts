/** Private local admission journal. Manifest JSON is never an issuer. Trusted writer identity
 * and its ACL-verified root are the boundary; hostile processes with that identity are outside it. */
import { createHash, randomUUID } from "node:crypto";
import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { verifyPrivateDirectory } from "../record-consent/private-acl.js";
import { requireNativeProviderAudio, type NativeProviderAudio } from "../record-consent/native-provider-audio.js";
import { requireNativeFinalizedMedia, type NativeFinalizedMedia } from "./native-media-finalize.js";
import { fingerprintNativeFile } from "./native-media-probe.js";

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
import { admitNativeArchive, sameNativeArchiveBinding as sameBinding, type NativeArchiveStoreOptions, type NativeArchiveBinding, type NativeArchiveManifest as Manifest } from "./native-archive-authority.js";
export { requireNativeArchiveAdmission, type NativeArchiveAdmission, type NativeArchiveBinding, type NativeArchiveStoreOptions } from "./native-archive-authority.js";
type InventoryFile = Manifest["files"][number];
interface JournalRow { kind: "sealed" | "published"; id: string; manifestSha256: string; publication?: string }
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

  return {
    async seal(input: { media: NativeFinalizedMedia; providerAudio: NativeProviderAudio;
      binding: NativeArchiveBinding; sourcePath: string; sidecarPath: string; consentPath: string }): Promise<string> {
      return exclusive(async () => {
        const media = await requireNativeFinalizedMedia(input.media);
        const provider = await requireNativeProviderAudio(input.providerAudio);
        if (provider.media !== media || media.spool.identity.tenantId !== input.binding.tenantId ||
          media.spool.identity.sessionId !== input.binding.sessionId || media.spool.identity.captureGeneration !== input.binding.captureGeneration ||
          input.providerAudio.receiptSha256 !== input.binding.receiptSha256) throw new Error("Native archive live capability binding mismatch");
        await current(input.binding);
        const id = randomUUID(), directory = path.join(root, id);
        await fs.mkdir(directory, { mode: 0o700 });
        const originals = [
          ["source.vp8.ivf", media.spool.video.path], ["source.s16le", media.spool.audio.path],
          ["producer-observations.jsonl", media.spool.ledger.path], ["complete.json", path.join(path.dirname(media.spool.video.path), "complete.json")],
          ["selected-provider.wav", media.canonicalAudio.path], ["playback.webm", media.video.media.file.path],
          ["provider.wav", input.providerAudio.audioPath], ["source.json", input.sourcePath],
          ["sampler.json", input.sidecarPath], ["consent.json", input.consentPath],
          ...(input.providerAudio.maskReceiptPath ? [["provider-mask.json", input.providerAudio.maskReceiptPath]] : []),
        ];
        const files: InventoryFile[] = []; let total = 65536;
        for (const [name, source] of originals) {
          const physical = fingerprintNativeFile(source!, options.maxArchiveBytes);
          total += physical.byteLength;
          if (total > options.maxArchiveBytes) throw new Error("Native archive copy exceeds finite reservation");
          const destination = path.join(directory, name!);
          await fs.copyFile(source!, destination, constants.COPYFILE_EXCL);
          const handle = await fs.open(destination, "r+");
          try { await handle.sync(); } finally { await handle.close(); }
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
