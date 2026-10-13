import mongoose, { Schema } from 'mongoose';

const familySchema = new Schema({
  ownerParentId: {
    type: Schema.Types.ObjectId,
    ref: 'Parent',
    required: true,
    unique: true,
    immutable: true,
  },
}, {
  timestamps: true,
  versionKey: false,
});

export default mongoose.models.Family ?? mongoose.model('Family', familySchema);
