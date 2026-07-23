const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['admin', 'teacher', 'student', 'parent', 'manager'], required: true },
  phone: { type: String, default: '' },
  department: { type: String, default: null },
  designation: { type: String, default: null },
  rollNo: { type: String, default: null },
  usn: { type: String, default: null, uppercase: true },
  branch: { type: String, default: null },
  semester: { type: String, default: null },
  section: { type: String, default: null },
  batch: { type: String, default: null },
  childName: { type: String, default: null },
  childUSN: { type: String, default: null, uppercase: true },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  emailVerifyToken: { type: String, default: null },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  emailVerifyTokenExpires: { type: Date, default: null },
}, { timestamps: true });

// Performance indexes for fast lookups under high concurrent load
userSchema.index({ usn: 1 }, { sparse: true });
userSchema.index({ role: 1, branch: 1, semester: 1 });
userSchema.index({ role: 1, department: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
