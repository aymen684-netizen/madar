(function (root) {
  'use strict';
  const encoder = new TextEncoder(),
    crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
  function crc(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  async function pack(files) {
    const chunks = [],
      directory = [];
    let offset = 0,
      centralSize = 0;
    for (const f of files) {
      const name = encoder.encode(f.name),
        data = new Uint8Array(await f.blob.arrayBuffer()),
        checksum = crc(data),
        local = new Uint8Array(30 + name.length),
        l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true);
      l.setUint16(6, 0x800, true);
      l.setUint16(12, 33, true);
      l.setUint32(14, checksum, true);
      l.setUint32(18, data.length, true);
      l.setUint32(22, data.length, true);
      l.setUint16(26, name.length, true);
      local.set(name, 30);
      const central = new Uint8Array(46 + name.length),
        c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x800, true);
      c.setUint16(14, 33, true);
      c.setUint32(16, checksum, true);
      c.setUint32(20, data.length, true);
      c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.set(name, 46);
      chunks.push(local, data);
      directory.push(central);
      offset += local.length + data.length;
      centralSize += central.length;
    }
    const end = new Uint8Array(22),
      v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, files.length, true);
    v.setUint16(10, files.length, true);
    v.setUint32(12, centralSize, true);
    v.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
  }
  root.InventoryZip = { pack };
})(globalThis);
