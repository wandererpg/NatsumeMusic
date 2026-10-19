import { deflateSync } from 'node:zlib';

/** AFA 1/2 index + DATA block, with raw names for encoding regression coverage. */
export function afaFixture(
  entries: Array<{ name: string | Buffer; data: Buffer }>,
  version = 2,
): Buffer {
  let offset = 8;
  const records = entries.map(({ name, data }) => {
    const bytes = typeof name === 'string' ? Buffer.from(name) : name;
    const record = Buffer.alloc(8 + bytes.length + (version === 1 ? 20 : 16));
    record.writeUInt32LE(bytes.length, 0);
    record.writeUInt32LE(bytes.length, 4);
    bytes.copy(record, 8);
    record.writeUInt32LE(offset, record.length - 8);
    record.writeUInt32LE(data.length, record.length - 4);
    offset += data.length;
    return record;
  });
  const index = Buffer.concat(records);
  const compressed = deflateSync(index);
  const header = Buffer.alloc(44);
  header.write('AFAH', 0);
  header.writeUInt32LE(28, 4);
  header.write('AlicArch', 8);
  header.writeUInt32LE(version, 16);
  header.writeUInt32LE(1, 20);
  header.writeUInt32LE(header.length + compressed.length, 24);
  header.write('INFO', 28);
  header.writeUInt32LE(compressed.length + 16, 32);
  header.writeUInt32LE(index.length, 36);
  header.writeUInt32LE(entries.length, 40);
  const dataHeader = Buffer.alloc(8);
  dataHeader.write('DATA');
  dataHeader.writeUInt32LE(offset, 4);
  return Buffer.concat([header, compressed, dataHeader, ...entries.map(({ data }) => data)]);
}
