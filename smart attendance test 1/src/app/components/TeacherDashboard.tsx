import React, { useState, useEffect, useCallback } from 'react';
import { ref, set, get, update, onValue, remove, rtdb, db, setSessionSaveChoice } from './firebaseCompat';
import { motion } from 'motion/react';
import { ArrowLeft, LogOut, Upload, Users, QrCode, Plus, Moon, Sun, Save, CheckCircle, XCircle, Play, Square, Download, Clock, Edit2, Calendar, BookOpen, GraduationCap, Settings, BarChart3, HelpCircle, Trash2 } from 'lucide-react';
import HelpContact from './Helpcontact';
import { useAuth } from './AuthContext';
import { attendanceAPI, leavesAPI } from './api';


import { useTheme } from './ThemeContext';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

interface StudentData {
  name: string;
  usn: string;
}

interface ClassData {
  id: string;
  name: string;
  subject: string;
  subjectCode?: string;
  classType?: 'Theory' | 'Lab';
  branch: string;
  semester: string;
  section: string;
  batch?: string;
  radius: number;
  classLength?: number;
  classWidth?: number;
  students: StudentData[];
  createdAt: string;
  latitude?: number;
  longitude?: number;
  geofenceActive?: boolean;
}

interface AttendanceRecord {
  [usn: string]: 'PRESENT' | 'ABSENT';
}

interface AttendanceSession {
  id: string;
  _id?: string;
  sessionId?: string;
  classId: string;
  className: string;
  subject: string;
  branch?: string;
  semester?: string;
  section?: string;
  batch?: string;
  date: string;
  year: string;
  startTime: string;
  endTime?: string;
  records: AttendanceRecord;
  students: StudentData[];
  geoFencingEnabled?: boolean;
}

const normalizeUSN = (usn?: string) => String(usn || '').trim().toUpperCase();

const normalizeAttendanceRecords = (records: any): AttendanceRecord => {
  const normalized: AttendanceRecord = {};
  Object.entries(records || {}).forEach(([key, value]) => {
    const usn = normalizeUSN(key);
    const status = String(value || '').trim().toUpperCase();
    if (!usn) return;
    normalized[usn] = status === 'PRESENT' ? 'PRESENT' : 'ABSENT';
  });
  return normalized;
};

const getSessionId = (session: AttendanceSession | null) => {
  if (!session) return '';
  return String(session.sessionId || session.id || session._id || '').trim();
};

interface StudentRowProps {
  student: StudentData;
  status: 'PRESENT' | 'ABSENT';
  onToggle: (usn: string) => void;
  isDarkMode: boolean;
  textColor: string;
  subTextColor: string;
}

const StudentRow = React.memo(({ student, status, onToggle, isDarkMode, textColor, subTextColor }: StudentRowProps) => (
  <div className={`${
      status === 'PRESENT'
        ? isDarkMode ? 'bg-green-500/20' : 'bg-green-50'
        : isDarkMode ? 'bg-red-500/20' : 'bg-red-50'
    } rounded-lg p-3 flex items-center justify-between`}>
    <div className="flex items-center gap-3">
      {status === 'PRESENT' ? (
        <CheckCircle className="w-5 h-5 text-green-500" />
      ) : (
        <XCircle className="w-5 h-5 text-red-500" />
      )}
      <div>
        <p className={textColor}>{student.name}</p>
        <p className={`${subTextColor} text-sm`}>{student.usn}</p>
      </div>
    </div>
    <Button
      size="sm"
      onClick={() => onToggle(student.usn)}
      className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300"
    >
      <Edit2 size={14} className="mr-1" />
      Toggle
    </Button>
  </div>
));

export default function TeacherDashboard() {
  const { currentUser, logout, getAllUsers, getStudentByUSN, updateUser } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [view, setView] = useState<'dashboard' | 'classes' | 'create-class' | 'class-detail' | 'attendance' | 'history' | 'exam-eligibility' | 'settings' | 'date-download' | 'help' | 'edit-students' | 'leave-notifications'>(() => {
    return (localStorage.getItem('teacher_view') as any) || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('teacher_view', view);
  }, [view]);

  const [leaveNotifications, setLeaveNotifications] = useState<any[]>([]);
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [allStudentsData, setAllStudentsData] = useState<any[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [classes, setClasses] = useState<ClassData[]>([]);
  
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(() => {
    const stored = localStorage.getItem('teacher_selected_class');
    try {
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [attendanceSession, setAttendanceSession] = useState<AttendanceSession | null>(() => {
    const stored = localStorage.getItem('teacher_attendance_session');
    try {
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [suspiciousAlerts, setSuspiciousAlerts] = useState<any[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [outsideAlerts, setOutsideAlerts] = useState<any[]>([]);
  const [showOutsideReport, setShowOutsideReport] = useState(false);

  const [qrCode, setQrCode] = useState<string>(() => {
    return localStorage.getItem('teacher_qrcode') || '';
  });

  const [otp, setOtp] = useState<string>(() => {
    return localStorage.getItem('teacher_otp') || '';
  });

  useEffect(() => {
    if (selectedClass) {
      localStorage.setItem('teacher_selected_class', JSON.stringify(selectedClass));
    } else {
      localStorage.removeItem('teacher_selected_class');
    }
  }, [selectedClass]);

  useEffect(() => {
    if (attendanceSession) {
      localStorage.setItem('teacher_attendance_session', JSON.stringify(attendanceSession));
    } else {
      localStorage.removeItem('teacher_attendance_session');
    }
  }, [attendanceSession]);

  useEffect(() => {
    if (otp) {
      localStorage.setItem('teacher_otp', otp);
    } else {
      localStorage.removeItem('teacher_otp');
    }
  }, [otp]);

  useEffect(() => {
    if (qrCode) {
      localStorage.setItem('teacher_qrcode', qrCode);
    } else {
      localStorage.removeItem('teacher_qrcode');
    }
  }, [qrCode]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord>({});
  const [isAttendanceLoaded, setIsAttendanceLoaded] = useState(false);
  const [otpInterval, setOtpInterval] = useState<NodeJS.Timeout | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceSession[]>([]);

  const presentCount = Object.values(attendanceRecords).filter(s => s === 'PRESENT').length;
  const absentCount = Object.keys(attendanceRecords).length > 0
    ? Object.values(attendanceRecords).filter(s => s === 'ABSENT').length
    : (selectedClass ? selectedClass.students.length : 0);

  const processSnapshot = useCallback((snap: any) => {
    const liveRecords = snap.exists() ? snap.val() : {};
    console.log('[TeacherDashboard] live attendance snapshot', { exists: snap.exists?.(), val: snap.val?.() });
    const normalizedRecords = normalizeAttendanceRecords(liveRecords);
    console.log('[TeacherDashboard] attendanceRecords replace', { liveRecords, normalizedRecords });
    setAttendanceRecords(normalizedRecords);
    setIsAttendanceLoaded(true);
  }, []);

  useEffect(() => {
    if (!attendanceSession || view !== 'attendance') return;
    const sessionId = getSessionId(attendanceSession);
    if (!sessionId) return;

    const interval = setInterval(async () => {
      try {
        const liveRef = ref(rtdb, `active_session_records/${sessionId}`);
        const recordsSnap = await get(liveRef);
        if (recordsSnap.exists()) {
          const refreshedRecords = normalizeAttendanceRecords(recordsSnap.val());
          setAttendanceRecords(prev => {
            const prevJson = JSON.stringify(prev);
            const nextJson = JSON.stringify(refreshedRecords);
            if (prevJson === nextJson) return prev;
            return refreshedRecords;
          });
        }
      } catch (err) {
        console.warn('[TeacherDashboard] live attendance polling failed', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [attendanceSession, view]);

  useEffect(() => {
    return () => {
      if (otpInterval) {
        clearInterval(otpInterval);
      }
      if ((window as any).__liveAttendanceUnsubscribe) {
        (window as any).__liveAttendanceUnsubscribe();
      }
    };
  }, [otpInterval]);

  const fetchOutsideAlerts = async (sessionId: string) => {
    try {
      const data = await attendanceAPI.getOutsideAlerts(sessionId);
      const alerts = data.alerts || [];
      setOutsideAlerts(alerts);
      const mapped = alerts.map((alert: any) => ({
        usn: alert.studentUSN,
        studentName: alert.studentName,
        type: alert.type || (alert.distance ? 'outside_classroom' : 'duplicate_device'),
        distance: alert.distance || 0,
        allowedRadius: alert.radius || 0,
        attemptedAt: alert.time || alert.markedAt || new Date().toISOString(),
      }));
      setSuspiciousAlerts(mapped);
    } catch (err: any) {
      if (err.status === 404 || String(err.message).includes('Session not found')) {
        setOutsideAlerts([]);
        setSuspiciousAlerts([]);
        return;
      }
      console.error('Failed to load outside alerts:', err);
    }
  };

  // Class creation form states
  const [className, setClassName] = useState('');
  const [classSubject, setClassSubject] = useState('');
  const [approvedLeaves, setApprovedLeaves] = useState<any[]>([]);

  const fetchApprovedLeaves = async () => {
    try {
      const res = await leavesAPI.getNotifications();
      if (res.success && res.leaves) {
        setApprovedLeaves(res.leaves.filter((l: any) => !l.viewedByTeacher));
      }
    } catch (err) {
      console.error('[TeacherDashboard] Error fetching leave notifications:', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchApprovedLeaves();
    }
  }, [currentUser]);
  const [classBranch, setClassBranch] = useState('');
  const [classSemester, setClassSemester] = useState('');
  const [classSection, setClassSection] = useState('');
  const [classBatch, setClassBatch] = useState('');
  const [classRadius, setClassRadius] = useState('50');
  const [classLength, setClassLength] = useState('10');
  const [classWidth, setClassWidth] = useState('8');
  const [classSubjectCode, setClassSubjectCode] = useState('');
  const [classType, setClassType] = useState<'Theory' | 'Lab'>('Theory');
  const [geoFencingEnabled, setGeoFencingEnabled] = useState(false); // Default OFF - teacher turns ON if needed
  const [editingSession, setEditingSession] = useState<AttendanceSession | null>(null);
  const [editSessionRecords, setEditSessionRecords] = useState<AttendanceRecord>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassData | null>(null);
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [studentEditForm, setStudentEditForm] = useState<any>({});
  const [allStudentsForEdit, setAllStudentsForEdit] = useState<any[]>([]);
  const [showStudentEdit, setShowStudentEdit] = useState(false);
  const [uploadedStudents, setUploadedStudents] = useState<StudentData[]>([]);

  // FEATURE: Auto-delete settings
  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState(true);
  const [autoDeleteDuration, setAutoDeleteDuration] = useState<'3' | '6' | '12' | 'disabled'>('6');

  // FEATURE: Exam Eligibility Report
  const [selectedClassForReport, setSelectedClassForReport] = useState<string>('');
  const [selectedSubjectForReport, setSelectedSubjectForReport] = useState<string>('');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [downloadStartDate, setDownloadStartDate] = useState('');
  const [downloadEndDate, setDownloadEndDate] = useState('');
  const [downloadClass, setDownloadClass] = useState('');
  const [downloadPreview, setDownloadPreview] = useState<any[]>([]);
  const [downloadGenerated, setDownloadGenerated] = useState(false);
  const [eligibilityPercentage, setEligibilityPercentage] = useState('50');
  const [generatedReport, setGeneratedReport] = useState<any[]>([]);

  useEffect(() => {
    if (!currentUser?.id) return;

    // Load classes from Firebase
    const classesRef = ref(rtdb, `teacher_classes/${currentUser.id}`);
    get(classesRef).then(snapshot => {
      const clsList = snapshot.val() || [];
      if (snapshot.exists()) {
        setClasses(clsList);
        
        // Refresh selectedClass data from the loaded classes list if it was restored from localStorage
        const storedClass = localStorage.getItem('teacher_selected_class');
        if (storedClass) {
          try {
            const parsed = JSON.parse(storedClass);
            const freshClass = clsList.find((c: any) => c.id === parsed.id || c._id === parsed.id);
            if (freshClass) {
              setSelectedClass(freshClass);
            }
          } catch {}
        }
      }

      // Check if there is an active session running on backend to restore state
      get(ref(rtdb, 'active_session')).then(async (sessionSnap) => {
        if (sessionSnap.exists()) {
          const session = sessionSnap.val();
          if (session.teacherId === currentUser.id) {
            const matchingClass = clsList.find((c: any) => c.id === session.classId || c._id === session.classId);
            if (matchingClass) {
              const restoredSessionId = getSessionId(session as AttendanceSession);
              const restoredSession = {
                ...session,
                id: restoredSessionId,
                sessionId: restoredSessionId,
                students: matchingClass.students || [],
              } as AttendanceSession;

              setSelectedClass(matchingClass);
              setAttendanceSession(restoredSession);
              setOtp(session.otp);

              // Initialize attendance state from restored active session payload
              if (session.records) {
                setAttendanceRecords(normalizeAttendanceRecords(session.records));
                setIsAttendanceLoaded(true);
              }

              // Regenerate QR code URL
              const qrData = JSON.stringify({
                sessionId: restoredSessionId,
                otp: session.otp,
                classId: matchingClass.id,
                teacherId: currentUser?.id,
                radius: matchingClass.radius,
              });
              try {
                const qrDataUrl = await QRCode.toDataURL(qrData);
                setQrCode(qrDataUrl);
              } catch {}

              // Load persisted outside alerts for this session
              try {
                const alertsData = await attendanceAPI.getOutsideAlerts(restoredSessionId);
                if (alertsData.alerts) {
                  setOutsideAlerts(alertsData.alerts);
                  setSuspiciousAlerts(prev => [...alertsData.alerts, ...prev]);
                }
              } catch (alertErr) {
                console.error('Failed to load outside alerts:', alertErr);
              }

              // Pre-fill initial records from active_session_records
              const liveRef = ref(rtdb, `active_session_records/${restoredSessionId}`);
              get(liveRef).then(recordsSnap => {
                if (recordsSnap.exists()) {
                  setAttendanceRecords(normalizeAttendanceRecords(recordsSnap.val()));
                  setIsAttendanceLoaded(true);
                }
              });

              // Start Socket.io listener
              (window as any).__onOutsideAlert = (alert: any) => {
                setSuspiciousAlerts(prev => {
                  if (prev.some(a => a.usn === alert.usn && a.type === alert.type && Math.abs(new Date(a.attemptedAt).getTime() - new Date(alert.attemptedAt).getTime()) < 5000)) {
                    return prev;
                  }
                  return [alert, ...prev];
                });
                toast.error(`⚠️ Suspicious activity: ${alert.studentName} (${alert.usn}) marked ${alert.type === 'duplicate_device' ? 'using a duplicate device' : 'from outside class'}!`, { duration: 8000 });
              };
              if ((window as any).__liveAttendanceUnsubscribe) {
                (window as any).__liveAttendanceUnsubscribe();
              }
              const unsubscribe = onValue(liveRef, processSnapshot);
              (window as any).__liveAttendanceUnsubscribe = unsubscribe;

              setView('attendance');
            }
          }
        }
      });
    });

    // Load settings from Firebase
    const settingsRef = ref(rtdb, `teacher_settings/${currentUser.id}`);
    get(settingsRef).then(snapshot => {
      if (snapshot.exists()) {
        const parsed = snapshot.val();
        setAutoDeleteEnabled(parsed.autoDeleteEnabled ?? true);
        setAutoDeleteDuration(parsed.autoDeleteDuration ?? '6');
        setGeoFencingEnabled(parsed.geoFencingEnabled ?? false); // Default OFF
      }
    });

    // Load attendance history from Firebase
    const historyRef = ref(rtdb, `attendance_history/${currentUser.id}`);
    get(historyRef).then(snapshot => {
      if (snapshot.exists()) {
        const history: AttendanceSession[] = Object.values(snapshot.val() || {});
        setAttendanceHistory(history.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    });
  }, [currentUser]);

  const fetchLeaveNotifications = async () => {
    try {
      const snap = await get(ref(db, 'leave_notifications'));
      if (snap.exists()) {
        const all = Object.values(snap.val()) as any[];
        const filtered = all.filter((l: any) => 
          l.forTeachers && 
          l.status === 'approved' &&
          (
            l.approvedBranch === currentUser?.department ||
            l.studentBranch === currentUser?.department ||
            l.approvedBranch === currentUser?.branch ||
            l.studentBranch === currentUser?.branch
          )
        );
        setLeaveNotifications(filtered.sort((a: any, b: any) => new Date(b.reviewedAt || b.submittedAt).getTime() - new Date(a.reviewedAt || a.submittedAt).getTime()));
      } else {
        setLeaveNotifications([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (view === 'leave-notifications') {
      fetchLeaveNotifications();
    }
  }, [view, currentUser]);

  useEffect(() => {
    return () => {
      if (otpInterval) { clearInterval(otpInterval); }
    };
  }, [otpInterval]);

  // Pre-fill form when editing a class
  useEffect(() => {
    if (editingClass) {
      setClassName(editingClass.name);
      setClassSubject(editingClass.subject);
      setClassSubjectCode(editingClass.subjectCode || '');
      setClassType(editingClass.classType || 'Theory');
      setClassBranch(editingClass.branch);
      setClassSemester(editingClass.semester);
      setClassSection(editingClass.section);
      setClassBatch(editingClass.batch || '');
      setClassLength(String(editingClass.classLength || 10));
      setClassWidth(String(editingClass.classWidth || 8));
      setUploadedStudents(editingClass.students);
    }
  }, [editingClass]);

  const saveClasses = (updatedClasses: ClassData[]) => {
    if (currentUser?.id) {
      set(ref(rtdb, `teacher_classes/${currentUser.id}`), updatedClasses);
    }
    setClasses(updatedClasses);
  };

  // Error logger - writes to Firebase for debugging
  const logError = async (context: string, error: any) => {
    try {
      const logRef = ref(rtdb, `error_logs/${Date.now()}`);
      await set(logRef, {
        context,
        error: error?.message || String(error),
        teacherId: currentUser?.id,
        timestamp: new Date().toISOString(),
      });
    } catch {}
    console.error(`[${context}]`, error);
  };

  const saveAttendanceHistory = (history: AttendanceSession[]) => {
    if (currentUser?.id) {
      const historyObj = history.reduce((acc: any, session: any) => {
        acc[session.id] = session;
        return acc;
      }, {});
      set(ref(rtdb, `attendance_history/${currentUser.id}`), historyObj);
    }
    setAttendanceHistory(history);
  };

  const clearClassForm = () => {
    setClassLength('10');
    setClassWidth('8');
    setClassSubjectCode('');
    setClassType('Theory');
    setClassName('');
    setClassSubject('');
    setClassBranch('');
    setClassSemester('');
    setClassBatch('');
    setEditingClass(null);
    setClassSection('');
    setClassRadius('50');
    setUploadedStudents([]);
  };

  const handleCreateClass = () => {
    if (!className || !classSubject || !classBranch || !classSemester || !classSection || !classBatch) {
      toast.error('Please fill in all required fields (including Admission Batch)');
      return;
    }
    if (!editingClass && uploadedStudents.length === 0) {
      toast.error('Please upload student list');
      return;
    }

    if (editingClass) {
      // EDIT MODE - update existing class
      const updatedClass: ClassData = {
        ...editingClass,
        name: className,
        subject: classSubject,
        subjectCode: classSubjectCode,
        classType: classType,
        branch: classBranch,
        semester: classSemester,
        section: classSection,
        batch: classBatch,
        radius: parseInt(classRadius),
        classLength: classLength ? parseFloat(classLength) : 10,
        classWidth: classWidth ? parseFloat(classWidth) : 8,
        students: uploadedStudents.length > 0 ? uploadedStudents : editingClass.students,
      };
      const updatedClasses = classes.map(c => c.id === editingClass.id ? updatedClass : c);
      saveClasses(updatedClasses);
      setSelectedClass(updatedClass);
      setEditingClass(null);
      toast.success('Class updated successfully!');
    } else {
      // CREATE MODE
      const classData: ClassData = {
        id: Date.now().toString(),
        name: className,
        subject: classSubject,
        subjectCode: classSubjectCode,
        classType: classType,
        branch: classBranch,
        semester: classSemester,
        section: classSection,
        batch: classBatch,
        radius: parseInt(classRadius),
        classLength: classLength ? parseFloat(classLength) : 10,
        classWidth: classWidth ? parseFloat(classWidth) : 8,
        students: uploadedStudents,
        createdAt: new Date().toISOString(),
      };
      saveClasses([...classes, classData]);
      toast.success('Class created successfully!');
    }
    clearClassForm();
    setView('classes');
  };

  const handleDeleteClass = async (classId: string) => {
    if (!window.confirm('Delete this class?\n\nThis will remove ALL attendance records for this class from student and parent portals. This cannot be undone!')) return;
    setGlobalLoading(true);
    const classToDelete = classes.find(c => c.id === classId);
    saveClasses(classes.filter(c => c.id !== classId));
    if (classToDelete) {
      // Remove from student attendance - filter by classId AND className
      const deletePromises = classToDelete.students.map(async (student) => {
        const studentRef = ref(rtdb, `student_attendance/${student.usn}`);
        const snap = await get(studentRef);
        if (snap.exists()) {
          const records = snap.val();
          const filtered = Object.fromEntries(
            Object.entries(records).filter(([key, r]: any) => 
              r.className !== classToDelete.name && 
              r.classId !== classId &&
              key !== classId
            )
          );
          if (Object.keys(filtered).length > 0) {
            await set(studentRef, filtered);
          } else {
            await remove(ref(rtdb, `student_attendance/${student.usn}`));
          }
        }
      });
      await Promise.all(deletePromises);
      // Remove from teacher history
      const updatedHistory = attendanceHistory.filter(h => h.classId !== classId);
      saveAttendanceHistory(updatedHistory);
      // Clean up active session records for this class
      await remove(ref(rtdb, `active_session_records/${classId}`));
    }
    if (selectedClass?.id === classId) { setSelectedClass(null); setView('classes'); }
    setGlobalLoading(false);
    toast.success('✅ Class and ALL attendance records deleted everywhere!');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        let students: StudentData[] = [];

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawData = XLSX.utils.sheet_to_json(worksheet);
          students = rawData.map((row: any) => ({
            name: row['Student Name'] || row['name'] || row['Name'] || '',
            usn: row['USN'] || row['usn'] || row['Roll Number'] || row['roll'] || '',
          })).filter(s => s.name && s.usn);
        } else if (file.name.endsWith('.csv')) {
          const text = data as string;
          const lines = text.split('\n').filter(line => line.trim());
          students = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            return {
              name: values[0] || '',
              usn: values[1] || '',
            };
          }).filter(s => s.name && s.usn);
        }

        if (students.length > 0) {
          setUploadedStudents(students);
          toast.success(`${students.length} students loaded successfully!`);
        } else {
          toast.error('No valid student data found. Please check file format.');
        }
      } catch (error) {
        console.error('Upload error:', error);
        toast.error('Failed to parse file. Please check the format.');
      }
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsBinaryString(file);
    } else if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      toast.error('Unsupported file format. Please use Excel (.xlsx, .xls) or CSV');
    }
  };

  const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const startAttendanceSession = async () => {
    if (!selectedClass || selectedClass.students.length === 0) {
      toast.error('❌ Cannot start session! This class has no students uploaded. Go to Edit Students and upload student list first.');
      return;
    }

    // Initialize all students as ABSENT
    const initialRecords: AttendanceRecord = {};
    selectedClass.students.forEach(student => {
      initialRecords[normalizeUSN(student.usn)] = 'ABSENT';
    });
    setAttendanceRecords(initialRecords);
    setIsAttendanceLoaded(true);

    const newOTP = generateOTP();
    const sessionId = Date.now().toString();
    const now = new Date();

    // Capture teacher's GPS location for verification only if geofencing is enabled
    let teacherLat: number | null = null;
    let teacherLng: number | null = null;
    let actualGeoFencing = geoFencingEnabled;
    
    if (geoFencingEnabled) {
      toast.loading('📡 Getting GPS location...', { id: 'gps-get' });
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true })
        );
        teacherLat = pos.coords.latitude;
        teacherLng = pos.coords.longitude;
        toast.success('GPS location captured!', { id: 'gps-get' });
      } catch {
        toast.error('GPS not available. Location verification disabled for this session.', { id: 'gps-get' });
        actualGeoFencing = false; // Disable since we don't have location!
      }
    }

    // Calculate GPS radius from classroom dimensions
    const gpsRadius = selectedClass.classLength && selectedClass.classWidth
      ? Math.round(Math.sqrt(Math.pow(selectedClass.classLength, 2) + Math.pow(selectedClass.classWidth, 2)) / 2) + 10
      : (selectedClass.radius || 50);

    const sessionData: AttendanceSession = {
      id: sessionId,
      classId: selectedClass.id,
      className: selectedClass.name,
      subject: selectedClass.subject,
      branch: selectedClass.branch,
      semester: selectedClass.semester,
      section: selectedClass.section,
      batch: selectedClass.batch || '',
      date: now.toISOString().split('T')[0],
      year: now.getFullYear().toString(),
      startTime: now.toLocaleTimeString(),
      records: initialRecords,
      students: selectedClass.students,
      geoFencingEnabled: actualGeoFencing,
    };

    // Generate QR Code
    const qrData = JSON.stringify({
      sessionId,
      otp: newOTP,
      classId: selectedClass.id,
      teacherId: currentUser?.id || currentUser?._id,
      radius: selectedClass.radius,
    });
    
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(qrData, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
    } catch (qrErr) {
      console.error('QR code generation error:', qrErr);
    }

    try {
      // Store session globally in Firebase for student access
      await set(ref(rtdb, 'active_session'), {
        sessionId,
        otp: newOTP,
        classId: selectedClass.id,
        teacherId: currentUser?.id || currentUser?._id,
        semester: selectedClass.semester,
        section: selectedClass.section,
        branch: selectedClass.branch,
        batch: selectedClass.batch || '',
        teacherLat,
        teacherLng,
        gpsRadius,
        geoFencingEnabled: actualGeoFencing,
        qrData: qrDataUrl,
      });

      setOtp(newOTP);
      setQrCode(qrDataUrl);
      setAttendanceSession(sessionData);
      setAttendanceRecords(initialRecords);
      setIsAttendanceLoaded(true);
      toast.success('Attendance session started! All students marked ABSENT by default.');
    } catch (err: any) {
      console.error('Failed to start session:', err);
      toast.error(err.message || 'Failed to start attendance session! Check backend server.');
      return;
    }

    // Auto-refresh OTP and QR every 30 seconds
    const interval = setInterval(async () => {
      const newOTP = generateOTP();
      setOtp(newOTP);
      
      const updatedData = JSON.stringify({
        sessionId,
        otp: newOTP,
        classId: selectedClass.id,
        teacherId: currentUser?.id,
        radius: selectedClass.radius,
      });
      
      try {
        const newQrDataUrl = await QRCode.toDataURL(updatedData, {
          width: 400,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
        setQrCode(newQrDataUrl);
      } catch {}

      // Update global session in Firebase
      set(ref(rtdb, 'active_session'), {
        sessionId,
        otp: newOTP,
        classId: selectedClass.id,
        teacherId: currentUser?.id,
        semester: selectedClass.semester,
        section: selectedClass.section,
        branch: selectedClass.branch,
        teacherLat,
        teacherLng,
        gpsRadius,
        geoFencingEnabled: actualGeoFencing,
      });
    }, 30000);

    setOtpInterval(interval);
    setView('attendance');
    await fetchOutsideAlerts(sessionId);

    // Write initial ABSENT records to Firebase for all students
    // This ensures teacher sees all students from the start
    const initialFirebaseRecords: Record<string, string> = {};
    selectedClass.students.forEach((s: any) => {
      initialFirebaseRecords[normalizeUSN(s.usn)] = 'ABSENT';
    });
    await set(ref(rtdb, `active_session_records/${sessionId}`), initialFirebaseRecords);

    // Real-time listener: update attendance records as students mark from phone
    (window as any).__onOutsideAlert = (alert: any) => {
      setSuspiciousAlerts(prev => {
        if (prev.some(a => a.usn === alert.usn && a.type === alert.type && Math.abs(new Date(a.attemptedAt).getTime() - new Date(alert.attemptedAt).getTime()) < 5000)) {
          return prev;
        }
        return [alert, ...prev];
      });
      toast.error(`⚠️ Suspicious activity: ${alert.studentName} (${alert.usn}) marked ${alert.type === 'duplicate_device' ? 'using a duplicate device' : 'from outside class'}!`, { duration: 8000 });
    };

    const liveRef = ref(rtdb, `active_session_records/${sessionId}`);
    if ((window as any).__liveAttendanceUnsubscribe) {
      (window as any).__liveAttendanceUnsubscribe();
    }
    console.log('[TeacherDashboard] attaching live attendance listener for session', sessionId);
    const unsubscribe = onValue(liveRef, processSnapshot);
    
    // Suspicious alerts shown via toast only - not stored in Firebase
    // Store unsubscribe so we can clean up when session ends
    (window as any).__liveAttendanceUnsubscribe = unsubscribe;
  };

  const manualToggleAttendance = useCallback(async (usn: string) => {
    if (!attendanceSession) return;
    const normalizedUsn = normalizeUSN(usn);
    const previousStatus = attendanceRecords[normalizedUsn] || 'ABSENT';
    const newStatus = previousStatus === 'PRESENT' ? 'ABSENT' : 'PRESENT';
    setAttendanceRecords(prev => ({ ...prev, [normalizedUsn]: newStatus }));
    try {
      const sessionId = getSessionId(attendanceSession);
      await set(ref(rtdb, `active_session_records/${sessionId}/${normalizedUsn}`), newStatus);
      if (newStatus === 'ABSENT') {
        await remove(ref(rtdb, `session_devices/${sessionId}/${normalizedUsn}`));
      }
    } catch (err: any) {
      console.error('Manual toggle error:', err);
      setAttendanceRecords(prev => ({ ...prev, [normalizedUsn]: previousStatus }));
      toast.error(err.message || 'Failed to toggle student status!');
    }
  }, [attendanceSession, attendanceRecords]);

  // Edit past attendance session
  const openEditSession = (session: AttendanceSession) => {
    setEditingSession(session);
    setEditSessionRecords({ ...session.records });
    setView('history');
  };

  const saveEditedSession = async () => {
    if (!editingSession) return;
    setSavingEdit(true);
    try {
      const updatedSession = { ...editingSession, records: editSessionRecords };
      const updatedHistory = attendanceHistory.map(s => s.id === editingSession.id ? updatedSession : s);
      // Save to MongoDB backend
      const formattedRecords = Object.entries(editSessionRecords).map(([usn, status]) => {
        const student = editingSession.students.find(s => s.usn === usn);
        return {
          usn,
          studentName: student?.name || usn,
          status,
        };
      });
      await attendanceAPI.editPastAttendance(editingSession._id || editingSession.id, formattedRecords);

      saveAttendanceHistory(updatedHistory);

      // Update EVERY student's record in Firebase
      const savePromises = editingSession.students.map(async (student) => {
        const status = editSessionRecords[student.usn] || 'ABSENT';
        const studentRef = ref(rtdb, `student_attendance/${student.usn}`);
        
        // Get all existing records and remove any duplicates for this session
        // (old records may have different keys but same date/subject/className)
        const snap = await get(studentRef);
        if (snap.exists()) {
          const allRecords = snap.val();
          // Find and delete any duplicate records for same class+date
          for (const [key, record] of Object.entries(allRecords) as any) {
            if (
              key !== editingSession.id && 
              record.className === editingSession.className &&
              record.date === editingSession.date &&
              record.subject === editingSession.subject
            ) {
              // Delete the duplicate
              await remove(ref(rtdb, `student_attendance/${student.usn}/${key}`));
            }
          }
        }

        // Save with sessionId as key (overwrites if exists)
        await set(ref(rtdb, `student_attendance/${student.usn}/${editingSession.id}`), {
          id: editingSession.id,
          subject: editingSession.subject,
          className: editingSession.className,
          branch: editingSession.branch,
          semester: editingSession.semester,
          date: editingSession.date,
          year: editingSession.year,
          status,
        });
      });
      await Promise.all(savePromises);

      toast.success('✅ Attendance updated! Student and parent portals updated.');
      setEditingSession(null);
      setEditSessionRecords({});
    } catch (err) {
      logError('saveEditedSession', err);
      toast.error('❌ Failed to save attendance! Check your internet connection and try again.');
    }
    setSavingEdit(false);
  };

  const endAttendanceSession = async () => {
    if (!attendanceSession || !selectedClass) return;

    const saveChoice = window.confirm('Do you want to SAVE this attendance record?\n\nOK = Save attendance\nCancel = End WITHOUT saving');

    if (otpInterval) { clearInterval(otpInterval); setOtpInterval(null); }
    if ((window as any).__liveAttendanceUnsubscribe) { (window as any).__liveAttendanceUnsubscribe(); (window as any).__liveAttendanceUnsubscribe = null; }

    try {
      // Always get fresh records from Firebase
      const liveRecordsSnapshot = await get(ref(rtdb, `active_session_records/${attendanceSession.id}`));
      const liveRecords = liveRecordsSnapshot.exists() ? liveRecordsSnapshot.val() : {};
      const allStudentRecords: AttendanceRecord = {};
      attendanceSession.students.forEach(student => {
        allStudentRecords[student.usn] = liveRecords[student.usn] || 'ABSENT';
      });

      if (saveChoice) {
        const endedSession: AttendanceSession = {
          ...attendanceSession,
          endTime: new Date().toLocaleTimeString(),
          records: allStudentRecords,
        };
        saveAttendanceHistory([endedSession, ...attendanceHistory]);

        // Save to each student's attendance in Firebase
        const savePromises = attendanceSession.students.map(async student => {
          const status = allStudentRecords[student.usn] || 'ABSENT';
          await set(ref(rtdb, `student_attendance/${student.usn}/${attendanceSession.id}`), {
            id: attendanceSession.id,
            subject: attendanceSession.subject,
            className: attendanceSession.className,
            branch: attendanceSession.branch,
            semester: attendanceSession.semester,
            date: attendanceSession.date,
            year: attendanceSession.year,
            status,
          });
        });
        await Promise.all(savePromises);
        toast.success('✅ Session ended and attendance saved!');
      } else {
        toast.success('Session ended without saving.');
      }
    } catch (err: any) {
      logError('endAttendanceSession', err);
      toast.error(err.message || 'Failed to end/save session');
    } finally {
      // Clean up - wrap in try-catch to prevent errors from crashing the connection
      try {
        if ((window as any).__liveAttendanceUnsubscribe) {
          try {
            (window as any).__liveAttendanceUnsubscribe();
          } catch (e) {
            console.error('Error unsubscribing from live attendance:', e);
          }
          delete (window as any).__liveAttendanceUnsubscribe;
        }
        if ((window as any).__pollInterval) {
          clearInterval((window as any).__pollInterval);
          delete (window as any).__pollInterval;
        }

        setSessionSaveChoice(saveChoice);
        
        // Call endSession via backend - handles session cleanup
        try {
          await remove(ref(rtdb, 'active_session'));
        } catch (e) {
          console.error('Error removing active_session:', e);
        }

        // Remove in-memory references (safe operations that won't fail)
        try {
          await remove(ref(rtdb, `active_session_records/${attendanceSession.id}`));
        } catch (e) {
          console.error('Error removing active_session_records:', e);
        }

        try {
          await remove(ref(rtdb, `session_devices/${attendanceSession.id}`));
        } catch (e) {
          console.error('Error removing session_devices:', e);
        }

        setSuspiciousAlerts([]);
        setShowAlerts(false);
        setView('history');
        setAttendanceSession(null);
        setQrCode('');
        setOtp('');
        setAttendanceRecords({});
        setIsAttendanceLoaded(false);
      } catch (err: any) {
        console.error('Cleanup error in endAttendanceSession:', err);
        // Continue anyway - don't let cleanup errors prevent state updates
        setSuspiciousAlerts([]);
        setShowAlerts(false);
        setView('history');
        setAttendanceSession(null);
        setQrCode('');
        setOtp('');
        setAttendanceRecords({});
        setIsAttendanceLoaded(false);
      }
    }
  };

  const downloadAttendanceExcel = (session: AttendanceSession) => {
    const data = session.students.map(student => ({
      'Student Name': student.name,
      'USN / Roll Number': student.usn,
      'Status': session.records[student.usn] || 'ABSENT',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `Attendance_${session.className}_${session.date}.xlsx`);
    toast.success('Attendance downloaded successfully!');
  };

  const openInGoogleSheets = (csvContent: string, filename: string) => {
    // Convert CSV to TSV (tab-separated values) for clean clipboard pasting
    const tsvContent = csvContent.replace(/,/g, '\t');
    
    // Copy TSV content to clipboard
    navigator.clipboard.writeText(tsvContent).then(() => {
      window.open('https://sheets.new', '_blank');
      toast.success(
        '📋 Attendance data copied to clipboard & Google Sheets opened!\n\nJust press Ctrl+V (Paste) in the new sheet to paste it immediately.',
        { duration: 15000 }
      );
    }).catch(() => {
      // Fallback: download CSV file if clipboard permissions are denied
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setTimeout(() => {
        window.open('https://sheets.new', '_blank');
        toast.success(
          '📊 CSV downloaded + Google Sheets opened!\n\nIn Sheets: Click File → Import → Upload → select the downloaded CSV file',
          { duration: 10000 }
        );
      }, 500);
    });
  };

  const exportToGoogleSheets = (session: AttendanceSession) => {
    const headers = ['Student Name', 'USN', 'Status', 'Date', 'Subject', 'Class'];
    const rows = session.students.map(student => [
      student.name,
      student.usn,
      session.records[student.usn] || 'ABSENT',
      session.date,
      session.subject,
      session.className,
    ]);
    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
    openInGoogleSheets(csvContent, `Attendance_${session.className}_${session.date}`);
  };

  const deleteAttendanceRecord = async (sessionId: string) => {
    if (window.confirm('Are you sure you want to delete this attendance record? This cannot be undone.')) {
      const session = attendanceHistory.find(s => s.id === sessionId);
      const targetId = session?._id || sessionId;
      try {
        await attendanceAPI.delete(targetId);
        const updatedHistory = attendanceHistory.filter(s => s.id !== sessionId);
        saveAttendanceHistory(updatedHistory);
        toast.success('Attendance record deleted successfully!');
      } catch (err: any) {
        toast.error(err.message || 'Failed to delete record from database');
      }
    }
  };

  const deleteAllAttendanceHistory = async () => {
    if (window.confirm('⚠️ Are you sure you want to DELETE ALL attendance history?\n\nThis will permanently delete all past attendance records for all your classes. This action CANNOT be undone!')) {
      try {
        await attendanceAPI.deleteAllTeacherHistory();
        setAttendanceHistory([]);
        localStorage.removeItem(`attendance_history_${currentUser?.id}`);
        toast.success('All attendance history deleted successfully!');
      } catch (err: any) {
        toast.error(err.message || 'Failed to delete attendance history');
      }
    }
  };

  const cardBg = isDarkMode ? 'bg-white/10 backdrop-blur-xl border-white/20' : 'bg-white border-gray-200';
  const textColor = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextColor = isDarkMode ? 'text-white/60' : 'text-gray-600';
  const inputBg = isDarkMode ? 'bg-white/10 border-white/20 text-white placeholder:text-white/50' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400';

  const DashboardView = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Approved Leave Notifications for Department Teachers */}
      {approvedLeaves.map(leave => (
        <motion.div
          key={leave._id || leave.id}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="p-5 rounded-2xl border bg-green-500/10 border-green-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-500 text-white">
                Approved Leave Alert ✓
              </span>
              <span className={`text-xs font-medium ${subTextColor}`}>HOD Forwarded Notification</span>
            </div>
            <h4 className={`text-base font-bold ${textColor}`}>
              {leave.studentName} ({leave.studentUSN}) — {leave.studentBranch} Sem {leave.studentSemester}
            </h4>
            <p className={`text-sm ${subTextColor}`}>
              📅 <strong>Approved Leave Dates:</strong> {leave.fromDate} to {leave.toDate} | 📝 <strong>Reason:</strong> {leave.reason}
            </p>
            {leave.reviewNote && (
              <p className="text-xs text-amber-400 mt-1 italic">
                💬 <strong>HOD Note ({leave.reviewedBy || 'HOD'}):</strong> "{leave.reviewNote}"
              </p>
            )}
          </div>
          <Button
            onClick={async () => {
              if (leave._id) {
                await leavesAPI.acknowledge(leave._id);
                fetchApprovedLeaves();
              }
            }}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition-all whitespace-nowrap"
          >
            Acknowledge / Clear ✕
          </Button>
        </motion.div>
      ))}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          onClick={() => setView('classes')}
          className="bg-gradient-to-br from-blue-500 to-cyan-500 border-0 p-6 text-white cursor-pointer hover:scale-105 transition-transform"
        >
          <Users className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">My Classes</h3>
          <p className="text-white/80 mt-2">{classes.length} classes created</p>
        </Card>

        <Card
          onClick={() => setView('create-class')}
          className="bg-gradient-to-br from-purple-500 to-pink-500 border-0 p-6 text-white cursor-pointer hover:scale-105 transition-transform"
        >
          <Plus className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">Create New Class</h3>
          <p className="text-white/80 mt-2">Add a new class</p>
        </Card>

        <Card
          onClick={() => setView('history')}
          className="bg-gradient-to-br from-green-500 to-emerald-600 border-0 p-6 text-white cursor-pointer hover:scale-105 transition-transform"
        >
          <Calendar className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">Attendance History</h3>
          <p className="text-white/80 mt-2">{attendanceHistory.length} records saved</p>
        </Card>
      </div>

      {/* FEATURE: Second row with Exam Eligibility, Date Download and Settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          onClick={() => setView('exam-eligibility')}
          className="bg-gradient-to-br from-orange-500 to-red-500 border-0 p-6 text-white cursor-pointer hover:scale-105 transition-transform"
        >
          <GraduationCap className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">Exam Eligibility</h3>
          <p className="text-white/80 mt-2">Generate eligibility reports</p>
        </Card>

        <Card
          onClick={() => { setDownloadGenerated(false); setDownloadPreview([]); setView('date-download'); }}
          className="bg-gradient-to-br from-teal-500 to-cyan-600 border-0 p-6 text-white cursor-pointer hover:scale-105 transition-transform"
        >
          <Download className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">Download Attendance</h3>
          <p className="text-white/80 mt-2">Export by date range to Excel</p>
        </Card>

        <Card
          onClick={() => setView('settings')}
          className="bg-gradient-to-br from-gray-600 to-gray-800 border-0 p-6 text-white cursor-pointer hover:scale-105 transition-transform"
        >
          <Settings className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">Settings</h3>
          <p className="text-white/80 mt-2">Configure auto-delete & more</p>
        </Card>

      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          onClick={async () => {
            setView('leave-notifications');
            const snap = await get(ref(db, 'leave_notifications'));
            if (snap.exists()) {
              const all = Object.values(snap.val()) as any[];
              // Show only approved leaves for teacher's branch
              const filtered = all.filter((l: any) => 
                l.forTeachers && 
                l.status === 'approved' &&
                (
                  l.approvedBranch === currentUser?.department ||
                  l.studentBranch === currentUser?.department ||
                  l.approvedBranch === currentUser?.branch ||
                  l.studentBranch === currentUser?.branch
                )
              );
              setLeaveNotifications(filtered.sort((a: any, b: any) => new Date(b.reviewedAt || b.submittedAt).getTime() - new Date(a.reviewedAt || a.submittedAt).getTime()));
            }
          }}
          className="bg-gradient-to-br from-yellow-500 to-orange-500 border-0 p-6 text-white cursor-pointer hover:scale-105 transition-transform relative"
        >
          <BookOpen className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">Leave Notifications</h3>
          <p className="text-white/80 mt-2">Approved student leaves</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          onClick={async () => {
            setView('edit-students');
            setLoadingStudents(true);
            try {
              const teacherScope = currentUser?.branch || currentUser?.department;
              if (!teacherScope) {
                toast.error('Your branch or department is not set. Contact administrator.');
                setLoadingStudents(false);
                return;
              }
              const allUsers = await getAllUsers();
              setAllStudentsData(allUsers.filter((u: any) => u.role === 'student'));
            } catch (err) {
              toast.error('Failed to load students. You may not have permission to view student data.');
              console.error('Error loading students:', err);
            }
            setLoadingStudents(false);
          }}
          className="bg-gradient-to-br from-indigo-500 to-purple-600 border-0 p-6 text-white cursor-pointer hover:scale-105 transition-transform"
        >
          <Edit2 className="w-12 h-12 mb-4" />
          <h3 className="text-xl font-bold">Edit Students</h3>
          <p className="text-white/80 mt-2">View and update student data from your branch</p>
        </Card>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen p-6">
      {/* Global Loading Overlay */}
      {globalLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full" />
            <p className="text-gray-700 dark:text-white font-medium">Processing...</p>
          </div>
        </div>
      )}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {view !== 'dashboard' && (
            <Button
              onClick={() => {
                if (view === 'attendance' && attendanceSession) {
                  toast.error('Please end the session first before going back');
                  return;
                }
                if (view === 'class-detail') {
                  setView('classes');
                } else {
                  setView('dashboard');
                }
              }}
              variant="ghost"
              className={isDarkMode ? 'text-white hover:bg-white/10' : 'text-gray-900 hover:bg-gray-100'}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className={`text-3xl font-bold ${textColor}`}>Teacher Dashboard</h1>
            <p className={subTextColor}>Welcome, {currentUser?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl border transition-all ${isDarkMode ? 'border-white/20 text-white bg-white/10 hover:bg-white/20' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-100'}`}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setView('help')}
            className={`p-2 rounded-xl border transition-all ${isDarkMode ? 'border-white/20 text-white bg-white/10 hover:bg-white/20' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-100'}`}
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button
            onClick={logout}
            className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${isDarkMode ? 'border-white/20 text-white bg-white/10 hover:bg-white/20' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-100'}`}
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </div>

      {view === 'dashboard' && <DashboardView />}
      
      {view === 'create-class' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-3xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-6`}>{editingClass ? '✏️ Edit Class' : 'Create New Class'}</h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Class Name *</Label>
                  <Input type="text" value={className} onChange={(e) => setClassName(e.target.value)}
                    placeholder="e.g., DBMS" className={inputBg} autoComplete="off" />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Class Type *</Label>
                  <select value={classType} onChange={(e) => setClassType(e.target.value as any)}
                    className={`${inputBg} w-full p-2.5 rounded-lg border`}>
                    <option value="Theory">Theory</option>
                    <option value="Lab">Lab</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Subject Name *</Label>
                  <Input type="text" value={classSubject} onChange={(e) => setClassSubject(e.target.value)}
                    placeholder="e.g., Database Management" className={inputBg} autoComplete="off" />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Subject Code</Label>
                  <Input type="text" value={classSubjectCode} onChange={(e) => setClassSubjectCode(e.target.value)}
                    placeholder="e.g., CS401" className={inputBg} autoComplete="off" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Branch *</Label>
                  <select value={classBranch} onChange={(e) => setClassBranch(e.target.value)}
                    className={`${inputBg} w-full p-2.5 rounded-lg border`}>
                    <option value="">Select Branch</option>
                    <option value="CSE">CSE</option>
                    <option value="ECE">ECE</option>
                    <option value="AIML">AIML</option>
                    <option value="ISE">ISE</option>
                  </select>
                  <Input type="text" value={classBranch} onChange={(e) => setClassBranch(e.target.value)}
                    placeholder="Or custom" className={`${inputBg} mt-2`} autoComplete="off" />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Current Sem *</Label>
                  <select value={classSemester} onChange={(e) => setClassSemester(e.target.value)}
                    className={`${inputBg} w-full p-2.5 rounded-lg border`}>
                    <option value="">Select Sem</option>
                    {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s.toString()}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Section *</Label>
                  <select value={classSection} onChange={(e) => setClassSection(e.target.value)}
                    className={`${inputBg} w-full p-2.5 rounded-lg border`}>
                    <option value="">Select Section</option>
                    {['A','B','C','D','E','F'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <Input type="text" value={classSection} onChange={(e) => setClassSection(e.target.value)}
                    placeholder="Or custom" className={`${inputBg} mt-2`} autoComplete="off" />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Admission Batch *</Label>
                  <Input type="text" value={classBatch} onChange={(e) => setClassBatch(e.target.value)}
                    placeholder="e.g., 2024" className={inputBg} autoComplete="off" />
                  <p className="text-[10px] text-amber-400 mt-1">Fixed admission year</p>
                </div>
              </div>

              <div>
                <Label className={`${textColor} mb-2 block`}>Classroom Size (for GPS radius) — Default: 10m × 8m</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" value={classLength} onChange={(e) => setClassLength(e.target.value)}
                    placeholder="Length (m) — default 10" className={inputBg} autoComplete="off" />
                  <Input type="number" value={classWidth} onChange={(e) => setClassWidth(e.target.value)}
                    placeholder="Width (m) — default 8" className={inputBg} autoComplete="off" />
                </div>
                <p className={`${subTextColor} text-xs mt-1`}>GPS radius auto-calculated from classroom size. Default covers average classroom.</p>
              </div>

              <div>
                <Label className={`${textColor} mb-2 block`}>Upload Student List * (Excel/CSV)</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className={inputBg}
                />
                <p className={`${subTextColor} text-sm mt-1`}>
                  Required columns: Student Name, USN (or Roll Number)
                </p>
                {uploadedStudents.length > 0 && (
                  <p className="text-green-400 text-sm mt-2">
                    ✓ {uploadedStudents.length} students loaded
                  </p>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  onClick={handleCreateClass}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 py-6"
                >
                  <Save className="w-5 h-5 mr-2" />
                  {editingClass ? 'Save Changes' : 'Create Class'}
                </Button>
                <Button
                  onClick={() => {
                    setView('dashboard');
                    clearClassForm();
                  }}
                  variant="outline"
                  className={`px-8 py-6 ${isDarkMode ? 'border-white/20 text-white hover:bg-white/10' : 'border-gray-300 text-gray-900 hover:bg-gray-100'}`}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {view === 'classes' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {classes.length === 0 ? (
            <Card className={`${cardBg} p-8 text-center`}>
              <Users className={`w-16 h-16 ${subTextColor} mx-auto mb-4`} />
              <p className={subTextColor}>No classes created yet</p>
              <Button
                onClick={() => setView('create-class')}
                className="mt-4 bg-gradient-to-r from-blue-500 to-purple-600"
              >
                <Plus className="w-5 h-5 mr-2" />
                Create First Class
              </Button>
            </Card>
          ) : (
            classes.map((classData) => (
              <Card
                key={classData.id}
                className={`${cardBg} p-6 hover:scale-[1.02] transition-transform`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className={`text-xl font-bold ${textColor}`}>{classData.name}</h3>
                    <p className={subTextColor}>{classData.subject}</p>
                    <p className={`${subTextColor} text-sm mt-1`}>
                      {classData.branch} - Sem {classData.semester} - Section {classData.section}
                    </p>
                    <p className={`${subTextColor} text-sm mt-1`}>
                      👥 {classData.students.length} students
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setSelectedClass(classData);
                      setView('class-detail');
                    }}
                    className="bg-gradient-to-r from-green-500 to-emerald-600"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    Start Session
                  </Button>
                </div>
              </Card>
            ))
          )}
        </motion.div>
      )}

      {view === 'class-detail' && selectedClass && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-3xl mx-auto`}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className={`text-2xl font-bold ${textColor}`}>{selectedClass.name}</h2>
                <p className={subTextColor}>{selectedClass.subject} {selectedClass.subjectCode && `(${selectedClass.subjectCode})`}</p>
                <p className={`${subTextColor} text-sm mt-1`}>
                  {selectedClass.branch} • Sem {selectedClass.semester} • Section {selectedClass.section} • {selectedClass.classType || 'Theory'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setEditingClass({...selectedClass}); setView('create-class'); }}
                  className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400">
                  <Edit2 size={15} className="mr-1" /> Edit
                </Button>
                <Button size="sm" onClick={() => handleDeleteClass(selectedClass.id)}
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-400">
                  <XCircle size={15} className="mr-1" /> Delete
                </Button>
              </div>
            </div>

            <div className="mt-6">
              <h3 className={`text-lg font-bold ${textColor} mb-3`}>
                Enrolled Students ({selectedClass.students.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {selectedClass.students.map((student, i) => (
                  <div key={i} className={`${isDarkMode ? 'bg-white/5' : 'bg-gray-50'} rounded-lg p-3 flex items-center justify-between`}>
                    <div>
                      <p className={textColor}>{student.name}</p>
                      <p className={`${subTextColor} text-sm`}>{student.usn}</p>
                    </div>
                    <Button size="sm" onClick={async () => {
                      // Find student in MongoDB by USN
                      const studentData = await getStudentByUSN(student.usn);
                      if (studentData) {
                        setEditingStudent(studentData);
                        setStudentEditForm({
                          name: (studentData as any).name || '',
                          usn: (studentData as any).usn || '',
                          branch: (studentData as any).branch || '',
                          semester: (studentData as any).semester || '',
                          section: (studentData as any).section || '',
                          phone: (studentData as any).phone || '',
                        });
                        setShowStudentEdit(true);
                      } else {
                        toast.error('Student not found in database');
                      }
                    }} className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400">
                      <Edit2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={startAttendanceSession}
              className="w-full mt-6 bg-gradient-to-r from-green-500 to-emerald-600 py-6 text-lg">
              <Play className="w-5 h-5 mr-2" /> Start Attendance Session
            </Button>
          </Card>
        </motion.div>
      )}

      {view === 'attendance' && attendanceSession && selectedClass && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-6">
          <Card className={`${cardBg} p-8`}>
            <div className="text-center mb-6">
              <h2 className={`text-2xl font-bold ${textColor} mb-2`}>📡 Session Active - MASTER MODE</h2>
              <p className={subTextColor}>{selectedClass.name} - {selectedClass.subject}</p>
              <p className={`${subTextColor} text-sm`}>QR & OTP refresh every 30 seconds</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {qrCode && (
                <div className="text-center">
                  <p className={`${textColor} mb-3 font-medium`}>Students Scan This QR</p>
                  <div className="bg-white p-4 rounded-lg inline-block">
                    <img src={qrCode} alt="QR Code" className="mx-auto" />
                  </div>
                </div>
              )}

              <div className="text-center">
                <p className={`${textColor} mb-3 font-medium`}>Or Enter This OTP</p>
                <div className={`${isDarkMode ? 'bg-white/10' : 'bg-gray-100'} p-8 rounded-lg`}>
                  <p className={`text-6xl font-bold ${textColor} tracking-wider`}>{otp}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="bg-blue-500/20 border-blue-500/50 p-4 text-center">
                <p className={subTextColor + ' text-sm'}>Total</p>
                <p className={`text-3xl font-bold ${textColor}`}>{selectedClass.students.length}</p>
              </Card>
              <Card className="bg-green-500/20 border-green-500/50 p-4 text-center">
                <p className={subTextColor + ' text-sm'}>Present</p>
                <p className="text-3xl font-bold text-green-400">
                  {isAttendanceLoaded ? presentCount : (
                    <span className="text-xl font-normal text-white/50">Loading...</span>
                  )}
                </p>
              </Card>
              <Card className="bg-red-500/20 border-red-500/50 p-4 text-center">
                <p className={subTextColor + ' text-sm'}>Absent</p>
                <p className="text-3xl font-bold text-red-400">
                  {isAttendanceLoaded ? absentCount : (
                    <span className="text-xl font-normal text-white/50">Loading...</span>
                  )}
                </p>
              </Card>
            </div>

            <div className="mb-6">
              <h3 className={`text-lg font-bold ${textColor} mb-3`}>
                Live Attendance (Manual Override Available)
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedClass.students.map((student) => {
                  const normalizedUsn = normalizeUSN(student.usn);
                  const status = attendanceRecords[normalizedUsn] || 'ABSENT';
                  return (
                    <StudentRow
                      key={normalizedUsn}
                      student={student}
                      status={status}
                      onToggle={manualToggleAttendance}
                      isDarkMode={isDarkMode}
                      textColor={textColor}
                      subTextColor={subTextColor}
                    />
                  );
                })}
              </div>
            </div>

            {/* 🚨 SUSPICIOUS ALERTS PANEL */}
            {suspiciousAlerts.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={() => setShowAlerts(!showAlerts)}
                  className="w-full flex items-center justify-between bg-red-500/20 border border-red-500/40 rounded-xl p-4 mb-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🚨</span>
                    <div className="text-left">
                      <p className="text-red-400 font-bold">Suspicious Activity Detected!</p>
                      <p className="text-red-300 text-sm">{suspiciousAlerts.length} alert{suspiciousAlerts.length > 1 ? 's' : ''} during this session</p>
                    </div>
                  </div>
                  <span className="text-red-400 text-sm">{showAlerts ? '▲ Hide' : '▼ Show'}</span>
                </button>

                {showAlerts && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {suspiciousAlerts.map((alert, i) => (
                      <div key={i} className={`${isDarkMode ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'} border rounded-xl p-3`}>
                        <div className="flex items-start gap-3">
                          <span className="text-xl mt-0.5">{alert.type === 'outside_classroom' ? '📍' : '📱'}</span>
                          <div className="flex-1">
                            <p className="text-red-400 font-bold text-sm">{alert.studentName} ({alert.usn})</p>
                            {alert.type === 'outside_classroom' && (
                              <p className={`text-xs ${subTextColor}`}>
                                Tried to mark from <span className="text-red-400 font-bold">{alert.distance}m away</span> (allowed: {alert.allowedRadius}m)
                              </p>
                            )}
                            {alert.type === 'duplicate_device' && (
                              <p className={`text-xs ${subTextColor}`}>
                                Tried to mark attendance twice from same device
                              </p>
                            )}
                            <p className={`text-xs ${subTextColor} mt-1`}>
                              {new Date(alert.attemptedAt).toLocaleTimeString()}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            alert.type === 'outside_classroom'
                              ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {alert.type === 'outside_classroom' ? 'Outside' : 'Duplicate'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={endAttendanceSession}
              className="w-full bg-gradient-to-r from-red-500 to-pink-600 py-6 text-lg"
            >
              <Square className="w-5 h-5 mr-2" />
              End & Save Session
            </Button>
          </Card>
        </motion.div>
      )}

      {view === 'history' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className={`text-2xl font-bold ${textColor}`}>
                  Attendance History ({attendanceHistory.length} records)
                </h2>
                <p className={`${subTextColor} text-sm mt-1`}>
                  * Records older than {autoDeleteEnabled && autoDeleteDuration !== 'disabled' ? `${autoDeleteDuration} months` : '1 month'} are automatically deleted
                </p>
              </div>
              {attendanceHistory.length > 0 && (
                <Button
                  onClick={deleteAllAttendanceHistory}
                  className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 px-4 py-2 rounded-xl transition-all shadow-md"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete All History
                </Button>
              )}
            </div>

            {attendanceHistory.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className={`w-16 h-16 ${subTextColor} mx-auto mb-4`} />
                <p className={subTextColor}>No attendance records yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {attendanceHistory.map((session) => {
                  const presentCount = Object.values(session.records).filter(s => s === 'PRESENT').length;
                  const absentCount = Object.values(session.records).filter(s => s === 'ABSENT').length;

                  return (
                    <Card key={session.id} className={`${isDarkMode ? 'bg-white/5' : 'bg-gray-50'} p-6`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className={`text-lg font-bold ${textColor}`}>{session.className}</h3>
                          <p className={`${subTextColor} text-sm mt-1`}>
                            📚 {session.subject}
                          </p>
                          <p className={`${subTextColor} text-sm mt-1`}>
                            📅 {session.date} • 🕐 {session.startTime}
                            {session.endTime && ` - ${session.endTime}`}
                          </p>
                          <div className="flex gap-4 mt-2">
                            <span className="text-sm text-green-400">
                              ✓ {presentCount} Present
                            </span>
                            <span className="text-sm text-red-400">
                              ✗ {absentCount} Absent
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => openEditSession(session)}
                            className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300">
                            <Edit2 size={16} />
                          </Button>
                          <Button size="sm" onClick={() => downloadAttendanceExcel(session)}
                            className="bg-green-500/20 hover:bg-green-500/30 text-green-300">
                            <Download size={16} />
                          </Button>
                          <Button size="sm" onClick={() => exportToGoogleSheets(session)}
                            title="Export to Google Sheets"
                            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs px-2">
                            📊
                          </Button>
                          <Button size="sm" onClick={() => deleteAttendanceRecord(session.id)}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-300">
                            <XCircle size={16} />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Edit Session Modal */}
          {editingSession && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
              <div className={`${cardBg} rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className={`text-xl font-bold ${textColor}`}>Edit Attendance</h3>
                    <p className={`text-sm ${subTextColor}`}>{editingSession.className} — {editingSession.date}</p>
                  </div>
                  <button onClick={() => { setEditingSession(null); setEditSessionRecords({}); }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-600'}`}>✕</button>
                </div>
                <div className={`${isDarkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'} border rounded-xl p-3 mb-4`}>
                  <p className={`text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                    ✅ Changes will automatically update in Student and Parent portals too!
                  </p>
                </div>
                <div className="space-y-2 mb-6">
                  {editingSession.students.map(student => (
                    <div key={student.usn} className={`${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} border rounded-xl p-3 flex items-center justify-between`}>
                      <div>
                        <p className={`font-medium ${textColor}`}>{student.name}</p>
                        <p className={`text-sm ${subTextColor}`}>{student.usn}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditSessionRecords(prev => ({ ...prev, [student.usn]: 'PRESENT' }))}
                          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            editSessionRecords[student.usn] === 'PRESENT'
                              ? 'bg-green-500 text-white'
                              : isDarkMode ? 'bg-white/10 text-white/60 hover:bg-green-500/20' : 'bg-gray-100 text-gray-500 hover:bg-green-50'
                          }`}>P</button>
                        <button onClick={() => setEditSessionRecords(prev => ({ ...prev, [student.usn]: 'ABSENT' }))}
                          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            editSessionRecords[student.usn] === 'ABSENT'
                              ? 'bg-red-500 text-white'
                              : isDarkMode ? 'bg-white/10 text-white/60 hover:bg-red-500/20' : 'bg-gray-100 text-gray-500 hover:bg-red-50'
                          }`}>A</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button onClick={saveEditedSession} disabled={savingEdit} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 py-4">
                    {savingEdit ? (
                      <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2" />Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Save Changes</>
                    )}
                  </Button>
                  <Button onClick={() => { setEditingSession(null); setEditSessionRecords({}); }} variant="outline"
                    className={`flex-1 ${isDarkMode ? 'border-white/20 text-white' : ''}`}>Cancel</Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* FEATURE: Exam Eligibility Report */}
      {view === 'exam-eligibility' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-4xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-6`}>Exam Eligibility Report</h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <Label className={`${textColor} mb-2 block`}>Select Class *</Label>
                <select
                  value={selectedClassForReport}
                  onChange={(e) => {
                    setSelectedClassForReport(e.target.value);
                    setGeneratedReport([]);
                  }}
                  className={`${inputBg} w-full p-3 rounded-lg`}
                >
                  <option value="">-- Select Class --</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name} ({cls.subject})</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className={`${textColor} mb-2 block`}>Select Subject *</Label>
                <select
                  value={selectedSubjectForReport}
                  onChange={(e) => {
                    setSelectedSubjectForReport(e.target.value);
                    setGeneratedReport([]);
                  }}
                  className={`${inputBg} w-full p-3 rounded-lg`}
                  disabled={!selectedClassForReport}
                >
                  <option value="">-- Select Subject --</option>
                  {selectedClassForReport && classes.find(c => c.id === selectedClassForReport) && (
                    <option value={classes.find(c => c.id === selectedClassForReport)!.subject}>
                      {classes.find(c => c.id === selectedClassForReport)!.subject}
                    </option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Start Date *</Label>
                  <Input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => {
                      setReportStartDate(e.target.value);
                      setGeneratedReport([]);
                    }}
                    className={inputBg}
                  />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>End Date *</Label>
                  <Input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => {
                      setReportEndDate(e.target.value);
                      setGeneratedReport([]);
                    }}
                    className={inputBg}
                  />
                </div>
              </div>

              <div>
                <Label className={`${textColor} mb-2 block`}>Eligibility Percentage (%) *</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={eligibilityPercentage}
                  onChange={(e) => setEligibilityPercentage(e.target.value)}
                  className={inputBg}
                />
                <p className={`${subTextColor} text-sm mt-1`}>
                  Students below this percentage will be marked as not eligible
                </p>
              </div>

              <Button
                onClick={() => {
                  if (!selectedClassForReport || !selectedSubjectForReport || !reportStartDate || !reportEndDate) {
                    toast.error('Please fill in all fields');
                    return;
                  }

                  const selectedClassData = classes.find(c => c.id === selectedClassForReport);
                  if (!selectedClassData) return;

                  // Calculate attendance for each student
                  const report = selectedClassData.students.map(student => {
                    const studentHistory = attendanceHistory.filter(
                      session =>
                        session.classId === selectedClassForReport &&
                        session.subject === selectedSubjectForReport &&
                        new Date(session.date) >= new Date(reportStartDate) &&
                        new Date(session.date) <= new Date(reportEndDate)
                    );

                    const totalClasses = studentHistory.length;
                    const presentClasses = studentHistory.filter(
                      session => session.records[student.usn] === 'PRESENT'
                    ).length;

                    const percentage = totalClasses > 0 ? Math.round((presentClasses / totalClasses) * 100 * 10) / 10 : 0;

                    return {
                      name: student.name,
                      usn: student.usn,
                      percentage,
                      eligible: percentage >= parseFloat(eligibilityPercentage),
                    };
                  });

                  setGeneratedReport(report);
                  toast.success('Report generated successfully!');
                }}
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 py-6 text-lg"
              >
                <GraduationCap className="w-5 h-5 mr-2" />
                Generate Eligibility Report
              </Button>
            </div>

            {generatedReport.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-lg font-bold ${textColor}`}>
                    Report Results ({generatedReport.length} students)
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const data = generatedReport.map(r => ({
                          'Student Name': r.name,
                          'USN / Roll Number': r.usn,
                          'Attendance Percentage': r.percentage + '%',
                          'Status': r.eligible ? 'Eligible' : 'Not Eligible',
                        }));
                        const ws = XLSX.utils.json_to_sheet(data);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, 'Eligibility Report');
                        XLSX.writeFile(wb, `Exam_Eligibility_${selectedSubjectForReport}_${new Date().toISOString().split('T')[0]}.xlsx`);
                        toast.success('Report downloaded successfully!');
                      }}
                      className="bg-gradient-to-r from-green-500 to-emerald-600"
                    >
                      <Download className="w-5 h-5 mr-2" /> Download Excel
                    </Button>
                    <Button
                      onClick={() => {
                        const headers = ['Student Name', 'USN', 'Attendance %', 'Status'];
                        const rows = generatedReport.map(r => [r.name, r.usn, r.percentage + '%', r.eligible ? 'Eligible' : 'Not Eligible']);
                        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
                        openInGoogleSheets(csv, `Eligibility_${selectedSubjectForReport}`);
                      }}
                      className="bg-gradient-to-r from-blue-500 to-cyan-500"
                    >
                      📊 Open in Sheets
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {generatedReport.map((student, i) => (
                    <Card
                      key={i}
                      className={`${
                        student.eligible
                          ? isDarkMode ? 'bg-green-500/20' : 'bg-green-50'
                          : isDarkMode ? 'bg-red-500/20' : 'bg-red-50'
                      } p-4`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`font-bold ${textColor}`}>{student.name}</p>
                          <p className={`${subTextColor} text-sm`}>{student.usn}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-bold ${student.eligible ? 'text-green-400' : 'text-red-400'}`}>
                            {student.percentage}%
                          </p>
                          <p className={`text-sm ${student.eligible ? 'text-green-400' : 'text-red-400'}`}>
                            {student.eligible ? '✓ Eligible' : '✗ Not Eligible'}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* FEATURE: Date Range Attendance Download */}
      {view === 'date-download' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-4xl mx-auto`}>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center">
                <Download className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className={`text-2xl font-bold ${textColor}`}>Download Attendance</h2>
                <p className={subTextColor}>Export student attendance by date range</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Class Selection */}
              <div>
                <Label className={`${textColor} mb-2 block font-medium`}>Select Class *</Label>
                <select
                  value={downloadClass}
                  onChange={(e) => { setDownloadClass(e.target.value); setDownloadGenerated(false); setDownloadPreview([]); }}
                  className={`${inputBg} w-full p-3 rounded-xl border`}
                >
                  <option value="">-- Select a class --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} — {c.subject} ({c.branch} Sem {c.semester} Sec {c.section})</option>
                  ))}
                </select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block font-medium`}>From Date *</Label>
                  <Input
                    type="date"
                    value={downloadStartDate}
                    onChange={(e) => { setDownloadStartDate(e.target.value); setDownloadGenerated(false); setDownloadPreview([]); }}
                    className={inputBg}
                  />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block font-medium`}>To Date *</Label>
                  <Input
                    type="date"
                    value={downloadEndDate}
                    onChange={(e) => { setDownloadEndDate(e.target.value); setDownloadGenerated(false); setDownloadPreview([]); }}
                    className={inputBg}
                  />
                </div>
              </div>

              {/* Quick Date Presets */}
              <div>
                <Label className={`${textColor} mb-2 block font-medium`}>Quick Select</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Last 7 days', days: 7 },
                    { label: 'Last 30 days', days: 30 },
                    { label: 'Last 3 months', days: 90 },
                    { label: 'Last 6 months', days: 180 },
                  ].map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(start.getDate() - preset.days);
                        setDownloadStartDate(start.toISOString().split('T')[0]);
                        setDownloadEndDate(end.toISOString().split('T')[0]);
                        setDownloadGenerated(false);
                        setDownloadPreview([]);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        isDarkMode
                          ? 'bg-white/10 border-white/20 text-white hover:bg-teal-500/30'
                          : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-teal-50 hover:border-teal-400'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Preview Button */}
              <Button
                onClick={() => {
                  if (!downloadClass || !downloadStartDate || !downloadEndDate) {
                    toast.error('Please select a class and date range');
                    return;
                  }
                  if (new Date(downloadStartDate) > new Date(downloadEndDate)) {
                    toast.error('Start date cannot be after end date');
                    return;
                  }

                  const selectedClassData = classes.find(c => c.id === downloadClass);
                  if (!selectedClassData) return;

                  // Filter sessions within date range for this class
                  const filteredSessions = attendanceHistory.filter(session =>
                    session.classId === downloadClass &&
                    new Date(session.date) >= new Date(downloadStartDate) &&
                    new Date(session.date) <= new Date(downloadEndDate)
                  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                  if (filteredSessions.length === 0) {
                    toast.error('No attendance records found for this date range');
                    return;
                  }

                  // Build preview data — one row per student with all dates as columns
                  const preview = selectedClassData.students.map(student => {
                    const row: any = {
                      'Student Name': student.name,
                      'USN': student.usn,
                    };
                    let present = 0;
                    let total = filteredSessions.length;

                    filteredSessions.forEach(session => {
                      const status = session.records?.[student.usn] || 'ABSENT';
                      row[session.date] = status === 'PRESENT' ? 'P' : 'A';
                      if (status === 'PRESENT') present++;
                    });

                    row['Total Classes'] = total;
                    row['Present'] = present;
                    row['Absent'] = total - present;
                    row['Attendance %'] = total > 0 ? (Math.round((present / total) * 1000) / 10) + '%' : '0%';
                    return row;
                  });

                  setDownloadPreview(preview);
                  setDownloadGenerated(true);
                  toast.success(`Preview generated! ${filteredSessions.length} sessions found`);
                }}
                className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 py-6 text-lg"
              >
                <BarChart3 className="w-5 h-5 mr-2" />
                Generate Preview
              </Button>
            </div>

            {/* Preview Table */}
            {downloadGenerated && downloadPreview.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-lg font-bold ${textColor}`}>
                    Preview — {downloadPreview.length} Students
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const ws = XLSX.utils.json_to_sheet(downloadPreview);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
                        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
                        for (let col = range.s.c; col <= range.e.c; col++) {
                          const cellAddr = XLSX.utils.encode_cell({ r: 0, c: col });
                          if (!ws[cellAddr]) continue;
                          ws[cellAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: '4F86C6' } } };
                        }
                        const className = classes.find(c => c.id === downloadClass)?.name || 'class';
                        XLSX.writeFile(wb, `Attendance_${className}_${downloadStartDate}_to_${downloadEndDate}.xlsx`);
                        toast.success('Excel downloaded successfully!');
                      }}
                      className="bg-gradient-to-r from-green-500 to-emerald-600"
                    >
                      <Download className="w-4 h-4 mr-2" /> Download Excel
                    </Button>
                    <Button
                      onClick={() => {
                        const headers = Object.keys(downloadPreview[0] || {});
                        const rows = downloadPreview.map(r => headers.map(h => r[h] || ''));
                        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
                        const className = classes.find(c => c.id === downloadClass)?.name || 'class';
                        openInGoogleSheets(csv, `Attendance_${className}_${downloadStartDate}`);
                      }}
                      className="bg-gradient-to-r from-blue-500 to-cyan-500"
                    >
                      📊 Open in Sheets
                    </Button>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className={`${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-50'} rounded-xl p-4 text-center`}>
                    <p className={`text-2xl font-bold ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                      {downloadPreview.length}
                    </p>
                    <p className={subTextColor}>Students</p>
                  </div>
                  <div className={`${isDarkMode ? 'bg-green-500/20' : 'bg-green-50'} rounded-xl p-4 text-center`}>
                    <p className={`text-2xl font-bold ${isDarkMode ? 'text-green-300' : 'text-green-600'}`}>
                      {downloadPreview[0] ? Object.keys(downloadPreview[0]).filter(k => k.match(/^\d{4}-\d{2}-\d{2}$/)).length : 0}
                    </p>
                    <p className={subTextColor}>Sessions</p>
                  </div>
                  <div className={`${isDarkMode ? 'bg-purple-500/20' : 'bg-purple-50'} rounded-xl p-4 text-center`}>
                    <p className={`text-2xl font-bold ${isDarkMode ? 'text-purple-300' : 'text-purple-600'}`}>
                      {downloadStartDate} → {downloadEndDate}
                    </p>
                    <p className={subTextColor}>Date Range</p>
                  </div>
                </div>

                {/* Student List Preview */}
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {downloadPreview.map((row, i) => {
                    const pct = parseFloat(row['Attendance %']);
                    const color = pct >= 75 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';
                    const bgColor = pct >= 75
                      ? isDarkMode ? 'bg-green-500/10' : 'bg-green-50'
                      : pct >= 50
                        ? isDarkMode ? 'bg-yellow-500/10' : 'bg-yellow-50'
                        : isDarkMode ? 'bg-red-500/10' : 'bg-red-50';
                    return (
                      <div key={i} className={`${bgColor} rounded-xl p-4 flex items-center justify-between`}>
                        <div>
                          <p className={`font-bold ${textColor}`}>{row['Student Name']}</p>
                          <p className={`${subTextColor} text-sm`}>{row['USN']}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-bold ${color}`}>{row['Attendance %']}</p>
                          <p className={`text-sm ${subTextColor}`}>{row['Present']}P / {row['Absent']}A</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* FEATURE: Settings */}
      {view === 'settings' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-3xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-6`}>Settings</h2>

            <div className="space-y-6">
              <div>
                <h3 className={`text-lg font-bold ${textColor} mb-4`}>Attendance Auto Delete Settings</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={textColor}>Enable Auto Delete</p>
                      <p className={`${subTextColor} text-sm`}>
                        Automatically delete old attendance records
                      </p>
                    </div>
                    <button
                      onClick={() => setAutoDeleteEnabled(!autoDeleteEnabled)}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                        autoDeleteEnabled ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          autoDeleteEnabled ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {autoDeleteEnabled && (
                    <div>
                      <Label className={`${textColor} mb-2 block`}>Auto Delete Duration</Label>
                      <select
                        value={autoDeleteDuration}
                        onChange={(e) => setAutoDeleteDuration(e.target.value as any)}
                        className={`${inputBg} w-full p-3 rounded-lg`}
                      >
                        <option value="3">3 Months</option>
                        <option value="6">6 Months (Default)</option>
                        <option value="12">12 Months</option>
                        <option value="disabled">Never Delete</option>
                      </select>
                      <p className={`${subTextColor} text-sm mt-2`}>
                        Records older than this duration will be automatically deleted from teacher, student, and parent history
                      </p>
                    </div>
                  )}

                  {/* GPS Geofencing Toggle */}
                  <div className={`${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} border rounded-xl p-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-medium ${textColor}`}>📍 GPS Geofencing Verification</p>
                        <p className={`${subTextColor} text-sm mt-1`}>
                          When ON — students must be inside classroom to mark attendance
                        </p>
                        <p className={`text-xs mt-1 ${geoFencingEnabled ? 'text-green-400' : 'text-orange-400'}`}>
                          {geoFencingEnabled ? '✅ Students must be physically present in class' : '⚠️ Students can mark attendance from anywhere'}
                        </p>
                      </div>
                      <button
                        onClick={() => setGeoFencingEnabled(!geoFencingEnabled)}
                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ml-4 shrink-0 ${
                          geoFencingEnabled ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                      >
                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          geoFencingEnabled ? 'translate-x-7' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      set(ref(rtdb, `teacher_settings/${currentUser?.id}`), {
                        autoDeleteEnabled,
                        autoDeleteDuration,
                        geoFencingEnabled,
                      });
                      toast.success('Settings saved successfully!');
                    }}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 py-4"
                  >
                    <Save className="w-5 h-5 mr-2" />
                    Save Settings
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Edit Students View */}
      {view === 'edit-students' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-6 max-w-4xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-2`}>Edit Students</h2>
            <p className={`${subTextColor} text-sm mb-6`}>Search and edit student data. Changes update everywhere — student and parent portals.</p>

            {/* Search */}
            <div className="relative mb-6">
              <input
                type="text"
                value={studentSearchQuery}
                onChange={e => setStudentSearchQuery(e.target.value)}
                placeholder="Search by name or USN..."
                className={`${inputBg} w-full p-3 pl-10 rounded-xl border`}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            </div>

            {loadingStudents ? (
              <div className="flex items-center justify-center py-12">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full" />
                <p className={`ml-3 ${subTextColor}`}>Loading students...</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {allStudentsData
                  .filter((s: any) =>
                    !studentSearchQuery ||
                    s.name?.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
                    s.usn?.toLowerCase().includes(studentSearchQuery.toLowerCase())
                  )
                  .sort((a: any, b: any) => (a.usn || '').localeCompare(b.usn || ''))
                  .map((student: any) => (
                    <div key={student.id} className={`${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} border rounded-xl p-4`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className={`font-bold ${textColor}`}>{student.name}</p>
                          <p className={`text-sm ${subTextColor}`}>{student.usn} • {student.branch} • Sem {student.semester} • Sec {student.section}</p>
                        </div>
                        <Button size="sm"
                          onClick={() => {
                            setEditingStudent(student);
                            setStudentEditForm({
                              name: student.name || '',
                              usn: student.usn || '',
                              branch: student.branch || '',
                              semester: student.semester || '',
                              section: student.section || '',
                              phone: student.phone || '',
                              rollNo: student.rollNo || '',
                              batch: student.batch || '',
                            });
                            setShowStudentEdit(true);
                          }}
                          className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400">
                          <Edit2 size={14} className="mr-1" /> Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                {allStudentsData.length === 0 && !loadingStudents && (
                  <p className={`text-center py-8 ${subTextColor}`}>No students found in your branch. Contact administrator if you believe this is incorrect.</p>
                )}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* Leave Notifications for Teacher */}
      {view === 'leave-notifications' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-6 max-w-3xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-2`}>📬 Approved Leave Notifications</h2>
            <p className={`${subTextColor} text-sm mb-6`}>Students from your branch whose leaves have been approved by HOD.</p>
            {leaveNotifications.length === 0 ? (
              <p className={`text-center py-8 ${subTextColor}`}>No approved leave notifications for your branch</p>
            ) : (
              <div className="space-y-4">
                {leaveNotifications.map(leave => (
                  <div key={leave.id} className={`${isDarkMode ? 'bg-green-500/10 border-green-500/20' : 'bg-green-50 border-green-200'} border rounded-xl p-5`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className={`font-bold ${textColor}`}>{leave.studentName} ({leave.studentUSN})</p>
                        <p className={`text-sm ${subTextColor}`}>Sem {leave.studentSemester} • {leave.studentBranch}</p>
                      </div>
                      <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-bold">✅ Approved</span>
                    </div>
                    <p className={`text-sm ${subTextColor} mb-1`}>📅 {leave.fromDate} → {leave.toDate}</p>
                    {leave.subject && <p className={`text-sm ${subTextColor} mb-1`}>📚 {leave.subject}</p>}
                    <p className={`text-sm ${subTextColor}`}>{leave.reason?.substring(0, 150)}</p>
                    {leave.reviewNote && (
                      <p className="text-xs text-green-400 mt-2">HOD Note: {leave.reviewNote}</p>
                    )}
                    {leave.fileData && (
                      <a href={leave.fileData.data} download={leave.fileData.name}
                        className="text-blue-400 text-xs underline mt-2 block">
                        📎 Download: {leave.fileData.name}
                      </a>
                    )}
                    <button onClick={async () => {
                      try {
                        await leavesAPI.delete(leave.id);
                        setLeaveNotifications(prev => prev.filter(l => l.id !== leave.id));
                        toast.success('✅ Leave cleared from your inbox');
                      } catch (err) {
                        toast.error('❌ Failed to clear leave. Try again.');
                        console.error('Error deleting leave:', err);
                      }
                    }} className={`mt-3 px-3 py-1.5 rounded-lg text-xs ${isDarkMode ? 'bg-white/10 text-white/60 hover:bg-white/20' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                      ✕ Clear
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* Outside Class Students Report - shown after session ends */}
      {showOutsideReport && outsideAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
          <Card className={`${cardBg} p-6 max-w-lg w-full max-h-96 overflow-y-auto`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${textColor}`}>⚠️ Outside Class Alerts</h3>
              <button onClick={() => setShowOutsideReport(false)}
                className={`p-2 rounded-xl ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>✕</button>
            </div>
            <p className={`text-sm ${subTextColor} mb-4`}>
              These students marked attendance from outside the classroom radius 
              (GPS verification was {attendanceSession?.geoFencingEnabled ? 'ON - they were blocked' : 'OFF - they were allowed'}):
            </p>
            <div className="space-y-3">
              {outsideAlerts.map((alert: any, i: number) => (
                <div key={i} className={`${isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'} border rounded-xl p-3`}>
                  <p className={`font-bold ${textColor}`}>{alert.studentName} ({alert.studentUSN})</p>
                  <p className="text-red-400 text-sm">📍 {alert.distance}m away (allowed: {alert.radius}m)</p>
                  <p className={`text-xs ${subTextColor}`}>⏰ {alert.time}</p>
                </div>
              ))}
            </div>
<Button onClick={() => {
  const csv = 'Student Name,USN,Distance,Allowed Radius,Time\n' +
    outsideAlerts.map((a: any) => `${a.studentName},${a.studentUSN},${a.distance}m,${a.radius}m,${a.time}`).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'outside_students.csv'; a.click();
            }} className="w-full mt-4 bg-red-500 hover:bg-red-600 text-white">
              📥 Download Report
            </Button>
          </Card>
        </motion.div>
      )}

      {view === 'help' && (
        <HelpContact onBack={() => setView('dashboard')} />
      )}

      {/* Teacher Edit Student Modal */}
      {showStudentEdit && editingStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className={`${cardBg} rounded-2xl p-6 w-full max-w-lg`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-xl font-bold ${textColor}`}>Edit Student Data</h3>
              <button onClick={() => { setShowStudentEdit(false); setEditingStudent(null); }}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-700'}`}>✕</button>
            </div>
            <div className="space-y-3">
              {['name','usn','rollNo','branch','semester','section','phone','batch'].map(field => (
                <div key={field}>
                  <label className={`text-sm font-medium ${textColor} capitalize mb-1 block`}>{field}</label>
                  {field === 'semester' ? (
                    <select value={studentEditForm[field] || ''} onChange={e => setStudentEditForm((p: any) => ({...p, [field]: e.target.value}))}
                      className={`${inputBg} w-full p-2.5 rounded-lg border`}>
                      {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s.toString()}>{s}</option>)}
                    </select>
                  ) : (
                    <Input value={studentEditForm[field] || ''} onChange={e => setStudentEditForm((p: any) => ({...p, [field]: e.target.value}))}
                      className={inputBg} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <Button onClick={async () => {
                if (!editingStudent?.id) return;
                setGlobalLoading(true);
                try {
                  // Update student in MongoDB
                  await updateUser(editingStudent.id, studentEditForm);
                  // Update local list
                  setAllStudentsData((prev: any[]) => prev.map((s: any) =>
                    s.id === editingStudent.id ? { ...s, ...studentEditForm } : s
                  ));
                  toast.success('✅ Student data updated everywhere!');
                  setShowStudentEdit(false);
                  setEditingStudent(null);
                } catch (err: any) {
                  logError('teacherEditStudent', err);
                  toast.error(err.message || 'Failed to update student');
                }
                setGlobalLoading(false);
              }} className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 py-3">
                <Save className="w-4 h-4 mr-2" /> Save
              </Button>
              <Button onClick={() => { setShowStudentEdit(false); setEditingStudent(null); }} variant="outline"
                className={`flex-1 ${isDarkMode ? 'border-white/20 text-white' : ''}`}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}