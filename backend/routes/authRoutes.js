const express = require('express');
const { registerUser, loginUser, refreshUser } = require('../controllers/authController');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/refresh', refreshUser);

module.exports = router;
