const SOURCE_IDS = [
  'malhas',
  'pib',
  'pam',
  'ppm',
  'cempre',
  'pia',
  'munic',
  's2id',
  'siconfi',
  'transfers',
  'emendas',
];

const SOURCE_CATALOG = [
  {
    id: 'malhas',
    label: 'Map cache',
    kind: 'malhas',
    description: 'IBGE municipality, state, and region boundaries.',
  },
  {
    id: 'pib',
    label: 'PIB / VAB',
    kind: 'sidra',
    description: 'GDP and sector value added (agro, industry, services).',
    aggregateId: 5938,
    niveis: ['N2', 'N3', 'N6'],
    maxYears: 5,
    variables: [
      { id: '37', series: 'gdp' },
      { id: '498', series: 'vab_total' },
      { id: '513', series: 'vab_agro' },
      { id: '517', series: 'vab_industry' },
      { id: '6575', series: 'vab_services' },
      { id: '525', series: 'vab_admin' },
    ],
  },
  {
    id: 'pam',
    label: 'PAM (agriculture)',
    kind: 'sidra',
    description: 'Municipal agricultural production (area, quantity, value).',
    aggregateId: 5457,
    niveis: ['N2', 'N3', 'N6'],
    maxYears: 5,
    variables: [
      { id: '215', series: 'crop_value' },
      { id: '216', series: 'crop_area' },
      { id: '214', series: 'crop_qty' },
    ],
    classificacao: '782[0]',
    cropClassificacao: '782[40124,40122,40106,40139,40119,40112]',
  },
  {
    id: 'ppm',
    label: 'PPM (livestock)',
    kind: 'sidra',
    description: 'Herd counts (cattle, swine, poultry, sheep).',
    aggregateId: 3939,
    niveis: ['N2', 'N3', 'N6'],
    maxYears: 5,
    variables: [{ id: '105', series: 'herd' }],
    classificacao: '79[2670,32794,32796,2677]',
  },
  {
    id: 'cempre',
    label: 'CEMPRE (local units)',
    kind: 'sidra',
    description: 'Local units and occupied personnel from the central business register.',
    aggregateId: 9509,
    niveis: ['N2', 'N3', 'N6'],
    maxYears: 5,
    variables: [
      { id: '706', series: 'local_units' },
      { id: '367', series: 'enterprises' },
      { id: '707', series: 'occupied' },
    ],
  },
  {
    id: 'pia',
    label: 'PIA (industry)',
    kind: 'sidra',
    description: 'Annual industrial survey (state level; extractive and manufacturing).',
    aggregateId: 1849,
    niveis: ['N3'],
    maxYears: 5,
    variables: [
      { id: '706', series: 'local_units' },
      { id: '631', series: 'occupied' },
      { id: '811', series: 'industry_transform' },
    ],
    classificacao: '12762[117897,116880,116910]',
  },
  {
    id: 'munic',
    label: 'MUNIC (disaster survey)',
    kind: 'sidra',
    description: 'IBGE municipal survey flags for floods, flash floods, and landslides.',
    aggregateId: 8536,
    niveis: ['N2', 'N3', 'N6'],
    maxYears: 5,
    collapseDuplicates: 'sum',
    variables: [
      { id: '12443', series: 'flood' },
      { id: '12444', series: 'flash_flood' },
      { id: '12445', series: 'landslide' },
    ],
    // 1210 has no Total; omitting it makes SIDRA return "..". Pin disaster years and other Totals.
    classificacao: '12446[47692]|1210[50868,50869,50870,50871]|1211[50872]|1212[50880]|1213[50888]',
  },
  {
    id: 's2id',
    label: 'S2ID (recent disasters)',
    kind: 's2id',
    description: 'Federal disaster records (emergency / calamity recognition).',
  },
  {
    id: 'siconfi',
    label: 'SICONFI (accounts)',
    kind: 'siconfi',
    description: 'Municipal and state annual revenues, transfers, and expenses (STN DCA).',
    maxYears: 5,
  },
  {
    id: 'transfers',
    label: 'Constitutional transfers',
    kind: 'transfers',
    description: 'Union transfers to states and municipalities (FPM, FPE, FUNDEB, ITR).',
    maxYears: 5,
  },
  {
    id: 'emendas',
    label: 'Parliamentary amendments',
    kind: 'emendas',
    description: 'Federal budget amendments (emendas) by locality, author, purpose, and target.',
    maxYears: 5,
  },
];

function getSource(id) {
  return SOURCE_CATALOG.find((item) => item.id === id) || null;
}

module.exports = {
  SOURCE_IDS,
  SOURCE_CATALOG,
  getSource,
};
