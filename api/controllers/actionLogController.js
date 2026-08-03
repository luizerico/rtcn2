const {
  queryActionLogs,
  listDistinctActions,
  listDistinctResourceTypes,
} = require('../services/actionLogService');
const { sendServerError, sendError, ERROR_CODES } = require('../utils/httpErrors');

exports.listActionLogs = async (req, res) => {
  try {
    const result = await queryActionLogs(req.query);
    res.status(200).json(result);
  } catch (error) {
    return sendServerError(res, error, 'Error fetching action logs');
  }
};

exports.getActionLogFilters = async (_req, res) => {
  try {
    const [actions, resourceTypes] = await Promise.all([
      listDistinctActions(),
      listDistinctResourceTypes(),
    ]);
    res.status(200).json({
      actions: actions.sort(),
      resourceTypes: resourceTypes.sort(),
      sortableFields: [
        'createdAt',
        'username',
        'action',
        'resourceType',
        'method',
        'statusCode',
        'success',
      ],
    });
  } catch (error) {
    return sendServerError(res, error, 'Error fetching log filter options');
  }
};
