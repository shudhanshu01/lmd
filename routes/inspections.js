const express = require('express');
const mongoose = require('mongoose');
const Application = require('../models/Application');
const Inspection = require('../models/Inspection');
const AuditLog = require('../models/AuditLog');
const { requireDatabase } = require('../middleware/database');
const { requireDemoRole } = require('../middleware/demoRole');

const router = express.Router();
router.use(requireDatabase);

function findInspection(id) {
  return Inspection.findOne(mongoose.isValidObjectId(id) ? { $or: [{ _id: id }, { applicationId: id }] } : { applicationId: id });
}

router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.lmoId ? { lmoId: req.query.lmoId } : {};
    res.json(await Inspection.find(filter).sort({ submittedAt: -1, createdAt: -1 }));
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const inspection = await findInspection(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'Inspection not found.' });
    res.json(inspection);
  } catch (error) { next(error); }
});

router.post('/', requireDemoRole('LMO'), async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.applicationId || !body.lmoId || !body.result) return res.status(400).json({ error: 'applicationId, lmoId, and result are required.' });
    if (!['PASS', 'FAIL'].includes(body.result)) return res.status(400).json({ error: 'result must be PASS or FAIL.' });
    const application = await Application.findOne({ applicationId: body.applicationId });
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    const inspection = await Inspection.create({ ...body, application: application._id, reportStatus: 'DRAFT' });
    res.status(201).json(inspection);
  } catch (error) { next(error); }
});

router.patch('/:id/submit', requireDemoRole('LMO'), async (req, res, next) => {
  try {
    const inspection = await findInspection(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'Inspection not found.' });
    inspection.reportStatus = 'SUBMITTED_TO_GATC';
    inspection.submittedAt = new Date();
    await inspection.save();
    const application = await Application.findOne({ applicationId: inspection.applicationId });
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    application.inspectionReport = inspection._id;
    application.status = 'PENDING_AUTHORIZATION';
    application.testVerdict = undefined;
    await application.save();
    await AuditLog.create({ action: 'Inspection Report Submitted', role: 'LMO', application: application._id, applicationId: application.applicationId, description: `Inspection report submitted to GATC by ${inspection.lmoId}.` });
    res.json({ inspection, application });
  } catch (error) { next(error); }
});

module.exports = router;
