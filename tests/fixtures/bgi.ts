/** Uncompressed BGI archive with extensionless BW-wrapped OGG entries. */
export function bwFixture(audio: Buffer, duration = 30, sampleRate = 44100): Buffer {
  const header = Buffer.alloc(64);
  header.writeUInt32LE(header.length, 0);
  header.write('bw  ', 4);
  header.writeUInt32LE(audio.length, 8);
  header.writeUInt32LE(Math.round(duration * sampleRate), 12);
  header.writeUInt32LE(sampleRate, 16);
  header.writeUInt32LE(2, 20);
  return Buffer.concat([header, audio]);
}

export function bgiFixture(entries: Array<{ name: string; data: Buffer }>, legacy = false): Buffer {
  const header = Buffer.alloc(16);
  header.write(legacy ? 'PackFile    ' : 'BURIKO ARC20');
  header.writeUInt32LE(entries.length, 12);
  const recordSize = legacy ? 32 : 128;
  const nameSize = legacy ? 16 : 96;
  const index = Buffer.alloc(recordSize * entries.length);
  let offset = 0;
  entries.forEach(({ name, data }, i) => {
    index.write(name, i * recordSize, nameSize, 'utf8');
    index.writeUInt32LE(offset, i * recordSize + nameSize);
    index.writeUInt32LE(data.length, i * recordSize + nameSize + 4);
    offset += data.length;
  });
  return Buffer.concat([header, index, ...entries.map(({ data }) => data)]);
}
