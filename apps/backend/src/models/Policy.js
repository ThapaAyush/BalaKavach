import mongoose, { Schema } from 'mongoose';

const policySchema = new Schema({
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
    unique: true,
    immutable: true,
  },
  version: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
  },
  screenTime: {
    dailyLimitMinutes: {
      type: Number,
      default: null,
      min: 1,
      max: 1440,
    },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: '21:00' },
      end: { type: String, default: '07:00' },
      days: {
        type: [String],
        default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    },
  },
  appRestrictions: {
    enabled: { type: Boolean, default: false },
    blockedApps: [
      {
        packageName: { type: String, required: true },
        appName: { type: String, default: '' },
      },
    ],
  },
  webRestrictions: {
    enabled: { type: Boolean, default: false },
    enforcementPlatform: { type: String, default: 'desktop_chrome' },
    blockAdultContent: { type: Boolean, default: true },
    blockedDomains: {
      type: [String],
      default: [],
    },
  },
}, {
  timestamps: true,
  versionKey: false,
});

policySchema.index({ familyId: 1, childProfileId: 1 }, { unique: true });

export default mongoose.models.Policy ?? mongoose.model('Policy', policySchema);
