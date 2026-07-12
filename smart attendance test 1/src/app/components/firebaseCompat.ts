// ============================================================
// FIREBASE COMPATIBILITY LAYER
// Makes all existing Firebase code work with MongoDB backend
// Drop-in replacement for firebase/database and firebase/firestore
// ============================================================

import { attendanceAPI, classesAPI, usersAPI, leavesAPI, API_URL } from './api';
import { io } from 'socket.io-client';

const getToken = () => localStorage.getItem('attendance_token');

const normalizeRecords = (records: any) => {
  if (!records || typeof records !== 'object') return {};
  if (records instanceof Map) {
    return Object.fromEntries(records);
  }
  const normalized: Record<string, string> = {};
  Object.entries(records).forEach(([key, value]) => {
    const usn = String(key || '').trim().toUpperCase();
    const status = String(value || '').trim().toUpperCase();
    if (!usn) return;
    normalized[usn] = status === 'PRESENT' ? 'PRESENT' : 'ABSENT';
  });
  return normalized;
};

// ============================================================
// REALTIME DATABASE COMPATIBILITY
// ============================================================

// Socket.io connection for real-time
let socket: any = null;
let socketConnected = false;
let socketConnectPromise: any = null;

const getSocket = async (waitForConnection = true) => {
  if (!socket) {
    // Create Socket.IO connection
    socket = io(API_URL, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    // Setup connection handlers
    socket.on('connect', () => {
      socketConnected = true;
      console.log('[Socket] ✅ Connected', socket.id, 'to', API_URL);
      if (socketConnectPromise) {
        socketConnectPromise.resolve();
        socketConnectPromise = null;
      }
    });

    socket.on('connect_error', (err: any) => {
      socketConnected = false;
      console.error('[Socket] ❌ Connection error:', err?.message || err);
    });

    socket.on('disconnect', (reason: any) => {
      socketConnected = false;
      console.warn('[Socket] ⚠️ Disconnected:', reason);
    });

    socket.on('error', (err: any) => {
      console.error('[Socket] 🔴 Error:', err?.message || err);
    });
  }

  // If connection is not established and we're waiting for it, wait for it
  if (waitForConnection && !socketConnected) {
    if (!socketConnectPromise) {
      socketConnectPromise = new Promise((resolve) => {
        if (socketConnected) {
          resolve();
        } else {
          // Wait up to 5 seconds for connection
          const timer = setTimeout(() => {
            console.warn('[Socket] Connection timeout - proceeding without waiting');
            resolve();
          }, 5000);

          const checkConnection = setInterval(() => {
            if (socketConnected) {
              clearTimeout(timer);
              clearInterval(checkConnection);
              resolve();
            }
          }, 100);
        }
      });
    }
    await socketConnectPromise;
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

// onValue() - real-time listener with Socket.IO support
export const onValue = (refObj: any, callback: Function, errorCallback?: Function) => {
  const path: string = refObj.path || refObj;
  let unsubscribeFunctions: (() => void)[] = [];

  // Initial fetch
  get(refObj)
    .then(snap => {
      if (path.startsWith('active_session_records/')) {
        const normalized = normalizeRecords(snap.val());
        memStore[path] = normalized;
        console.log(`[onValue][Initial] Fetched ${path}`, normalized);
        callback({
          exists: () => Object.keys(normalized).length > 0,
          val: () => normalized,
        });
      } else {
        console.log(`[onValue][Initial] Fetched ${path}`, snap.val());
        callback(snap);
      }
    })
    .catch(err => {
      console.error(`[onValue][Initial] Error fetching ${path}:`, err);
      if (errorCallback) errorCallback(err);
    });

  // For active session records - use Socket.IO real-time updates
  if (path.startsWith('active_session_records/')) {
    const sessionId = path.split('/')[1];
    
    // Setup Socket.IO listener asynchronously
    getSocket(true).then((sock: any) => {
      if (!sock) return;
      sock.emit('join-session', sessionId);

      // Handler for live attendance updates from backend
      const onUpdate = async (data: any) => {
        console.log(`[Socket][Update] session:${sessionId}:update received`, { usn: data.usn, status: data.status, records: data.records });
        try {
          const liveData = await attendanceAPI.getLiveRecords(sessionId);
          const records = normalizeRecords(liveData.records);
          const recordsCount = Object.keys(records).length;
          const currentRecords = memStore[path] || {};

          if (recordsCount === 0 && Object.keys(currentRecords).length > 0) {
            console.warn(`[Socket][Update] live fetch returned empty for ${path}, preserving current cached state`);
            if (data.usn && data.status) {
              const normalizedUsn = String(data.usn || '').trim().toUpperCase();
              if (normalizedUsn) {
                currentRecords[normalizedUsn] = String(data.status || '').trim().toUpperCase() === 'PRESENT' ? 'PRESENT' : 'ABSENT';
              }
            }
            callback({
              exists: () => Object.keys(currentRecords).length > 0,
              val: () => currentRecords,
            });
            return;
          }

          console.log(`[Socket][Update] session:${sessionId}:update refreshed`, { recordsCount, recordsSample: Object.entries(records).slice(0, 5) });
          memStore[path] = records;
          callback({
            exists: () => recordsCount > 0,
            val: () => records,
          });
        } catch (err: any) {
          console.warn(`[Socket][Update] failed to refresh live records for ${path}:`, err);
          if (Object.keys(memStore[path] || {}).length > 0) {
            callback({
              exists: () => true,
              val: () => memStore[path],
            });
          }
          if (errorCallback) errorCallback(err);
        }
      };

      // Handler for suspicious activity alerts
      const onAlert = (alertData: any) => {
        console.log(`[Socket][Alert] session:${sessionId}:outside-alert`, alertData);
        if (typeof (window as any).__onOutsideAlert === 'function') {
          (window as any).__onOutsideAlert(alertData);
        }
      };

      // Register socket listeners
      sock.on(`session:${sessionId}:update`, onUpdate);
      sock.on(`session:${sessionId}:outside-alert`, onAlert);

      console.log(`[Socket][Subscribe] Registered listeners for session:${sessionId}`);

      // Store unsubscribe functions
      unsubscribeFunctions.push(() => {
        sock.off(`session:${sessionId}:update`, onUpdate);
        sock.off(`session:${sessionId}:outside-alert`, onAlert);
        console.log(`[Socket][Unsubscribe] Removed listeners for session:${sessionId}`);
      });
    }).catch(err => {
      console.warn(`[Socket][Error] Failed to setup Socket.IO listener for ${path}:`, err);
    });

    // Return cleanup function
    return () => {
      unsubscribeFunctions.forEach(fn => fn());
    };
  }

  // For student attendance - use API polling with smarter debouncing
  if (path.startsWith('student_attendance/')) {
    let lastValStr = '';
    let pollTimer: any = null;
    
    const poll = async () => {
      try {
        const snap = await get(refObj);
        const val = snap.val();
        const valStr = JSON.stringify(val || {});
        
        // Only callback if data actually changed
        if (valStr !== lastValStr) {
          lastValStr = valStr;
          console.log(`[Poll][Update] ${path} - records changed`);
          callback(snap);
        }
      } catch (err) {
        console.warn(`[Poll][Error] for ${path}:`, err?.message || err);
        if (errorCallback) errorCallback(err);
      }
    };

    // Initial poll
    poll();
    
    // Set up polling interval (check every 2 seconds)
    pollTimer = setInterval(poll, 2000);
    
    unsubscribeFunctions.push(() => {
      if (pollTimer) clearInterval(pollTimer);
      console.log(`[Poll][Cleanup] Stopped polling for ${path}`);
    });

    return () => {
      unsubscribeFunctions.forEach(fn => fn());
    };
  }

  // For teacher settings and other static paths - no real-time
  if (path.startsWith('teacher_settings/') || path.startsWith('teacher_classes/') || path === 'leave_applications' || path === 'leave_notifications') {
    // One-time fetch only - these don't need real-time updates in this context
    return () => {};
  }

  // Default - return no-op unsubscribe
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
