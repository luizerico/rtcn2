const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { paramObjectId } = require('../validation/schemas');

/**
 * GET-only geography catalog router. Any verified session may read.
 * @param {{ list: Function, getById: Function, idLabel: string }} options
 */
function createGeoRouter({ list, getById, idLabel }) {
  const router = express.Router();
  router.use(protect);
  router.get('/', list);
  router.get('/:id', validate(paramObjectId('id', idLabel)), getById);
  return router;
}

module.exports = { createGeoRouter };
