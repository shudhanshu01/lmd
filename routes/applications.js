const express = require('express');
const mongoose = require('mongoose');
const Application = require('../models/Application');
const AuditLog = require('../models/AuditLog');
const { requireDatabase } = require('../middleware/database');
const { requireDemoRole } = require('../middleware/demoRole');

const router = express.Router();
const statuses = new Set(Application.applicationStatuses);

function makeApplicationId() {
  return `LM-VER-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
}

function findApplication(identifier) {
  const query = mongoose.isValidObjectId(identifier)
    ? { $or: [{ _id: identifier }, { applicationId: identifier }] }
    : { applicationId: identifier };
  return Application.findOne(query);
}

async function audit(action, application, description, role) {
  await AuditLog.create({ action, application: application._id, applicationId: application.applicationId, description, role });
}

router.use(requireDatabase);

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.assignedLMO) filter.assignedOfficerId = req.query.assignedLMO;
    const applications = await Application.find(filter).populate('inspectionReport').populate('gatcTest').populate('certificate').sort({ createdAt: -1 });
    res.json(applications);
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    await application.populate('inspectionReport gatcTest certificate');
    res.json(application);
  } catch (error) { next(error); }
});

router.post('/', requireDemoRole('SHOPKEEPER', 'ADMIN'), async (req, res, next) => {
  try {
    const body = req.body || {};
    for (const field of ['businessName', 'instrumentType', 'serialNumber']) {
      if (!String(body[field] || '').trim()) return res.status(400).json({ error: `${field} is required.` });
    }
    const application = await Application.create({
      ...body,
      applicationId: body.applicationId || makeApplicationId(),
      status: 'PENDING_ADMIN_REVIEW',
      applicationDate: body.applicationDate || new Date()
    });
    await audit('Application Submitted', application, `Application ${application.applicationId} submitted.`, req.demoRole);
    res.status(201).json(application);
  } catch (error) { next(error); }
});

router.patch('/:id/status', requireDemoRole('ADMIN', 'GATC'), async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!statuses.has(status)) return res.status(400).json({ error: 'Invalid application status.' });
    const application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    application.status = status;
    for (const field of ['sampleCode', 'benchId', 'receivedAt', 'receptionChecks', 'rejectionReason']) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) application[field] = req.body[field];
    }
    if (['CERTIFIED', 'REJECTED'].includes(status)) application.completedAt = new Date();
    await application.save();
    await audit('Application Status Updated', application, `Status changed to ${status}.`, req.demoRole);
    res.json(application);
  } catch (error) { next(error); }
});

router.patch('/:id/assign-lmo', requireDemoRole('ADMIN'), async (req, res, next) => {
  try {
    const { assignedLMO, assignedOfficerId } = req.body || {};
    if (!assignedLMO && !assignedOfficerId) return res.status(400).json({ error: 'assignedLMO or assignedOfficerId is required.' });
    const application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    application.assignedLMO = mongoose.isValidObjectId(assignedLMO) ? assignedLMO : undefined;
    application.assignedOfficerId = assignedOfficerId || assignedLMO;
    await application.save();
    await audit('LMO Assigned', application, `Application assigned to ${application.assignedOfficerId}.`, req.demoRole);
    res.json(application);
  } catch (error) { next(error); }
});

router.patch('/:id/schedule', requireDemoRole('ADMIN'), async (req, res, next) => {
  try {
    const { inspectionDate, inspectionTime, scheduleDate, scheduleTime } = req.body || {};
    const dateValue = inspectionDate || scheduleDate;
    if (!dateValue || Number.isNaN(new Date(dateValue).getTime())) return res.status(400).json({ error: 'A valid inspection date is required.' });
    const application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    application.inspectionDate = new Date(dateValue);
    application.inspectionTime = inspectionTime || scheduleTime;
    application.scheduleDate = String(dateValue).split('T')[0];
    application.scheduleTime = application.inspectionTime;
    application.status = 'SCHEDULED';
    await application.save();
    await audit('Inspection Scheduled', application, `Inspection scheduled for ${application.scheduleDate} at ${application.scheduleTime || 'unspecified time'}.`, req.demoRole);
    res.json(application);
  } catch (error) { next(error); }
});

module.exports = router;
