const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  password: { type: String, select: false },
  role: {
    type: String,
    enum: ['SHOPKEEPER', 'ADMIN', 'LMO', 'GATC', 'PUBLIC'],
    required: true,
    default: 'SHOPKEEPER'
  },
  externalId: { type: String, trim: true },
  organisation: { type: String, trim: true },
  status: { type: String, enum: ['ACTIVE', 'PENDING_APPROVAL', 'DISABLED'], default: 'ACTIVE' }
}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ externalId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
