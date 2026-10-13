import mongoose, { Schema } from 'mongoose';

const childProfileSchema = new Schema({
  familyId: {
    type: Schema.Types.ObjectId,
    ref: 'Family',
    required: true,
    immutable: true,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 60,
  },
  dateOfBirth: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
  versionKey: false,
});

childProfileSchema.index({ familyId: 1, createdAt: 1, _id: 1 });

export default mongoose.models.ChildProfile ?? mongoose.model('ChildProfile', childProfileSchema);
