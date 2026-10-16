import mongoose, { Schema } from 'mongoose';

const parentSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    maxlength: 254,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
}, {
  timestamps: true,
  versionKey: false,
});

parentSchema.set('toJSON', {
  transform(_document, result) {
    delete result.passwordHash;
    return result;
  },
});

export default mongoose.models.Parent ?? mongoose.model('Parent', parentSchema);
