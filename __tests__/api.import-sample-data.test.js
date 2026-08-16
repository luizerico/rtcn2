/**
 * @jest-environment node
 */

const mongoose = require('mongoose');
const {
  unwrapOid,
  unwrapDate,
  normalizeSponsor,
  normalizeOpportunity,
  normalizeProject,
} = require('../api/scripts/import-sample-data');

const OWNER = new mongoose.Types.ObjectId('66fb10a147cf43795d325466');
const SPONSOR_ID = new mongoose.Types.ObjectId('68f4157468e9288043baf185');
const OPP_ID = new mongoose.Types.ObjectId('68fe6d0768e9288043baf2a7');

describe('import-sample-data mapping', () => {
  const previousDeleted = process.env.IMPORT_DELETED;

  afterEach(() => {
    if (previousDeleted === undefined) delete process.env.IMPORT_DELETED;
    else process.env.IMPORT_DELETED = previousDeleted;
  });

  it('unwraps Extended JSON ObjectId and Date', () => {
    expect(String(unwrapOid({ $oid: String(OWNER) }))).toBe(String(OWNER));
    expect(unwrapDate({ $date: '2025-10-18T22:32:20.370Z' }).toISOString()).toBe(
      '2025-10-18T22:32:20.370Z'
    );
  });

  it('maps sponsor orgName to asset name and fills kind', () => {
    const { doc, skipReason } = normalizeSponsor(
      {
        _id: { $oid: String(SPONSOR_ID) },
        orgName: 'Nestlé Brasil Ltda',
        orgEmail: 'falecom@nestle.com.br',
        origem: 'emp_com_fins_lucrativos',
        contact: 'Desk',
        phone: '1155084400',
        createdBy: { $oid: String(OWNER) },
        isDeleted: false,
      },
      OWNER
    );
    expect(skipReason).toBeUndefined();
    expect(doc.name).toBe('Nestlé Brasil Ltda');
    expect(doc.kind).toBe('SPONSOR');
    expect(doc.assetType).toBe('Sponsor');
    expect(doc.orgEmail).toBe('falecom@nestle.com.br');
    expect(String(doc.ownerId)).toBe(String(OWNER));
  });

  it('skips deleted source rows unless IMPORT_DELETED is set', () => {
    const raw = {
      _id: { $oid: String(SPONSOR_ID) },
      orgName: 'Gone',
      orgEmail: 'gone@example.com',
      origem: 'org_internacional',
      contact: 'x',
      phone: '1',
      isDeleted: true,
    };
    expect(normalizeSponsor(raw, OWNER).skipReason).toBe('deleted in source');
    process.env.IMPORT_DELETED = '1';
    expect(normalizeSponsor(raw, OWNER).doc.name).toBe('Gone');
  });

  it('maps opportunity and requires a known sponsor', () => {
    const raw = {
      _id: { $oid: String(OPP_ID) },
      name: 'Climate call',
      description: 'Window',
      sponsor: { $oid: String(SPONSOR_ID) },
      type: 'financial',
      category: 'call',
      eligibility: 'municipal_public_administration',
      website: 'https://example.org',
      submissionMethod: 'Online',
      startDate: { $date: '2026-01-01T00:00:00.000Z' },
      budget: 1000,
      isDeleted: false,
    };
    const missing = normalizeOpportunity(raw, OWNER, new Set());
    expect(missing.skipReason).toBe('sponsor not imported');

    const ok = normalizeOpportunity(raw, OWNER, new Set([String(SPONSOR_ID)]));
    expect(ok.doc.kind).toBe('OPPORTUNITY');
    expect(ok.doc.continuous).toBe(false);
    expect(String(ok.doc.sponsor)).toBe(String(SPONSOR_ID));
  });

  it('maps project projName/projDescription onto asset fields', () => {
    const { doc, skipReason } = normalizeProject(
      {
        _id: { $oid: '68fd6521ead7b22434a59678' },
        projName: 'River basin',
        projDescription: 'Phase 1',
        projWebsite: 'https://example.org/p',
        projStartDate: { $date: '2026-03-01T00:00:00.000Z' },
        projBudget: 25000,
        projStatus: 'in-progress',
        opportunity: { $oid: String(OPP_ID) },
        relatedEntity: {
          entityType: 'county',
          entityId: [{ $oid: '6760694c325518ff8dc0a8d1' }],
        },
        isDeleted: false,
      },
      OWNER
    );
    expect(skipReason).toBeUndefined();
    expect(doc.name).toBe('River basin');
    expect(doc.description).toBe('Phase 1');
    expect(doc.kind).toBe('PROJECT');
    expect(doc.relatedEntity.entityType).toBe('county');
    expect(doc.relatedEntity.entityId).toHaveLength(1);
  });
});
