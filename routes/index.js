const express = require('express');
const applications = require('./applications');
const inspections = require('./inspections');
const gatc = require('./gatc');
const certificates = require('./certificates');
const users = require('./users');
const publicRoutes = require('./public');

const router = express.Router();
router.use('/applications', applications);
router.use('/inspections', inspections);
router.use('/gatc', gatc);
router.use('/certificates', certificates);
router.use('/users', users);
router.use('/public', publicRoutes);

module.exports = router;
