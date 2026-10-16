import mongoose, { Schema } from 'mongoose';

const pairingCodeSchema = new Schema({
  codeHash: {
    type: String,
    required: true,
    unique: true,
    select: false,
  },
  familyId: {
    type: Schema.Types.ObjectId,
    ref: 'Family',
    required: true,
    immutable: true,
  },
  childProfileId: {
    type: Schema.Types.ObjectId,
    ref: 'ChildProfile',
    required: true,
    immutable: true,
  },
  createdByParentId: {
    type: Schema.Types.ObjectId,
    ref: 'Parent',
    required: true,
    immutable: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  redeemedAt: {
    type: Date,
    default: null,
  },
  revokedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  versionKey: false,
});

pairingCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
pairingCodeSchema.index({ familyId: 1, childProfileId: 1, createdAt: -1 });

export default mongoose.models.PairingCode ?? mongoose.model('PairingCode', pairingCodeSchema);
