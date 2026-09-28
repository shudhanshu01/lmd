const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role: { type: String, trim: true },
  application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' },
  applicationId: { type: String, trim: true },
  description: { type: String, required: true, trim: true },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

auditLogSchema.index({ applicationId: 1, timestamp: -1 });

auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
