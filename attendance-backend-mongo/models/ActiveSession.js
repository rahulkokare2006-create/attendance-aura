const mongoose = require('mongoose');

const activeSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  classId: { type: mongoose.Schema.Types.Mixed, required: true },
  className: { type: String, required: true },
  subject: { type: String, required: true },
  branch: { type: String, required: true },
  semester: { type: String, required: true },
  section: { type: String, required: true },
  otp: { type: String, required: true },
  qrData: { type: String, default: '' },
  geoFencingEnabled: { type: Boolean, default: false },
  teacherLat: { type: Number, default: null },
  teacherLng: { type: Number, default: null },
  gpsRadius: { type: Number, default: 50 },
  students: [{ usn: String, name: String, branch: String }], // Students enrolled in this class
  records: { type: Map, of: String, default: {} }, // {usn: PRESENT/ABSENT}
  markedStudents: { type: Map, of: Object, default: {} }, // {usn: {markedAt}}
  date: { type: String, required: true },
  startTime: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  outsideAlerts: [{
    studentName: String,
    studentUSN: String,
    distance: Number,
    radius: Number,
    time: String,
    markedAt: { type: Date, default: Date.now },
    _id: false,
  }],
}, { timestamps: true });

module.exports = mongoose.model('ActiveSession', activeSessionSchema);
