function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (~crc) >>> 0;
}

function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.from(file.data);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    const local = Buffer.concat([localHeader, name, data]);
    locals.push(local);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += local.length;
  }

  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

function pdfBuffer() {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
}

function pngBuffer() {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
  );
}

function jpegBuffer() {
  return Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
}

function svgBuffer() {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
}

function exeBuffer() {
  return Buffer.from('MZ\x90\x00this is not an image');
}

function docxBuffer() {
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types></Types>' },
    { name: 'word/document.xml', data: '<?xml version="1.0"?><w:document></w:document>' },
  ]);
}

function xlsxBuffer() {
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types></Types>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0"?><workbook></workbook>' },
  ]);
}

function oleBuffer() {
  return Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(24),
  ]);
}

module.exports = {
  pdfBuffer,
  pngBuffer,
  jpegBuffer,
  svgBuffer,
  exeBuffer,
  docxBuffer,
  xlsxBuffer,
  oleBuffer,
};
