const express = require('express');
const mongoose = require('mongoose');
const ActiveSession = require('../models/ActiveSession');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const { protect, restrictTo } = require('../middleware/auth');
const router = express.Router();

// Haversine formula to calculate distance between two GPS coordinates in meters
const getDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// POST /api/attendance/start-session - Teacher starts session
router.post('/start-session', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const { classId, otp, qrData, geoFencingEnabled, teacherLat, teacherLng, gpsRadius, sessionId: requestedSessionId } = req.body;
    
    let cls = null;
    if (classId && mongoose.Types.ObjectId.isValid(classId)) {
      cls = await Class.findById(classId);
    }
    if (!cls) {
      cls = await Class.findOne({ teacherId: req.user._id, isActive: true });
    }
    if (!cls) {
      cls = await Class.findOne({ teacherId: req.user._id });
    }
    if (!cls) return res.status(404).json({ error: 'Class not found. Please create a class first.' });

    // Delete any existing active session for this teacher
    await ActiveSession.deleteOne({ teacherId: req.user._id });

    const sessionId = requestedSessionId || Date.now().toString();
    const now = new Date();

    // Initialize all students as ABSENT
    const records = {};
    const markedStudents = {};
    cls.students.forEach(s => { records[s.usn] = 'ABSENT'; });

    const session = await ActiveSession.create({
      sessionId, teacherId: req.user._id, classId,
      className: cls.name, subject: cls.subject,
      branch: cls.branch, semester: cls.semester, section: cls.section,
      batch: cls.batch || '',
      otp, qrData: qrData || '', geoFencingEnabled: geoFencingEnabled || false,
      teacherLat: teacherLat || null, teacherLng: teacherLng || null,
      gpsRadius: gpsRadius || 50, records, markedStudents,
      students: cls.students || [],  // Include students list for student enrollment verification
      date: now.toISOString().split('T')[0],
      startTime: now.toLocaleTimeString(),
    });

    // Emit via socket.io
    const io = req.app.get('io');
    io.emit(`session:${sessionId}:update`, { records });
    io.emit('active-session-changed', { session, type: 'start' });
    console.log(`[IO] Emitted session:${sessionId}:update and active-session-changed (start-session)`);

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/attendance/update-otp - Teacher updates OTP during active session
router.put('/update-otp', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const { sessionId, otp, qrData } = req.body;
    const session = await ActiveSession.findOneAndUpdate(
      { sessionId, teacherId: req.user._id },
      { otp, qrData },
      { new: true }
    );
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    // Emit via socket.io
    req.app.get('io').emit(`session:${sessionId}:otp-update`, { otp, qrData });
    console.log(`[IO] Emitted session:${sessionId}:otp-update (update-otp)`);
    
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/active-session - Get current active session
router.get('/active-session', protect, async (req, res) => {
  try {
    let session;
    if (req.user.role === 'teacher' || req.user.role === 'manager') {
      session = await ActiveSession.findOne({ teacherId: req.user._id, isActive: true });
    } else {
      // Student gets session by branch/semester/section
      session = await ActiveSession.findOne({
        branch: req.user.branch,
        semester: req.user.semester,
        section: req.user.section,
        isActive: true,
      });
    }
    if (!session) return res.json({ success: true, session: null });
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/mark - Student marks attendance
router.post('/mark', protect, restrictTo('student'), async (req, res) => {
  try {
    const { sessionId, otp, deviceId, deviceToken, lat, lng } = req.body;
    const usn = req.user.usn;
    const targetToken = deviceToken || deviceId;

    const session = await ActiveSession.findOne({ sessionId, isActive: true });
    if (!session) return res.status(404).json({ error: '❌ No active session found! Ask your teacher to start the session.' });

    // Validate OTP
    if (session.otp !== otp) return res.status(400).json({ error: '❌ Wrong OTP! Please check the OTP shown by your teacher.' });

    // Device Session Token required
    if (!targetToken) {
      return res.status(400).json({ error: '❌ Device Session Token is required for attendance marking.' });
    }

    // Attendance Session Device Token Check (Proxy Detection strictly scoped per session)
    const duplicateUsage = Array.from(session.markedStudents.values()).find((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const entryToken = entry.deviceToken || entry.deviceId;
      return entryToken === targetToken && entry.usn !== usn;
    });

    if (duplicateUsage) {
      const existingStudent = session.students?.find(s => s.usn === duplicateUsage.usn);
      const existingName = existingStudent?.name || duplicateUsage.studentName || duplicateUsage.usn;
      const alertTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Emit socket notification to teacher dashboard
      const proxyAlert = {
        sessionId,
        studentUSN: usn,
        studentName: req.user.name,
        existingUSN: duplicateUsage.usn,
        existingName: existingName,
        deviceToken: targetToken,
        time: alertTime,
        type: 'POSSIBLE_PROXY_ATTENDANCE',
      };
      req.app.get('io').emit(`session:${sessionId}:proxy-alert`, proxyAlert);
      console.log(`[IO] Emitted proxy alert for session ${sessionId}: ${req.user.name} (${usn}) attempted attendance on device already used by ${existingName} (${duplicateUsage.usn})`);

      // Push to session outsideAlerts list for teacher manual review
      await ActiveSession.findOneAndUpdate(
        { sessionId, isActive: true },
        {
          $push: {
            outsideAlerts: {
              studentName: req.user.name,
              studentUSN: usn,
              distance: 0,
              radius: session.gpsRadius || 50,
              time: `⚠️ Possible Proxy Attendance: Attempted on device already used by ${existingName} (${duplicateUsage.usn}) at ${alertTime}`,
              markedAt: new Date(),
            }
          }
        }
      );

      return res.status(400).json({
        error: `❌ Possible Proxy Attendance Detected! This device was already used by ${existingName} (${duplicateUsage.usn}) in this session.`
      });
    }

    // GPS Geofencing Check
    if (session.geoFencingEnabled && session.teacherLat && session.teacherLng) {
      if (lat === undefined || lng === undefined) {
        return res.status(400).json({ error: '❌ GPS location is required for this session!' });
      }
      const distance = getDistance(lat, lng, session.teacherLat, session.teacherLng);
      if (distance > session.gpsRadius) {
        return res.status(400).json({ error: `❌ GPS Verification Failed! You are ${Math.round(distance)}m away. Must be within ${session.gpsRadius}m.` });
      }
    }

    const normalizeSem = (sem) => {
      if (!sem) return '';
      const match = String(sem).match(/\d+/);
      return match ? match[0] : String(sem).trim().toLowerCase();
    };

    const getGraduationYear = (batchStr) => {
      if (!batchStr) return '';
      const matches = String(batchStr).match(/\b(20\d{2})\b/g);
      if (matches && matches.length > 0) {
        return matches[matches.length - 1];
      }
      return String(batchStr).trim().toLowerCase();
    };

    const norm = (str) => String(str || '').trim().toLowerCase();

    // Graduation Year / Batch validation (supports Regular and Lateral Entry studying together)
    const sessionGradYear = getGraduationYear(session.batch);
    const userGradYear = getGraduationYear(req.user.batch);
    if (session.batch && req.user.batch && sessionGradYear && userGradYear && norm(sessionGradYear) !== norm(userGradYear)) {
      return res.status(400).json({ error: `❌ Graduation Year mismatch! Session is for Graduation Year ${sessionGradYear} but your profile is for ${userGradYear}` });
    }
    if (normalizeSem(session.semester) !== normalizeSem(req.user.semester)) {
      return res.status(400).json({ error: `❌ Semester mismatch! Session is for Semester ${session.semester} but your current semester is Semester ${req.user.semester}` });
    }
    if (session.branch && req.user.branch && norm(session.branch) !== norm(req.user.branch)) {
      return res.status(400).json({ error: `❌ Branch mismatch! Session is for ${session.branch} but you are in ${req.user.branch}` });
    }
    if (session.section && req.user.section && norm(session.section) !== norm(req.user.section)) {
      return res.status(400).json({ error: `❌ Section mismatch! Session is for Section ${session.section} but you are in Section ${req.user.section}` });
    }

    // Check already marked
    if (session.markedStudents.get(usn)) {
      return res.status(400).json({ error: '⚠️ You have already marked attendance for this session!' });
    }

    // Check enrolled - use session.students list (already includes class students)
    const isEnrolled = session.students?.some(s => s.usn?.trim().toUpperCase() === usn?.trim().toUpperCase());
    if (!isEnrolled) return res.status(400).json({ error: `❌ Your USN (${usn}) is not in this class! Ask your teacher to add you.` });

    // Mark as PRESENT atomically to prevent VersionError/collisions under high concurrent student load
    const updatedSession = await ActiveSession.findOneAndUpdate(
      { sessionId, isActive: true },
      { 
        $set: { 
          [`records.${usn}`]: 'PRESENT',
          [`markedStudents.${usn}`]: { markedAt: new Date(), deviceToken: targetToken, deviceId: targetToken, usn, studentName: req.user.name }
        } 
      },
      { new: true }
    );

    if (!updatedSession) {
      return res.status(500).json({ error: '❌ Failed to mark attendance. Please try again.' });
    }

    // Emit real-time update via socket.io
    const payload = { usn, status: 'PRESENT' };
    req.app.get('io').emit(`session:${sessionId}:update`, payload);
    console.log(`[IO] Emitted session:${sessionId}:update (mark) -> usn=${usn}`);

    res.json({ success: true, message: '🎉 Attendance marked successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/attendance/manual-toggle - Teacher manually toggles student
router.put('/manual-toggle', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const { sessionId, usn, status } = req.body;
    
    // Validate input
    if (!sessionId || !usn || !status) {
      return res.status(400).json({ error: 'sessionId, usn, and status are required' });
    }
    if (!['PRESENT', 'ABSENT'].includes(status)) {
      return res.status(400).json({ error: 'Status must be PRESENT or ABSENT' });
    }
    
    console.log(`[DEBUG] manual-toggle called with: sessionId=${sessionId}, usn=${usn}, status=${status}`);
    const session = await ActiveSession.findOne({ sessionId });
    if (!session) {
      const allActive = await ActiveSession.find({}, 'sessionId className');
      console.log(`[DEBUG] ActiveSession NOT found for sessionId=${sessionId}. Existing active sessions:`, allActive);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify authorization: must be the teacher or a manager
    if (req.user.role !== 'manager' && session.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to modify this session' });
    }

    const updatedSession = await ActiveSession.findOneAndUpdate(
      { sessionId },
      { $set: { [`records.${usn}`]: status } },
      { new: true }
    );
    if (!updatedSession) return res.status(404).json({ error: 'Session not found' });
    
    // Emit via socket.io - convert Map to object properly and normalize keys
    const recordsObj = {};
    if (updatedSession.records) {
      if (typeof updatedSession.records.forEach === 'function') {
        updatedSession.records.forEach((value, key) => {
          const normKey = String(key || '').trim().toUpperCase();
          if (recordsObj[normKey] === 'PRESENT' || value === 'PRESENT') {
            recordsObj[normKey] = 'PRESENT';
          } else {
            recordsObj[normKey] = 'ABSENT';
          }
        });
      } else {
        Object.entries(updatedSession.records).forEach(([key, value]) => {
          const normKey = String(key || '').trim().toUpperCase();
          if (recordsObj[normKey] === 'PRESENT' || value === 'PRESENT') {
            recordsObj[normKey] = 'PRESENT';
          } else {
            recordsObj[normKey] = 'ABSENT';
          }
        });
      }
    }
    req.app.get('io').emit(`session:${sessionId}:update`, { usn, status, records: recordsObj });
    res.json({ success: true, message: `✅ Marked ${usn} as ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/end-session - Teacher ends session
router.post('/end-session', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const { sessionId, save } = req.body;
    console.log(`[endSession] Received: sessionId=${sessionId}, save=${save}`);
    const session = await ActiveSession.findOne({ sessionId });
    if (!session) {
      console.log(`[endSession] Session not found: sessionId=${sessionId}`);
      return res.status(404).json({ error: 'Session not found' });
    }
    console.log(`[endSession] Found session: sessionId=${sessionId}, save=${save}`);

    if (req.user.role !== 'manager' && session.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to modify this session' });
    }

    if (save) {
      let cls = null;
      if (session.classId && mongoose.Types.ObjectId.isValid(session.classId)) {
        cls = await Class.findById(session.classId);
      }
      if (!cls && session.teacherId) {
        cls = await Class.findOne({ teacherId: session.teacherId, isActive: true });
      }
      const studentsList = (cls?.students && cls.students.length > 0) ? cls.students : (session.students || []);
      const records = studentsList.map(student => {
        let status = 'ABSENT';
        let markedAt = null;
        const studentUsn = String(student.usn || '').trim().toUpperCase();
        
        if (session.records) {
          if (typeof session.records.forEach === 'function') {
            session.records.forEach((v, k) => {
              if (String(k || '').trim().toUpperCase() === studentUsn) {
                if (v === 'PRESENT') status = 'PRESENT';
              }
            });
          } else {
            Object.entries(session.records).forEach(([k, v]) => {
              if (String(k || '').trim().toUpperCase() === studentUsn) {
                if (v === 'PRESENT') status = 'PRESENT';
              }
            });
          }
        }

        if (session.markedStudents) {
          if (typeof session.markedStudents.forEach === 'function') {
            session.markedStudents.forEach((v, k) => {
              if (String(k || '').trim().toUpperCase() === studentUsn) {
                markedAt = v?.markedAt || null;
              }
            });
          } else {
            Object.entries(session.markedStudents).forEach(([k, v]) => {
              if (String(k || '').trim().toUpperCase() === studentUsn) {
                markedAt = v?.markedAt || null;
              }
            });
          }
        }

        return {
          usn: student.usn,
          studentName: student.name,
          status,
          markedAt
        };
      });

      console.log(`[endSession] Creating Attendance record with ${records.length} student records`);
      const attendanceRecord = await Attendance.create({
        classId: session.classId,
        teacherId: session.teacherId,
        className: session.className,
        subject: session.subject,
        branch: session.branch,
        semester: session.semester,
        section: session.section,
        batch: session.batch || cls?.batch || '',
        date: session.date,
        year: new Date().getFullYear().toString(),
        records,
        sessionId,
        startTime: session.startTime,
        endTime: new Date().toLocaleTimeString(),
      });
      console.log(`[endSession] Attendance record created: ${attendanceRecord._id}`);
    } else {
      console.log(`[endSession] Session ended without saving (save=false)`);
    }

    session.isActive = false;
    await session.save();
    await ActiveSession.deleteOne({ sessionId });
    console.log(`[endSession] Session cleanup complete, deleted from ActiveSession collection`);

    // Emit socket event for active session state change
    const io = req.app.get('io');
    io.emit('active-session-changed', { session: null, sessionId, type: 'end' });

    res.json({ success: true, message: save ? 'Attendance saved!' : 'Session ended without saving' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/student/:usn - Get student attendance history (supports academic group inheritance for new & lateral entry students)
router.get('/student/:usn', protect, async (req, res) => {
  try {
    const usn = req.params.usn.toUpperCase();
    const User = require('../models/User');
    const studentUser = await User.findOne({ usn });

    const getGraduationYear = (batchStr) => {
      if (!batchStr) return '';
      const matches = String(batchStr).match(/\b(20\d{2})\b/g);
      if (matches && matches.length > 0) return matches[matches.length - 1];
      return String(batchStr).trim().toLowerCase();
    };

    const normalizeSem = (sem) => {
      if (!sem) return '';
      const match = String(sem).match(/\d+/);
      return match ? match[0] : String(sem).trim().toLowerCase();
    };

    const norm = (str) => String(str || '').trim().toLowerCase();

    let candidateRecords = [];

    if (studentUser && studentUser.branch && studentUser.semester) {
      const studentBranch = studentUser.branch.trim();
      const studentSem = normalizeSem(studentUser.semester);
      const studentSection = norm(studentUser.section);
      const studentGradYear = getGraduationYear(studentUser.batch);

      // Find all class attendance records for the student's branch
      const branchRecords = await Attendance.find({
        branch: new RegExp(`^${studentBranch}$`, 'i'),
      }).sort({ createdAt: -1 });

      candidateRecords = branchRecords.filter(r => {
        const rSem = normalizeSem(r.semester);
        const rSection = norm(r.section);
        const rGradYear = getGraduationYear(r.batch);

        const semMatch = rSem === studentSem;
        const sectionMatch = !studentSection || !rSection || rSection === studentSection;
        const gradYearMatch = !studentGradYear || !rGradYear || norm(studentGradYear) === norm(rGradYear);
        const hasDirectUSN = r.records && r.records.some(rec => rec.usn && rec.usn.toUpperCase() === usn);

        return hasDirectUSN || (semMatch && sectionMatch && gradYearMatch);
      });
    } else {
      candidateRecords = await Attendance.find({ 'records.usn': usn }).sort({ createdAt: -1 });
    }

    const history = candidateRecords.map(r => {
      const studentRecord = r.records.find(rec => rec.usn && rec.usn.toUpperCase() === usn);
      return {
        id: r._id,
        className: r.className,
        subject: r.subject,
        date: r.date,
        year: r.year,
        status: studentRecord?.status || 'ABSENT',
        sessionId: r.sessionId,
        branch: r.branch,
        semester: r.semester,
        section: r.section,
        batch: r.batch,
        startTime: r.startTime,
        endTime: r.endTime,
      };
    });

    res.json({ success: true, history });
  } catch (err) {
    console.error('getStudentHistory error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/teacher/:teacherId - Get teacher attendance history
router.get('/teacher/:teacherId', protect, async (req, res) => {
  try {
    const history = await Attendance.find({ teacherId: req.params.teacherId })
      .sort({ createdAt: -1 });
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/attendance/:id - Edit past attendance
router.put('/:id', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const { records } = req.body;
    const id = req.params.id;

    let query;
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ _id: id }, { sessionId: id }] };
    } else {
      query = { sessionId: id };
    }

    if (req.user.role !== 'manager') {
      query.teacherId = req.user._id;
    }

    const attendance = await Attendance.findOneAndUpdate(
      query, { records }, { new: true }
    );
    if (!attendance) return res.status(404).json({ error: 'Attendance record not found' });
    res.json({ success: true, attendance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/session/:sessionId/live - Get live session records
router.get('/session/:sessionId/live', protect, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    
    const session = await ActiveSession.findOne({ sessionId });
    if (!session) {
      // Session not found - might have ended already, return empty records
      console.log(`[DEBUG] Session ${sessionId} not found in getLiveRecords - session may have ended`);
      return res.json({ success: true, records: {} });
    }
    
    // Convert Map to object properly and normalize keys
    const recordsObj = {};
    if (session.records) {
      if (typeof session.records.forEach === 'function') {
        session.records.forEach((value, key) => {
          const normKey = String(key || '').trim().toUpperCase();
          if (recordsObj[normKey] === 'PRESENT' || value === 'PRESENT') {
            recordsObj[normKey] = 'PRESENT';
          } else {
            recordsObj[normKey] = 'ABSENT';
          }
        });
      } else {
        Object.entries(session.records).forEach(([key, value]) => {
          const normKey = String(key || '').trim().toUpperCase();
          if (recordsObj[normKey] === 'PRESENT' || value === 'PRESENT') {
            recordsObj[normKey] = 'PRESENT';
          } else {
            recordsObj[normKey] = 'ABSENT';
          }
        });
      }
    }
    res.json({ success: true, records: recordsObj });
  } catch (err) {
    console.error('getLiveRecords error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/outside-alert - Student outside classroom or duplicate device alert
router.post('/outside-alert', protect, async (req, res) => {
  try {
    const { sessionId, studentName, studentUSN, distance, radius, time, type } = req.body;
    const session = await ActiveSession.findOne({ sessionId });
    if (session) {
      const alerts = session.outsideAlerts || [];
      const alertType = type || (distance ? 'outside_classroom' : 'duplicate_device');
      // Only add if same alert type has not already been reported for the student
      if (!alerts.find(a => a.studentUSN === studentUSN && a.type === alertType)) {
        const newAlert = {
          studentName,
          studentUSN,
          distance: distance || 0,
          radius: radius || 0,
          time: time || new Date().toISOString(),
          type: alertType,
          markedAt: new Date(),
        };
        alerts.push(newAlert);
        session.outsideAlerts = alerts;
        await session.save();
        // Real-time notify teacher
        req.app.get('io').emit(`session:${sessionId}:outside-alert`, newAlert);
        console.log(`⚠️ Outside alert: ${studentName} (${studentUSN}) type=${alertType}`);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/outside-alerts/:sessionId
router.get('/outside-alerts/:sessionId', protect, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    
    const session = await ActiveSession.findOne({ sessionId });
    if (!session) {
      console.log(`[outside-alerts] No active session found for sessionId=${sessionId}, returning empty alerts`);
      return res.json({ success: true, alerts: [] });
    }
    
    res.json({ success: true, alerts: session?.outsideAlerts || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/attendance/teacher/all - Delete ALL attendance records for teacher
router.delete('/teacher/all', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const teacherId = req.user._id;
    await Attendance.deleteMany({ teacherId });
    await ActiveSession.deleteMany({ teacherId });
    res.json({ success: true, message: 'All attendance history deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/attendance/:id - Delete an attendance record
router.delete('/:id', protect, restrictTo('teacher', 'manager'), async (req, res) => {
  try {
    const id = req.params.id;

    let query;
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ _id: id }, { sessionId: id }] };
    } else {
      query = { sessionId: id };
    }

    if (req.user.role !== 'manager') {
      query.teacherId = req.user._id;
    }

    const attendance = await Attendance.findOneAndDelete(query);
    if (!attendance) return res.status(404).json({ error: 'Attendance record not found or not authorized' });
    res.json({ success: true, message: 'Attendance record deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// Debug emit endpoint - POST /api/attendance/emit-test
// Body: { sessionId: string, usn?: string, status?: 'PRESENT'|'ABSENT' }
// Protected route - any authenticated user can use for quick testing in staging.
router.post('/emit-test', protect, async (req, res) => {
  try {
    const { sessionId, usn, status } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const payload = {
      usn: usn || 'TEST_USN',
      status: status || 'PRESENT',
      records: {},
      debug: true,
      emittedBy: req.user ? req.user.email || req.user._id : 'unknown'
    };

    // emit to all listeners
    req.app.get('io').emit(`session:${sessionId}:update`, payload);
    console.log(`[IO][DEBUG] Emitted session:${sessionId}:update (emit-test) ->`, payload);
    res.json({ success: true, emitted: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public debug emit endpoint (no auth) - useful for quick connectivity tests on staging
// POST /api/attendance/emit-test-public { sessionId, usn?, status? }
router.post('/emit-test-public', async (req, res) => {
  try {
    const { sessionId, usn, status } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    const payload = {
      usn: usn || 'TEST_USN',
      status: status || 'PRESENT',
      records: {},
      debug: true,
      emittedBy: 'public-debug'
    };
    req.app.get('io').emit(`session:${sessionId}:update`, payload);
    console.log(`[IO][DEBUG][PUBLIC] Emitted session:${sessionId}:update ->`, payload);
    res.json({ success: true, emitted: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
