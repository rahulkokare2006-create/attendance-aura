const express = require('express');
const User = require('../models/User');
const { protect, restrictTo } = require('../middleware/auth');
const router = express.Router();

// GET /api/users - Get all users (admin, manager, teacher)
// Teachers can filter by their branch: ?branch=CSE
router.get('/', protect, restrictTo('admin', 'manager', 'teacher'), async (req, res) => {
  try {
    let query = { isActive: { $ne: false } };
    
    // If teacher is requesting, allow filtering by their branch or department
    if (req.user.role === 'teacher') {
      const teacherScope = req.user.branch || req.user.department;
      if (!teacherScope) {
        return res.status(400).json({ error: 'Teacher branch or department not set. Contact admin.' });
      }
      // Teachers can only see students from their branch/department
      query = { role: 'student', branch: teacherScope, isActive: { $ne: false } };
      console.log(`[GET /api/users] Teacher (${req.user.name}) requesting students from branch/department: ${teacherScope}`);
    } else {
      // Admin/manager can filter by branch if provided, otherwise get all active users
      if (req.query.branch) {
        query.branch = req.query.branch;
        console.log(`[GET /api/users] ${req.user.role} (${req.user.name}) requesting students from branch: ${req.query.branch}`);
      } else {
        console.log(`[GET /api/users] ${req.user.role} (${req.user.name}) requesting all users`);
      }
    }
    
    const users = await User.find(query).select('-password -emailVerifyToken -resetPasswordToken');
    console.log(`[GET /api/users] Returning ${users.length} user(s) with query:`, query);
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users - Create user (admin/manager)
router.post('/', protect, restrictTo('admin', 'manager'), async (req, res) => {
  try {
    const { name, email, password, role, phone, department, designation, childName, childUSN, usn, rollNo, branch, semester, section, batch } = req.body;
    
    const normalizedEmail = email ? email.toLowerCase() : '';
    let existing = await User.findOne({ email: normalizedEmail });
    if (!existing && role === 'student' && usn) {
      existing = await User.findOne({ usn: usn.toUpperCase(), role: 'student' });
    }

    if (existing) {
      // Reconnect and restore existing database record
      existing.name = name || existing.name;
      existing.email = normalizedEmail || existing.email;
      existing.password = password;
      existing.role = role || existing.role;
      existing.phone = phone !== undefined ? phone : existing.phone;
      if (department) existing.department = department;
      if (designation) existing.designation = designation;
      if (childName) existing.childName = childName;
      if (childUSN) existing.childUSN = childUSN.toUpperCase();
      if (usn) existing.usn = usn.toUpperCase();
      if (rollNo) existing.rollNo = rollNo;
      if (branch) existing.branch = branch;
      if (semester) existing.semester = semester;
      if (section) existing.section = section;
      if (batch) existing.batch = batch;
      existing.isActive = true;
      existing.isEmailVerified = true;
      await existing.save();

      const userData = existing.toObject();
      delete userData.password;
      return res.status(200).json({ success: true, user: userData, restored: true });
    }

    // Max 2 parents per USN
    if (role === 'parent' && childUSN) {
      const count = await User.countDocuments({ role: 'parent', childUSN, isActive: { $ne: false } });
      if (count >= 2) return res.status(400).json({ error: 'Maximum 2 parent accounts already exist for this student' });
    }

    const user = await User.create({
      name, email: normalizedEmail, password, role, phone: phone || '',
      department: department || null, designation: designation || null,
      usn: usn?.toUpperCase() || null, rollNo: rollNo || null,
      branch: branch || null, semester: semester || null,
      section: section || null, batch: batch || null,
      childName: childName || null, childUSN: childUSN?.toUpperCase() || null,
      isEmailVerified: true, // Admin created accounts are pre-verified
    });

    const userData = user.toObject();
    delete userData.password;
    res.status(201).json({ success: true, user: userData });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Email already registered' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', protect, restrictTo('admin', 'manager', 'teacher', 'student'), async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.password; // Never update password here
    delete updates.role; // Never update role here
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Propagate student updates to their leave applications
    if (user.role === 'student') {
      const LeaveApplication = require('../models/LeaveApplication');
      await LeaveApplication.updateMany(
        { studentId: user._id },
        { 
          $set: { 
            studentName: user.name,
            studentBranch: user.branch,
            studentSemester: user.semester
          } 
        }
      );
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id - Delete user (account only)
router.delete('/:id', protect, restrictTo('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User account deactivated. Data preserved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// GET /api/users/student/:usn - Find student by USN (must come AFTER batch route)
router.get('/student/:usn', protect, async (req, res) => {
  try {
    const student = await User.findOne({ usn: req.params.usn.toUpperCase(), role: 'student' }).select('-password');
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json({ success: true, student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// DELETE /api/users/:id/cascade - Delete user + all data
router.delete('/:id/cascade', protect, restrictTo('admin'), async (req, res) => {
  try {
    const Attendance = require('../models/Attendance');
    const ActiveSession = require('../models/ActiveSession');
    const LeaveApplication = require('../models/LeaveApplication');
    const Class = require('../models/Class');
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Delete attendance records for a student
    if (user.usn) {
      await Attendance.updateMany({}, { $pull: { records: { usn: user.usn } } });
      await Attendance.deleteMany({ records: { $size: 0 } });
      await User.deleteMany({ role: 'parent', childUSN: user.usn });
      await LeaveApplication.deleteMany({ studentId: user._id });
      await LeaveApplication.deleteMany({ studentUSN: user.usn });
    }

    // Delete teacher and manager sessions/classes/attendance
    if (user.role === 'teacher' || user.role === 'manager') {
      await ActiveSession.deleteMany({ teacherId: user._id });
      await Class.deleteMany({ teacherId: user._id });
      await Attendance.deleteMany({ teacherId: user._id });
    }

    // Delete any leave applications created by this user if they are a student
    if (user.role === 'student') {
      await LeaveApplication.deleteMany({ studentId: user._id });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User and all related data deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/batch/:batch - Delete entire batch
router.delete('/batch/:batch', protect, restrictTo('admin'), async (req, res) => {
  try {
    const Attendance = require('../models/Attendance');
    const batch = req.params.batch;
    const students = await User.find({ role: 'student', batch });
    const usns = students.map(s => s.usn).filter(Boolean);
    
    // Delete attendance records for these students
    for (const usn of usns) {
      await Attendance.updateMany({}, { $pull: { records: { usn } } });
    }
    await Attendance.deleteMany({ records: { $size: 0 } });
    
    // Delete parent accounts linked to these students
    await User.deleteMany({ role: 'parent', childUSN: { $in: usns } });
    
    // Delete leave applications linked to these students
    const LeaveApplication = require('../models/LeaveApplication');
    await LeaveApplication.deleteMany({ studentUSN: { $in: usns } });
    
    // Delete student accounts
    await User.deleteMany({ role: 'student', batch });
    
    res.json({ success: true, message: `Batch ${batch} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
