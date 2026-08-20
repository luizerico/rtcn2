/**
 * Serialize opportunity-match context payloads as JSON files for RTCNAI /v1/analyses.
 */

function buildJsonContext(payload) {
  return Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
}

module.exports = {
  buildJsonContext,
};
