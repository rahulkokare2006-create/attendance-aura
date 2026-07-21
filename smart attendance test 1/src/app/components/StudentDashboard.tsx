import React, { useState, useEffect } from 'react';
import { ref, set, get, update, onValue, remove, rtdb, db } from './firebaseCompat';
import { motion } from 'motion/react';
import { ArrowLeft, LogOut, Calendar, CheckCircle2, XCircle, Moon, Sun, Scan, BookOpen, BarChart3, Edit2, Save } from 'lucide-react';
import { useAuth } from './AuthContext';
import { API_URL, leavesAPI, attendanceAPI } from './api';


import { useTheme } from './ThemeContext';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface AttendanceRecord {
  subject: string;
  className: string;
  date: string;
  year: string;
  status: 'PRESENT' | 'ABSENT';
}

interface SubjectStats {
  subject: string;
  total: number;
  attended: number;
  percentage: number;
}

const normalizeSem = (sem: any): string => {
  if (!sem) return '';
  const str = String(sem).trim();
  const match = str.match(/\d+/);
  return match ? match[0] : str.toLowerCase();
};

export default function StudentDashboard() {
  const { currentUser, logout, updateUser } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();

  // Error logger - writes to Firebase for debugging
  const logError = async (context: string, error: any) => {
    try {
      const logRef = ref(rtdb, `error_logs/${Date.now()}`);
      await set(logRef, {
        context,
        error: error?.message || String(error),
        portal: 'Student',
        timestamp: new Date().toISOString(),
      });
    } catch {}
    console.error(`[Student][${context}]`, error);
  };

  const [view, setView] = useState<'dashboard' | 'mark-attendance' | 'history' | 'subject-wise' | 'edit-profile' | 'leave-application' | 'my-leaves'>(() => {
    const stored = localStorage.getItem('student_view');
    if (stored === 'mark-attendance') {
      return 'dashboard';
    }
    return (stored as any) || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('student_view', view);
  }, [view]);
  const [leaveSubject, setLeaveSubject] = useState('');
  const [leaveFromDate, setLeaveFromDate] = useState('');
  const [leaveToDate, setLeaveToDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveFile, setLeaveFile] = useState<File | null>(null);
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [editSemester, setEditSemester] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState('');
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = React.useRef<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'otp' | 'gps' | 'done'>('otp');
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'checking' | 'passed' | 'failed'>('idle');

  // Generate unique device ID per student - stored in localStorage so it persists
  const getOrCreateDeviceId = (usn: string) => {
    const key = `device_id_${usn}`;
    let id = localStorage.getItem(key);
    if (!id) {
      // Create truly unique ID: USN + random + timestamp
      id = `${usn}_${Math.random().toString(36).substring(2)}_${Date.now()}`;
      localStorage.setItem(key, id);
    }
    return id;
  };
  const [deviceId, setDeviceId] = useState('');

  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<AttendanceRecord[]>([]);
  // Initialize directly from currentUser.semester so filter is correct from the very first render
  const [selectedSemester, setSelectedSemester] = useState<string>(() => String(currentUser?.semester || ''));
  const [totalClasses, setTotalClasses] = useState(0);
  const [attendedClasses, setAttendedClasses] = useState(0);
  const [attendancePercentage, setAttendancePercentage] = useState(0);
  const [subjectStats, setSubjectStats] = useState<SubjectStats[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);

  const [studentLeaves, setStudentLeaves] = useState<any[]>([]);

  // Keep selectedSemester in sync if user's semester changes (e.g. after promotion)
  useEffect(() => {
    if (currentUser?.semester && !selectedSemester) {
      setSelectedSemester(String(currentUser.semester));
    }
  }, [currentUser?.semester]);

  const fetchStudentLeaves = async () => {
    try {
      const res = await leavesAPI.getMyLeaves();
      if (res.success && res.leaves) {
        setStudentLeaves(res.leaves);
      }
    } catch (err) {
      console.error('[StudentDashboard] Error fetching student leaves:', err);
    }
  };

  useEffect(() => {
    if (currentUser?.usn) {
      fetchStudentLeaves();
    }
  }, [currentUser]);

  // Real-time active session listener for student's branch/semester/section/batch
  useEffect(() => {
    const activeRef = ref(rtdb, 'active_session');
    const unsubscribe = onValue(activeRef, (snap: any) => {
      if (snap.exists()) {
        const session = snap.val();
        const batchMatch = !session.batch || !currentUser?.batch || normalizeSem(session.batch) === normalizeSem(currentUser?.batch);
        if (
          session &&
          batchMatch &&
          session.branch?.trim().toUpperCase() === currentUser?.branch?.trim().toUpperCase() &&
          normalizeSem(session.semester) === normalizeSem(currentUser?.semester) &&
          session.section?.trim().toUpperCase() === currentUser?.section?.trim().toUpperCase()
        ) {
          setActiveSession(session);
        } else {
          setActiveSession(null);
        }
      } else {
        setActiveSession(null);
      }
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.usn) return;
    const id = getOrCreateDeviceId(currentUser.usn);
    setDeviceId(id);

    const getRecordKey = (item: any) => item.sessionId || item.id || `${item.date}_${item.subject}`;
    const getRecordSem = (r: any) => {
      if (r.semester && String(r.semester).trim()) return String(r.semester).trim();
      if (r.classSemester && String(r.classSemester).trim()) return String(r.classSemester).trim();
      if (r.className) {
        const semMatch = String(r.className).match(/(?:sem|semester|class|sec)?\s*(\d+)/i);
        if (semMatch && semMatch[1]) return semMatch[1];
      }
      return String(currentUser?.semester || '').trim();
    };

    // Initial fetch from backend to get official history
    const loadBackendHistory = async () => {
      try {
        const backendRes = await attendanceAPI.getStudentHistory(currentUser.usn);
        if (backendRes.success && Array.isArray(backendRes.history) && backendRes.history.length > 0) {
          const tagged = backendRes.history.map((r: any) => ({
            ...r,
            semester: getRecordSem(r),
          }));
          setAttendanceHistory(prev => {
            const map = new Map<string, any>();
            tagged.forEach((item: any) => map.set(getRecordKey(item), item));
            prev.forEach((item: any) => map.set(getRecordKey(item), { ...map.get(getRecordKey(item)), ...item }));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.log('[StudentDashboard] Backend history fetch fallback to RTDB');
      }
    };
    loadBackendHistory();

    // Real-time continuous listener from RTDB - fires instantly when attendance is marked
    const studentRef = ref(rtdb, `student_attendance/${currentUser.usn}`);
    const unsubscribe = onValue(studentRef, (snapshot: any) => {
      try {
        if (snapshot.exists()) {
          const rawRecords: any[] = Object.values(snapshot.val());
          const tagged = rawRecords.map((r: any) => ({
            ...r,
            semester: getRecordSem(r),
          }));
          setAttendanceHistory(prev => {
            const map = new Map<string, any>();
            prev.forEach((item: any) => map.set(getRecordKey(item), item));
            tagged.forEach((item: any) => map.set(getRecordKey(item), { ...map.get(getRecordKey(item)), ...item }));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.error('[StudentDashboard] Error processing RTDB history:', err);
      }
    }, (err: Error) => {
      console.error('[StudentDashboard] Real-time listener error:', err);
    });

    return () => unsubscribe();
  }, [currentUser?.usn]);

  // Dynamically calculate attendance stats & filter history based on selected semester
  useEffect(() => {
    // Always resolve to current user's semester if nothing explicitly selected yet
    const effectiveSem = selectedSemester || String(currentUser?.semester || '');
    const targetSemNorm = normalizeSem(effectiveSem);

    const filtered = (targetSemNorm && effectiveSem !== 'ALL')
      ? attendanceHistory.filter((h: any) => {
          const recSemNorm = normalizeSem(h.semester);
          return recSemNorm === targetSemNorm;
        })
      : attendanceHistory;

    setFilteredHistory(filtered);
    setTotalClasses(filtered.length);
    const attended = filtered.filter((h: any) => h.status === 'PRESENT').length;
    setAttendedClasses(attended);
    setAttendancePercentage(filtered.length > 0 ? Math.round((attended / filtered.length) * 100 * 10) / 10 : 0);

    const subjectMap = new Map<string, { total: number; attended: number }>();
    filtered.forEach((record: any) => {
      if (!record.subject) return;
      const existing = subjectMap.get(record.subject) || { total: 0, attended: 0 };
      existing.total++;
      if (record.status === 'PRESENT') existing.attended++;
      subjectMap.set(record.subject, existing);
    });
    const stats: SubjectStats[] = Array.from(subjectMap.entries()).map(([subject, data]) => ({
      subject, total: data.total, attended: data.attended,
      percentage: Math.round((data.attended / data.total) * 100 * 10) / 10,
    }));
    setSubjectStats(stats);
  }, [attendanceHistory, selectedSemester, currentUser?.semester]);

  // QR Scanner using browser camera + jsQR via CDN
  const startQRScanner = async () => {
    setScanError('');
    setShowScanner(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        // Load jsQR dynamically
        if (!(window as any).jsQR) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
          script.onload = () => startScanning();
          document.head.appendChild(script);
        } else {
          startScanning();
        }
      }
    } catch (err) {
      setScanError('Camera access denied. Please allow camera permission and try again.');
      setShowScanner(false);
    }
  };

  const startScanning = () => {
    scanIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const jsQR = (window as any).jsQR;
      if (!jsQR) return;
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        try {
          const qrData = JSON.parse(code.data);
          if (qrData.otp) {
            setOtpInput(qrData.otp);
            stopQRScanner();
            toast.success('QR Code scanned! OTP filled automatically.');
          }
        } catch {
          // Not a valid QR code, keep scanning
        }
      }
    }, 300);
  };

  const stopQRScanner = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setShowScanner(false);
  };

  useEffect(() => {
    return () => {
      stopQRScanner();
    };
  }, []);

  // Helper: calculate distance between 2 GPS coords in meters
  const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // Step 1: Verify OTP + session
  const handleVerifyOTP = async () => {
    if (!otpInput || otpInput.length !== 6) { 
      toast.error('⚠️ Please enter a valid 6-digit OTP'); 
      return; 
    }
    setSubmitting(true);
    try {
      const sessionSnapshot = await get(ref(rtdb, 'active_session'));
      if (!sessionSnapshot.exists()) { 
        toast.error('❌ No active attendance session found. Ask your teacher to start a session.'); 
        setSubmitting(false); 
        return; 
      }
      const session = sessionSnapshot.val();
      console.log('[OTP] Session data:', { sessionId: session.sessionId, branch: session.branch, semester: session.semester, section: session.section, batch: session.batch });
      console.log('[OTP] Student data:', { branch: currentUser?.branch, semester: currentUser?.semester, section: currentUser?.section, batch: currentUser?.batch });

      // Check admission batch match
      if (session.batch && currentUser?.batch && normalizeSem(session.batch) !== normalizeSem(currentUser.batch)) {
        toast.error(`❌ Admission Batch Mismatch! Session is for Batch ${session.batch} but your profile is registered in Batch ${currentUser.batch}.`);
        setSubmitting(false); return;
      }
      // Check semester match
      if (normalizeSem(currentUser?.semester) !== normalizeSem(session.semester)) { 
        toast.error(`❌ Semester Mismatch! Session is for Semester ${session.semester} but your current semester is Semester ${currentUser?.semester}.`); 
        setSubmitting(false); return; 
      }
      // Check branch match
      if (currentUser?.branch?.trim().toUpperCase() !== session.branch?.trim().toUpperCase()) { 
        toast.error(`❌ Branch Mismatch! Session is for ${session.branch} but you are in ${currentUser?.branch}. Contact your teacher.`); 
        setSubmitting(false); return; 
      }
      // Check section match
      if (currentUser?.section?.trim().toUpperCase() !== session.section?.trim().toUpperCase()) { 
        toast.error(`❌ Section Mismatch! Session is for Section ${session.section} but you are in Section ${currentUser?.section}. Contact your teacher.`); 
        setSubmitting(false); return; 
      }
      
      // Check OTP
      console.log(`[OTP] Entered OTP: ${otpInput}, Expected: ${session.otp}`);
      if (otpInput !== session.otp) { 
        toast.error(`❌ Wrong OTP! Please check the OTP shown by your teacher and try again.`); 
        setSubmitting(false); return; 
      }
      localStorage.setItem('current_student_session', JSON.stringify(session));

      // Check if already marked
      const studentAttendanceRef = ref(rtdb, `session_devices/${session.sessionId}/${currentUser?.usn}`);
      const studentAttendanceSnap = await get(studentAttendanceRef);
      if (studentAttendanceSnap.exists()) {
        toast.error('⚠️ You have already marked attendance for this session!');
        setSubmitting(false);
        return;
      }

      // Check if this device has already been used by another student in this session
      const sessionDevicesRef = ref(rtdb, `session_devices/${session.sessionId}`);
      const sessionDevicesSnap = await get(sessionDevicesRef);
      if (sessionDevicesSnap.exists()) {
        const devices = sessionDevicesSnap.val();
        const currentDevId = localStorage.getItem(`device_id_${currentUser?.usn}`);
        if (currentDevId) {
          const duplicate = Object.values(devices).find((d: any) => d.usn !== currentUser?.usn && d.deviceId === currentDevId);
          if (duplicate) {
            toast.error('❌ Device mismatch! This device has already been used by another student in this session.');
            
            // Post duplicate device alert to teacher via backend socket
            fetch(`${API_URL}/api/attendance/outside-alert`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('attendance_token')}` },
              body: JSON.stringify({
                sessionId: session.sessionId,
                studentName: currentUser?.name,
                studentUSN: currentUser?.usn,
                type: 'duplicate_device',
                attemptedAt: new Date().toISOString(),
              })
            }).catch(() => {});
            
            setSubmitting(false);
            return;
          }
        }
      }

      // Check if enrolled in this class - Session already contains the students list from backend
      const isEnrolled = session.students?.some((s: any) => s.usn === currentUser?.usn);
      if (!isEnrolled) { 
        console.error('Student enrollment check failed:', { 
          studentUSN: currentUser?.usn,
          sessionStudents: session.students?.map((s: any) => s.usn) || [],
          session
        });
        toast.error(`❌ Your USN (${currentUser?.usn}) is not in this class! Ask your teacher to add you to the class student list.`); 
        setSubmitting(false); 
        return; 
      }

      setSubmitting(false);
      
      // Check if GPS is enabled by teacher BEFORE going to GPS step
      if (session.geoFencingEnabled === true && session.teacherLat && session.teacherLng) {
        setStep('gps'); // GPS enabled → show GPS step
      } else {
        // GPS disabled - but still silently check location for teacher report
        if (navigator.geolocation && session.teacherLat && session.teacherLng) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const dist = getDistance(pos.coords.latitude, pos.coords.longitude, session.teacherLat, session.teacherLng);
              const radius = session.gpsRadius || 100;
              if (dist > radius) {
                // Student is outside - notify teacher silently via API
                fetch(`${API_URL}/api/attendance/outside-alert`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('attendance_token')}` },
                  body: JSON.stringify({
                    sessionId: session.sessionId,
                    studentName: currentUser?.name,
                    studentUSN: currentUser?.usn,
                    distance: Math.round(dist),
                    radius,
                    time: new Date().toLocaleTimeString(),
                  })
                }).catch(() => {});
              }
            },
            () => {}, // Silent fail - GPS optional when disabled
            { enableHighAccuracy: false, timeout: 5000 }
          );
        }
        // Mark attendance directly (GPS verification skipped)
        await handleSubmitAttendanceDirectly(session);
      }
    } catch (error) {
      logError('handleVerifyOTP', error);
      toast.error('Failed to verify OTP. Please try again.');
      setSubmitting(false);
    }
  };

  // Direct submission without GPS (when GPS disabled)
  const handleSubmitAttendanceDirectly = async (session: any) => {
    localStorage.removeItem('student_lat');
    localStorage.removeItem('student_lng');
    setSubmitting(true);
    try {
      const studentUsn = currentUser?.usn || '';
      let success = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await update(ref(rtdb, `active_session_records/${session.sessionId}`), {
            [studentUsn]: 'PRESENT'
          });
          await update(ref(rtdb, `session_devices/${session.sessionId}`), {
            [studentUsn]: { usn: studentUsn, deviceId: localStorage.getItem(`device_id_${studentUsn}`), markedAt: new Date().toISOString() }
          });
          const newRecord = {
            id: session.sessionId,
            sessionId: session.sessionId,
            subject: session.subject,
            className: session.className,
            branch: session.branch,
            semester: String(session.semester || currentUser?.semester || '').trim(),
            date: session.date || new Date().toISOString().split('T')[0],
            year: session.year || new Date().getFullYear().toString(),
            status: 'PRESENT',
          };
          await set(ref(rtdb, `student_attendance/${studentUsn}/${session.sessionId}`), newRecord);
          setAttendanceHistory(prev => {
            const map = new Map<string, any>();
            const getKey = (item: any) => item.sessionId || item.id || `${item.date}_${item.subject}`;
            prev.forEach((item: any) => map.set(getKey(item), item));
            map.set(getKey(newRecord), newRecord);
            return Array.from(map.values());
          });
          success = true;
          break;
        } catch (retryErr) {
          if (attempt === 3) throw retryErr;
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
      if (success) {
        setStep('done');
        toast.success('🎉 Attendance marked successfully!');
        setTimeout(() => { setStep('otp'); setView('dashboard'); }, 2000);
      }
    } catch (error) {
      logError('handleSubmitAttendanceDirectly', error);
      toast.error('Failed to submit attendance. Please try again.');
      setStep('otp');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: GPS verification
  const handleGPSCheck = async () => {
    setGpsStatus('checking');
    try {
      const sessionSnapshot = await get(ref(rtdb, 'active_session'));
      const session = sessionSnapshot.val();

      if (!session.teacherLat || !session.teacherLng || session.geoFencingEnabled === false) {
        // GPS disabled by teacher or not set
        console.log('[GPS] Geofencing disabled or not configured. Skipping GPS check.');
        toast.success('Location check disabled. Proceeding...');
        setGpsStatus('passed');
        setTimeout(() => handleSubmitAttendance(), 1000);
        return;
      }

      // Geofencing is enabled - get student location
      console.log('[GPS] Geofencing enabled. Getting student location...');
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, enableHighAccuracy: true })
      );

      const distance = getDistance(pos.coords.latitude, pos.coords.longitude, session.teacherLat, session.teacherLng);
      const radius = session.gpsRadius || 50;

      console.log(`[GPS] Student location: (${pos.coords.latitude}, ${pos.coords.longitude}), Distance: ${Math.round(distance)}m, Radius: ${radius}m`);

      if (distance <= radius) {
        setGpsStatus('passed');
        toast.success(`✅ Location verified! Within ${radius}m of classroom.`);
        localStorage.setItem('student_lat', pos.coords.latitude.toString());
        localStorage.setItem('student_lng', pos.coords.longitude.toString());
        setTimeout(() => handleSubmitAttendance(), 1500);
      } else {
        setGpsStatus('failed');
        toast.error(`❌ Location verification failed. You are ${Math.round(distance)}m away (max allowed: ${radius}m).`);
        
        // Report to teacher
        fetch(`${API_URL}/api/attendance/outside-alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('attendance_token')}` },
          body: JSON.stringify({
            sessionId: session.sessionId,
            studentName: currentUser?.name,
            studentUSN: currentUser?.usn,
            distance: Math.round(distance),
            radius,
            location: `(${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)})`,
            time: new Date().toLocaleTimeString(),
          })
        }).catch(() => {});
      }
    } catch (err: any) {
      console.error('[GPS] Error during GPS check:', err);
      if (err.code === 1) {
        setGpsStatus('failed');
        toast.error('❌ Location permission denied. Please enable GPS in your browser settings.');
      } else if (err.code === 2) {
        setGpsStatus('failed');
        toast.error('❌ Location unavailable. Please check your internet and GPS.');
      } else if (err.code === 3) {
        setGpsStatus('failed');
        toast.error('❌ Location request timeout. Please try again.');
      } else {
        toast.error('❌ GPS check failed. Please try again.');
        setGpsStatus('idle');
      }
    }
  };

  // Final step: Submit attendance after GPS passed
  const handleSubmitAttendance = async () => {
    setSubmitting(true);
    try {
      const sessionSnapshot = await get(ref(rtdb, 'active_session'));
      const session = sessionSnapshot.val();
      const studentUsn = currentUser?.usn || '';
      if (!studentUsn) { toast.error('Student USN not found'); setSubmitting(false); return; }

      // Retry up to 3 times to handle concurrent write failures
      let success = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // Use atomic update - handles concurrent writes properly
          await update(ref(rtdb, `active_session_records/${session.sessionId}`), {
            [studentUsn]: 'PRESENT'
          });
          // Mark student as submitted for this session
          await update(ref(rtdb, `session_devices/${session.sessionId}`), {
            [studentUsn]: { usn: studentUsn, deviceId: localStorage.getItem(`device_id_${studentUsn}`), markedAt: new Date().toISOString() }
          });
          const newRecord = {
            id: session.sessionId,
            sessionId: session.sessionId,
            subject: session.subject,
            className: session.className,
            branch: session.branch,
            semester: String(session.semester || currentUser?.semester || '').trim(),
            date: session.date || new Date().toISOString().split('T')[0],
            year: session.year || new Date().getFullYear().toString(),
            status: 'PRESENT',
          };
          await set(ref(rtdb, `student_attendance/${studentUsn}/${session.sessionId}`), newRecord);
          setAttendanceHistory(prev => {
            const map = new Map<string, any>();
            const getKey = (item: any) => item.sessionId || item.id || `${item.date}_${item.subject}`;
            prev.forEach((item: any) => map.set(getKey(item), item));
            map.set(getKey(newRecord), newRecord);
            return Array.from(map.values());
          });
          success = true;
          break;
        } catch (retryErr) {
          if (attempt === 3) throw retryErr;
          await new Promise(r => setTimeout(r, 500 * attempt)); // wait before retry
        }
      }

      if (!success) throw new Error('Failed after 3 attempts');

      // Show success immediately (optimistic update)
      setStep('done');
      setOtpInput('');
      setGpsStatus('idle');
      toast.success('🎉 Attendance marked successfully!');

      // onValue listener handles real-time refresh automatically

      setTimeout(() => { setStep('otp'); setView('dashboard'); }, 2000);
    } catch (error) {
      logError('handleSubmitAttendance', error);
      toast.error('Failed to submit attendance');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAttendance = handleVerifyOTP; // legacy alias

  const cardBg = isDarkMode ? 'bg-white/10 backdrop-blur-xl border-white/20' : 'bg-white border-gray-200';
  const textColor = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextColor = isDarkMode ? 'text-white/60' : 'text-gray-600';
  const inputBg = isDarkMode ? 'bg-white/10 border-white/20 text-white placeholder:text-white/50' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400';

  const DashboardView = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {activeSession && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 border border-emerald-400/30"
        >
          <div className="flex items-center gap-4">
            <span className="relative flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-white"></span>
            </span>
            <div>
              <h4 className="text-xl font-extrabold tracking-wide">Live Attendance Session Active!</h4>
              <p className="text-emerald-100 text-sm mt-0.5">
                {activeSession.subject || 'Class'} ({activeSession.className || ''}) is taking attendance now.
              </p>
            </div>
          </div>
          <button
            onClick={() => setView('mark-attendance')}
            className="px-6 py-3 bg-white text-emerald-700 font-bold rounded-xl shadow-lg hover:bg-emerald-50 transition-all transform hover:scale-105 active:scale-95 whitespace-nowrap cursor-pointer"
          >
            Mark Attendance Now →
          </button>
        </motion.div>
      )}

      {/* Leave Application Status Notifications */}
      {studentLeaves.filter(l => (l.status === 'approved' || l.status === 'rejected') && !l.viewedByStudent).map(leave => (
        <motion.div
          key={leave._id || leave.id}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`p-5 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg ${
            leave.status === 'approved' ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                leave.status === 'approved' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
              }`}>
                Leave {leave.status === 'approved' ? 'Approved ✓' : 'Rejected ✕'}
              </span>
              <span className={`text-xs font-medium ${subTextColor}`}>HOD Review Notification</span>
            </div>
            <h4 className={`text-base font-bold ${textColor}`}>
              {leave.studentName} ({leave.studentUSN}) — {leave.subject || 'Leave Application'}
            </h4>
            <p className={`text-sm ${subTextColor}`}>
              📅 <strong>Dates:</strong> {leave.fromDate} to {leave.toDate} | 📝 <strong>Reason:</strong> {leave.reason}
            </p>
            {leave.reviewNote && (
              <p className="text-xs text-amber-400 mt-1 italic">
                💬 <strong>Review Note from HOD ({leave.reviewedBy || 'HOD'}):</strong> "{leave.reviewNote}"
              </p>
            )}
          </div>
          <button
            onClick={async () => {
              if (leave._id) {
                await leavesAPI.acknowledge(leave._id);
                fetchStudentLeaves();
              }
            }}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition-all whitespace-nowrap"
          >
            Got it / Dismiss ✕
          </button>
        </motion.div>
      ))}

      {/* Semester Switcher Bar */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${cardBg}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-lg">
            🎓
          </div>
          <div>
            <h4 className={`text-sm font-bold ${textColor}`}>
              Semester View: {selectedSemester && selectedSemester !== 'ALL' ? `Sem ${selectedSemester}` : 'All Semesters'}
            </h4>
            <p className={`text-xs ${subTextColor}`}>
              Enrolled in Semester {currentUser?.semester || 'N/A'}. Select any semester to view history.
            </p>
          </div>
        </div>
        <select
          value={selectedSemester}
          onChange={e => setSelectedSemester(e.target.value)}
          className={`${inputBg} px-4 py-2 rounded-xl text-sm font-bold border outline-none cursor-pointer`}
        >
          <option value="ALL">🌐 All Semesters</option>
          {['1', '2', '3', '4', '5', '6', '7', '8'].map(sem => (
            <option key={sem} value={sem}>
              Sem {sem} {normalizeSem(currentUser?.semester) === sem ? '⭐ (Current)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-blue-500 to-cyan-500 border-0 p-6 text-white">
          <Calendar className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">Total Classes</h3>
          <p className="text-4xl font-bold mt-2">{totalClasses}</p>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-emerald-600 border-0 p-6 text-white">
          <CheckCircle2 className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">Attended</h3>
          <p className="text-4xl font-bold mt-2">{attendedClasses}</p>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-pink-500 border-0 p-6 text-white">
          <BarChart3 className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">Attendance %</h3>
          <p className="text-4xl font-bold mt-2">{attendancePercentage}%</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          onClick={() => setView('mark-attendance')}
          className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}
        >
          <Scan className={`w-12 h-12 ${textColor} mb-4`} />
          <h3 className={`text-xl font-bold ${textColor}`}>Mark Attendance</h3>
          <p className={subTextColor}>Enter OTP to mark attendance</p>
        </Card>

        <Card
          onClick={() => setView('subject-wise')}
          className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}
        >
          <BookOpen className={`w-12 h-12 ${textColor} mb-4`} />
          <h3 className={`text-xl font-bold ${textColor}`}>Subject-wise</h3>
          <p className={subTextColor}>View by subject</p>
        </Card>

        <Card
          onClick={() => setView('history')}
          className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}
        >
          <Calendar className={`w-12 h-12 ${textColor} mb-4`} />
          <h3 className={`text-xl font-bold ${textColor}`}>History</h3>
          <p className={subTextColor}>View all records</p>
        </Card>

        <Card
          onClick={() => setView('leave-application')}
          className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}
        >
          <Edit2 className={`w-12 h-12 ${textColor} mb-4`} />
          <h3 className={`text-xl font-bold ${textColor}`}>Leave Application</h3>
          <p className={subTextColor}>Apply for leave / absence</p>
        </Card>

        <Card
          onClick={async () => {
            setView('my-leaves');
            const snap = await get(ref(db, `leave_applications`));
            if (snap.exists()) {
              const all = Object.values(snap.val()) as any[];
              setMyLeaves(all.filter(l => l.studentId === currentUser?.id).sort((a,b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()));
            }
          }}
          className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}
        >
          <BookOpen className={`w-12 h-12 ${textColor} mb-4`} />
          <h3 className={`text-xl font-bold ${textColor}`}>My Applications</h3>
          <p className={subTextColor}>View leave status</p>
        </Card>

        <Card
          onClick={() => { setEditSemester(currentUser?.semester || ''); setView('edit-profile'); }}
          className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}
        >
          <Edit2 className={`w-12 h-12 ${textColor} mb-4`} />
          <h3 className={`text-xl font-bold ${textColor}`}>Edit Profile</h3>
          <p className={subTextColor}>Update semester & details</p>
        </Card>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen p-6">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {view !== 'dashboard' && (
            <Button
              onClick={() => setView('dashboard')}
              variant="ghost"
              className={isDarkMode ? 'text-white hover:bg-white/10' : 'text-gray-900 hover:bg-gray-100'}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className={`text-3xl font-bold ${textColor}`}>Student Dashboard</h1>
            <p className={subTextColor}>Welcome, {currentUser?.name}</p>
            <p className={`${subTextColor} text-sm`}>USN: {currentUser?.usn}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme}
            className={`p-2 rounded-xl border transition-all ${isDarkMode ? 'border-white/20 text-white bg-white/10 hover:bg-white/20' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-100'}`}>
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button onClick={logout}
            className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${isDarkMode ? 'border-white/20 text-white bg-white/10 hover:bg-white/20' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-100'}`}>
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </div>

      {view === 'dashboard' && <DashboardView />}

      {view === 'mark-attendance' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-xl mx-auto`}>

            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {[{n:1,label:'OTP'},{n:2,label:'GPS'}].map((s,i) => {
                const stepMap: any = {otp:1, gps:2, done:3};
                const current = stepMap[step];
                const done = current > s.n;
                const active = current === s.n;
                return (
                  <React.Fragment key={s.n}>
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                        done ? 'bg-green-500 text-white' : active ? 'bg-blue-500 text-white ring-4 ring-blue-500/30' : isDarkMode ? 'bg-white/10 text-white/40' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {done ? '✓' : s.n}
                      </div>
                      <span className={`text-xs font-medium ${active ? (isDarkMode ? 'text-white' : 'text-gray-900') : subTextColor}`}>{s.label}</span>
                    </div>
                    {i < 2 && <div className={`flex-1 h-0.5 mb-4 ${done ? 'bg-green-500' : isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* STEP 1: OTP */}
            {step === 'otp' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-4xl mb-2">🔑</div>
                  <h2 className={`text-xl font-bold ${textColor}`}>Enter OTP</h2>
                  <p className={`text-sm ${subTextColor}`}>Get the OTP from your teacher or scan QR code</p>
                </div>

                {showScanner && (
                  <div className="relative">
                    <video ref={videoRef} className="w-full rounded-2xl" playsInline muted />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-48 border-4 border-green-400 rounded-2xl opacity-70" />
                    </div>
                    <button onClick={stopQRScanner} className="absolute top-3 right-3 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">✕</button>
                    <p className={"text-center text-sm mt-2 " + subTextColor}>Point camera at QR code</p>
                  </div>
                )}
                {scanError && <div className="bg-red-500/20 rounded-xl p-3"><p className="text-red-400 text-sm">{scanError}</p></div>}

                <div>
                  <Label className={`${textColor} mb-2 block`}>6-Digit OTP</Label>
                  <div className="flex gap-2">
                    <Input type="text" maxLength={6} value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter OTP" className={`${inputBg} text-center text-2xl tracking-widest flex-1`} autoComplete="off" />
                    <button onClick={showScanner ? stopQRScanner : startQRScanner}
                      className={`px-4 rounded-xl border-2 transition-all font-medium text-sm ${showScanner ? 'bg-red-500/20 border-red-400 text-red-400' : isDarkMode ? 'bg-white/10 border-white/30 text-white hover:bg-white/20' : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'}`}>
                      📷 {showScanner ? 'Stop' : 'Scan QR'}
                    </button>
                  </div>
                </div>

                <Button onClick={handleVerifyOTP} disabled={submitting || otpInput.length !== 6}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 py-6 text-lg">
                  {submitting ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <>Next: GPS Check →</>}
                </Button>
              </div>
            )}

            {/* STEP 2: GPS */}
            {step === 'gps' && (
              <div className="space-y-6 text-center">
                <div className="text-5xl mb-2">📍</div>
                <h2 className={`text-xl font-bold ${textColor}`}>Location Verification</h2>
                <p className={`text-sm ${subTextColor}`}>We need to confirm you are inside the classroom</p>

                {gpsStatus === 'idle' && (
                  <div className={`${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-50'} rounded-2xl p-4`}>
                    <p className={`text-sm ${isDarkMode ? 'text-blue-200' : 'text-blue-700'}`}>
                      Click below to verify your location. Make sure GPS/Location is enabled on your phone.
                    </p>
                  </div>
                )}
                {gpsStatus === 'checking' && (
                  <div className={`${isDarkMode ? 'bg-yellow-500/20' : 'bg-yellow-50'} rounded-2xl p-4 flex items-center justify-center gap-3`}>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full" />
                    <p className={`text-sm ${isDarkMode ? 'text-yellow-200' : 'text-yellow-700'}`}>Getting your location...</p>
                  </div>
                )}
                {gpsStatus === 'passed' && (
                  <div className="bg-green-500/20 rounded-2xl p-4">
                    <p className="text-green-400 font-bold">✅ Location Verified!</p>
                  </div>
                )}
                {gpsStatus === 'failed' && (
                  <div className="bg-red-500/20 rounded-2xl p-4">
                    <p className="text-red-400 font-bold">❌ You are not in the classroom!</p>
                    <p className={`text-sm ${subTextColor} mt-1`}>Move closer to the classroom and try again.</p>
                  </div>
                )}

                {(gpsStatus === 'idle' || gpsStatus === 'failed') && (
                  <Button onClick={handleGPSCheck} className="w-full bg-gradient-to-r from-green-500 to-emerald-600 py-6 text-lg">
                    📍 Verify My Location
                  </Button>
                )}

                {/* Back button - go back to OTP step */}
                {gpsStatus !== 'checking' && gpsStatus !== 'passed' && (
                  <button
                    onClick={() => {
                      setStep('otp');
                      setOtpInput('');
                      setGpsStatus('idle');
                    }}
                    className={`w-full py-3 rounded-xl border text-sm font-medium transition-all ${
                      isDarkMode
                        ? 'border-white/20 text-white/60 hover:text-white hover:bg-white/10'
                        : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    ← Go Back & Re-enter OTP
                  </button>
                )}

                {/* Location not working hint */}
                <div className={`${isDarkMode ? 'bg-orange-500/10 border-orange-500/20' : 'bg-orange-50 border-orange-200'} border rounded-xl p-3 text-left`}>
                  <p className={`text-xs font-semibold ${isDarkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                    📱 Location not working?
                  </p>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-orange-200/70' : 'text-orange-600'}`}>
                    1. Enable GPS/Location on your phone<br/>
                    2. Allow location permission for browser<br/>
                    3. Move closer to classroom center<br/>
                    4. Try again or go back and re-enter OTP
                  </p>
                </div>
              </div>
            )}

            {/* DONE */}
            {step === 'done' && (
              <div className="text-center space-y-4 py-8">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
                  <div className="text-7xl">🎉</div>
                </motion.div>
                <h2 className={`text-2xl font-bold ${textColor}`}>Attendance Marked!</h2>
                <p className={subTextColor}>Your attendance has been recorded successfully.</p>
              </div>
            )}

          </Card>
        </motion.div>
      )}

      {view === 'subject-wise' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-6`}>Subject-wise Attendance</h2>

            {subjectStats.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen className={`w-16 h-16 ${subTextColor} mx-auto mb-4`} />
                <p className={subTextColor}>No attendance records yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {subjectStats.map((stat) => (
                  <Card key={stat.subject} className={`${isDarkMode ? 'bg-white/5' : 'bg-gray-50'} p-6`}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className={`text-lg font-bold ${textColor}`}>{stat.subject}</h3>
                        <p className={`${subTextColor} text-sm`}>
                          {stat.attended} / {stat.total} classes attended
                        </p>
                      </div>
                      <div className={`text-3xl font-bold ${
                        stat.percentage >= 75 ? 'text-green-400' : 
                        stat.percentage >= 50 ? 'text-yellow-400' : 
                        'text-red-400'
                      }`}>
                        {stat.percentage}%
                      </div>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full ${
                          stat.percentage >= 75 ? 'bg-green-500' :
                          stat.percentage >= 50 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${stat.percentage}%` }}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {view === 'history' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8`}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className={`text-2xl font-bold ${textColor}`}>
                  Attendance History ({filteredHistory.length} records)
                </h2>
                <p className={`${subTextColor} text-sm mt-0.5`}>
                  Showing attendance for Semester {currentUser?.semester || 'N/A'}
                </p>
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className={`w-16 h-16 ${subTextColor} mx-auto mb-4`} />
                <p className={subTextColor}>No attendance records for Semester {currentUser?.semester || 'N/A'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...filteredHistory].reverse().map((record, index) => (
                  <Card key={index} className={`${isDarkMode ? 'bg-white/5' : 'bg-gray-50'} p-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className={`font-bold ${textColor}`}>{record.subject}</h3>
                        <p className={`${subTextColor} text-sm`}>{record.className}</p>
                        <p className={`${subTextColor} text-xs mt-1`}>
                          📅 {record.date} • Sem {record.semester || 'N/A'}
                        </p>
                      </div>
                      {record.status === 'PRESENT' ? (
                        <div className="flex items-center gap-2 text-green-400">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="font-bold">Present</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-400">
                          <XCircle className="w-5 h-5" />
                          <span className="font-bold">Absent</span>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* Leave Application View */}
      {view === 'leave-application' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-6 max-w-2xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-2`}>📝 Leave Application</h2>
            <p className={`${subTextColor} text-sm mb-6`}>Submit your absence request to HOD/Manager. If approved, it will be forwarded to your teachers.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`text-sm font-medium ${textColor} mb-2 block`}>From Date *</label>
                  <input type="date" value={leaveFromDate} onChange={e => setLeaveFromDate(e.target.value)}
                    className={`${inputBg} w-full p-3 rounded-xl border`} required />
                </div>
                <div>
                  <label className={`text-sm font-medium ${textColor} mb-2 block`}>To Date *</label>
                  <input type="date" value={leaveToDate} onChange={e => setLeaveToDate(e.target.value)}
                    className={`${inputBg} w-full p-3 rounded-xl border`} required />
                </div>
              </div>
              <div>
                <label className={`text-sm font-medium ${textColor} mb-2 block`}>Subject / Classes Missed *</label>
                <input type="text" value={leaveSubject} onChange={e => setLeaveSubject(e.target.value)}
                  placeholder="e.g. DAA, DBMS Lab" className={`${inputBg} w-full p-3 rounded-xl border`} />
              </div>
              <div>
                <label className={`text-sm font-medium ${textColor} mb-2 block`}>Reason for Absence *</label>
                <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)}
                  placeholder="Explain your reason for absence in detail..."
                  rows={4} className={`${inputBg} w-full p-3 rounded-xl border resize-none`} />
              </div>
              <div>
                <label className={`text-sm font-medium ${textColor} mb-2 block`}>Attach Document (Optional)</label>
                <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={e => setLeaveFile(e.target.files?.[0] || null)}
                  className={`${inputBg} w-full p-3 rounded-xl border`} />
                <p className={`text-xs ${subTextColor} mt-1`}>Accepted: PDF, Word, Images</p>
              </div>
              <Button
                disabled={submittingLeave || !leaveReason || !leaveFromDate || !leaveToDate}
                onClick={async () => {
                  if (!leaveReason || !leaveFromDate || !leaveToDate) { toast.error('Please fill all required fields'); return; }
                  setSubmittingLeave(true);
                  try {
                    const appId = Date.now().toString();
                    
                    let fileData: any = null;
                    if (leaveFile) {
                      // Convert to base64 for storage
                      const reader = new FileReader();
                      fileData = await new Promise((resolve) => {
                        reader.onload = (e) => resolve({ name: leaveFile.name, data: e.target?.result });
                        reader.readAsDataURL(leaveFile);
                      });
                    }

                    await set(ref(db, `leave_applications/${appId}`), {
                      id: appId,
                      studentId: currentUser?.id,
                      studentName: currentUser?.name,
                      studentUSN: currentUser?.usn,
                      studentBranch: currentUser?.branch,
                      studentSemester: currentUser?.semester,
                      subject: leaveSubject,
                      fromDate: leaveFromDate,
                      toDate: leaveToDate,
                      reason: leaveReason,
                      fileData: fileData,
                      status: 'pending',
                      submittedAt: new Date().toISOString(),
                    });
                    toast.success('✅ Leave application submitted to HOD/Manager!');
                    setLeaveReason(''); setLeaveSubject(''); setLeaveFromDate(''); setLeaveToDate(''); setLeaveFile(null);
                    setView('my-leaves');
                  } catch (err) {
                    toast.error('Failed to submit. Try again.');
                  }
                  setSubmittingLeave(false);
                }}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 py-4">
                {submittingLeave ? 'Submitting...' : '📤 Submit Leave Application'}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {/* My Leave Applications */}
      {view === 'my-leaves' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-6 max-w-2xl mx-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-2xl font-bold ${textColor}`}>My Applications</h2>
              <Button onClick={() => setView('leave-application')} className="bg-gradient-to-r from-blue-500 to-purple-600 text-sm px-4 py-2">
                + New Application
              </Button>
            </div>
            {myLeaves.length === 0 ? (
              <p className={`text-center py-8 ${subTextColor}`}>No leave applications yet</p>
            ) : (
              <div className="space-y-3">
                {myLeaves.map(leave => (
                  <div key={leave.id} className={`${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} border rounded-xl p-4`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className={`font-bold ${textColor}`}>{leave.fromDate} → {leave.toDate}</p>
                        <p className={`text-sm ${subTextColor}`}>{leave.subject || 'General Leave'}</p>
                        <p className={`text-xs ${subTextColor}`}>Submitted: {new Date(leave.submittedAt).toLocaleDateString()}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        leave.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                        leave.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {leave.status === 'approved' ? '✅ Approved' : leave.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
                      </span>
                    </div>
                    <p className={`text-sm ${subTextColor} mb-3`}>{leave.reason?.substring(0, 150)}{leave.reason?.length > 150 ? '...' : ''}</p>
                    {leave.reviewNote && (
                      <p className={`text-xs mb-3 ${leave.status === 'approved' ? 'text-green-400' : 'text-red-400'}`}>
                        HOD Note: {leave.reviewNote}
                      </p>
                    )}
                    <div className="flex gap-2">
                      {/* Delete only if pending */}
                      {leave.status === 'pending' && (
                        <button onClick={async () => {
                          if (!window.confirm('Delete this leave application? It will be removed from HOD inbox too.')) return;
                          await remove(ref(db, `leave_applications/${leave.id}`));
                          await remove(ref(db, `leave_notifications/${leave.id}`));
                          setMyLeaves(prev => prev.filter(l => l.id !== leave.id));
                          toast.success('Application deleted successfully');
                        }} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">
                          🗑️ Delete
                        </button>
                      )}
                      {/* Clear = delete from Firebase completely */}
                      {leave.status !== 'pending' && (
                        <button onClick={async () => {
                          await remove(ref(db, `leave_applications/${leave.id}`));
                          await remove(ref(db, `leave_notifications/${leave.id}`));
                          setMyLeaves(prev => prev.filter(l => l.id !== leave.id));
                          toast.success('Cleared and deleted from database');
                        }} className={`px-3 py-1.5 rounded-lg text-xs ${isDarkMode ? 'bg-white/10 text-white/60 hover:bg-white/20' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                          ✕ Clear
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* Edit Profile View */}
      {view === 'edit-profile' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-6`}>Edit Profile</h2>
            <div className={`${isDarkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'} border rounded-xl p-4 mb-6`}>
              <p className={`text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                ℹ️ You can update your semester here when you move to the next semester.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <p className={`text-sm ${subTextColor} mb-1`}>Name</p>
                <p className={`font-bold ${textColor}`}>{currentUser?.name}</p>
              </div>
              <div>
                <p className={`text-sm ${subTextColor} mb-1`}>USN</p>
                <p className={`font-bold ${textColor}`}>{currentUser?.usn}</p>
              </div>
              <div>
                <p className={`text-sm ${subTextColor} mb-1`}>Branch</p>
                <p className={`font-bold ${textColor}`}>{currentUser?.branch}</p>
              </div>
              <div>
                <label className={`text-sm font-medium ${textColor} mb-2 block`}>Current Semester — Update if needed</label>
                <select value={editSemester} onChange={e => setEditSemester(e.target.value)}
                  className={`${inputBg} w-full p-3 rounded-lg border`}>
                  {[1,2,3,4,5,6,7,8].map(s => (
                    <option key={s} value={s.toString()}>{s} Semester</option>
                  ))}
                </select>
              </div>
              <Button
                disabled={updatingProfile}
                onClick={async () => {
                  if (editSemester === currentUser?.semester) { toast.error('No changes made'); return; }
                  setUpdatingProfile(true);
                  const success = await updateUser(currentUser!.id, { semester: editSemester });
                  if (success) {
                    toast.success(`✅ Semester updated to ${editSemester}!`);
                    setView('dashboard');
                  } else {
                    toast.error('Failed to update. Try again.');
                  }
                  setUpdatingProfile(false);
                }}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 py-4">
                {updatingProfile ? (
                  <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2" />Updating...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" /> Save Changes</>
                )}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}