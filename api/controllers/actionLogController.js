const {
  queryActionLogs,
  listDistinctActions,
  listDistinctResourceTypes,
} = require('../services/actionLogService');

exports.listActionLogs = async (req, res) => {
  try {
    const result = await queryActionLogs(req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching action logs', error: error.message });
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
    res.status(500).json({ message: 'Error fetching log filter options', error: error.message });
  }
};
