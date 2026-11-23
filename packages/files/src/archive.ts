/**
 * Archives: the entries of a ZIP archive from its bytes, with `node:zlib` only.
 *
 * The reader reads the central directory, and then the data of each entry at its local header. It copies a stored
 * entry (method 0) and inflates a deflated entry (method 8). It checks the CRC-32 and the size of each entry.
 *
 * The reader does not throw on bad input. It gives a typed error. Limits on the size of each entry, on the whole archive
 * and on the count of entries stop an archive that expands too much (a zip bomb). The reader refuses ZIP64, archives on
 * more than one disk, encrypted entries and the other methods of compression.
 *
 * An entry has a name, its bytes and its time of change. The readers of other archive formats give the same entry.
 */

import { inflateRawSync } from "node:zlib";

/** One file of an archive. */
export interface ArchiveEntry {
  /** The path of the file in the archive, with `/` separators. Join it to a folder only after a check with `isInside`. */
  readonly name: string;
  /** The uncompressed bytes of the file. */
  readonly bytes: Uint8Array;
  /** The time of the last change of the file, or `null` when the archive has no valid time. */
  readonly modified: Date | null;
}

/** The limits of one read. Each limit counts uncompressed bytes. */
export interface ArchiveLimits {
  /** The largest uncompressed size of one entry. The default is `DEFAULT_ARCHIVE_LIMITS.entryBytes`. */
  readonly entryBytes?: number | undefined;
  /** The largest sum of the uncompressed sizes of all entries. The default is `DEFAULT_ARCHIVE_LIMITS.totalBytes`. */
  readonly totalBytes?: number | undefined;
  /** The largest count of entries in the central directory. The default is `DEFAULT_ARCHIVE_LIMITS.entries`. */
  readonly entries?: number | undefined;
}

/** The default limits: 256 MiB for one entry, 1 GiB for the archive, and 65,535 entries. */
export const DEFAULT_ARCHIVE_LIMITS: { readonly entryBytes: number; readonly totalBytes: number; readonly entries: number } = Object.freeze({
  entryBytes: 256 * 1024 * 1024,
  totalBytes: 1024 * 1024 * 1024,
  entries: 0xffff,
});

/**
 * The kinds of error of a read.
 *
 * - `not-zip`: the bytes have no end record of a ZIP archive.
 * - `truncated`: a record or the data of an entry goes past the end of the bytes.
 * - `bad-record`: a record has a wrong signature or a wrong field.
 * - `zip64`: the archive uses ZIP64. This reader does not read it.
 * - `multi-disk`: the archive is on more than one disk.
 * - `encrypted`: an entry is encrypted.
 * - `method`: an entry uses a method of compression other than 0 (stored) or 8 (deflate).
 * - `limit`: an entry, the archive or the count of entries is larger than its limit.
 * - `inflate`: the deflated data of an entry is not valid.
 * - `size`: the uncompressed data of an entry has a size other than the size in the central directory.
 * - `crc`: the CRC-32 of an entry is not the CRC-32 in the central directory.
 */
export const ARCHIVE_ERROR_KINDS = ["not-zip", "truncated", "bad-record", "zip64", "multi-disk", "encrypted", "method", "limit", "inflate", "size", "crc"] as const;

/** One kind of error of a read. */
export type ArchiveErrorKind = (typeof ARCHIVE_ERROR_KINDS)[number];

/** The error of a read. */
export interface ArchiveError {
  readonly kind: ArchiveErrorKind;
  /** The cause, in one sentence. */
  readonly message: string;
  /** The name of the entry with the error, when the error is in one entry. */
  readonly entry?: string;
}

/** The result of a read: the entries, or the error that stopped the read. */
export type ArchiveResult = { readonly ok: true; readonly entries: readonly ArchiveEntry[] } | { readonly ok: false; readonly error: ArchiveError };

const END_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const END_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
const ZIP64_LOCATOR_SIZE = 20;
/** The extra field of the extended timestamp: the time of change in seconds since the epoch, UTC. */
const EXTENDED_TIME_ID = 0x5455;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;

/** The table of the CRC-32 of the polynomial 0xEDB88320. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** This function gives the CRC-32 of `bytes`, as ZIP, gzip and PNG use it. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** This function gives a failed result. */
function fail(kind: ArchiveErrorKind, message: string, entry?: string): ArchiveResult {
  return { ok: false, error: entry === undefined ? { kind, message } : { kind, message, entry } };
}

/** This function gives the time of a DOS date and time, read as UTC, or `null` when the fields are not a valid time. */
function dosTime(date: number, time: number): Date | null {
  const year = 1980 + (date >>> 9);
  const month = (date >>> 5) & 0x0f;
  const day = date & 0x1f;
  const hour = time >>> 11;
  const minute = (time >>> 5) & 0x3f;
  const second = (time & 0x1f) * 2;
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return value.getUTCDate() === day ? value : null;
}

/** This function gives the time of change of the extended timestamp field in `extra`, or `null`. */
function extendedTime(view: DataView, start: number, length: number): Date | null {
  let at = start;
  const end = start + length;
  while (at + 4 <= end) {
    const id = view.getUint16(at, true);
    const size = view.getUint16(at + 2, true);
    const body = at + 4;
    if (body + size > end) return null;
    if (id === EXTENDED_TIME_ID && size >= 5 && (view.getUint8(body) & 1) === 1) return new Date(view.getUint32(body + 1, true) * 1000);
    at = body + size;
  }
  return null;
}

/** This function gives the offset of the end record, or -1. The search starts at the end, past a comment of up to 65,535 bytes. */
function findEnd(view: DataView): number {
  const last = view.byteLength - END_SIZE;
  const first = Math.max(0, last - 0xffff);
  for (let at = last; at >= first; at--) {
    if (view.getUint32(at, true) === END_SIGNATURE && at + END_SIZE + view.getUint16(at + 20, true) === view.byteLength) return at;
  }
  return -1;
}

/**
 * This function reads the entries of the ZIP archive in `bytes`. It gives each file in the order of the central
 * directory. It does not give the entries of folders: a name that ends with `/` and has no bytes.
 *
 * A name with the UTF-8 flag is read as UTF-8. Another name is read as Latin-1, not as code page 437. The two are the
 * same for ASCII. The time comes from the extended timestamp field when the entry has one. Otherwise the function reads
 * the DOS time of the entry as UTC, because a DOS time has no time zone.
 */
export function readZipEntries(bytes: Uint8Array, limits: ArchiveLimits = {}): ArchiveResult {
  const entryLimit = limits.entryBytes ?? DEFAULT_ARCHIVE_LIMITS.entryBytes;
  const totalLimit = limits.totalBytes ?? DEFAULT_ARCHIVE_LIMITS.totalBytes;
  const countLimit = limits.entries ?? DEFAULT_ARCHIVE_LIMITS.entries;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < END_SIZE) return fail("not-zip", "The bytes are shorter than the end record of a ZIP archive.");
  const end = findEnd(view);
  if (end < 0) return fail("not-zip", "The bytes have no end record of a ZIP archive.");
  if (end >= ZIP64_LOCATOR_SIZE && view.getUint32(end - ZIP64_LOCATOR_SIZE, true) === ZIP64_LOCATOR_SIGNATURE) {
    return fail("zip64", "The archive has a ZIP64 end record. This reader does not read ZIP64.");
  }
  const disk = view.getUint16(end + 4, true);
  const centralDisk = view.getUint16(end + 6, true);
  const diskCount = view.getUint16(end + 8, true);
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    return fail("zip64", "The end record has a field of ZIP64. This reader does not read ZIP64.");
  }
  if (disk !== 0 || centralDisk !== 0 || diskCount !== count) return fail("multi-disk", "The archive is on more than one disk.");
  if (count > countLimit) return fail("limit", `The archive has ${count} entries, more than the limit of ${countLimit}.`);
  if (centralOffset + centralSize > end) return fail("truncated", "The central directory goes past the end record.");

  const decodeUtf8 = new TextDecoder("utf-8", { fatal: false });
  const decodeLatin1 = new TextDecoder("latin1");
  const entries: ArchiveEntry[] = [];
  let total = 0;
  let at = centralOffset;
  for (let index = 0; index < count; index++) {
    if (at + CENTRAL_SIZE > end) return fail("truncated", `The central record ${index} goes past the central directory.`);
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) return fail("bad-record", `The central record ${index} has a wrong signature.`);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const time = view.getUint16(at + 12, true);
    const date = view.getUint16(at + 14, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const next = at + CENTRAL_SIZE + nameLength + extraLength + commentLength;
    if (next > end) return fail("truncated", `The central record ${index} goes past the central directory.`);
    const rawName = bytes.subarray(at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength);
    const name = ((flags & FLAG_UTF8) !== 0 ? decodeUtf8 : decodeLatin1).decode(rawName);
    const modified = extendedTime(view, at + CENTRAL_SIZE + nameLength, extraLength) ?? dosTime(date, time);
    at = next;

    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      return fail("zip64", "The entry has a field of ZIP64. This reader does not read ZIP64.", name);
    }
    if ((flags & FLAG_ENCRYPTED) !== 0) return fail("encrypted", "The entry is encrypted.", name);
    if (method !== 0 && method !== 8) return fail("method", `The entry uses the method of compression ${method}. This reader reads only 0 and 8.`, name);
    if (name.endsWith("/") && size === 0) continue;
    if (size > entryLimit) return fail("limit", `The entry has ${size} bytes, more than the limit of ${entryLimit}.`, name);
    if (total + size > totalLimit) return fail("limit", `The entries have more than the limit of ${totalLimit} bytes.`, name);
    if (method === 0 && compressedSize !== size) return fail("size", "The stored entry has two different sizes.", name);

    if (localOffset + LOCAL_SIZE > bytes.byteLength) return fail("truncated", "The local header goes past the end of the bytes.", name);
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) return fail("bad-record", "The local header has a wrong signature.", name);
    const dataStart = localOffset + LOCAL_SIZE + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > bytes.byteLength) return fail("truncated", "The data of the entry goes past the end of the bytes.", name);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);

    let content: Uint8Array;
    if (method === 0) {
      content = data.slice();
    } else {
      try {
        // One byte more than the size lets the reader see data that is too long, and it stops a zip bomb at that size.
        content = new Uint8Array(inflateRawSync(data, { maxOutputLength: size + 1 }));
      } catch (error) {
        if (error instanceof RangeError) return fail("size", `The entry inflates to more than its size of ${size} bytes.`, name);
        return fail("inflate", "The deflated data of the entry is not valid.", name);
      }
    }
    if (content.byteLength !== size) return fail("size", `The entry has ${content.byteLength} bytes, not its size of ${size} bytes.`, name);
    if (crc32(content) !== crc) return fail("crc", "The CRC-32 of the entry is not the CRC-32 of the central directory.", name);
    total += size;
    entries.push({ name, bytes: content, modified });
  }
  return { ok: true, entries };
}
