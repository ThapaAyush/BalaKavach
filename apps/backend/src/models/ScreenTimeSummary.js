import mongoose, { Schema } from 'mongoose';

const appUsageItemSchema = new Schema({
  packageName: { type: String, required: true, trim: true, maxlength: 150 },
  appName: { type: String, required: true, trim: true, maxlength: 100 },
  durationSeconds: { type: Number, required: true, min: 0, max: 86400 },
  openCount: { type: Number, default: 0, min: 0 },
}, { _id: false });

const screenTimeSummarySchema = new Schema({
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
  deviceId: {
    type: Schema.Types.ObjectId,
    ref: 'DeviceRegistration',
    required: true,
    immutable: true,
  },
  date: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/,
  },
  totalScreenTimeSeconds: {
    type: Number,
    default: null,
    min: 0,
    max: 86400,
  },
  deviceUnlockCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  reportingPeriod: {
    start: { type: Date, required: true },
    end: { type: Date, required: true },
  },
  permissionGranted: {
    type: Boolean,
    required: true,
  },
  source: {
    type: String,
    required: true,
    enum: ['measured', 'unavailable', 'incomplete'],
  },
  appUsage: {
    type: [appUsageItemSchema],
    default: [],
  },
  reportedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  versionKey: false,
});

screenTimeSummarySchema.index({ deviceId: 1, date: 1 }, { unique: true });
screenTimeSummarySchema.index({ familyId: 1, childProfileId: 1, date: -1 });

export default mongoose.models.ScreenTimeSummary ?? mongoose.model('ScreenTimeSummary', screenTimeSummarySchema);
