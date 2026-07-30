const express = require('express');
const router = express.Router();
const {
  getAllObjects,
  createObject,
  getObjectById,
  updateObject,
  deleteObject,
} = require('../controllers/objectController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', authorize('OBJECT:READ'), getAllObjects);
router.post('/', authorize('OBJECT:CREATE'), createObject);
router.get('/:id', authorize('OBJECT:READ'), getObjectById);
router.put('/:id', authorize('OBJECT:WRITE'), updateObject);
router.delete('/:id', authorize('OBJECT:DELETE'), deleteObject);

router.post('/:objectId/members', authorize('OBJECT:WRITE'), (_req, res) => {
  res.status(501).json({ message: 'Object membership updates are not implemented yet.' });
});

router.post('/:objectId/permissions', authorize('OBJECT:WRITE'), (_req, res) => {
  res.status(501).json({ message: 'Object permission updates are not implemented yet.' });
});

module.exports = router;
