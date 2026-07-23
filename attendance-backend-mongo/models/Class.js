const mongoose = require('mongoose');

const studentEntrySchema = new mongoose.Schema({
  usn: { type: String, required: true, uppercase: true },
  name: { type: String, required: true },
  rollNo: { type: String, default: '' },
}, { _id: false });

const classSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  subject: { type: String, required: true },
  subjectCode: { type: String, default: '' },
  branch: { type: String, required: true },
  semester: { type: String, required: true },
  section: { type: String, required: true },
  batch: { type: String, default: '' },
  type: { type: String, enum: ['Theory', 'Lab'], default: 'Theory' },
  students: [studentEntrySchema],
  radius: { type: Number, default: 50 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Performance indexes for class lookups
classSchema.index({ teacherId: 1, isActive: 1 });
classSchema.index({ branch: 1, semester: 1, section: 1 });

module.exports = mongoose.model('Class', classSchema);
