const express = require('express');
const Certificate = require('../models/Certificate');
const { requireDatabase } = require('../middleware/database');

const router = express.Router();
router.get('/certificates/:certificateId', requireDatabase, async (req, res, next) => {
  try {
    const certificate = await Certificate.findOne({ certificateId: req.params.certificateId }).lean();
    if (!certificate) return res.status(404).json({ valid: false, liveStatus: 'NOT_FOUND', certificateId: req.params.certificateId });
    const expiry = new Date(certificate.expiryDate).getTime();
    const expired = Number.isNaN(expiry) || expiry < Date.now();
    res.json({ ...certificate, valid: certificate.status === 'CERTIFIED' && !expired, liveStatus: certificate.status === 'CERTIFIED' && !expired ? 'VALID' : 'EXPIRED', serverTime: new Date().toISOString() });
  } catch (error) { next(error); }
});

module.exports = router;
