const express = require('express');
const Certificate = require('../models/Certificate');
const Application = require('../models/Application');
const AuditLog = require('../models/AuditLog');
const { requireDatabase } = require('../middleware/database');
const { requireDemoRole } = require('../middleware/demoRole');

const router = express.Router();
router.use(requireDatabase);

function certificatePayload(body) {
  return {
    ...body,
    certificateId: body.certificateId,
    applicationId: body.applicationId,
    issueDate: body.issueDate || new Date(),
    expiryDate: body.expiryDate,
    status: body.status || 'CERTIFIED'
  };
}

router.get('/', async (req, res, next) => {
  try { res.json(await Certificate.find(req.query.applicationId ? { applicationId: req.query.applicationId } : {}).sort({ createdAt: -1 })); } catch (error) { next(error); }
});

router.get('/:certificateId', async (req, res, next) => {
  try {
    const certificate = await Certificate.findOne({ certificateId: req.params.certificateId });
    if (!certificate) return res.status(404).json({ error: 'Certificate not found.' });
    res.json(certificate);
  } catch (error) { next(error); }
});

router.post('/', requireDemoRole('GATC'), async (req, res, next) => {
  try {
    const body = req.body || {};
    for (const field of ['certificateId', 'applicationId', 'businessName', 'instrumentType', 'serialNumber', 'expiryDate', 'hologramSealId', 'securityStampSerial', 'digitalSignatureReference', 'qrVerificationUrl']) {
      if (!String(body[field] || '').trim()) return res.status(400).json({ error: `${field} is required.` });
    }
    if (Number.isNaN(new Date(body.expiryDate).getTime())) return res.status(400).json({ error: 'expiryDate must be a valid date.' });
    const application = await Application.findOne({ applicationId: body.applicationId });
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    if (!['TEST_PASSED', 'PENDING_AUTHORIZATION'].includes(application.status)) return res.status(409).json({ error: 'Application is not ready for certificate authorization.' });
    const certificate = await Certificate.create({ ...certificatePayload(body), application: application._id, authorizedById: body.authorizedById || 'GATC-LAB-01' });
    application.certificate = certificate._id;
    application.certificateId = certificate.certificateId;
    application.status = 'CERTIFIED';
    application.completedAt = new Date();
    await application.save();
    await AuditLog.create({ action: 'Certificate Issued', role: 'GATC', application: application._id, applicationId: application.applicationId, description: `${certificate.certificateId} issued.` });
    res.status(201).json({ certificate, application });
  } catch (error) { next(error); }
});

router.patch('/:id', requireDemoRole('GATC'), async (req, res, next) => {
  try {
    const certificate = await Certificate.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true });
    if (!certificate) return res.status(404).json({ error: 'Certificate not found.' });
    res.json(certificate);
  } catch (error) { next(error); }
});

module.exports = router;
