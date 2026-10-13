import mongoose, { Schema } from 'mongoose';

const deviceRegistrationSchema = new Schema({
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
  pairingCodeId: {
    type: Schema.Types.ObjectId,
    ref: 'PairingCode',
    required: true,
    immutable: true,
    unique: true,
  },
  credentialHash: {
    type: String,
    required: true,
    unique: true,
    select: false,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 60,
  },
  platform: {
    type: String,
    required: true,
    enum: ['android', 'ios', 'windows', 'macos', 'linux', 'unknown'],
  },
  pairedAt: {
    type: Date,
    required: true,
  },
  lastSeenAt: {
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

deviceRegistrationSchema.index({ familyId: 1, pairedAt: -1, _id: 1 });
deviceRegistrationSchema.index({ familyId: 1, childProfileId: 1, pairedAt: -1 });

export default mongoose.models.DeviceRegistration
  ?? mongoose.model('DeviceRegistration', deviceRegistrationSchema);
