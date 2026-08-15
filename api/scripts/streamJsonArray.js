const fs = require('fs');

/**
 * Stream a top-level JSON array and invoke `onObject` for each object element.
 * Avoids parsing the entire file into memory.
 * @param {string} filePath
 * @param {(obj: object) => Promise<void>|void} onObject
 * @param {{ highWaterMark?: number }} [options]
 */
async function forEachJsonArrayObject(filePath, onObject, options = {}) {
  const highWaterMark = options.highWaterMark || 1024 * 1024;
  const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark });
  let buf = '';
  let inString = false;
  let escape = false;
  let depth = 0;
  let objStart = -1;

  async function consume(chunk) {
    // Only scan newly appended bytes. Re-walking the buffer would re-count `{`
    // when an object spans chunks and silently drop the rest of the file.
    const startScan = buf.length;
    buf += chunk;
    for (let i = startScan; i < buf.length; i += 1) {
      const ch = buf[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') {
        if (depth === 0) objStart = i;
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0 && objStart >= 0) {
          const raw = buf.slice(objStart, i + 1);
          const obj = JSON.parse(raw);
          await onObject(obj);
          buf = buf.slice(i + 1);
          i = -1;
          objStart = -1;
        }
      }
    }
    if (objStart > 0) {
      buf = buf.slice(objStart);
      objStart = 0;
    }
  }

  for await (const chunk of stream) {
    await consume(chunk);
  }
}

module.exports = { forEachJsonArrayObject };
