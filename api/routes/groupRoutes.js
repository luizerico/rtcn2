const express = require('express');
const router = express.Router();
const { 
    getAllGroups, 
    createGroup, 
    getGroupById, 
    updateGroup, 
    deleteGroup 
} = require('../controllers/groupController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All endpoints for groups require the user to be logged in and authorized
router.use(protect);

// GET /api/groups - Retrieve all groups (Admin only)
router.get('/', protect, authorize('GROUP:READ'), getAllGroups); 

// POST /api/groups - Create a new group (Admin only)
router.post('/', protect, authorize('GROUP:CREATE'), createGroup);

// GET /api/groups/:id - Get a single group by ID
router.get('/:id', protect, authorize('GROUP:READ'), getGroupById);

// PUT/PATCH /api/groups/:id - Update an existing group
router.put('/:id', protect, authorize('GROUP:WRITE'), updateGroup);

// DELETE /api/groups/:id - Delete a group by ID
router.delete('/:id', protect, authorize('GROUP:DELETE'), deleteGroup);

module.exports = router;