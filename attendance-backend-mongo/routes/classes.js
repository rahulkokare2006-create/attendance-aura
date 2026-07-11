const express = require('express');
const Class = require('../models/Class');
const Attendance = require('../models/Attendance');
const { protect, restrictTo } = require('../middleware/auth');
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
    res.status(201).json({ success: true, class: cls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/classes/:id - Update class
router.put('/:id', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const cls = await Class.findOneAndUpdate(
      { _id: req.params.id, teacherId: req.user._id },
      req.body, { new: true }
    );
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    res.json({ success: true, class: cls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/classes/:id - Delete class + attendance
router.delete('/:id', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    // Verify authorization: teacher can only delete their own classes
    const cls = await Class.findOne({ _id: req.params.id, teacherId: req.user._id });
    if (!cls) {
      if (req.user.role === 'manager') {
        // Manager can delete any class
        const anyClass = await Class.findById(req.params.id);
        if (!anyClass) return res.status(404).json({ error: 'Class not found' });
      } else {
        return res.status(404).json({ error: 'Class not found or not authorized' });
      }
    }
    
    // Delete all attendance for this class
    await Attendance.deleteMany({ classId: req.params.id });
    await Class.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '✅ Class and all attendance records deleted!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
