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
  fileData: { type: mongoose.Schema.Types.Mixed, default: null }, // object { name, data } or string
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: String, default: null },
  reviewNote: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  forTeachers: { type: Boolean, default: false },
  approvedBranch: { type: String, default: null },
  viewedByStudent: { type: Boolean, default: false },
  viewedByTeacher: { type: Boolean, default: false },
  viewedByManager: { type: Boolean, default: false },
}, { timestamps: true });

// Performance indexes for leave queries
leaveSchema.index({ studentId: 1 });
leaveSchema.index({ status: 1, studentBranch: 1 });
leaveSchema.index({ status: 1, approvedBranch: 1 });

module.exports = mongoose.model('LeaveApplication', leaveSchema);
