/**
 * @jest-environment node
 */

const { inspectUpload, sniffKind, assertAllowedUploadMeta } = require('../api/services/fileTypes');
const {
  pdfBuffer,
  pngBuffer,
  jpegBuffer,
  svgBuffer,
  exeBuffer,
  docxBuffer,
} = require('./helpers/fileFixtures');

describe('file type allow-list', () => {
  it('accepts PDF, DOCX, and images', () => {
    expect(inspectUpload({ originalName: 'a.pdf', mimeType: 'application/pdf', buffer: pdfBuffer() }).kind).toBe(
      'pdf'
    );
    expect(inspectUpload({ originalName: 'a.png', mimeType: 'image/png', buffer: pngBuffer() }).kind).toBe('png');
    expect(inspectUpload({ originalName: 'a.jpg', mimeType: 'image/jpeg', buffer: jpegBuffer() }).kind).toBe(
      'jpeg'
    );
    expect(
      inspectUpload({
        originalName: 'a.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: docxBuffer(),
      }).kind
    ).toBe('docx');
  });

  it('rejects exe and svg by extension', () => {
    expect(() => assertAllowedUploadMeta('payload.exe', 'application/octet-stream')).toThrow(/PDF, DOCX/);
    expect(() => assertAllowedUploadMeta('icon.svg', 'image/svg+xml')).toThrow(/PDF, DOCX/);
  });

  it('rejects mismatched content vs extension', () => {
    expect(() =>
      inspectUpload({ originalName: 'photo.png', mimeType: 'image/png', buffer: pdfBuffer() })
    ).toThrow(/does not match/);
    expect(() =>
      inspectUpload({ originalName: 'notes.pdf', mimeType: 'application/pdf', buffer: exeBuffer() })
    ).toThrow(/not a supported/);
    expect(sniffKind(svgBuffer())).toBeNull();
  });
});
