import React, { useState, useEffect } from 'react';
import { ref, set, get, update, onValue, remove, rtdb, db } from './firebaseCompat';
import { motion } from 'motion/react';
import { LogOut, Users, Download, Send, Moon, Sun, Search, Filter, BookOpen, BarChart3, Mail, ChevronDown, HelpCircle } from 'lucide-react';
import HelpContact from './Helpcontact';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { reportsAPI } from './api';



import * as XLSX from 'xlsx';

const API_SECRET = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_SECRET) || 'attendance-aura-secret-2026';

export default function ManagerDashboard() {
  const { currentUser, logout, createTeacherAccount, getAllUsers } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();

  // Error logger - writes to Firebase for debugging
  const logError = async (context: string, error: any) => {
    try {
      const logRef = ref(rtdb, `error_logs/${Date.now()}`);
      await set(logRef, {
        context,
        error: error?.message || String(error),
        portal: 'Manager',
        timestamp: new Date().toISOString(),
      });
    } catch {}
    console.error(`[Manager][${context}]`, error);
  };

  const [view, setView] = useState<'dashboard' | 'students' | 'reports' | 'send-report' | 'create-parent' | 'leave-inbox' | 'whatsapp' | 'help'>(() => {
    return (localStorage.getItem('manager_view') as any) || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('manager_view', view);
  }, [view]);
  const [leaveApplications, setLeaveApplications] = useState<any[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewingLeave, setReviewingLeave] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [allHistory, setAllHistory] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [reportPreview, setReportPreview] = useState<any[]>([]);
  const [newParentName, setNewParentName] = useState('');
  const [newParentEmail, setNewParentEmail] = useState('');
  const [newParentPhone, setNewParentPhone] = useState('');
  const [newParentPassword, setNewParentPassword] = useState('');
  const [newParentChildName, setNewParentChildName] = useState('');
  const [newParentChildUSN, setNewParentChildUSN] = useState('');
  const [creatingParent, setCreatingParent] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);

  const cardBg = isDarkMode ? 'bg-white/10 backdrop-blur-xl border-white/20' : 'bg-white border-gray-200';
  const textColor = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextColor = isDarkMode ? 'text-white/60' : 'text-gray-600';
  const inputBg = isDarkMode ? 'bg-white/10 border-white/20 text-white placeholder:text-white/50' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400';

  useEffect(() => { loadAllData(); }, []);

  const fetchLeaveApplications = async () => {
    setLoadingLeaves(true);
    try {
      const snap = await get(ref(db, 'leave_applications'));
      if (snap.exists()) {
        const all = Object.values(snap.val()) as any[];
        const filtered = all.filter((l: any) => 
          !currentUser?.department || 
          l.studentBranch === currentUser?.department ||
          l.studentBranch?.toLowerCase().includes(currentUser?.department?.toLowerCase() || '')
        );
        setLeaveApplications(filtered.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()));
      } else {
        setLeaveApplications([]);
      }
    } catch (err) {
      console.error(err);
    }
    setLoadingLeaves(false);
  };

  useEffect(() => {
    fetchLeaveApplications();
  }, [currentUser]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      // Load all users from backend API
      const allUsers = await getAllUsers();
      const studentsData = allUsers.filter(u => u.role === 'student');
      setStudents(studentsData);

      // Load all parents
      setParents(allUsers.filter(u => u.role === 'parent'));

      // Load attendance for all students
      const histories: any[] = [];
      for (const student of studentsData) {
        if (!student.usn) continue;
        const snap = await get(ref(rtdb, `student_attendance/${student.usn}`));
        if (snap.exists()) {
          const records = Object.values(snap.val()) as any[];
          histories.push({ usn: student.usn, name: student.name, branch: student.branch, batch: student.batch, semester: student.semester, records });
        }
      }
      setAllHistory(histories);
    } catch (err) { toast.error('Failed to load data'); }
    setLoading(false);
  };

  const uniqueBatches = Array.from(new Set(students.map(s => s.batch).filter(Boolean)));
  const uniqueBranches = Array.from(new Set(students.map(s => s.branch).filter(Boolean)));

  // Manager sees ONLY their department students
  const myDeptStudents = currentUser?.department
    ? students.filter(s => s.branch === currentUser.department)
    : students;

  const filteredStudents = myDeptStudents.filter(s => {
    const matchSearch = !searchQuery || s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.usn?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchBatch = !filterBatch || s.batch === filterBatch;
    const matchSem = !filterSemester || s.semester === filterSemester;
    return matchSearch && matchBatch && matchSem;
  });

  const getStudentStats = (usn: string) => {
    const studentHistory = allHistory.find(h => h.usn === usn);
    if (!studentHistory) return { total: 0, present: 0, percentage: 0 };
    const total = studentHistory.records.length;
    const present = studentHistory.records.filter((r: any) => r.status === 'PRESENT').length;
    return { total, present, percentage: total > 0 ? Math.round((present / total) * 100) : 0 };
  };

  const getSubjectWise = (usn: string) => {
    const studentHistory = allHistory.find(h => h.usn === usn);
    if (!studentHistory) return [];
    const subjectMap: any = {};
    studentHistory.records.forEach((r: any) => {
      if (!subjectMap[r.subject]) subjectMap[r.subject] = { total: 0, present: 0 };
      subjectMap[r.subject].total++;
      if (r.status === 'PRESENT') subjectMap[r.subject].present++;
    });
    return Object.entries(subjectMap).map(([subject, data]: any) => ({
      subject, total: data.total, present: data.present,
      percentage: Math.round((data.present / data.total) * 100)
    }));
  };

  // Generate report data for preview
  const generateReport = () => {
    const now = new Date();
    const cutoff = new Date();
    if (reportPeriod === 'weekly') cutoff.setDate(now.getDate() - 7);
    else cutoff.setMonth(now.getMonth() - 1);

    // Only include manager's department students
    const deptStudents = currentUser?.department ? students.filter(s => s.branch === currentUser.department) : students;
    const batchStudents = selectedBatch === 'all' ? deptStudents : deptStudents.filter(s => s.batch === selectedBatch);
    const preview = batchStudents.map(student => {
      const parentOfStudent = parents.find(p => p.childUSN === student.usn);
      const studentHistory = allHistory.find(h => h.usn === student.usn);
      const periodRecords = studentHistory?.records.filter((r: any) => new Date(r.date) >= cutoff) || [];
      const total = periodRecords.length;
      const present = periodRecords.filter((r: any) => r.status === 'PRESENT').length;
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
      return {
        name: student.name,
        usn: student.usn,
        branch: student.branch,
        batch: student.batch,
        parentEmail: parentOfStudent?.email || null,
        parentName: parentOfStudent?.name || 'No parent registered',
        total, present, absent: total - present, percentage,
        subjectWise: getSubjectWise(student.usn),
      };
    });
    setReportPreview(preview);
    setReportGenerated(true);
  };

  // Download all data as Excel
  const downloadAllExcel = () => {
    const rows = filteredStudents.map(student => {
      const stats = getStudentStats(student.usn);
      const subjectWise = getSubjectWise(student.usn);
      const subjectStr = subjectWise.map(s => `${s.subject}: ${s.percentage}%`).join(' | ');
      return {
        'Name': student.name,
        'USN': student.usn,
        'Branch': student.branch,
        'Semester': student.semester,
        'Batch': student.batch,
        'Total Classes': stats.total,
        'Present': stats.present,
        'Absent': stats.total - stats.present,
        'Attendance %': `${stats.percentage}%`,
        'Subject-wise': subjectStr,
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
    XLSX.writeFile(wb, `Attendance_Report_${new Date().toLocaleDateString()}.xlsx`);
    toast.success('Excel downloaded successfully!');
  };

  // Send email reports via backend
  const sendEmailReports = async () => {
    if (!reportGenerated || reportPreview.length === 0) { toast.error('❌ Please click Generate Report Preview first before sending!'); return; }
    const studentsWithParent = reportPreview.filter(s => s.parentEmail);
    if (studentsWithParent.length === 0) { toast.error('❌ No parents found with registered email! Ask admin to create parent accounts for these students.'); return; }
    setSendingReport(true);
    try {
      const emailData = studentsWithParent.map(s => ({
        to: s.parentEmail,
        parentName: s.parentName,
        studentName: s.name,
        usn: s.usn,
        period: reportPeriod,
        total: s.total,
        present: s.present,
        absent: s.absent,
        percentage: s.percentage,
        subjectWise: s.subjectWise,
      }));
      // Send reports
      toast.loading('📧 Sending reports...', { id: 'sending' });
      try {
        const data = await reportsAPI.sendReports(emailData);
        toast.dismiss('sending');
        if (data.success) {
          if (data.sent > 0) {
            toast.success(`✅ Reports sent to ${data.sent} parents successfully!`);
            if (data.failed > 0) toast.error(`⚠️ ${data.failed} emails failed to send. Please check credentials or network connection.`);
          } else {
            toast.error(`❌ Failed to send reports. All ${data.failed} emails failed. Please configure GMAIL_USER and GMAIL_APP_PASSWORD in your backend .env file.`);
          }
        } else {
          toast.error(`Failed: ${data.error || 'Unknown error'}`);
        }
      } catch (err: any) {
        toast.dismiss('sending');
        toast.error(`Error sending reports: ${err.message}`);
      }
    } catch (err: any) {
      logError('sendEmailReports', err);
      console.error('Send report error:', err);
      toast.error(`Error: ${err.message || 'Backend not available. Please try again.'}`);
    }
    setSendingReport(false);
  };

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${textColor}`}>Manager Dashboard</h1>
          <p className={subTextColor}>Welcome, {currentUser?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme}
            className={`p-2 rounded-xl border transition-all ${isDarkMode ? 'border-white/20 text-white bg-white/10 hover:bg-white/20' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-100'}`}>
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => setView('help')}
            className={`p-2 rounded-xl border transition-all ${isDarkMode ? 'border-white/20 text-white bg-white/10 hover:bg-white/20' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-100'}`}>
            <HelpCircle size={18} />
          </button>
          <button onClick={logout}
            className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${isDarkMode ? 'border-white/20 text-white bg-white/10 hover:bg-white/20' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-100'}`}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mb-8 flex-wrap">
        {[
          { id: 'dashboard', label: '🏠 Overview', },
          { id: 'students', label: '👥 Students', },
          { id: 'send-report', label: '📧 Send Reports', },
          { id: 'create-parent', label: '👨‍👩‍👧 Add Parent', },
          { id: 'leave-inbox', label: '📬 Leave Inbox', },
          { id: 'whatsapp', label: '📱 WhatsApp', },
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id as any)}
            className={`px-5 py-2.5 rounded-xl font-medium transition-all ${
              view === tab.id
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow'
                : isDarkMode ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>{tab.label}</button>
        ))}
      </div>

      {/* Overview */}
      {view === 'dashboard' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-500 to-cyan-500 border-0 p-6 text-white">
              <Users className="w-10 h-10 mb-3" />
              <p className="text-3xl font-bold">{myDeptStudents.length}</p>
              <p className="text-sm opacity-80">Total Students ({currentUser?.department || 'All'})</p>
            </Card>
            <Card className="bg-gradient-to-br from-purple-500 to-pink-500 border-0 p-6 text-white">
              <BookOpen className="w-10 h-10 mb-3" />
              <p className="text-3xl font-bold">{uniqueBatches.length}</p>
              <p className="text-sm opacity-80">Batches</p>
            </Card>
            <Card className="bg-gradient-to-br from-green-500 to-emerald-600 border-0 p-6 text-white">
              <BarChart3 className="w-10 h-10 mb-3" />
              <p className="text-3xl font-bold">
                {myDeptStudents.length > 0 ? Math.round(myDeptStudents.reduce((acc, s) => acc + getStudentStats(s.usn).percentage, 0) / myDeptStudents.length) : 0}%
              </p>
              <p className="text-sm opacity-80">Avg Attendance</p>
            </Card>
            <Card className="bg-gradient-to-br from-orange-500 to-red-500 border-0 p-6 text-white">
              <Mail className="w-10 h-10 mb-3" />
              <p className="text-3xl font-bold">{parents.length}</p>
              <p className="text-sm opacity-80">Parents Registered</p>
            </Card>
          </div>

          {/* Pending Leave Applications Notification for HOD */}
          {leaveApplications.filter(l => l.status === 'pending').length > 0 && (
            <Card className="bg-gradient-to-r from-amber-500 to-orange-600 border-0 p-6 text-white shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
                    📝
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">
                      {leaveApplications.filter(l => l.status === 'pending').length} Pending Leave Application(s) Awaiting Review
                    </h3>
                    <p className="text-sm opacity-90">
                      Students in your department have submitted absence requests requiring your approval.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setView('leave-inbox')}
                  className="bg-white text-orange-700 hover:bg-orange-50 font-bold px-6 py-3 rounded-xl shadow-lg transition-all whitespace-nowrap"
                >
                  Review In Inbox →
                </Button>
              </div>
            </Card>
          )}

          {/* Low attendance alert */}
          <Card className={`${cardBg} p-6`}>
            <h3 className={`text-lg font-bold ${textColor} mb-4`}>⚠️ Low Attendance Students (Below 75%)</h3>
            {myDeptStudents.filter(s => getStudentStats(s.usn).percentage < 75 && getStudentStats(s.usn).total > 0).length === 0 ? (
              <p className={`${subTextColor} text-center py-4`}>✅ All students have good attendance!</p>
            ) : (
              <div className="space-y-2">
                {myDeptStudents.filter(s => getStudentStats(s.usn).percentage < 75 && getStudentStats(s.usn).total > 0).slice(0, 10).map(student => {
                  const stats = getStudentStats(student.usn);
                  return (
                    <div key={student.id} className={`${isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'} border rounded-xl p-3 flex items-center justify-between`}>
                      <div>
                        <p className={`font-medium ${textColor}`}>{student.name}</p>
                        <p className={`text-sm ${subTextColor}`}>{student.usn} • {student.branch}</p>
                      </div>
                      <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">{stats.percentage}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* Students View */}
      {view === 'students' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-6`}>
            {/* Filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subTextColor}`} />
                <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search name/USN..." className={`${inputBg} pl-9`} />
              </div>

              <select value={filterBatch} onChange={e => setFilterBatch(e.target.value)} className={`${inputBg} p-2.5 rounded-lg border`}>
                <option value="">All Batches</option>
                {uniqueBatches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <Button onClick={downloadAllExcel} className="bg-gradient-to-r from-green-500 to-emerald-600">
                <Download size={16} className="mr-2" /> Download Excel
              </Button>
            </div>

            <p className={`text-sm ${subTextColor} mb-4`}>Showing {filteredStudents.length} students</p>

            <div className="space-y-3">
              {loading ? (
                <p className={`text-center py-8 ${subTextColor}`}>Loading...</p>
              ) : filteredStudents.map(student => {
                const stats = getStudentStats(student.usn);
                const subjectWise = getSubjectWise(student.usn);
                return (
                  <div key={student.id} className={`${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} border rounded-xl p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className={`font-bold ${textColor}`}>{student.name}</p>
                        <p className={`text-sm ${subTextColor}`}>{student.usn} • {student.branch} • Sem {student.semester} • {student.batch}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        stats.percentage >= 75 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>{stats.percentage}%</span>
                    </div>
                    <div className="flex gap-4 text-sm mb-2">
                      <span className="text-green-400">✓ {stats.present} Present</span>
                      <span className="text-red-400">✗ {stats.total - stats.present} Absent</span>
                      <span className={subTextColor}>Total: {stats.total}</span>
                    </div>
                    {subjectWise.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {subjectWise.map(s => (
                          <span key={s.subject} className={`text-xs px-2 py-1 rounded-full ${
                            s.percentage >= 75
                              ? isDarkMode ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-700'
                              : isDarkMode ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700'
                          }`}>{s.subject}: {s.percentage}%</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Send Reports */}
      {view === 'send-report' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-6 max-w-3xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-6`}>📧 Send Attendance Report to Parents</h2>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Report Period</Label>
                  <select value={reportPeriod} onChange={e => setReportPeriod(e.target.value as any)}
                    className={`${inputBg} w-full p-3 rounded-lg border`}>
                    <option value="weekly">Weekly Report (Last 7 days)</option>
                    <option value="monthly">Monthly Report (Last 30 days)</option>
                  </select>
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Send To (Batch)</Label>
                  <select value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)}
                    className={`${inputBg} w-full p-3 rounded-lg border`}>
                    <option value="all">All Batches</option>
                    {uniqueBatches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              <Button onClick={generateReport} className="w-full bg-gradient-to-r from-blue-500 to-purple-600 py-4">
                <BarChart3 className="w-5 h-5 mr-2" /> Generate Report Preview
              </Button>
            </div>

            {reportGenerated && reportPreview.length > 0 && (
              <>
                <div className={`${isDarkMode ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-4 mb-4`}>
                  <div className="flex justify-between items-center mb-3">
                    <p className={`font-bold ${textColor}`}>Report Preview ({reportPeriod})</p>
                    <span className={`text-sm ${subTextColor}`}>{reportPreview.filter(s => s.parentEmail).length} parents will receive email</span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {reportPreview.map((s, i) => (
                      <div key={i} className={`${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border rounded-xl p-3 flex items-center justify-between`}>
                        <div>
                          <p className={`font-medium text-sm ${textColor}`}>{s.name} ({s.usn})</p>
                          <p className={`text-xs ${subTextColor}`}>Parent: {s.parentName} {s.parentEmail ? `• ${s.parentEmail}` : '• ⚠️ No email'}</p>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm font-bold ${s.percentage >= 75 ? 'text-green-400' : 'text-red-400'}`}>{s.percentage}%</span>
                          <p className={`text-xs ${subTextColor}`}>{s.present}/{s.total}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button onClick={sendEmailReports} disabled={sendingReport}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 py-6 text-lg">
                  {sendingReport ? (
                    <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mr-2" />
                      Sending Reports...</>
                  ) : (
                    <><Send className="w-5 h-5 mr-2" />
                      Send {reportPeriod === 'weekly' ? 'Weekly' : 'Monthly'} Report to All Parents</>
                  )}
                </Button>
              </>
            )}
          </Card>
        </motion.div>
      )}

      {/* Create Parent View */}
      {view === 'create-parent' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-6 max-w-xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-6`}>Add Parent Account</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newParentName || !newParentEmail || !newParentPassword || !newParentChildUSN) {
                toast.error('All fields required'); return;
              }
              setCreatingParent(true);
              try {
                const success = await createTeacherAccount({
                  name: newParentName, email: newParentEmail, phone: newParentPhone,
                  password: newParentPassword, role: 'parent',
                  childName: newParentChildName, childUSN: newParentChildUSN.toUpperCase(),
                  department: '', designation: '',
                });
                if (success) {
                  toast.success('✅ Parent account created! They can now login.');
                  setNewParentName(''); setNewParentEmail(''); setNewParentPhone('');
                  setNewParentPassword(''); setNewParentChildName(''); setNewParentChildUSN('');
                  await loadAllData();
                } else {
                  toast.error('Failed to create parent account');
                }
              } catch (err: any) {
                toast.error(err.message || 'Failed to create parent');
              }
              setCreatingParent(false);
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Parent Name *</Label>
                  <Input value={newParentName} onChange={e => setNewParentName(e.target.value)} placeholder="Parent Name" className={inputBg} required />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Phone</Label>
                  <Input value={newParentPhone} onChange={e => setNewParentPhone(e.target.value)} placeholder="Phone" className={inputBg} />
                </div>
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Email *</Label>
                <Input type="email" value={newParentEmail} onChange={e => setNewParentEmail(e.target.value)} placeholder="parent@email.com" className={inputBg} required />
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Password *</Label>
                <Input type="password" value={newParentPassword} onChange={e => setNewParentPassword(e.target.value)} placeholder="Min 6 characters" className={inputBg} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Child Name</Label>
                  <Input value={newParentChildName} onChange={e => setNewParentChildName(e.target.value)} placeholder="Student name" className={inputBg} />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Child USN *</Label>
                  <Input value={newParentChildUSN} onChange={e => setNewParentChildUSN(e.target.value.toUpperCase())}
                    placeholder="2HB24CS001" className={inputBg} required maxLength={10} />
                </div>
              </div>
              <Button type="submit" disabled={creatingParent} className="w-full bg-gradient-to-r from-blue-500 to-purple-600 py-4">
                {creatingParent ? 'Creating...' : '+ Create Parent Account'}
              </Button>
            </form>
          </Card>
        </motion.div>
      )}

      {/* Leave Inbox */}
      {view === 'leave-inbox' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-6 max-w-4xl mx-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-2xl font-bold ${textColor}`}>📬 Leave Applications</h2>
              <Button onClick={async () => {
                if (loadingLeaves) return;
                setLoadingLeaves(true);
                try {
                  const snap = await get(ref(db, 'leave_applications'));
                  if (snap.exists()) {
                    const all = Object.values(snap.val()) as any[];
                    // Filter by manager's department/branch
                    const filtered = all.filter((l: any) => 
                      !currentUser?.department || 
                      l.studentBranch === currentUser?.department ||
                      l.studentBranch?.toLowerCase().includes(currentUser?.department?.toLowerCase() || '')
                    );
                    setLeaveApplications(filtered.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()));
                  } else {
                    setLeaveApplications([]);
                  }
                } catch (err) {
                  console.error(err);
                }
                setLoadingLeaves(false);
              }} disabled={loadingLeaves} className="bg-gradient-to-r from-blue-500 to-purple-600 text-sm px-4">
                🔄 Refresh
              </Button>
            </div>

            {loadingLeaves ? (
              <p className={`text-center py-8 ${subTextColor}`}>Loading...</p>
            ) : leaveApplications.length === 0 ? (
              <div className="text-center py-12">
                <p className={`${subTextColor} mb-3`}>No leave applications yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {leaveApplications.map(leave => (
                  <div key={leave.id} className={`${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} border rounded-xl p-5`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className={`font-bold text-lg ${textColor}`}>{leave.studentName} ({leave.studentUSN})</p>
                        <p className={`text-sm ${subTextColor}`}>{leave.studentBranch} • Sem {leave.studentSemester}</p>
                        <p className={`text-sm ${subTextColor} mt-1`}>📅 {leave.fromDate} → {leave.toDate}</p>
                        {leave.subject && <p className={`text-sm ${subTextColor}`}>📚 {leave.subject}</p>}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                        leave.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                        leave.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {leave.status === 'approved' ? '✅ Approved' : leave.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
                      </span>
                    </div>
                    <div className={`${isDarkMode ? 'bg-white/5' : 'bg-white'} rounded-xl p-3 mb-3`}>
                      <p className={`text-sm ${textColor} font-medium mb-1`}>Reason:</p>
                      <p className={`text-sm ${subTextColor}`}>{leave.reason}</p>
                    </div>
                    {leave.fileData && (
                      <a href={leave.fileData.data} download={leave.fileData.name}
                        className="text-blue-400 text-sm underline mb-3 block">
                        📎 Download: {leave.fileData.name}
                      </a>
                    )}
                    {leave.status === 'pending' && (
                      <div className="space-y-2">
                        <input type="text" placeholder="Add a note (optional)..."
                          className={`${inputBg} w-full p-2.5 rounded-xl border text-sm`}
                          onChange={e => setReviewNote(e.target.value)} />
                        <div className="flex gap-3">
                          <Button onClick={async () => {
                            // Approve
                            await update(ref(db, `leave_applications/${leave.id}`), {
                              status: 'approved',
                              reviewedAt: new Date().toISOString(),
                              reviewedBy: currentUser?.name,
                              reviewNote: reviewNote || 'Approved by HOD',
                            });
                            // Notify all teachers of same branch
                            await update(ref(db, `leave_notifications/${leave.id}`), {
                              ...leave, 
                              status: 'approved',
                              reviewNote: reviewNote || 'Approved by HOD',
                              forTeachers: true,
                              approvedBranch: leave.studentBranch,
                              approvedBy: currentUser?.name,
                              approvedAt: new Date().toISOString(),
                            });
                            toast.success('✅ Leave approved! All ' + leave.studentBranch + ' teachers notified.');
                            setLeaveApplications(prev => prev.map(l => l.id === leave.id ? {...l, status: 'approved'} : l));
                          }} className="flex-1 bg-green-500 hover:bg-green-600 text-white">
                            ✅ Approve
                          </Button>
                          <Button onClick={async () => {
                            await update(ref(db, `leave_applications/${leave.id}`), {
                              status: 'rejected',
                              reviewedAt: new Date().toISOString(),
                              reviewedBy: currentUser?.name,
                              reviewNote: reviewNote || 'Rejected by HOD',
                            });
                            toast.success('Leave rejected.');
                            setLeaveApplications(prev => prev.map(l => l.id === leave.id ? {...l, status: 'rejected'} : l));
                          }} className="flex-1 bg-red-500 hover:bg-red-600 text-white">
                            ❌ Reject
                          </Button>
                        </div>
                      </div>
                    )}
                    {leave.reviewNote && leave.status !== 'pending' && (
                      <p className={`text-xs mt-2 ${leave.status === 'approved' ? 'text-green-400' : 'text-red-400'}`}>
                        Note: {leave.reviewNote}
                      </p>
                    )}
                    {/* Clear from inbox */}
                    <div className="flex gap-2 mt-3">
                      <button onClick={async () => {
                        await remove(ref(db, `leave_applications/${leave.id}`));
                        setLeaveApplications(prev => prev.filter(l => l.id !== leave.id));
                        toast.success('Cleared and deleted from database');
                      }} className={`px-3 py-1.5 rounded-lg text-xs ${isDarkMode ? 'bg-white/10 text-white/60 hover:bg-white/20' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                        ✕ Clear
                      </button>
                      {/* Delete entirely - removes from student view too */}
                      <button onClick={async () => {
                        if (!window.confirm('Permanently delete this application? Student will also lose access to it.')) return;
                        await remove(ref(db, `leave_applications/${leave.id}`));
                        setLeaveApplications(prev => prev.filter(l => l.id !== leave.id));
                        toast.success('Application permanently deleted');
                      }} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* WhatsApp Bulk Message */}
      {view === 'whatsapp' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-6 max-w-2xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-2`}>📱 WhatsApp Bulk Message</h2>
            <p className={`${subTextColor} text-sm mb-6`}>Send attendance reports to parents via WhatsApp</p>
            <div className="space-y-4">
              <div className={`${isDarkMode ? 'bg-green-500/10 border-green-500/20' : 'bg-green-50 border-green-200'} border rounded-xl p-4`}>
                <p className={`font-bold ${textColor} mb-2`}>📋 Steps to send bulk WhatsApp:</p>
                <ol className={`text-sm ${subTextColor} space-y-2 list-decimal list-inside`}>
                  <li>Download parent contacts CSV below</li>
                  <li>Use college WhatsApp Business number</li>
                  <li>Upload CSV to <strong>Wati.io</strong> or <strong>AiSensy</strong> or <strong>Interakt</strong></li>
                  <li>Send template message to all parents at once</li>
                </ol>
              </div>
              <div className={`${isDarkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'} border rounded-xl p-4`}>
                <p className={`font-bold ${textColor} mb-1`}>📝 Suggested WhatsApp Template:</p>
                <p className={`text-sm ${subTextColor} font-mono`}>
                  "Dear {'{{parent_name}}'}, your ward {'{{student_name}}'} (USN: {'{{usn}}'}) attendance this week is {'{{percentage}}'}%. 
                  {'{{alert}}'} - Attendance Aura, AMBIT"
                </p>
              </div>
              <Button onClick={async () => {
                const data = await fetch('/api/users', {
                  headers: { Authorization: `Bearer ${localStorage.getItem('attendance_token')}` }
                }).then(r => r.json());
                const parents = (data.users || []).filter((u: any) => u.role === 'parent' && u.childUSN);
                const csvLines = ["Parent Name,Phone,Child Name,Child USN,Department"];
                csvLines.push(...parents.map((p: any) => `${p.name},${p.phone || ""},${p.childName || ""},${p.childUSN},${p.department || ""}`));
                const csv = csvLines.join("\n");
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'parent_contacts_whatsapp.csv'; a.click();
                toast.success('📥 Parent contacts downloaded for WhatsApp!');
              }} className="bg-green-500 hover:bg-green-600 text-white w-full py-4">
                📥 Download Parent Contacts for WhatsApp
              </Button>
              <div className="flex gap-3">
                <Button onClick={() => window.open('https://wati.io', '_blank')} 
                  className={`flex-1 ${isDarkMode ? 'bg-white/10' : 'bg-gray-100'} ${textColor}`}>
                  🔗 Wati.io
                </Button>
                <Button onClick={() => window.open('https://aisensy.com', '_blank')}
                  className={`flex-1 ${isDarkMode ? 'bg-white/10' : 'bg-gray-100'} ${textColor}`}>
                  🔗 AiSensy
                </Button>
                <Button onClick={() => window.open('https://interakt.ai', '_blank')}
                  className={`flex-1 ${isDarkMode ? 'bg-white/10' : 'bg-gray-100'} ${textColor}`}>
                  🔗 Interakt
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {view === 'help' && (
        <HelpContact onBack={() => setView('dashboard')} />
      )}
    </div>
  );
}
