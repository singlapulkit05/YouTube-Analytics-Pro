const express = require('express');
const { syncData } = require('../controllers/syncController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', protect, syncData);

module.exports = router;
