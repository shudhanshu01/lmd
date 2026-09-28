const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  certificateId: { type: String, required: true, unique: true, trim: true },
  application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
  applicationId: { type: String, required: true, trim: true },
  businessName: { type: String, required: true, trim: true },
  location: { type: String, trim: true },
  instrumentType: { type: String, required: true, trim: true },
  serialNumber: { type: String, required: true, trim: true },
  issueDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true },
  hologramSealId: { type: String, required: true, trim: true },
  securityStampSerial: { type: String, required: true, trim: true },
  digitalSignatureReference: { type: String, required: true, trim: true },
  qrVerificationUrl: { type: String, required: true, trim: true },
  status: { type: String, enum: ['CERTIFIED', 'EXPIRED', 'REVOKED', 'REJECTED'], default: 'CERTIFIED' },
  authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  authorizedById: { type: String, trim: true },
  registry: {
    provider: { type: String, trim: true },
    externalId: { type: String, trim: true },
    syncStatus: { type: String, enum: ['PENDING', 'SYNCED', 'FAILED'] }
  }
}, { timestamps: true });

certificateSchema.index({ applicationId: 1 });

module.exports = mongoose.model('Certificate', certificateSchema);
