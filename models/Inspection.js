const mongoose = require('mongoose');

const inspectionSchema = new mongoose.Schema({
  application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
  applicationId: { type: String, required: true, trim: true },
  lmo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lmoId: { type: String, required: true, trim: true },
  inspectionDate: { type: Date, required: true },
  gps: {
    latitude: { type: Number },
    longitude: { type: Number },
    verified: { type: Boolean, default: false },
    note: { type: String, trim: true }
  },
  instrumentDetails: {
    instrumentType: { type: String, trim: true },
    serialNumber: { type: String, trim: true },
    capacity: { type: String, trim: true }
  },
  measurements: {
    standardLoad: { type: Number },
    observedLoad: { type: Number },
    calculatedError: { type: Number },
    toleranceAllowed: { type: Number }
  },
  checklist: [{ label: { type: String, trim: true }, passed: { type: Boolean } }],
  photoEvidence: [{ type: String }],
  result: { type: String, enum: ['PASS', 'FAIL'], required: true },
  remarks: { type: String, trim: true },
  reportStatus: { type: String, enum: ['DRAFT', 'SUBMITTED_TO_GATC'], default: 'DRAFT' },
  submittedAt: { type: Date }
}, { timestamps: true });

inspectionSchema.index({ applicationId: 1 });
inspectionSchema.index({ lmoId: 1, submittedAt: -1 });

module.exports = mongoose.model('Inspection', inspectionSchema);
