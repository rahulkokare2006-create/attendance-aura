const express = require('express');
const LeaveApplication = require('../models/LeaveApplication');
const { protect, restrictTo } = require('../middleware/auth');
const router = express.Router();

// POST /api/leaves - Student submits leave
router.post('/', protect, restrictTo('student'), async (req, res) => {
  try {
    const { subject, fromDate, toDate, reason, fileName, fileData } = req.body;
    
    // CRITICAL FIX: Validate date fields
    if (!fromDate || !toDate) return res.status(400).json({ error: 'From date and to date are required' });
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason is required' });
    
    // Ensure dates are in valid format
    const from = new Date(fromDate);
    const to = new Date(toDate);
    
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    if (to < from) {
      return res.status(400).json({ error: 'End date must be on or after start date' });
    }
    
    let targetFileName = fileName || null;
    if (fileData && typeof fileData === 'object' && fileData.name) {
      targetFileName = fileData.name;
    }
    
    const leave = await LeaveApplication.create({
      studentId: req.user._id, studentName: req.user.name,
      studentUSN: req.user.usn, studentBranch: req.user.branch,
      studentSemester: req.user.semester, subject: subject || '',
      fromDate: fromDate, toDate: toDate, reason: reason.trim(),
      fileName: targetFileName, fileData: fileData || null,
    });
    res.status(201).json({ success: true, leave });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leaves/my - Student's own leaves
router.get('/my', protect, restrictTo('student'), async (req, res) => {
  try {
    const leaves = await LeaveApplication.find({ studentId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, leaves });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leaves/inbox - Manager inbox (own dept only)
router.get('/inbox', protect, restrictTo('manager'), async (req, res) => {
  try {
    const filter = req.user.department ? { studentBranch: req.user.department } : {};
    const leaves = await LeaveApplication.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, leaves });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leaves/notifications - Teacher/Manager notifications (approved leaves)
router.get('/notifications', protect, restrictTo('teacher', 'manager', 'admin'), async (req, res) => {
  try {
    const dept = req.user.department || req.user.branch || '__none__';
    const leaves = await LeaveApplication.find({
      status: 'approved',
      forTeachers: true,
      $or: [
        { approvedBranch: dept },
        { studentBranch: dept }
      ]
    }).sort({ updatedAt: -1 });
    res.json({ success: true, leaves });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/leaves/:id/review - Manager approves/rejects
router.put('/:id/review', protect, restrictTo('manager'), async (req, res) => {
  try {
    const { status, reviewNote } = req.body;
    const leave = await LeaveApplication.findByIdAndUpdate(req.params.id, {
      status, reviewNote: reviewNote || '',
      reviewedBy: req.user.name, reviewedAt: new Date(),
      forTeachers: status === 'approved',
      approvedBranch: status === 'approved' ? req.user.department : null,
      viewedByStudent: false, // Reset flag so student gets approval/rejection notification
      viewedByTeacher: false, // Reset flag so teacher gets notification if approved
      viewedByManager: true, // Mark viewed by reviewing manager
    }, { new: true });
    if (!leave) return res.status(404).json({ error: 'Leave application not found' });
    res.json({ success: true, leave });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/leaves/:id/acknowledge - Mark notification as viewed/acknowledged by user
router.put('/:id/acknowledge', protect, async (req, res) => {
  try {
    const leave = await LeaveApplication.findById(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Leave application not found' });

    if (req.user.role === 'student') {
      leave.viewedByStudent = true;
    } else if (req.user.role === 'teacher') {
      leave.viewedByTeacher = true;
    } else if (req.user.role === 'manager') {
      leave.viewedByManager = true;
    }
    await leave.save();
    res.json({ success: true, message: 'Notification acknowledged', leave });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leaves/:id - Delete leave (Student who submitted, Manager, Admin, or Teacher)
router.delete('/:id', protect, async (req, res) => {
  try {
    const leave = await LeaveApplication.findById(req.params.id);
    if (!leave) {
      // If already deleted, return success so client syncs cleanly
      return res.json({ success: true, message: 'Leave application already deleted' });
    }

    const isStudentOwner = req.user.role === 'student' && (
      (leave.studentId && leave.studentId.toString() === req.user._id.toString()) ||
      (leave.studentUSN && req.user.usn && leave.studentUSN.trim().toUpperCase() === req.user.usn.trim().toUpperCase())
    );

    const isManagerOrAdmin = req.user.role === 'manager' || req.user.role === 'admin';

    const isTeacherScope = req.user.role === 'teacher' && (
      !req.user.branch ||
      leave.studentBranch === req.user.branch ||
      leave.approvedBranch === req.user.branch ||
      leave.studentBranch === req.user.department
    );

    if (!isStudentOwner && !isManagerOrAdmin && !isTeacherScope) {
      return res.status(403).json({ error: 'Not authorized to delete this leave application' });
    }

    await LeaveApplication.findByIdAndDelete(req.params.id);
    console.log(`[DELETE /api/leaves/:id] Deleted leave ID: ${req.params.id} by ${req.user.name} (${req.user.role})`);
    res.json({ success: true, message: 'Leave application deleted successfully' });
  } catch (err) {
    console.error('Delete leave error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
