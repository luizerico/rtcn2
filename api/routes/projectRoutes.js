const express = require('express');
const router = express.Router();
const {
  listProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
} = require('../controllers/projectController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');

router.use(protect);

router.get(
  '/',
  authorize('PROJECT:READ', { allowAnyInstance: true, attachAccessible: true }),
  listProjects
);
router.post('/', authorize('PROJECT:CREATE', { classWideOnly: true }), createProject);
router.get(
  '/:id',
  validate(paramObjectId('id', 'Project id')),
  authorize('PROJECT:READ', { param: 'id' }),
  getProjectById
);
router.put(
  '/:id',
  validate(paramObjectId('id', 'Project id')),
  authorize('PROJECT:WRITE', { param: 'id' }),
  updateProject
);
router.delete(
  '/:id',
  validate(paramObjectId('id', 'Project id')),
  authorize('PROJECT:DELETE', { param: 'id' }),
  deleteProject
);

module.exports = router;
