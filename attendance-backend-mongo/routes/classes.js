const express = require('express');
const mongoose = require('mongoose');
const Class = require('../models/Class');
const Attendance = require('../models/Attendance');
const { protect, restrictTo } = require('../middleware/auth');
const { initializeStudentAttendanceHistory } = require('../utils/attendanceInitializer');
const router = express.Router();

// GET /api/classes - Get teacher's classes
router.get('/', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const classes = await Class.find({ teacherId: req.user._id, isActive: true });
    res.json({ success: true, classes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/classes - Create class
router.post('/', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const { name, subject, subjectCode, branch, semester, section, batch, type, students, radius } = req.body;
    
    // CRITICAL FIX: Validate all required fields
    if (!name || !name.trim()) return res.status(400).json({ error: 'Class name is required' });
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
    if (!branch || !branch.trim()) return res.status(400).json({ error: 'Branch is required' });
    if (!semester || !semester.trim()) return res.status(400).json({ error: 'Semester is required' });
    if (!section || !section.trim()) return res.status(400).json({ error: 'Section is required' });
    
    const cls = await Class.create({
      teacherId: req.user._id, name: name.trim(), subject: subject.trim(), subjectCode: subjectCode || '',
      branch: branch.trim(), semester: semester.trim(), section: section.trim(), batch: batch || '', 
      type: type || 'Theory',
      students: students || [], radius: radius || 50,
    });

    if (students && students.length > 0) {
      setImmediate(async () => {
        for (const s of students) {
          if (s.usn) {
            await initializeStudentAttendanceHistory({
              usn: s.usn,
              name: s.name,
              branch,
              semester,
              section,
              batch,
            }).catch(err => console.error('[Classes] Error initializing history:', err));
          }
        }
      });
    }

    res.status(201).json({ success: true, class: cls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/classes/:id - Update class
router.put('/:id', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const id = req.params.id;
    let cls = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      cls = await Class.findOneAndUpdate(
        { _id: id, teacherId: req.user._id },
        req.body, { new: true }
      );
    }
    if (!cls && (req.body.name || req.body.subject)) {
      cls = await Class.findOneAndUpdate(
        { teacherId: req.user._id, name: req.body.name, subject: req.body.subject },
        req.body, { new: true }
      );
    }
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    res.json({ success: true, class: cls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/classes/:id - Delete class + attendance
router.delete('/:id', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const id = req.params.id;
    let cls = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      cls = await Class.findOne({ _id: id, teacherId: req.user._id });
      if (!cls && req.user.role === 'manager') {
        cls = await Class.findById(id);
      }
    }
    if (!cls) {
      return res.status(404).json({ error: 'Class not found or not authorized' });
    }
    
    // Delete all attendance for this class
    await Attendance.deleteMany({ classId: cls._id });
    await Class.findByIdAndDelete(cls._id);
    res.json({ success: true, message: '✅ Class and all attendance records deleted!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
