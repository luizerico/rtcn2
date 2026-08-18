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
  normalizeQuestion,
  normalizeOrganization,
  normalizeUser,
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

  it('maps diagnostic questions onto the embedded survey question schema', () => {
    const { doc, skipReason } = normalizeQuestion(
      {
        _id: { $oid: '673a63788ce4cc28bcd8c0ca' },
        area: 'GT',
        code: 'GT11',
        question: 'Has a mobility plan?',
        evidence: 'Municipal law',
        criteria: 'Max if present',
        maxPoints: 2,
        weight: 3,
        todo: 'Draft the plan',
        isDeleted: false,
      },
      OWNER
    );
    expect(skipReason).toBeUndefined();
    expect(doc.code).toBe('GT11');
    expect(doc.prompt).toBe('Has a mobility plan?');
    expect(doc.type).toBe('score');
    expect(doc.maxPoints).toBe(2);
    expect(doc.weight).toBe(3);
  });

  it('maps organization contact fields and skips deleted rows', () => {
    const { doc, skipReason } = normalizeOrganization({
      _id: { $oid: '6a033bdc87a6ba030bccf198' },
      name: 'SEBRAE MS',
      description: 'Contatos: Vitor',
      website: 'https://ms.loja.sebrae.com.br/',
      email: 'vitor.faria@ms.sebrae.com.br',
      phone: '67 9188-9119',
      isDeleted: false,
    });
    expect(skipReason).toBeUndefined();
    expect(doc.name).toBe('SEBRAE MS');
    expect(doc.email).toBe('vitor.faria@ms.sebrae.com.br');
    expect(doc.deletedAt).toBeNull();

    expect(
      normalizeOrganization({
        _id: { $oid: '69bc395c54bd4876f38cba06' },
        name: 'SEBRAE MT',
        isDeleted: true,
      }).skipReason
    ).toBe('deleted in source');
  });

  it('maps dump users onto the current User schema', () => {
    const orgId = '6a033bdc87a6ba030bccf198';
    const hash = '$2a$12$WUjTtkVbcGlQ3OU36mNYTuk4sUlbdLNHXBu85.TbdZhkwq5D5jYui';
    const { doc, skipReason, unsetGoogleId } = normalizeUser(
      {
        _id: { $oid: '66fb10a147cf43795d325466' },
        name: 'pesquisador01',
        email: 'pesquisador01@rtcn.com.br',
        password: hash,
        googleId: '000000',
        isAdmin: true,
        roles: ['admin', 'researcher'],
        isEnabled: true,
        organization: { $oid: orgId },
        lastLogin: { $date: '2026-07-23T13:35:31.721Z' },
        isDeleted: false,
      },
      new Set([orgId])
    );
    expect(skipReason).toBeUndefined();
    expect(doc.username).toBe('pesquisador01');
    expect(doc.password).toBe(hash);
    expect(doc.googleId).toBeUndefined();
    expect(unsetGoogleId).toBe(true);
    expect(doc.isAdmin).toBeUndefined();
    expect(doc.roles).toBeUndefined();
    expect(doc.isVerified).toBe(true);
    expect(doc.isEnabled).toBe(true);
    expect(String(doc.organization)).toBe(orgId);
    expect(doc.lastLoginAt.toISOString()).toBe('2026-07-23T13:35:31.721Z');
  });

  it('clears dump organization when the org was not imported', () => {
    const hash = '$2a$12$WUjTtkVbcGlQ3OU36mNYTuk4sUlbdLNHXBu85.TbdZhkwq5D5jYui';
    const { doc } = normalizeUser(
      {
        _id: { $oid: '66fb10a147cf43795d325466' },
        name: 'alice',
        email: 'alice@example.com',
        password: hash,
        organization: { $oid: '6977ab0ddd63873fae2ad0be' },
        isDeleted: false,
      },
      new Set()
    );
    expect(doc.organization).toBeNull();
  });
});
