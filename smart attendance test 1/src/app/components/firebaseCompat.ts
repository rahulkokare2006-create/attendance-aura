// ============================================================
// FIREBASE COMPATIBILITY LAYER
// Makes all existing Firebase code work with MongoDB backend
// Drop-in replacement for firebase/database and firebase/firestore
// ============================================================

import { attendanceAPI, classesAPI, usersAPI, leavesAPI, API_URL } from './api';
import { io } from 'socket.io-client';

const getToken = () => localStorage.getItem('attendance_token');

// ============================================================
// REALTIME DATABASE COMPATIBILITY
// ============================================================

// Socket.io connection for real-time
let socket: any = null;
const listeners: Map<string, Function[]> = new Map();

const getSocket = () => {
  if (!socket) {
    socket = io(API_URL, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
    });
    // Diagnostic logging
    socket.on('connect', () => {
      console.log('[Socket] connected', socket.id, 'to', API_URL);
    });
    socket.on('connect_error', (err: any) => {
      console.error('[Socket] connect_error', err?.message || err);
    });
    socket.on('disconnect', (reason: any) => {
      console.log('[Socket] disconnected', reason);
    });
  }
  return socket;
};

// In-memory store for compatibility
const memStore: Record<string, any> = {};

export const setSessionSaveChoice = (save: boolean) => {
  memStore['should_save_session'] = save;
};

export const clearSessionSaveChoice = () => {
  delete memStore['should_save_session'];
};

// ref() - creates a reference (returns path string)
export const ref = (db: any, path: string) => ({ path, db });

// get() - reads data once
export const get = async (refObj: any) => {
  const path: string = refObj.path || refObj;
  
  try {
    // Teacher classes
    if (path.startsWith('teacher_classes/')) {
      const data = await classesAPI.getAll();
      const classes = (data.classes || []).map((c: any) => ({
        ...c,
        id: c._id?.toString() || c.id,
      }));
      return {
        exists: () => classes.length > 0,
        val: () => classes,
      };
    }
    
    // Attendance history
    if (path.startsWith('attendance_history/')) {
      const teacherId = path.split('/')[1];
      const data = await attendanceAPI.getTeacherHistory(teacherId);
      const history = data.history || [];
      const histObj: any = {};
      history.forEach((h: any) => {
        const recordsObj: Record<string, string> = {};
        if (Array.isArray(h.records)) {
          h.records.forEach((r: any) => {
            recordsObj[r.usn] = r.status;
          });
        }
        const students = Array.isArray(h.records) ? h.records.map((r: any) => ({
          usn: r.usn,
          name: r.studentName || r.usn,
          rollNo: '',
        })) : [];
        
        const sessionId = h.sessionId || h._id.toString();
        histObj[sessionId] = {
          id: sessionId,
          _id: h._id.toString(),
          sessionId: h.sessionId,
          classId: h.classId?.toString(),
          className: h.className,
          subject: h.subject,
          date: h.date,
          year: h.year,
          startTime: h.startTime,
          endTime: h.endTime,
          records: recordsObj,
          students,
        };
      });
      return {
        exists: () => history.length > 0,
        val: () => histObj,
      };
    }

    // Student attendance
    if (path.startsWith('student_attendance/')) {
      const usn = path.split('/')[1].toUpperCase();
      const data = await attendanceAPI.getStudentHistory(usn);
      const history = data.history || [];
      const histObj: any = {};
      history.forEach((h: any) => {
        const status = h.status || 'ABSENT';
        
        const sessionId = h.sessionId || h._id.toString();
        histObj[sessionId] = {
          id: sessionId,
          subject: h.subject,
          className: h.className,
          date: h.date,
          year: h.year || new Date(h.date).getFullYear().toString(),
          status,
        };
      });
      return {
        exists: () => history.length > 0,
        val: () => histObj,
      };
    }

    // Active session records
    if (path.startsWith('active_session_records/')) {
      const sessionId = path.split('/')[1];
      try {
        const data = await attendanceAPI.getLiveRecords(sessionId);
        // If session not found (404), getLiveRecords now returns empty records instead of error
        // This allows graceful degradation when session ends while students are checking live records
        return {
          exists: () => Object.keys(data.records || {}).length > 0,
          val: () => data.records || {},
        };
      } catch {
        // Session not found or API error - return empty records
        return { exists: () => false, val: () => ({}) };
      }
    }

    // Active session
    if (path === 'active_session') {
      try {
        const data = await attendanceAPI.getActiveSession();
        if (data.session) {
          memStore['current_session'] = data.session;
          memStore['active_session'] = data.session;
        }
        return {
          exists: () => !!data.session,
          val: () => data.session,
        };
      } catch {
        return { exists: () => false, val: () => null };
      }
    }

    // Teacher settings
    if (path.startsWith('teacher_settings/')) {
      const stored = localStorage.getItem(`teacher_settings_${path}`);
      return {
        exists: () => !!stored,
        val: () => stored ? JSON.parse(stored) : null,
      };
    }

    // Leave applications
    if (path === 'leave_applications') {
      const userStr = localStorage.getItem('attendance_user');
      const user = userStr ? JSON.parse(userStr) : null;
      let leaves = [];
      if (user?.role === 'student') {
        const data = await leavesAPI.getMyLeaves();
        leaves = data.leaves || [];
      } else {
        const data = await leavesAPI.getInbox();
        leaves = data.leaves || [];
      }
      const obj: any = {};
      leaves.forEach((l: any) => { obj[l._id] = { ...l, id: l._id }; });
      return { exists: () => leaves.length > 0, val: () => obj };
    }

    if (path === 'leave_notifications') {
      const data = await leavesAPI.getNotifications();
      const leaves = data.leaves || [];
      const obj: any = {};
      leaves.forEach((l: any) => { obj[l._id] = { ...l, id: l._id }; });
      return { exists: () => leaves.length > 0, val: () => obj };
    }

    // Memory store fallback
    const stored = memStore[path];
    return {
      exists: () => stored !== undefined && stored !== null,
      val: () => stored,
    };
  } catch (err) {
    console.error(`get(${path}) error:`, err);
    return { exists: () => false, val: () => null };
  }
};

// set() - writes data
export const set = async (refObj: any, value: any) => {
  const path: string = refObj.path || refObj;
  
  try {
    // Teacher settings - save to localStorage
    if (path.startsWith('teacher_settings/')) {
      localStorage.setItem(`teacher_settings_${path}`, JSON.stringify(value));
      return;
    }

    // Save classes (and handle deletion)
    if (path.startsWith('teacher_classes/')) {
      if (Array.isArray(value)) {
        try {
          const currentData = await classesAPI.getAll();
          const currentClasses = currentData.classes || [];
          const updatedIds = value.map(c => c._id || c.id).filter(Boolean);
          
          // Delete classes missing from the updated list
          for (const oldCls of currentClasses) {
            const oldIdStr = oldCls._id.toString();
            if (!updatedIds.includes(oldIdStr)) {
              await classesAPI.delete(oldIdStr);
            }
          }
        } catch (err) {
          console.error("Error checking class deletions:", err);
        }

        for (const cls of value) {
          if (cls._id) {
            await classesAPI.update(cls._id, cls);
          } else {
            await classesAPI.create(cls);
          }
        }
      }
      return;
    }

    // Active session - start or update OTP
    if (path === 'active_session') {
      if (value) {
        const current = memStore['active_session'];
        if (current && (current.sessionId === value.sessionId || current.id === value.sessionId)) {
          // In-place OTP and QR update
          await attendanceAPI.updateOTP(value.sessionId, value.otp, value.qrData || '');
          memStore['active_session'] = { ...current, otp: value.otp, qrData: value.qrData };
          memStore['current_session'] = { ...current, otp: value.otp, qrData: value.qrData };
        } else {
          // New active session
          const data = await attendanceAPI.startSession(value);
          const savedSession = data.session || value;
          memStore['active_session'] = savedSession;
          memStore['current_session'] = savedSession;
        }
      }
      return;
    }

    // Student attendance write (implies teacher is saving ended session)
    if (path.startsWith('student_attendance/')) {
      // Note: This just marks that we should save. The actual save happens via endSession API call.
      // The value being set indicates whether individual student record is being saved.
      memStore['should_save_session'] = true;
      console.log(`[firebaseCompat.set] student_attendance path detected, setting should_save_session=true`);
      return;
    }

    // Active session records - initial write (ABSENT) and manual toggle updates
    if (path.startsWith('active_session_records/')) {
      const parts = path.split('/');
      if (parts.length === 3) {
        const sessionId = parts[1];
        const usn = parts[2];
        await attendanceAPI.manualToggle(sessionId, usn, value);
        return;
      }
      if (!path.includes('/', path.indexOf('/') + 1 + parts[1].length)) {
        // Bulk initial records - handled by startSession
        return;
      }
    }

    // Leave application
    if (path.startsWith('leave_applications/')) {
      if (value) {
        await leavesAPI.submit(value);
      }
      return;
    }

    // Leave notification update
    if (path.startsWith('leave_notifications/')) {
      const id = path.split('/')[1];
      if (value && value.status) {
        await leavesAPI.review(id, value.status, value.reviewNote || '');
      }
      return;
    }

    // Memory store fallback
    memStore[path] = value;
  } catch (err) {
    console.error(`set(${path}) error:`, err);
    throw err;
  }
};

// update() - partial update
export const update = async (refObj: any, value: any) => {
  const path: string = refObj.path || refObj;
  
  try {
    // Student marks attendance
    if (path.startsWith('active_session_records/')) {
      const parts = path.split('/');
      if (parts.length === 3) {
        const sessionId = parts[1];
        const usn = parts[2];
        await attendanceAPI.manualToggle(sessionId, usn, value);
        return;
      }
      const sessionId = parts[1];
      const usn = Object.keys(value)[0];
      const status = value[usn];
      if (status === 'PRESENT') {
        // Get OTP from session
        const stored = localStorage.getItem('current_student_session');
        let sessionData = memStore['current_session'];
        if (stored) {
          try {
            sessionData = JSON.parse(stored);
          } catch {}
        }
        if (sessionData) {
          const studentUsn = Object.keys(value)[0];
          const deviceId = localStorage.getItem(`device_id_${studentUsn}`) || undefined;
          const latVal = localStorage.getItem('student_lat');
          const lngVal = localStorage.getItem('student_lng');
          const lat = latVal ? parseFloat(latVal) : undefined;
          const lng = lngVal ? parseFloat(lngVal) : undefined;
          await attendanceAPI.markAttendance(sessionId, sessionData.otp, deviceId, lat, lng);
          localStorage.removeItem('student_lat');
          localStorage.removeItem('student_lng');
          localStorage.removeItem('current_student_session');
        }
      }
      return;
    }

    // Session devices
    if (path.startsWith('session_devices/')) {
      memStore[path] = { ...(memStore[path] || {}), ...value };
      return;
    }

    // Leave notification update
    if (path.startsWith('leave_notifications/')) {
      const id = path.split('/')[1];
      if (value.status) {
        await leavesAPI.review(id, value.status, value.reviewNote || '');
      }
      return;
    }

    // Leave application update
    if (path.startsWith('leave_applications/')) {
      const id = path.split('/')[1];
      if (value.status) {
        await leavesAPI.review(id, value.status, value.reviewNote || '');
      }
      return;
    }

    memStore[path] = { ...(memStore[path] || {}), ...value };
  } catch (err) {
    console.error(`update(${path}) error:`, err);
    throw err;
  }
};

// remove() - deletes data
export const remove = async (refObj: any) => {
  const path: string = refObj.path || refObj;
  
  try {
    // Delete class
    if (path.startsWith('teacher_classes/')) {
      // Handled by class delete API
      return;
    }

    // Delete leave
    if (path.startsWith('leave_applications/') || path.startsWith('leave_notifications/')) {
      const id = path.split('/')[1];
      if (id) await leavesAPI.delete(id);
      return;
    }

    // End session cleanup
    if (path === 'active_session' || path.startsWith('active_session_records/') || path.startsWith('session_devices/')) {
      if (path === 'active_session') {
        const stored = localStorage.getItem('teacher_attendance_session');
        let active = memStore['active_session'];
        if (!active && stored) {
          try {
            active = JSON.parse(stored);
          } catch {}
        }
        if (active) {
          const save = !!memStore['should_save_session'];
          console.log(`[firebaseCompat.remove] Calling endSession with save=${save} for sessionId=${active.sessionId || active.id}`);
          try {
            await attendanceAPI.endSession(active.sessionId || active.id, save);
            console.log(`[firebaseCompat.remove] endSession completed successfully`);
          } catch (err) {
            console.error(`[firebaseCompat.remove] endSession failed:`, err);
            // Don't rethrow - let cleanup continue even if endSession fails
          }
          delete memStore['active_session'];
          delete memStore['should_save_session'];
          localStorage.removeItem('teacher_attendance_session');
          localStorage.removeItem('teacher_otp');
          localStorage.removeItem('teacher_qrcode');
        }
      }
      delete memStore[path];
      return;
    }

    delete memStore[path];
  } catch (err) {
    console.error(`remove(${path}) error:`, err);
    // Don't re-throw errors for session cleanup operations - they should not crash the connection
    if (path === 'active_session' || path.startsWith('active_session_records/') || path.startsWith('session_devices/')) {
      console.log(`[firebaseCompat.remove] Suppressing error for session cleanup path: ${path}`);
      return;
    }
    throw err;
  }
};

// onValue() - real-time listener
export const onValue = (refObj: any, callback: Function, errorCallback?: Function) => {
  const path: string = refObj.path || refObj;

  // Initial fetch
  get(refObj).then(snap => callback(snap)).catch(err => {
    if (errorCallback) errorCallback(err);
  });

  // For active session records - poll every 2 seconds
  if (path.startsWith('active_session_records/')) {
    const sessionId = path.split('/')[1];
    const sock = getSocket();

    // Initial fetch to load currently marked students
    get(refObj).then(snap => callback(snap)).catch(() => {});

    const onUpdate = (data: any) => {
      const records = data.records || {};
      console.log(`[Socket][onUpdate] session:${sessionId}:update received`, data);
      callback({
        exists: () => Object.keys(records).length > 0,
        val: () => records,
      });
    };

    const onAlert = (alertData: any) => {
      if (typeof (window as any).__onOutsideAlert === 'function') {
        (window as any).__onOutsideAlert(alertData);
      }
    };

    sock.on(`session:${sessionId}:update`, onUpdate);
    sock.on(`session:${sessionId}:outside-alert`, onAlert);

    // Return unsubscribe function
    return () => {
      sock.off(`session:${sessionId}:update`, onUpdate);
      sock.off(`session:${sessionId}:outside-alert`, onAlert);
    };
  }

  // For student attendance - poll every 3 seconds for faster updates after session ends
  if (path.startsWith('student_attendance/')) {
    let lastValStr = '';
    const interval = setInterval(async () => {
      try {
        const snap = await get(refObj);
        const val = snap.val();
        const valStr = JSON.stringify(val);
        if (valStr !== lastValStr) {
          lastValStr = valStr;
          callback(snap);
        }
      } catch (err) {
        console.warn(`[firebaseCompat.onValue] Poll error for ${path}:`, err);
        // Continue polling despite errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }

  // Default - no real-time, just one-time
  return () => {};
};

// rtdb and db compatibility objects
export const rtdb = { _compat: true };
export const db = { _compat: true };
export const auth = { _compat: true };

// Store current session OTP for student marking
export const setCurrentSession = (session: any) => {
  memStore['current_session'] = session;
};

export const getCurrentSession = () => memStore['current_session'];
