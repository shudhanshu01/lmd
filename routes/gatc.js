const express = require('express');
const mongoose = require('mongoose');
const Application = require('../models/Application');
const GATCTest = require('../models/GATCTest');
const AuditLog = require('../models/AuditLog');
const { requireDatabase } = require('../middleware/database');
const { requireDemoRole } = require('../middleware/demoRole');

const router = express.Router();
router.use(requireDatabase);

router.get('/tests', async (req, res, next) => {
  try { res.json(await GATCTest.find(req.query.applicationId ? { applicationId: req.query.applicationId } : {}).sort({ testedAt: -1 })); } catch (error) { next(error); }
});

router.post('/tests', requireDemoRole('GATC'), async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.applicationId || !body.sampleCode || !body.result) return res.status(400).json({ error: 'applicationId, sampleCode, and result are required.' });
    if (!['PASS', 'FAIL'].includes(body.result)) return res.status(400).json({ error: 'result must be PASS or FAIL.' });
    const application = await Application.findOne({ applicationId: body.applicationId });
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    const test = await GATCTest.create({ ...body, application: application._id, testedById: body.testedById || 'GATC-LAB-01' });
    application.gatcTest = test._id;
    application.testVerdict = body.result;
    application.status = body.result === 'PASS' ? 'TEST_PASSED' : 'TEST_FAILED';
    await application.save();
    await AuditLog.create({ action: 'GATC Test Completed', role: 'GATC', application: application._id, applicationId: application.applicationId, description: `GATC test completed with ${body.result}.` });
    res.status(201).json({ test, application });
  } catch (error) { next(error); }
});

router.patch('/tests/:id', requireDemoRole('GATC'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid GATC test ID.' });
    const test = await GATCTest.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true });
    if (!test) return res.status(404).json({ error: 'GATC test not found.' });
    res.json(test);
  } catch (error) { next(error); }
});

module.exports = router;
