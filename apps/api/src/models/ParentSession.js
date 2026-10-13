import mongoose, { Schema } from 'mongoose';

const parentSessionSchema = new Schema({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    select: false,
  },
  parentId: {
    type: Schema.Types.ObjectId,
    ref: 'Parent',
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
}, {
  timestamps: true,
  versionKey: false,
});

parentSessionSchema.index({ parentId: 1 });
parentSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.ParentSession ?? mongoose.model('ParentSession', parentSessionSchema);
