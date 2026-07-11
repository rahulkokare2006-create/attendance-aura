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

module.exports = mongoose.model('Class', classSchema);
