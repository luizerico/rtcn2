const mongoose = require('mongoose');
const { ValidationError, nonEmptyString, oneOf, objectId, booleanFlag } = require('../validation');
const {
  SPONSOR_ORIGEM,
  OPPORTUNITY_TYPE,
  OPPORTUNITY_CATEGORY,
  OPPORTUNITY_ELIGIBILITY,
  RELATED_ENTITY_TYPES,
  DEFAULT_CURRENCY,
} = require('../constants/fundingTypes');
const Sponsor = require('../models/assets/Sponsor');
const Opportunity = require('../models/assets/Opportunity');
const { County, State, Biome, Region, MicroRegion } = require('../models/geo');

const GEO_MODELS = {
  county: County,
  state: State,
  biome: Biome,
  region: Region,
  microregion: MicroRegion,
};

function optionalString(value, label, { maxLength = 500 } = {}) {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  if (str.length > maxLength) {
    throw new ValidationError(`${label} must be at most ${maxLength} characters.`);
  }
  return str;
}

function requiredString(value, label, { maxLength = 200 } = {}) {
  return nonEmptyString(value, label, { maxLength });
}

function parseOptionalObjectId(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object' && value._id) {
    return objectId(value._id, label);
  }
  return objectId(value, label);
}

function parseObjectIdArray(value, label) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) {
    throw new ValidationError(`${label} must be an array.`);
  }
  return value
    .filter((item) => item !== undefined && item !== null && item !== '')
    .map((item, index) => objectId(typeof item === 'object' && item._id ? item._id : item, `${label}[${index}]`));
}

function parseStringArray(value, label, { maxLength = 500 } = {}) {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) {
    throw new ValidationError(`${label} must be an array of strings.`);
  }
  return value.map((item, index) => {
    const str = String(item ?? '').trim();
    if (str.length > maxLength) {
      throw new ValidationError(`${label}[${index}] must be at most ${maxLength} characters.`);
    }
    return str;
  }).filter(Boolean);
}

function parseDate(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${label} is required.`);
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Invalid ${label}.`);
  }
  return date;
}

function parseNumber(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${label} is required.`);
    return null;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    throw new ValidationError(`${label} must be a number.`);
  }
  return num;
}

function assertDateOrder(start, end, startLabel, endLabel) {
  if (start && end && end.getTime() < start.getTime()) {
    throw new ValidationError(`${endLabel} must be on or after ${startLabel}.`);
  }
}

function pickDefined(entries) {
  const out = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

async function parseSponsorBody(body = {}, { partial = false } = {}) {
  const nameSource = body.name ?? body.orgName;
  const data = {};

  if (!partial || nameSource !== undefined) {
    data.name = requiredString(nameSource, 'Name');
  }
  if (!partial || body.description !== undefined) {
    data.description = body.description == null ? '' : String(body.description);
  }
  if (!partial || body.orgEmail !== undefined) {
    data.orgEmail = requiredString(body.orgEmail, 'Organization email', { maxLength: 200 });
  }
  if (!partial || body.origem !== undefined) {
    data.origem = oneOf(body.origem, SPONSOR_ORIGEM, 'origem');
  }
  if (!partial || body.contact !== undefined) {
    data.contact = requiredString(body.contact, 'Contact');
  }
  if (!partial || body.phone !== undefined) {
    data.phone = requiredString(body.phone, 'Phone', { maxLength: 64 });
  }

  const optionals = [
    ['orgUnit', 200],
    ['webpage', 500],
    ['email', 200],
    ['socialMedia', 500],
    ['address', 500],
    ['city', 120],
    ['state', 120],
    ['zipCode', 32],
    ['country', 120],
    ['obs', 2000],
  ];
  for (const [field, maxLength] of optionals) {
    if (!partial || body[field] !== undefined) {
      data[field] = optionalString(body[field] ?? '', field, { maxLength }) || '';
    }
  }

  return pickDefined(data);
}

async function parseOpportunityBody(body = {}, { partial = false } = {}) {
  const data = {};

  if (!partial || body.name !== undefined) {
    data.name = requiredString(body.name, 'Name');
  }
  if (!partial || body.description !== undefined) {
    data.description = requiredString(body.description, 'Description', { maxLength: 8000 });
  }
  if (!partial || body.sponsor !== undefined) {
    const sponsorId = parseOptionalObjectId(body.sponsor, 'Sponsor');
    if (!sponsorId) throw new ValidationError('Sponsor is required.');
    const sponsor = await Sponsor.findById(sponsorId).select('_id');
    if (!sponsor) throw new ValidationError('Sponsor not found.');
    data.sponsor = sponsorId;
  }
  if (!partial || body.type !== undefined) {
    data.type = oneOf(body.type, OPPORTUNITY_TYPE, 'type');
  }
  if (!partial || body.category !== undefined) {
    data.category = oneOf(body.category, OPPORTUNITY_CATEGORY, 'category');
  }
  if (!partial || body.eligibility !== undefined) {
    data.eligibility = oneOf(body.eligibility, OPPORTUNITY_ELIGIBILITY, 'eligibility');
  }
  if (!partial || body.website !== undefined) {
    data.website = requiredString(body.website, 'Website', { maxLength: 500 });
  }
  if (!partial || body.submissionMethod !== undefined) {
    data.submissionMethod = requiredString(body.submissionMethod, 'Submission method', {
      maxLength: 500,
    });
  }

  const startDate =
    !partial || body.startDate !== undefined
      ? parseDate(body.startDate, 'Start date', { required: !partial })
      : undefined;
  if (startDate !== undefined) data.startDate = startDate;

  const continuous =
    !partial || body.continuous !== undefined
      ? booleanFlag(body.continuous, { defaultValue: false })
      : undefined;
  if (continuous !== undefined) data.continuous = continuous;

  if (!partial || body.endDate !== undefined) {
    data.endDate = parseDate(body.endDate, 'End date');
  }

  const startForOrder = data.startDate;
  const endForOrder = data.endDate;
  if (startForOrder && endForOrder) {
    assertDateOrder(startForOrder, endForOrder, 'start date', 'end date');
  }

  if (!partial || body.budget !== undefined) {
    data.budget = parseNumber(body.budget, 'Budget', { required: true });
  }
  if (!partial || body.totalBudget !== undefined) {
    data.totalBudget = parseNumber(body.totalBudget, 'Total budget');
  }
  if (!partial || body.currency !== undefined) {
    data.currency = optionalString(body.currency, 'Currency', { maxLength: 32 }) || DEFAULT_CURRENCY;
  }
  if (!partial || body.obs !== undefined) {
    data.obs = parseStringArray(body.obs, 'obs', { maxLength: 2000 });
  }
  if (!partial || body.documents !== undefined) {
    data.documents = parseStringArray(body.documents, 'documents');
  }
  if (!partial || body.areas !== undefined) {
    data.areas = parseObjectIdArray(body.areas, 'areas');
  }

  return pickDefined(data);
}

async function parseRelatedEntity(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return { entityId: [] };

  const entityTypeRaw = value.entityType;
  if (!entityTypeRaw) {
    return { entityId: [] };
  }
  const entityType = oneOf(
    String(entityTypeRaw).toLowerCase(),
    RELATED_ENTITY_TYPES,
    'related entity type'
  );
  const entityId = parseObjectIdArray(value.entityId, 'related entity id');
  if (entityId.length) {
    const GeoModel = GEO_MODELS[entityType];
    const found = await GeoModel.find({ _id: { $in: entityId } }).select('_id').lean();
    if (found.length !== entityId.length) {
      throw new ValidationError('One or more related geography records were not found.');
    }
  }
  return { entityType, entityId };
}

async function parseProjectBody(body = {}, { partial = false } = {}) {
  const data = {};
  const nameSource = body.name ?? body.projName;
  const descriptionSource = body.description ?? body.projDescription;

  if (!partial || nameSource !== undefined) {
    data.name = requiredString(nameSource, 'Name');
  }
  if (!partial || descriptionSource !== undefined) {
    data.description = requiredString(descriptionSource, 'Description', { maxLength: 8000 });
  }
  if (!partial || body.opportunity !== undefined) {
    const opportunityId = parseOptionalObjectId(body.opportunity, 'Opportunity');
    if (opportunityId) {
      const opportunity = await Opportunity.findById(opportunityId).select('_id');
      if (!opportunity) throw new ValidationError('Opportunity not found.');
    }
    data.opportunity = opportunityId;
  }
  if (!partial || body.relatedEntity !== undefined) {
    data.relatedEntity = await parseRelatedEntity(body.relatedEntity);
  }
  if (!partial || body.projWebsite !== undefined) {
    data.projWebsite = requiredString(body.projWebsite, 'Website', { maxLength: 500 });
  }

  const startDate =
    !partial || body.projStartDate !== undefined
      ? parseDate(body.projStartDate, 'Start date', { required: !partial })
      : undefined;
  if (startDate !== undefined) data.projStartDate = startDate;

  if (!partial || body.projEndDate !== undefined) {
    data.projEndDate = parseDate(body.projEndDate, 'End date');
  }
  if (data.projStartDate && data.projEndDate) {
    assertDateOrder(data.projStartDate, data.projEndDate, 'start date', 'end date');
  }

  if (!partial || body.projBudget !== undefined) {
    data.projBudget = parseNumber(body.projBudget, 'Budget', { required: true });
  }
  if (!partial || body.currency !== undefined) {
    data.currency = optionalString(body.currency, 'Currency', { maxLength: 32 }) || DEFAULT_CURRENCY;
  }
  if (!partial || body.projStatus !== undefined) {
    data.projStatus = requiredString(body.projStatus, 'Status', { maxLength: 64 });
  }
  if (!partial || body.projComments !== undefined) {
    data.projComments = parseStringArray(body.projComments, 'comments', { maxLength: 2000 });
  }
  if (!partial || body.projDocuments !== undefined) {
    data.projDocuments = parseStringArray(body.projDocuments, 'documents');
  }
  if (!partial || body.obs !== undefined) {
    data.obs = optionalString(body.obs ?? '', 'obs', { maxLength: 2000 }) || '';
  }
  if (!partial || body.areas !== undefined) {
    data.areas = parseObjectIdArray(body.areas, 'areas');
  }

  return pickDefined(data);
}

async function loadRelatedEntities(relatedEntity) {
  if (!relatedEntity?.entityType || !Array.isArray(relatedEntity.entityId) || !relatedEntity.entityId.length) {
    return [];
  }
  const GeoModel = GEO_MODELS[relatedEntity.entityType];
  if (!GeoModel) return [];
  const ids = relatedEntity.entityId
    .map((id) => (id && id._id ? id._id : id))
    .filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return [];
  return GeoModel.find({ _id: { $in: ids } }).select('code name').lean();
}

module.exports = {
  parseSponsorBody,
  parseOpportunityBody,
  parseProjectBody,
  loadRelatedEntities,
};
