const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentName: { type: String, required: true },
  studentUSN: { type: String, required: true },
  studentBranch: { type: String, required: true },
  studentSemester: { type: String, required: true },
  subject: { type: String, default: '' },
  fromDate: { type: String, required: true },
  toDate: { type: String, required: true },
  reason: { type: String, required: true },
  fileName: { type: String, default: null },
  fileData: { type: String, default: null }, // base64
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: String, default: null },
  reviewNote: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  forTeachers: { type: Boolean, default: false },
  approvedBranch: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('LeaveApplication', leaveSchema);
