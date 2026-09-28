const mongoose = require('mongoose');

const applicationStatuses = [
  'PENDING_ADMIN_REVIEW',
  'SCHEDULED',
  'PENDING_AUTHORIZATION',
  'RECEIVED',
  'IN_TESTING',
  'TEST_PASSED',
  'TEST_FAILED',
  'CERTIFIED',
  'REJECTED',
  'FAILED'
];

const applicationSchema = new mongoose.Schema({
  applicationId: { type: String, required: true, unique: true, trim: true },
  applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: String, trim: true },
  businessName: { type: String, required: true, trim: true },
  businessAddress: { type: String, trim: true },
  ownerName: { type: String, trim: true },
  contactInformation: { type: String, trim: true },
  location: { type: String, trim: true },
  instrumentType: { type: String, required: true, trim: true },
  instrumentName: { type: String, trim: true },
  manufacturer: { type: String, trim: true },
  modelNumber: { type: String, trim: true },
  serialNumber: { type: String, required: true, trim: true },
  capacity: { type: String, trim: true },
  applicationDate: { type: Date, default: Date.now },
  assignedLMO: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedOfficerId: { type: String, trim: true },
  inspectionDate: { type: Date },
  inspectionTime: { type: String, trim: true },
  status: { type: String, enum: applicationStatuses, default: 'PENDING_ADMIN_REVIEW' },
  inspectionReport: { type: mongoose.Schema.Types.ObjectId, ref: 'Inspection' },
  gatcTest: { type: mongoose.Schema.Types.ObjectId, ref: 'GATCTest' },
  certificate: { type: mongoose.Schema.Types.ObjectId, ref: 'Certificate' },
  scheduleDate: { type: String, trim: true },
  scheduleTime: { type: String, trim: true },
  certificateId: { type: String, trim: true },
  sampleCode: { type: String, trim: true },
  benchId: { type: String, trim: true },
  receivedAt: { type: Date },
  receptionChecks: { type: mongoose.Schema.Types.Mixed },
  testVerdict: { type: String, enum: ['PASS', 'FAIL'] },
  rejectionReason: { type: String, trim: true },
  feeAmount: { type: Number, min: 0 },
  feeStatus: { type: String, enum: ['PENDING', 'PAID', 'REFUNDED'] },
  slaDueAt: { type: Date },
  completedAt: { type: Date }
}, { timestamps: true });

applicationSchema.index({ status: 1, assignedOfficerId: 1 });
applicationSchema.index({ applicant: 1, createdAt: -1 });

module.exports = mongoose.model('Application', applicationSchema);
module.exports.applicationStatuses = applicationStatuses;
