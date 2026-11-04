/**
 * Reads the text files of a .zip archive in the browser (an exported Elementor kit), without a library (U/Zip.scala): the
 * central directory says where each entry is; stored entries are read as they are, deflated ones through the browser's
 * `DecompressionStream`. ZIP64 and encrypted archives are not read.
 */
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Bytes as UTF-8 text. */
export const utf8 = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes);

/** True when the bytes start like a zip archive. */
export const isZip = (buf: ArrayBuffer) => buf.byteLength >= 4 && new DataView(buf).getUint32(0, true) === LOCAL;

/** Raw DEFLATE through the browser's own decompressor. */
async function inflate(bytes: Uint8Array): Promise<ArrayBuffer> {
  const D = (globalThis as { DecompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!D) throw new Error("This browser cannot unzip; unzip the kit and choose its .json files.");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new D("deflate-raw"));
  return new Response(stream).arrayBuffer();
}

type Read = { ok: true; value: [string, string][] } | { ok: false; error: string };

/** The entries whose name passes `wanted`, as text (UTF-8): path inside the archive → content. */
export async function zipTexts(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Read> {
  const view = new DataView(buf);
  const size = buf.byteLength;
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  // the end record is in the last 22 bytes plus a comment of up to 64 KB
  let e = -1;
  for (let i = size - 22; i >= Math.max(0, size - 22 - 65535); i--) if (u32(i) === EOCD) { e = i; break; }
  if (e < 0) return { ok: false, error: "This file is not a zip archive (or it is damaged)." };
  const count = u16(e + 10);
  let at = u32(e + 16);
  const decoder = new TextDecoder("utf-8");
  const entries: [string, number, number, number][] = [];
  for (let k = 0; k < count; k++) {
    if (at + 46 > size || u32(at) !== CENTRAL)
      return { ok: false, error: "This zip archive is damaged or uses ZIP64, which is not read here. Unzip it and choose its .json files." };
    const method = u16(at + 10), packed = u32(at + 20), nameLen = u16(at + 28), extraLen = u16(at + 30), commentLen = u16(at + 32), local = u32(at + 42);
    const name = decoder.decode(new Uint8Array(buf, at + 46, nameLen));
    if (!name.endsWith("/") && wanted(name)) entries.push([name, method, packed, local]);
    at += 46 + nameLen + extraLen + commentLen;
  }
  const all = await Promise.all(entries.map(async ([name, method, packed, local]): Promise<{ ok: true; v: [string, string] } | { ok: false; e: string }> => {
    if (local + 30 > size || u32(local) !== LOCAL) return { ok: false, e: `${name}: damaged entry` };
    const data = local + 30 + u16(local + 26) + u16(local + 28);
    const bytes = new Uint8Array(buf, data, Math.min(packed, size - data));
    if (method === 0) return { ok: true, v: [name, decoder.decode(bytes)] };
    if (method === 8) {
      try { return { ok: true, v: [name, decoder.decode(new Uint8Array(await inflate(bytes)))] }; } catch (err) { return { ok: false, e: `${name}: ${(err as Error).message}` }; }
    }
    return { ok: false, e: `${name}: compression ${method} is not read here` };
  }));
  const bad = all.find((r) => !r.ok) as { ok: false; e: string } | undefined;
  if (bad && all.every((r) => !r.ok)) return { ok: false, error: bad.e };
  return { ok: true, value: all.flatMap((r) => (r.ok ? [r.v] : [])) };
}
