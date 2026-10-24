import mongoose, { Schema } from 'mongoose';

const webHistorySchema = new Schema({
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
  },
  deviceName: {
    type: String,
    default: 'Chrome Browser',
  },
  url: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    default: '',
  },
  domain: {
    type: String,
    required: true,
  },
  visitedAt: {
    type: Date,
    required: true,
  },
  visitCount: {
    type: Number,
    default: 1,
    min: 1,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  category: {
    type: String,
    default: 'general',
  },
}, {
  timestamps: true,
  versionKey: false,
});

webHistorySchema.index({ familyId: 1, childProfileId: 1, visitedAt: -1 });
webHistorySchema.index({ childProfileId: 1, url: 1, visitedAt: -1 });

export default mongoose.models.WebHistory ?? mongoose.model('WebHistory', webHistorySchema);
