const REGION_LETTER_TO_IBGE_ID = {
  N: '1',
  NE: '2',
  SE: '3',
  S: '4',
  CO: '5',
};

const IBGE_ID_TO_REGION_LETTER = {
  1: 'N',
  2: 'NE',
  3: 'SE',
  4: 'S',
  5: 'CO',
};

const UF_TO_IBGE_ID = {
  RO: '11',
  AC: '12',
  AM: '13',
  RR: '14',
  PA: '15',
  AP: '16',
  TO: '17',
  MA: '21',
  PI: '22',
  CE: '23',
  RN: '24',
  PB: '25',
  PE: '26',
  AL: '27',
  SE: '28',
  BA: '29',
  MG: '31',
  ES: '32',
  RJ: '33',
  SP: '35',
  PR: '41',
  SC: '42',
  RS: '43',
  MS: '50',
  MT: '51',
  GO: '52',
  DF: '53',
};

const IBGE_ID_TO_UF = Object.fromEntries(
  Object.entries(UF_TO_IBGE_ID).map(([uf, id]) => [id, uf])
);

const NIVEL_TO_KIND = {
  N2: 'region',
  N3: 'state',
  N6: 'county',
};

function nivelToKind(nivelId) {
  return NIVEL_TO_KIND[String(nivelId || '').toUpperCase()] || null;
}

function normalizeMunicipioIbgeId(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 7) return digits.slice(0, 7);
  return digits.padStart(7, '0');
}

module.exports = {
  REGION_LETTER_TO_IBGE_ID,
  IBGE_ID_TO_REGION_LETTER,
  UF_TO_IBGE_ID,
  IBGE_ID_TO_UF,
  NIVEL_TO_KIND,
  nivelToKind,
  normalizeMunicipioIbgeId,
};
