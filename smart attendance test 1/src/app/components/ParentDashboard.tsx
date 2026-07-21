import React, { useState, useEffect } from 'react';
import { ref, set, get, update, onValue, remove, rtdb, db } from './firebaseCompat';
import { motion } from 'motion/react';
import { ArrowLeft, LogOut, Calendar, CheckCircle2, XCircle, Moon, Sun, BookOpen, BarChart3 } from 'lucide-react';
import { useAuth } from './AuthContext';
import { attendanceAPI } from './api';


import { useTheme } from './ThemeContext';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card } from './ui/card';

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

export default function ParentDashboard() {
  const { currentUser, logout, getStudentByUSN } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();

  // Error logger - writes to Firebase for debugging
  const logError = async (context: string, error: any) => {
    try {
      const logRef = ref(rtdb, `error_logs/${Date.now()}`);
      await set(logRef, {
        context,
        error: error?.message || String(error),
        portal: 'Parent',
        timestamp: new Date().toISOString(),
      });
    } catch {}
    console.error(`[Parent][${context}]`, error);
  };

  const [view, setView] = useState<'dashboard' | 'view-data' | 'subject-wise'>(() => {
    return (localStorage.getItem('parent_view') as any) || 'view-data';
  });

  useEffect(() => {
    localStorage.setItem('parent_view', view);
  }, [view]);
  
  const [studentData, setStudentData] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<AttendanceRecord[]>([]);
  const [parentSemFilter, setParentSemFilter] = useState<string>('');
  const [totalClasses, setTotalClasses] = useState(0);
  const [attendedClasses, setAttendedClasses] = useState(0);
  const [attendancePercentage, setAttendancePercentage] = useState(0);
  const [subjectStats, setSubjectStats] = useState<SubjectStats[]>([]);

  // Automatically sync parentSemFilter with studentData's enrolled semester (only if not manually set)
  useEffect(() => {
    if (studentData?.semester && !parentSemFilter) {
      setParentSemFilter(String(studentData.semester));
    }
  }, [studentData?.semester]);

  // Automatically load linked child's data and set up real-time attendance listener
  useEffect(() => {
    let unsubscribe: any = null;

    const init = async () => {
      if (currentUser?.childUSN) {
        try {
          // Search for student by USN using AuthContext
          const student = await getStudentByUSN(currentUser.childUSN);

          if (!student) {
            toast.error('Linked student not found');
            return;
          }

          setStudentData(student);

          // Load attendance data in real-time with error handling
          const studentUsn = (student as any).usn || '';

          const getRecordKey = (item: any) => item.sessionId || item.id || `${item.date}_${item.subject}`;

          // Returns ONLY explicitly stored semester — no fallback guess
          const getExplicitSem = (r: any): string => {
            if (r.semester && String(r.semester).trim()) return String(r.semester).trim();
            if (r.classSemester && String(r.classSemester).trim()) return String(r.classSemester).trim();
            if (r.className) {
              const semMatch = String(r.className).match(/(?:sem|semester|class|sec)\s*(\d+)/i);
              if (semMatch && semMatch[1]) return semMatch[1];
            }
            return '';
          };

          const getRecordSem = (r: any): string => {
            const explicit = getExplicitSem(r);
            if (explicit) return explicit;
            return String((student as any)?.semester || '').trim();
          };

          // 1. Try fetching official backend history with semester metadata
          try {
            const backendRes = await attendanceAPI.getStudentHistory(studentUsn);
            if (backendRes.success && Array.isArray(backendRes.history) && backendRes.history.length > 0) {
              const tagged = backendRes.history.map((r: any) => ({
                ...r,
                semester: getRecordSem(r),
              }));
              setAttendanceHistory(prev => {
                const map = new Map<string, any>();
                tagged.forEach((item: any) => map.set(getRecordKey(item), item));
                prev.forEach((item: any) => {
                  const existing = map.get(getRecordKey(item));
                  map.set(getRecordKey(item), {
                    ...existing,
                    ...item,
                    semester: existing?.semester || item.semester,
                  });
                });
                return Array.from(map.values());
              });
            }
          } catch (e) {
            console.log('[ParentDashboard] Backend fetch fallback to RTDB');
          }

          // 2. Real-time fallback from RTDB
          const studentRef = ref(rtdb, `student_attendance/${studentUsn}`);
          unsubscribe = onValue(studentRef, (snapshot: any) => {
            try {
              if (snapshot.exists()) {
                const rawRecords: any[] = Object.values(snapshot.val());
                setAttendanceHistory(prev => {
                  const map = new Map<string, any>();
                  prev.forEach((item: any) => map.set(getRecordKey(item), item));
                  rawRecords.forEach((r: any) => {
                    const key = getRecordKey(r);
                    const prevItem = map.get(key);
                    const explicitSem = getExplicitSem(r);
                    const effectiveSem = explicitSem
                      || prevItem?.semester
                      || String((student as any)?.semester || '').trim();
                    map.set(key, { ...prevItem, ...r, semester: effectiveSem });
                  });
                  return Array.from(map.values());
                });
              }
            } catch (err) {
              console.error('[ParentDashboard] Error processing attendance history:', err);
            }
          }, (err: Error) => {
            console.error('[ParentDashboard] Real-time listener error:', err);
          });
        } catch (error) {
          logError('parentPortal', error);
          toast.error('Failed to load student data');
        }
      }
    };

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser]);

  // Dynamically calculate stats based on selected parentSemFilter (defaulting to child's semester)
  useEffect(() => {
    const effectiveSem = parentSemFilter || String(studentData?.semester || '');
    const semNorm = normalizeSem(effectiveSem);
    const filtered = (semNorm && effectiveSem !== 'ALL')
      ? attendanceHistory.filter((h: any) => {
          const recSem = normalizeSem(h.semester);
          return recSem === semNorm;
        })
      : attendanceHistory;

    setFilteredHistory(filtered);
    setTotalClasses(filtered.length);
    const attended = filtered.filter(h => h.status === 'PRESENT').length;
    setAttendedClasses(attended);
    setAttendancePercentage(filtered.length > 0 ? Math.round((attended / filtered.length) * 100 * 10) / 10 : 0);

    const subjectMap = new Map<string, { total: number; attended: number }>();
    filtered.forEach(record => {
      if (!record.subject) return;
      const existing = subjectMap.get(record.subject) || { total: 0, attended: 0 };
      existing.total++;
      if (record.status === 'PRESENT') existing.attended++;
      subjectMap.set(record.subject, existing);
    });

    const stats: SubjectStats[] = Array.from(subjectMap.entries()).map(([subject, data]) => ({
      subject,
      total: data.total,
      attended: data.attended,
      percentage: Math.round((data.attended / data.total) * 100 * 10) / 10,
    }));
    setSubjectStats(stats);
  }, [attendanceHistory, parentSemFilter, studentData?.semester]);

  const cardBg = isDarkMode ? 'bg-white/10 backdrop-blur-xl border-white/20' : 'bg-white border-gray-200';
  const textColor = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextColor = isDarkMode ? 'text-white/60' : 'text-gray-600';

  const ViewDataView = () => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {studentData && (
        <Card className={`${cardBg} p-6`}>
          <h3 className={`text-xl font-bold ${textColor}`}>Student Information</h3>
          <div className="mt-4 space-y-2">
            <p className={textColor}><strong>Name:</strong> {studentData.name}</p>
            <p className={textColor}><strong>USN:</strong> {studentData.usn}</p>
            <p className={textColor}><strong>Branch:</strong> {studentData.branch}</p>
            <p className={textColor}><strong>Semester:</strong> {studentData.semester}</p>
            <p className={textColor}><strong>Section:</strong> {studentData.section}</p>
            {studentData.batch && <p className={textColor}><strong>Batch:</strong> {studentData.batch}</p>}
          </div>
        </Card>
      )}

      {/* Semester Filter Bar for Parents */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${cardBg}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-lg">
            🎓
          </div>
          <div>
            <h4 className={`text-sm font-bold ${textColor}`}>
              Semester Filter: {parentSemFilter && parentSemFilter !== 'ALL' ? `Sem ${parentSemFilter}` : 'All Semesters'}
            </h4>
            <p className={`text-xs ${subTextColor}`}>
              Defaulting to child's enrolled semester ({studentData?.semester || 'N/A'}). Select any semester to inspect.
            </p>
          </div>
        </div>
        <select
          value={parentSemFilter}
          onChange={e => setParentSemFilter(e.target.value)}
          className={`px-4 py-2 rounded-xl text-sm font-bold border outline-none cursor-pointer ${
            isDarkMode ? 'bg-white/10 border-white/20 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
          }`}
        >
          <option value="ALL">🌐 All Semesters</option>
          {['1', '2', '3', '4', '5', '6', '7', '8'].map(sem => (
            <option key={sem} value={sem}>
              Sem {sem} {normalizeSem(studentData?.semester) === sem ? '⭐ (Current Enrolled)' : ''}
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

      <Card
        onClick={() => setView('subject-wise')}
        className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}
      >
        <BookOpen className={`w-12 h-12 ${textColor} mb-4`} />
        <h3 className={`text-xl font-bold ${textColor}`}>Subject-wise Attendance</h3>
        <p className={subTextColor}>View attendance by subject</p>
      </Card>

      <Card className={`${cardBg} p-8`}>
        <h2 className={`text-2xl font-bold ${textColor} mb-6`}>
          Attendance History ({filteredHistory.length} records)
        </h2>

        {filteredHistory.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className={`w-16 h-16 ${subTextColor} mx-auto mb-4`} />
            <p className={subTextColor}>No attendance records for selected semester</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {[...filteredHistory].reverse().map((record, index) => (
              <Card key={index} className={`${isDarkMode ? 'bg-white/5' : 'bg-gray-50'} p-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className={`font-bold ${textColor}`}>{record.subject}</h3>
                    <p className={`${subTextColor} text-sm`}>{record.className}</p>
                    <p className={`${subTextColor} text-xs mt-1`}>
                      📅 {record.date} • Sem {record.semester || studentData?.semester || 'N/A'}
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
  );

  const SubjectWiseView = () => (
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
  );

  return (
    <div className="min-h-screen p-6">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {view === 'subject-wise' && (
            <Button
              onClick={() => setView('view-data')}
              variant="ghost"
              className={isDarkMode ? 'text-white hover:bg-white/10' : 'text-gray-900 hover:bg-gray-100'}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className={`text-3xl font-bold ${textColor}`}>Parent Portal</h1>
            <p className={subTextColor}>Welcome, {currentUser?.name}</p>
            <p className={`${subTextColor} text-sm`}>Read-only access to {studentData?.name || 'student'} data</p>
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

      {view === 'view-data' && <ViewDataView />}
      {view === 'subject-wise' && <SubjectWiseView />}
    </div>
  );
}