const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.Mixed, required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  className: { type: String, required: true },
  subject: { type: String, required: true },
  branch: { type: String, required: true },
  semester: { type: String, required: true },
  section: { type: String, required: true },
  batch: { type: String, default: '' },
  date: { type: String, required: true }, // YYYY-MM-DD
  year: { type: String, required: true },
  records: [{
    usn: { type: String, required: true, uppercase: true },
    studentName: { type: String, required: true },
    status: { type: String, enum: ['PRESENT', 'ABSENT'], required: true },
    markedAt: { type: Date, default: null },
    _id: false,
  }],
  sessionId: { type: String, required: true },
  startTime: { type: String, default: '' },
  endTime: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
