const express = require('express');
const User = require('../models/User');
const { requireDatabase } = require('../middleware/database');

const router = express.Router();
router.use(requireDatabase);

router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.role ? { role: String(req.query.role).toUpperCase() } : {};
    res.json(await User.find(filter).select('-password').sort({ name: 1 }));
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!String(body.name || '').trim() || !String(body.email || '').trim() || !String(body.role || '').trim()) {
      return res.status(400).json({ error: 'name, email, and role are required.' });
    }
    if (!['SHOPKEEPER', 'ADMIN', 'LMO', 'GATC', 'PUBLIC'].includes(body.role)) return res.status(400).json({ error: 'Invalid user role.' });
    const user = await User.create(body);
    res.status(201).json(user);
  } catch (error) { next(error); }
});

module.exports = router;
