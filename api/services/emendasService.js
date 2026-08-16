const zlib = require('zlib');
const { UF_TO_IBGE_ID } = require('./ibgeLocalidades');
const { noteUpstreamRequest } = require('./upstreamRequestLog');
const { runSyncStage, fetchLabel, noteSyncError, logSyncConsole } = require('./geoSyncDebug');

const EMENDAS_INDEX_URL = 'https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares';
const EMENDAS_DOCS_URL = 'https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares-documentos';
const FETCH_TIMEOUT_MS = 90_000;

function emendasError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function fetchBuffer(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  noteUpstreamRequest(url);
  return runSyncStage('fetch', fetchLabel(url), async () => {
    let upstream;
    try {
      upstream = await fetch(url, {
        headers: {
          Accept: 'text/csv, text/plain, application/zip, application/json, */*',
          'User-Agent': 'Mozilla/5.0 (compatible; RTCN-geo-sync/1.0)',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const wrapped = emendasError('Portal da Transparência emendas service is unreachable.');
      wrapped.cause = cause;
      throw wrapped;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (!upstream.ok) {
      throw emendasError('Portal da Transparência emendas service returned an error.');
    }
    return { buffer, headers: upstream.headers, url: String(upstream.url || url) };
  });
}

function decodeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) {
    return buffer.toString('utf8');
  }
  const latinHead = sample.toString('latin1');
  const utf8Head = sample.toString('utf8');
  const utf8LooksClean = latinHead.includes('Ã') && !utf8Head.includes('\uFFFD');
  return utf8LooksClean ? buffer.toString('utf8') : buffer.toString('latin1');
}

function inflateZipPayload(buffer, start, method, compressedSize, flags) {
  const useDescriptor = (flags & 0x8) !== 0;
  const unknownSize = !compressedSize || compressedSize === 0xffffffff || useDescriptor;
  const compressed = unknownSize
    ? buffer.subarray(start)
    : buffer.subarray(start, start + compressedSize);
  if (method === 0) return compressed;
  if (method === 8) return zlib.inflateRawSync(compressed);
  throw emendasError('Unsupported emendas ZIP compression.');
}

function listZipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString('utf8').replace(/\\/g, '/');
    const dataStart = offset + 30 + nameLength + extraLength;
    entries.push({ name, flags, method, compressedSize, dataStart });
    const unknownSize = !compressedSize || compressedSize === 0xffffffff || (flags & 0x8) !== 0;
    if (unknownSize) break;
    offset = dataStart + compressedSize;
  }
  return entries;
}

function zipBaseName(name) {
  return String(name || '').split('/').pop() || '';
}

function isMainEmendasName(name) {
  const base = zipBaseName(name);
  if (!/\.csv$/i.test(base)) return false;
  if (/favorecido|convenio|documento/i.test(base)) return false;
  return /^emendasparlamentares\.csv$/i.test(base);
}

function isFavorecidoEmendasName(name) {
  return /favorecido/i.test(zipBaseName(name)) && /\.csv$/i.test(name);
}

function isIgnoredEmendasName(name) {
  return /favorecido|convenio|documento/i.test(zipBaseName(name));
}

function extractZipEntry(buffer, entry) {
  if (!entry) return null;
  return inflateZipPayload(buffer, entry.dataStart, entry.method, entry.compressedSize, entry.flags);
}

function unzipNamedCsv(buffer, predicate) {
  if (buffer.length < 30 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return null;
  const entry = listZipEntries(buffer).find((item) => predicate(item.name));
  const payload = extractZipEntry(buffer, entry);
  return payload?.length ? decodeText(payload).replace(/^\uFEFF/, '') : null;
}

function looksLikeMainEmendasPayload(payload) {
  if (!payload?.length) return false;
  const head = normalizeHeader(decodeText(payload).slice(0, 500));
  return /municipio.*ibge|codigo ibge/.test(head) && /(^|[;,"\s])uf($|[;,"\s])/.test(head);
}

function unzipCsvFromBuffer(buffer) {
  if (buffer.length < 30 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return null;
  let best = null;
  let bestScore = -1;
  for (const entry of listZipEntries(buffer)) {
    if (entry.name.endsWith('/')) continue;
    if (isIgnoredEmendasName(entry.name)) continue;
    const payload = extractZipEntry(buffer, entry);
    const looksCsv = /\.(csv|txt)$/i.test(entry.name) || !/\.[a-z0-9]+$/i.test(zipBaseName(entry.name));
    if (!looksCsv || !payload?.length) continue;
    const score = (isMainEmendasName(entry.name) ? 2 : 0) + (looksLikeMainEmendasPayload(payload) ? 1 : 0);
    if (score > bestScore) {
      best = payload;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function bufferToCsv(buffer) {
  const named = unzipNamedCsv(buffer, isMainEmendasName);
  if (named) return named;
  const unzipped = unzipCsvFromBuffer(buffer);
  if (unzipped) return decodeText(unzipped).replace(/^\uFEFF/, '');
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return '';
  return decodeText(buffer).replace(/^\uFEFF/, '');
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/\uFFFD/g, '')
    .replace(/Ã./g, (pair) => {
      const repaired = {
        'Ã¡': 'a',
        'Ã©': 'e',
        'Ã­': 'i',
        'Ã³': 'o',
        'Ãº': 'u',
        'Ã£': 'a',
        'Ãµ': 'o',
        'Ã§': 'c',
        'Ã¢': 'a',
        'Ãª': 'e',
        'Ã´': 'o',
      };
      return repaired[pair] || pair;
    })
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function forEachCsvRow(text, onRow) {
  let row = [];
  let cell = '';
  let inQuotes = false;
  const input = String(text || '');
  const flush = () => {
    row.push(cell);
    if (row.some((item) => String(item).trim())) onRow(row);
    row = [];
    cell = '';
  };
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      flush();
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell || row.length) flush();
}

function parseCsv(text) {
  const rows = [];
  forEachCsvRow(text, (row) => rows.push(row));
  return rows;
}

function findColumn(headers, patterns, excludes = []) {
  for (const pattern of patterns) {
    const idx = headers.findIndex(
      (header) => pattern.test(header) && !excludes.some((exclude) => exclude.test(header))
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

function meaningful(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = normalizeHeader(text);
  if (!normalized || normalized === '-' || normalized === '-1') return '';
  if (/^sem informa/.test(normalized) || normalized === 'nao informado') return '';
  return text;
}

function normalizeCode(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseMoney(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const fallback = Number(raw.replace(',', '.'));
  const num = Number(normalized);
  const chosen = Number.isFinite(num) ? num : fallback;
  return Number.isFinite(chosen) ? chosen : null;
}

function mapAmendmentType(value) {
  const text = normalizeHeader(value);
  if (/individ/.test(text) || /\brp6\b|\brp 6\b/.test(text)) return 'individual';
  if (/bancada/.test(text)) return 'bancada';
  if (/comiss/.test(text)) return 'comissao';
  if (/relator/.test(text)) return 'relator';
  return 'other';
}

function datedFileFromHtml(html) {
  const matches = [...String(html || '').matchAll(/emendas-parlamentares\/(\d{8})/gi)];
  const dates = matches.map((item) => item[1]).sort();
  return dates[dates.length - 1] || '';
}

function yyyymmdd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function candidateFileDates(from = new Date(), days = 14) {
  const dates = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(from);
    date.setDate(date.getDate() - i);
    dates.push(yyyymmdd(date));
  }
  return dates;
}

async function headDownload(url) {
  noteUpstreamRequest(url);
  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'HEAD',
      headers: {
        Accept: 'application/zip, text/csv, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; RTCN-geo-sync/1.0)',
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, lastModified: '' };
  }
  const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
  const ok = upstream.ok && /zip|csv|octet-stream/.test(contentType);
  return {
    ok,
    lastModified: upstream.headers.get('last-modified') || '',
  };
}

async function resolveDatedFile(html) {
  const fromHtml = datedFileFromHtml(html);
  if (fromHtml) return { fileDate: fromHtml, lastModified: '' };
  for (const fileDate of candidateFileDates()) {
    const probed = await headDownload(`${EMENDAS_INDEX_URL}/${fileDate}`);
    if (probed.ok) return { fileDate, lastModified: probed.lastModified };
  }
  return { fileDate: '', lastModified: '' };
}

async function probeEmendas() {
  const resolved = await resolveDatedFile('');
  const fileDate = resolved.fileDate;
  const lastModified = resolved.lastModified || '';
  if (!fileDate) {
    throw emendasError('Portal da Transparência emendas catalog did not list a downloadable file.');
  }
  const docsYear = new Date().getFullYear();
  const docsHead = await headDownload(`${EMENDAS_DOCS_URL}/${docsYear}`);
  const docsStamp = docsHead.lastModified || (docsHead.ok ? String(docsYear) : '');
  return {
    originPeriod: String(fileDate),
    originFingerprint: `emendas:${fileDate}${lastModified ? `:${lastModified}` : ''}${docsStamp ? `:docs:${docsYear}:${docsStamp}` : ''}`,
    originUpdatedAt: lastModified ? new Date(lastModified) : null,
    csvUrl: `${EMENDAS_INDEX_URL}/${fileDate}`,
    fileDate,
    docsYear: docsHead.ok ? docsYear : null,
  };
}

const VALID_UF_IDS = new Set(Object.values(UF_TO_IBGE_ID));
const UF_NAME_TO_CODE = {
  ACRE: 'AC',
  ALAGOAS: 'AL',
  AMAPA: 'AP',
  AMAZONAS: 'AM',
  BAHIA: 'BA',
  CEARA: 'CE',
  'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES',
  GOIAS: 'GO',
  MARANHAO: 'MA',
  'MATO GROSSO': 'MT',
  'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG',
  PARA: 'PA',
  PARAIBA: 'PB',
  PARANA: 'PR',
  PERNAMBUCO: 'PE',
  PIAUI: 'PI',
  'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS',
  RONDONIA: 'RO',
  RORAIMA: 'RR',
  'SANTA CATARINA': 'SC',
  'SAO PAULO': 'SP',
  SERGIPE: 'SE',
  TOCANTINS: 'TO',
};

function parseCountyIbge(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 7) return '';
  if (!VALID_UF_IDS.has(digits.slice(0, 2))) return '';
  if (/^0+$/.test(digits)) return '';
  return digits;
}

function parseUfCode(value) {
  const token = normalizeHeader(value).toUpperCase();
  if (UF_TO_IBGE_ID[token] || VALID_UF_IDS.has(token)) return token;
  if (UF_NAME_TO_CODE[token]) return UF_NAME_TO_CODE[token];
  const digits = token.replace(/\D/g, '');
  if (digits.length >= 2 && VALID_UF_IDS.has(digits.slice(0, 2))) return digits.slice(0, 2);
  return '';
}

function ufFromLocalidade(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const marked = text.match(/[/–-]\s*([A-Za-z]{2})\s*$/);
  if (marked) return parseUfCode(marked[1]);
  return parseUfCode(text);
}

function resolveLocality(ibgeId, uf, maps, localidade = '') {
  const countyId = parseCountyIbge(ibgeId);
  if (countyId) {
    const county = maps.countyByIbge.get(countyId);
    if (county) {
      const state = maps.stateByObjectId?.get(String(county.state)) || null;
      const region = maps.regionByObjectId?.get(String(county.region)) || null;
      return {
        kind: 'county',
        subjectId: county._id,
        ibgeId: countyId,
        county: county._id,
        state: county.state || state?._id,
        region: county.region || region?._id,
      };
    }
  }

  const ufCode =
    parseUfCode(uf) || ufFromLocalidade(localidade) || (countyId ? countyId.slice(0, 2) : '');
  const ufId = UF_TO_IBGE_ID[ufCode] || (VALID_UF_IDS.has(String(ufCode)) ? String(ufCode) : '');
  if (!ufId) return null;
  const state = maps.stateByIbge.get(String(ufId));
  if (!state) return null;
  const region = maps.regionByObjectId?.get(String(state.region)) || null;
  return {
    kind: 'state',
    subjectId: state._id,
    ibgeId: String(ufId),
    county: undefined,
    state: state._id,
    region: state.region || region?._id,
  };
}

function cellAt(cells, idx) {
  if (idx < 0) return '';
  return meaningful(cells[idx]);
}

function amendmentColumns(headers) {
  return {
    code: findColumn(headers, [/codigo da emenda/, /codigo.*emenda/, /cod emenda/], [/autor/, /favorecido/]),
    year: findColumn(headers, [/^ano da emenda/, /^ano/, /exercicio/]),
    author: findColumn(headers, [/nome do autor/, /^autor/]),
    authorType: findColumn(headers, [/tipo.*autor/, /casa/]),
    type: findColumn(headers, [/^tipo de emenda$/, /tipo de emenda/, /tipo emenda/], [/codigo/]),
    functionName: findColumn(headers, [/nome funcao/, /^funcao$/, /funcao/], [/codigo/, /sub/]),
    subfunction: findColumn(headers, [/nome subfuncao/, /subfuncao/], [/codigo/]),
    expenseGroup: findColumn(headers, [/grupo despesa/, /grupo de despesa/, /^grupo$/], [/codigo/]),
    ibge: findColumn(
      headers,
      [/codigo municipio ibge/, /municipio.*ibge/, /ibge do municipio/, /codigo ibge/],
      [/autor/, /uf /]
    ),
    uf: findColumn(headers, [/^uf$/, /sigla uf/], [/ibge/, /favorecido/, /aplicacao/]),
    ufIbge: findColumn(headers, [/codigo uf ibge/, /codigo uf/], [/municipio/, /autor/]),
    municipio: findColumn(headers, [/^municipio$/, /nome municipio/, /municipio (do |de )/], [/ibge/, /favorecido/]),
    localidade: findColumn(headers, [/localidade/, /local de aplicacao/, /local do gasto/]),
    committed: findColumn(headers, [/valor empenhad/, /empenhad/, /valor da emenda/, /dotacao/]),
    paid: findColumn(headers, [/valor pago/, /^pago$/], [/restos/]),
    liquid: findColumn(headers, [/liquidad/]),
    purpose: findColumn(headers, [/elemento despesa/, /nome elemento/], [/codigo/]),
    action: findColumn(headers, [/nome acao/, /^acao$/, /acao governamental/], [/codigo/, /aplicacao/]),
    target: findColumn(
      headers,
      [/^favorecido$/, /nome do favorecido/, /nome favorecido/, /favorecido/],
      [/codigo/, /tipo/, /^uf /, /municipio/]
    ),
    targetCode: findColumn(headers, [/codigo (do )?favorecido/]),
    targetType: findColumn(headers, [/tipo favorecido/]),
  };
}

function documentYears() {
  const latest = new Date().getFullYear();
  return [latest, latest - 1];
}

function extraScore(extra) {
  return [
    extra.target,
    extra.function,
    extra.subfunction,
    extra.grupo,
    extra.purpose,
    extra.action,
  ].filter(Boolean).length;
}

function parseRowYear(cells, cols) {
  const fromCol = Number(String(cols.year >= 0 ? cells[cols.year] : '').replace(/\D/g, '').slice(0, 4));
  if (Number.isInteger(fromCol) && fromCol >= 2000) return fromCol;
  const code = normalizeCode(cols.code >= 0 ? cells[cols.code] : '');
  const fromCode = Number(code.slice(0, 4));
  if (Number.isInteger(fromCode) && fromCode >= 2000) return fromCode;
  return NaN;
}

function extraFromRow(cells, cols, minYear) {
  const year = parseRowYear(cells, cols);
  if (Number.isInteger(year) && minYear && year < minYear) return null;
  const code = normalizeCode(cellAt(cells, cols.code) || (cols.code >= 0 ? cells[cols.code] : ''));
  if (!code) return null;
  const extra = {
    function: cellAt(cells, cols.functionName),
    subfunction: cellAt(cells, cols.subfunction),
    grupo: cellAt(cells, cols.expenseGroup),
    purpose: cellAt(cells, cols.purpose),
    action: cellAt(cells, cols.action),
    target: cellAt(cells, cols.target),
    targetCode: cellAt(cells, cols.targetCode),
    targetType: cellAt(cells, cols.targetType),
  };
  if (!extraScore(extra)) return null;
  return { code, year, extra };
}

function codeKeys(code, year) {
  const digits = normalizeCode(code);
  const keys = [];
  if (!digits) return keys;
  keys.push(digits);
  if (digits.length === 12) keys.push(digits.slice(4));
  if (digits.length === 8 && year) keys.push(`${year}${digits}`);
  return keys;
}

function extraMatchesNeeded(code, year, neededCodes) {
  if (!neededCodes) return true;
  return codeKeys(code, year).some((key) => neededCodes.has(key));
}

function rememberExtra(byCode, parsed) {
  for (const key of codeKeys(parsed.code, parsed.year)) {
    const existing = byCode.get(key);
    if (!existing || extraScore(parsed.extra) > extraScore(existing)) {
      byCode.set(key, parsed.extra);
    }
  }
}

function extrasFromCsvText(text, minYear, neededCodes) {
  const byCode = new Map();
  let cols = null;
  forEachCsvRow(text, (cells) => {
    if (!cols) {
      const headers = cells.map(normalizeHeader);
      if (!headers.some((header) => /emenda|favorecido|funcao|acao|elemento|grupo/.test(header))) return;
      cols = amendmentColumns(headers);
      return;
    }
    const parsed = extraFromRow(cells, cols, minYear);
    if (!parsed) return;
    if (!extraMatchesNeeded(parsed.code, parsed.year, neededCodes)) return;
    rememberExtra(byCode, parsed);
  });
  return byCode;
}

function extrasFromDocsTable(table, minYear, neededCodes) {
  const byCode = new Map();
  if (table.length < 2) return byCode;
  const cols = amendmentColumns(table[0].map(normalizeHeader));
  for (let i = 1; i < table.length; i += 1) {
    const parsed = extraFromRow(table[i], cols, minYear);
    if (!parsed) continue;
    if (!extraMatchesNeeded(parsed.code, parsed.year, neededCodes)) continue;
    rememberExtra(byCode, parsed);
  }
  return byCode;
}

function lookupExtra(byCode, code, year) {
  for (const key of codeKeys(code, year)) {
    const extra = byCode.get(key);
    if (extra) return extra;
  }
  return null;
}

function attachDocumentInfo(result, byCode) {
  if (!byCode.size) return result;
  for (const row of result.amendments) {
    const extra = lookupExtra(byCode, row.code, row.year);
    if (!extra) continue;
    row.function = extra.function || row.function || '';
    row.subfunction = extra.subfunction || row.subfunction || '';
    row.grupo = extra.grupo || row.grupo || '';
    row.purpose = extra.purpose || row.purpose || '';
    row.action = extra.action || row.action || '';
    row.target = extra.target || row.target || '';
    row.targetCode = extra.targetCode || row.targetCode || '';
    row.targetType = extra.targetType || row.targetType || '';
  }
  return result;
}

function describeColumns(cols) {
  return `year=${cols?.year ?? -1} ibge=${cols?.ibge ?? -1} uf=${cols?.uf ?? -1} code=${cols?.code ?? -1} function=${cols?.functionName ?? -1} action=${cols?.action ?? -1}`;
}

function addAmendmentFromRow(cells, cols, maps, fetchedAt, minYear, sink) {
  const year = parseRowYear(cells, cols);
  if (!Number.isInteger(year) || (minYear && year < minYear)) {
    sink.yearSkip += 1;
    return;
  }
  const ibgeId = cols.ibge >= 0 ? cells[cols.ibge] : '';
  const uf = (cols.uf >= 0 ? cells[cols.uf] : '') || (cols.ufIbge >= 0 ? cells[cols.ufIbge] : '');
  const localidade = cellAt(cells, cols.localidade) || cellAt(cells, cols.municipio);
  const locality = resolveLocality(ibgeId, uf, maps, localidade);
  if (!locality) {
    sink.noLocality += 1;
    if (meaningful(ibgeId) || parseUfCode(uf) || ufFromLocalidade(localidade)) sink.failed += 1;
    return;
  }
  const code = cellAt(cells, cols.code) || normalizeCode(cols.code >= 0 ? cells[cols.code] : '');
  const amendmentType = mapAmendmentType(cols.type >= 0 ? cells[cols.type] : '');
  const committed = cols.committed >= 0 ? parseMoney(cells[cols.committed]) : null;
  const paid = cols.paid >= 0 ? parseMoney(cells[cols.paid]) : null;
  const empenhado = cols.liquid >= 0 ? parseMoney(cells[cols.liquid]) : committed;
  sink.amendments.push({
    sourceId: `emenda:${code || sink.amendments.length + 1}:${year}:${locality.ibgeId}`,
    kind: locality.kind,
    subjectId: locality.subjectId,
    ibgeId: locality.ibgeId,
    county: locality.county,
    state: locality.state,
    region: locality.region,
    year,
    code,
    author: cellAt(cells, cols.author),
    authorType: cellAt(cells, cols.authorType),
    amendmentType,
    function: cellAt(cells, cols.functionName),
    subfunction: cellAt(cells, cols.subfunction),
    grupo: cellAt(cells, cols.expenseGroup),
    purpose: cellAt(cells, cols.purpose),
    action: cellAt(cells, cols.action),
    target: cellAt(cells, cols.target),
    targetCode: cellAt(cells, cols.targetCode),
    targetType: cellAt(cells, cols.targetType),
    committed: committed ?? undefined,
    paid: paid ?? undefined,
    empenhado: empenhado ?? undefined,
    fetchedAt,
  });

  const add = (series, value) => {
    if (value == null) return;
    const key = [locality.kind, locality.ibgeId, series, year, amendmentType].join('|');
    const existing = sink.totals.get(key);
    if (existing) existing.value += value;
    else {
      sink.totals.set(key, {
        kind: locality.kind,
        subjectId: locality.subjectId,
        ibgeId: locality.ibgeId,
        source: 'emendas',
        series,
        year,
        value,
        unit: 'R$',
        categoryId: amendmentType,
        category: amendmentType,
        fetchedAt,
      });
    }
  };
  add('emenda_committed', committed);
  add('emenda_paid', paid);
}

function emptyParseResult(diag = '') {
  return {
    amendments: [],
    indicators: [],
    failed: 0,
    yearSkip: 0,
    noLocality: 0,
    diag,
  };
}

function finishParse(sink, cols, text) {
  const header = String(text || '').split(/\r?\n/, 1)[0].slice(0, 160);
  return {
    amendments: sink.amendments,
    indicators: [...sink.totals.values()],
    failed: sink.failed,
    yearSkip: sink.yearSkip,
    noLocality: sink.noLocality,
    diag: `cols ${describeColumns(cols)}; header ${header}`,
  };
}

function tableToDocs(table, maps, fetchedAt, minYear) {
  if (table.length < 2) return emptyParseResult('empty table');
  const cols = amendmentColumns(table[0].map(normalizeHeader));
  const sink = { amendments: [], totals: new Map(), failed: 0, yearSkip: 0, noLocality: 0 };
  for (let i = 1; i < table.length; i += 1) {
    addAmendmentFromRow(table[i], cols, maps, fetchedAt, minYear, sink);
  }
  return finishParse(sink, cols, table[0].join(';'));
}

function docsFromCsvText(text, maps, fetchedAt, minYear) {
  if (!String(text || '').trim()) return emptyParseResult('empty csv');
  let cols = null;
  const sink = { amendments: [], totals: new Map(), failed: 0, yearSkip: 0, noLocality: 0 };
  forEachCsvRow(text, (cells) => {
    if (!cols) {
      cols = amendmentColumns(cells.map(normalizeHeader));
      return;
    }
    addAmendmentFromRow(cells, cols, maps, fetchedAt, minYear, sink);
  });
  return finishParse(sink, cols, text);
}

async function extrasForYear(year, minYear, neededCodes) {
  const { buffer, headers } = await fetchBuffer(`${EMENDAS_DOCS_URL}/${year}`);
  const contentType = String(headers.get('content-type') || '').toLowerCase();
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!isZip && !/zip|csv|octet-stream|text\/plain/.test(contentType)) return new Map();
  return extrasFromCsvText(bufferToCsv(buffer), minYear, neededCodes);
}

async function collectDocumentExtras(minYear, neededCodes) {
  const byCode = new Map();
  let failed = 0;
  for (const year of documentYears()) {
    try {
      const extras = await extrasForYear(year, minYear, neededCodes);
      for (const [code, extra] of extras) {
        const existing = byCode.get(code);
        if (!existing || extraScore(extra) > extraScore(existing)) byCode.set(code, extra);
      }
    } catch (error) {
      failed += 1;
      noteSyncError(error, error?.stage || 'fetch', `emendas documentos ${year}`);
      logSyncConsole(`Emendas documentos ${year} fetch failed`, error);
    }
  }
  return { byCode, failed };
}

async function collectEmendaDocs({ maps, fetchedAt, minYear, csvUrl }) {
  const { buffer } = await fetchBuffer(csvUrl);
  const csv = bufferToCsv(buffer);
  const parsed = await runSyncStage('process', 'parse emendas csv', () =>
    docsFromCsvText(csv, maps, fetchedAt, minYear)
  );
  if (!parsed.amendments.length) {
    const entries =
      buffer[0] === 0x50 && buffer[1] === 0x4b
        ? listZipEntries(buffer).map((entry) => zipBaseName(entry.name)).join(',')
        : 'not-zip';
    parsed.diag = `${parsed.diag || ''}; bytes=${buffer.length} csvChars=${csv.length} zip=${entries}`;
  }
  const neededCodes = new Set();
  for (const row of parsed.amendments) {
    for (const key of codeKeys(row.code, row.year)) neededCodes.add(key);
  }
  const favText = unzipNamedCsv(buffer, isFavorecidoEmendasName);
  if (favText) {
    attachDocumentInfo(parsed, extrasFromCsvText(favText, minYear, neededCodes));
  }
  const { byCode, failed } = await collectDocumentExtras(minYear, neededCodes);
  const merged = attachDocumentInfo(parsed, byCode);
  return { ...merged, failed: parsed.failed + failed };
}

module.exports = {
  EMENDAS_INDEX_URL,
  EMENDAS_DOCS_URL,
  probeEmendas,
  collectEmendaDocs,
  tableToDocs,
  mapAmendmentType,
  parseCsv,
  bufferToCsv,
  extrasFromCsvText,
  attachDocumentInfo,
};
