/**
 * @jest-environment node
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { forEachJsonArrayObject } = require('../api/scripts/streamJsonArray');

describe('forEachJsonArrayObject', () => {
  let tmp;

  afterEach(() => {
    if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
    tmp = undefined;
  });

  function writeTemp(contents) {
    tmp = path.join(os.tmpdir(), `stream-json-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(tmp, contents);
    return tmp;
  }

  it('imports every object when records span tiny read chunks', async () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      _id: { $oid: String(index).padStart(24, '0') },
      name: `County ${index}`,
      note: 'braces { } and quotes \\"inside\\"',
      emissions: [{ sector: 'energy', value: index, year: 2020 }],
    }));
    writeTemp(JSON.stringify(items, null, 2));

    const names = [];
    await forEachJsonArrayObject(
      tmp,
      (obj) => {
        names.push(obj.name);
      },
      { highWaterMark: 32 }
    );

    expect(names).toEqual(items.map((item) => item.name));
  });
});
