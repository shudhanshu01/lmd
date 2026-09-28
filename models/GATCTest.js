const mongoose = require('mongoose');

const gatcTestSchema = new mongoose.Schema({
  application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
  applicationId: { type: String, required: true, trim: true },
  sampleCode: { type: String, required: true, trim: true },
  bench: { type: String, trim: true },
  referenceStandards: [{
    standardId: { type: String, trim: true },
    calibrationId: { type: String, trim: true },
    validUntil: { type: Date },
    statusAtTest: { type: String, trim: true }
  }],
  measurements: {
    maxCapacity: { type: Number },
    minCapacity: { type: Number },
    scaleInterval: { type: Number },
    observedError: { type: Number },
    eccentricity: [{ type: String, trim: true }],
    repeatability: [{ type: String, trim: true }]
  },
  mpe: {
    ruleVersion: { type: String, trim: true },
    allowedError: { type: Number },
    observedError: { type: Number },
    withinLimit: { type: Boolean }
  },
  result: { type: String, enum: ['PASS', 'FAIL'], required: true },
  remarks: { type: String, trim: true },
  testedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  testedById: { type: String, trim: true },
  testedAt: { type: Date, default: Date.now }
}, { timestamps: true });

gatcTestSchema.index({ applicationId: 1, testedAt: -1 });

gatcTestSchema.index({ sampleCode: 1 }, { unique: true });

module.exports = mongoose.model('GATCTest', gatcTestSchema);
