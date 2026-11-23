import { deflateRawSync } from "node:zlib";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ARCHIVE_ERROR_KINDS, crc32, readZipEntries, type ArchiveResult } from "./archive.ts";

/** One file for the test writer. */
interface TestFile {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** The method: 0 (stored) or 8 (deflate), or another number for a test of an unknown method. */
  readonly method?: number;
  readonly flags?: number;
  /** A size for the central directory that is not the real size. */
  readonly declaredSize?: number;
  readonly crc?: number;
  readonly dosDate?: number;
  readonly dosTime?: number;
  /** The seconds since the epoch of an extended timestamp field. */
  readonly unixTime?: number;
}

const utf8 = new TextEncoder();

/** This function writes a ZIP archive of `files`, with an archive comment. It is the reference of the round trip. */
function writeZip(files: readonly TestFile[], comment = ""): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const method = file.method ?? 8;
    const name = utf8.encode(file.name);
    const data = method === 8 ? new Uint8Array(deflateRawSync(file.bytes)) : file.bytes;
    const crc = file.crc ?? crc32(file.bytes);
    const size = file.declaredSize ?? file.bytes.byteLength;
    const flags = file.flags ?? 0x0800;
    const extra = new Uint8Array(file.unixTime === undefined ? 0 : 9);
    if (file.unixTime !== undefined) {
      const e = new DataView(extra.buffer);
      e.setUint16(0, 0x5455, true);
      e.setUint16(2, 5, true);
      e.setUint8(4, 1);
      e.setUint32(5, file.unixTime, true);
    }
    const local = new Uint8Array(30 + name.length + data.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, flags, true);
    l.setUint16(8, method, true);
    l.setUint16(10, file.dosTime ?? 0, true);
    l.setUint16(12, file.dosDate ?? 0x21, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, size, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length + extra.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, flags, true);
    c.setUint16(10, method, true);
    c.setUint16(12, file.dosTime ?? 0, true);
    c.setUint16(14, file.dosDate ?? 0x21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    c.setUint16(30, extra.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    central.set(extra, 46 + name.length);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const commentBytes = utf8.encode(comment);
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22 + commentBytes.length);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  e.setUint16(20, commentBytes.length, true);
  end.set(commentBytes, 22);
  return concat([...locals, ...centrals, end]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function errorKind(result: ArchiveResult): string {
  return result.ok ? "ok" : result.error.kind;
}

const text = (value: string): Uint8Array => utf8.encode(value);

describe("crc32", () => {
  it("gives the check value of the standard", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("readZipEntries", () => {
  const files = fc.uniqueArray(
    fc.record({
      name: fc.stringMatching(/^[a-z0-9_.é中-]{1,12}(\/[a-z0-9_.-]{1,8}){0,2}$/),
      bytes: fc.oneof(fc.uint8Array({ maxLength: 2000 }), fc.string({ maxLength: 500 }).map(text)),
      method: fc.constantFrom(0, 8),
    }),
    { selector: (file) => file.name, maxLength: 8 },
  );

  it("reads back each archive that the reference writer makes", () => {
    fc.assert(
      fc.property(files, fc.string({ maxLength: 40 }), (input, comment) => {
        const result = readZipEntries(writeZip(input, comment));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.entries.map((entry) => entry.name)).toEqual(input.map((file) => file.name));
        result.entries.forEach((entry, index) => expect(Buffer.from(entry.bytes).equals(Buffer.from(input[index]!.bytes))).toBe(true));
      }),
    );
  });

  it("never throws, and gives a known kind of error, for each prefix and each changed byte", () => {
    fc.assert(
      fc.property(files, fc.nat(), fc.nat(), fc.integer({ min: 1, max: 255 }), (input, cut, at, xor) => {
        const archive = writeZip(input);
        const prefix = archive.subarray(0, cut % archive.length);
        const prefixResult = readZipEntries(prefix);
        expect(prefixResult.ok).toBe(false);
        const changed = archive.slice();
        changed[at % changed.length]! ^= xor;
        const changedResult = readZipEntries(changed);
        if (!changedResult.ok) expect(ARCHIVE_ERROR_KINDS).toContain(changedResult.error.kind);
      }),
    );
  });

  it("never throws on random bytes", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
      expect(readZipEntries(bytes).ok).toBe(false);
    }));
  });

  it("reads an archive that is a view into a larger buffer", () => {
    const archive = writeZip([{ name: "a.txt", bytes: text("abc") }]);
    const larger = new Uint8Array(archive.length + 10);
    larger.set(archive, 5);
    const result = readZipEntries(larger.subarray(5, 5 + archive.length));
    expect(result.ok && new TextDecoder().decode(result.entries[0]!.bytes)).toBe("abc");
  });

  it("does not give folder entries", () => {
    const result = readZipEntries(writeZip([{ name: "dir/", bytes: new Uint8Array(0), method: 0 }, { name: "dir/a", bytes: text("x") }]));
    expect(result.ok && result.entries.map((entry) => entry.name)).toEqual(["dir/a"]);
  });

  it("reads the time from the extended timestamp, or else the DOS time as UTC", () => {
    const dosDate = ((2026 - 1980) << 9) | (11 << 5) | 23;
    const dosTime = (20 << 11) | (15 << 5) | (30 / 2);
    const result = readZipEntries(
      writeZip([
        { name: "unix", bytes: text("1"), unixTime: 1_763_928_000, dosDate, dosTime },
        { name: "dos", bytes: text("2"), dosDate, dosTime },
        { name: "none", bytes: text("3"), dosDate: 0, dosTime: 0 },
      ]),
    );
    expect(result.ok && result.entries.map((entry) => entry.modified?.toISOString() ?? null)).toEqual([
      new Date(1_763_928_000_000).toISOString(),
      "2026-11-23T20:15:30.000Z",
      null,
    ]);
  });

  it("reads a name with no UTF-8 flag as Latin-1", () => {
    const archive = writeZip([{ name: "café", bytes: text("x"), flags: 0 }]);
    const result = readZipEntries(archive);
    // The writer gives the UTF-8 bytes of the name, so a Latin-1 read gives two characters for the é.
    expect(result.ok && result.entries[0]!.name).toBe("cafÃ©");
  });

  it("gives a typed error for each refused archive", () => {
    const one = (file: Partial<TestFile>): string => errorKind(readZipEntries(writeZip([{ name: "a", bytes: text("hello"), ...file }])));
    expect(one({ flags: 0x0801 })).toBe("encrypted");
    expect(one({ method: 12 })).toBe("method");
    expect(one({ crc: 1 })).toBe("crc");
    expect(one({ declaredSize: 3 })).toBe("size");
    expect(one({ declaredSize: 9 })).toBe("size");
    expect(one({ method: 0, declaredSize: 9 })).toBe("size");
    expect(errorKind(readZipEntries(text("not an archive at all, and longer than 22 bytes")))).toBe("not-zip");
  });

  it("stops a zip bomb at the size of its central record, and at each limit", () => {
    const big = new Uint8Array(10_000_000);
    const bomb = writeZip([{ name: "bomb", bytes: big, declaredSize: 1000, crc: crc32(big.subarray(0, 1000)) }]);
    expect(bomb.length).toBeLessThan(20_000);
    expect(errorKind(readZipEntries(bomb))).toBe("size");
    const two = writeZip([{ name: "a", bytes: new Uint8Array(600) }, { name: "b", bytes: new Uint8Array(600) }]);
    expect(errorKind(readZipEntries(two, { entryBytes: 500 }))).toBe("limit");
    expect(errorKind(readZipEntries(two, { totalBytes: 1000 }))).toBe("limit");
    expect(errorKind(readZipEntries(two, { entries: 1 }))).toBe("limit");
    expect(readZipEntries(two, { entryBytes: 600, totalBytes: 1200, entries: 2 }).ok).toBe(true);
  });

  it("refuses ZIP64 and archives on more than one disk", () => {
    const archive = writeZip([{ name: "a", bytes: text("x") }]);
    const end = archive.length - 22;
    const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const zip64 = archive.slice();
    view(zip64).setUint32(end + 16, 0xffffffff, true);
    expect(errorKind(readZipEntries(zip64))).toBe("zip64");
    const locator = new Uint8Array(20);
    view(locator).setUint32(0, 0x07064b50, true);
    expect(errorKind(readZipEntries(concat([archive.subarray(0, end), locator, archive.subarray(end)])))).toBe("zip64");
    const disks = archive.slice();
    view(disks).setUint16(end + 4, 1, true);
    expect(errorKind(readZipEntries(disks))).toBe("multi-disk");
  });
});
