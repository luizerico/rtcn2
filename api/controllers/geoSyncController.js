const { sendError, sendServerError, ERROR_CODES } = require('../utils/httpErrors');
const { SOURCE_IDS } = require('../services/geoSourceCatalog');
const { listSyncStatus, startSyncSource } = require('../services/geoSyncService');

async function getGeoSyncStatus(req, res) {
  try {
    const probe = String(req.query.probe || '0') === '1';
    const payload = await listSyncStatus({ probe });
    return res.status(200).json(payload);
  } catch (error) {
    return sendServerError(res, error, 'Error reading geography sync status');
  }
}

function actorFromRequest(req) {
  return {
    userId: req.user?._id || null,
    username: req.user?.username || '',
    ipAddress: req.ip || req.socket?.remoteAddress || '',
    userAgent: req.get('user-agent') || '',
    clientApp: req.get('x-client-app') || 'rbac-platform',
  };
}

async function postGeoSync(req, res) {
  try {
    const source = String(req.body?.source || '')
      .trim()
      .toLowerCase();
    const force = Boolean(req.body?.force);
    const actor = actorFromRequest(req);
    req.actionLogContext = {
      action: 'geo.sync_start',
      resourceType: 'GEO',
      resourceId: SOURCE_IDS.includes(source) ? source : null,
      message: `${actor.username || 'anonymous'} started geography sync${source ? ` for ${source}` : ''}${force ? ' (force)' : ''}`,
      meta: { source: source || undefined, force },
    };
    if (!SOURCE_IDS.includes(source)) {
      return sendError(
        res,
        400,
        `source must be one of: ${SOURCE_IDS.join(', ')}.`,
        ERROR_CODES.VALIDATION
      );
    }
    const result = await startSyncSource(source, { force, actor });
    return res.status(202).json(result);
  } catch (error) {
    if (error.status === 400) {
      return sendError(res, 400, error.message, error.code || ERROR_CODES.VALIDATION);
    }
    if (error.status === 409) {
      return sendError(res, 409, error.message, ERROR_CODES.CONFLICT);
    }
    return sendServerError(res, error, 'Error starting geography sync');
  }
}

module.exports = {
  getGeoSyncStatus,
  postGeoSync,
};
