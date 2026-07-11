import React, { useState, useEffect } from 'react';
import { ref, set, get, update, onValue, remove, rtdb, db } from './firebaseCompat';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, LogOut, Users, GraduationCap, UserPlus, Trash2, Edit, BookOpen, Moon, Sun, Search, ChevronLeft, ChevronRight, Save, X, HelpCircle, Mail } from 'lucide-react';
import HelpContact from './Helpcontact';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card } from './ui/card';



export default function AdminDashboard() {
  const { currentUser, logout, getAllUsers, createTeacherAccount, deleteUserCascade, deleteUser, deleteBatch, updateUser } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();

  // Error logger - writes to Firebase for debugging
  const logError = async (context: string, error: any) => {
    try {
      const logRef = ref(rtdb, `error_logs/${Date.now()}`);
      await set(logRef, {
        context,
        error: error?.message || String(error),
        portal: 'Admin',
        timestamp: new Date().toISOString(),
      });
    } catch {}
    console.error(`[Admin][${context}]`, error);
  };

  const [view, setView] = useState<'dashboard' | 'users' | 'create-teacher' | 'create-manager' | 'create-parent' | 'batch-management' | 'help'>(() => {
    return (localStorage.getItem('admin_view') as any) || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('admin_view', view);
  }, [view]);
  const [userGroupView, setUserGroupView] = useState<'teachers' | 'students' | 'parents' | 'managers'>('teachers');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editBatch, setEditBatch] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);


  // Teacher creation form
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherConfirmPassword, setTeacherConfirmPassword] = useState('');
  const [teacherDepartment, setTeacherDepartment] = useState('');
  const [teacherDesignation, setTeacherDesignation] = useState('');

  // Manager creation form
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [managerDepartment, setManagerDepartment] = useState('');
  const [managerDesignation, setManagerDesignation] = useState('');
  const [managerAlsoTeacher, setManagerAlsoTeacher] = useState(false);

  // Parent creation form
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentPassword, setParentPassword] = useState('');
  const [parentChildName, setParentChildName] = useState('');
  const [parentChildUSN, setParentChildUSN] = useState('');
  const [createdAccountEmail, setCreatedAccountEmail] = useState('');
  const [createdAccountType, setCreatedAccountType] = useState('');
  const [showCreatedSuccess, setShowCreatedSuccess] = useState(false);

  const refreshUsers = async () => {
    const users = await getAllUsers();
    setAllUsers(users);
  };

  useEffect(() => {
    refreshUsers();
    // Load available batches from Firebase
  }, []);

  const teachers = allUsers.filter((u) => u.role === 'teacher');
  const students = allUsers.filter((u) => u.role === 'student');
  const parents = allUsers.filter((u) => u.role === 'parent');
  const managers = allUsers.filter((u) => u.role === 'manager');
  const uniqueBatches = Array.from(new Set(students.map(s => s.batch).filter(Boolean))) as string[];

  const clearTeacherForm = () => {
    setTeacherName(''); setTeacherEmail(''); setTeacherPhone('');
    setTeacherPassword(''); setTeacherConfirmPassword('');
    setTeacherDepartment(''); setTeacherDesignation('');
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerName || !managerEmail || !managerPassword || !managerDepartment) { toast.error('❌ Please fill all required fields marked with *'); return; }
    const success = await createTeacherAccount({
      name: managerName, email: managerEmail, phone: managerPhone,
      password: managerPassword, role: 'manager',
      department: managerDepartment, designation: managerDesignation || 'HOD',
    });
    if (success) {
      // Also create teacher account if checked
      if (managerAlsoTeacher) {
        const teacherPassword = managerPassword + '_teacher';
        const teacherEmail = managerEmail.replace('@', '.hod@');
        await createTeacherAccount({
          name: managerName, email: teacherEmail, phone: managerPhone,
          password: teacherPassword, role: 'teacher',
          department: managerDepartment, designation: managerDesignation || 'HOD',
        });
        toast.success(`✅ Manager + Teacher accounts created! Teacher email: ${teacherEmail}, Password: ${teacherPassword}`);
      }
      setCreatedAccountEmail(managerEmail);
      setCreatedAccountType('Manager');
      setManagerName(''); setManagerEmail(''); setManagerPhone(''); setManagerPassword('');
      setManagerDepartment(''); setManagerDesignation(''); setManagerAlsoTeacher(false);
      await refreshUsers();
      setShowCreatedSuccess(true);
    }
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (teacherPassword !== teacherConfirmPassword) { toast.error('Passwords do not match'); return; }
    const success = await createTeacherAccount({
      name: teacherName, email: teacherEmail, phone: teacherPhone,
      password: teacherPassword, role: 'teacher', department: teacherDepartment, designation: teacherDesignation,
    });
    if (success) {
      setCreatedAccountEmail(teacherEmail);
      setCreatedAccountType('Teacher');
      clearTeacherForm();
      await refreshUsers();
      setShowCreatedSuccess(true);
    }
  };

  // Open edit modal with all user fields pre-filled
  const openEditModal = (user: any) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || '',
      phone: user.phone || '',
      email: user.email || '',
      department: user.department || '',
      designation: user.designation || '',
      usn: user.usn || '',
      branch: user.branch || '',
      semester: user.semester || '',
      section: user.section || '',
      batch: user.batch || '',
      childName: user.childName || '',
      childUSN: user.childUSN || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    // Remove empty fields
    const updates = Object.fromEntries(
      Object.entries(editForm).filter(([_, v]) => v !== '')
    );
    const success = await updateUser(editingUser.id, updates);
    if (success) {
      toast.success(`${editingUser.name}'s details updated successfully!`);
      setEditingUser(null);
      setEditForm({});
      await refreshUsers();
    } else {
      toast.error('❌ Failed to update! Check your internet connection and try again.');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string, role: string, usn?: string) => {
    const choice = window.confirm(
      `Delete ${userName}?\n\nOK = Delete Account + ALL Data (attendance records, history)\nCancel = Choose account-only delete`
    );
    
    if (choice) {
      // Delete account + all data
      setDeletingId(userId);
      const success = await deleteUserCascade(userId);
      setDeletingId(null);
      if (success) {
        toast.success(`${userName} and all their data deleted!`);
        await refreshUsers();
      } else {
        logError('deleteUser', new Error('Failed to delete user'));
        toast.error('❌ Failed to delete! Backend may be sleeping. Wait 30 seconds and try again.');
      }
    } else {
      // Ask for account-only delete
      const accountOnly = window.confirm(
        `Delete ONLY the account for ${userName}?\n\nAttendance records and data will be KEPT.\n\nOK = Delete account only\nCancel = Cancel`
      );
      if (accountOnly) {
        setDeletingId(userId);
        const success = await deleteUser(userId);
        setDeletingId(null);
        if (success) {
          toast.success(`${userName}'s account deleted. Data preserved.`);
          await refreshUsers();
        } else {
          toast.error('❌ Failed to delete account! Try again in 30 seconds.');
        }
      }
    }
  };

  const handleDeleteBatch = async (batch: string) => {
    const studentsInBatch = students.filter(s => s.batch === batch);
    const parentsInBatch = allUsers.filter(u => u.role === 'parent' && studentsInBatch.some(s => s.usn === u.childUSN));
    if (window.confirm(
      `⚠️ DELETE ENTIRE BATCH: ${batch}\n\n` +
      `This will permanently delete:\n` +
      `• ${studentsInBatch.length} student accounts\n` +
      `• ${parentsInBatch.length} parent accounts linked to these students\n` +
      `• ALL attendance records\n` +
      `• ALL Firebase Auth emails\n\n` +
      `This CANNOT be undone! Are you sure?`
    )) {
      toast.loading('Deleting batch... Please wait...', { id: 'batch-delete' });
      const success = await deleteBatch(batch);
      toast.dismiss('batch-delete');
      if (success) {
        toast.success(`✅ Batch ${batch} completely deleted! All accounts and data removed.`);
        await refreshUsers();
      } else {
        toast.error('❌ Batch delete failed! Backend may be sleeping. Wait 30 seconds and try again.');
      }
    }
  };

  const filteredUsers = () => {
    let users = userGroupView === 'teachers' ? teachers : userGroupView === 'students' ? students : userGroupView === 'parents' ? parents : managers;
    if (searchQuery.trim()) {
      users = users.filter(u =>
        u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.usn && u.usn.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    return users;
  };

  const paginatedUsers = () => {
    const filtered = filteredUsers();
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  };

  const totalPages = Math.ceil(filteredUsers().length / itemsPerPage);

  const cardBg = isDarkMode ? 'bg-white/10 backdrop-blur-xl border-white/20' : 'bg-white border-gray-200';
  const textColor = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextColor = isDarkMode ? 'text-white/60' : 'text-gray-600';
  const inputBg = isDarkMode ? 'bg-white/10 border-white/20 text-white placeholder:text-white/50' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400';

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {view !== 'dashboard' && (
            <Button variant="outline" onClick={() => setView('dashboard')}
              className={isDarkMode ? 'border-white/20 text-white hover:bg-white/10' : ''}>
              <ArrowLeft size={18} className="mr-2" /> Back
            </Button>
          )}
          <div>
            <h1 className={`text-2xl font-bold ${textColor}`}>Admin Dashboard</h1>
            <p className={subTextColor}>Welcome, {currentUser?.name}</p>
          </div>
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

      {/* Dashboard View */}
      {view === 'dashboard' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="bg-gradient-to-br from-blue-500 to-cyan-500 border-0 p-6 text-white">
              <GraduationCap className="w-12 h-12 mb-4" />
              <h3 className="text-xl font-bold">Teachers</h3>
              <p className="text-4xl font-bold mt-2">{teachers.length}</p>
            </Card>
            <Card className="bg-gradient-to-br from-purple-500 to-pink-500 border-0 p-6 text-white">
              <Users className="w-12 h-12 mb-4" />
              <h3 className="text-xl font-bold">Students</h3>
              <p className="text-4xl font-bold mt-2">{students.length}</p>
            </Card>
            <Card className="bg-gradient-to-br from-green-500 to-emerald-600 border-0 p-6 text-white">
              <Users className="w-12 h-12 mb-4" />
              <h3 className="text-xl font-bold">Parents</h3>
              <p className="text-4xl font-bold mt-2">{parents.length}</p>
            </Card>
            <Card className="bg-gradient-to-br from-orange-500 to-red-500 border-0 p-6 text-white">
              <BookOpen className="w-12 h-12 mb-4" />
              <h3 className="text-xl font-bold">Batches</h3>
              <p className="text-4xl font-bold mt-2">{uniqueBatches.length}</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card onClick={() => setView('users')}
              className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}>
              <Users className={`w-12 h-12 ${textColor} mb-4`} />
              <h3 className={`text-xl font-bold ${textColor}`}>Manage Users</h3>
              <p className={subTextColor}>View, edit, and delete users</p>
            </Card>
            <Card onClick={() => setView('create-teacher')}
              className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}>
              <UserPlus className={`w-12 h-12 ${textColor} mb-4`} />
              <h3 className={`text-xl font-bold ${textColor}`}>Create Teacher</h3>
              <p className={subTextColor}>Add a new teacher account</p>
            </Card>

            <Card onClick={() => setView('create-manager')}
              className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}>
              <UserPlus className={`w-12 h-12 ${textColor} mb-4`} />
              <h3 className={`text-xl font-bold ${textColor}`}>Create Manager</h3>
              <p className={subTextColor}>Add a manager account ({managers.length} managers)</p>
            </Card>
            <Card onClick={() => setView('batch-management')}
              className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}>
              <BookOpen className={`w-12 h-12 ${textColor} mb-4`} />
              <h3 className={`text-xl font-bold ${textColor}`}>Batch Management</h3>
              <p className={subTextColor}>Delete student batches ({uniqueBatches.length} batches)</p>
            </Card>
            <Card onClick={() => setView('create-parent')}
              className={`${cardBg} p-6 cursor-pointer hover:scale-105 transition-transform`}>
              <UserPlus className={`w-12 h-12 ${textColor} mb-4`} />
              <h3 className={`text-xl font-bold ${textColor}`}>Create Parent</h3>
              <p className={subTextColor}>Add a parent account ({parents.length} parents)</p>
            </Card>
          </div>
        </motion.div>
      )}

      {/* Manage Users */}
      {view === 'users' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-6`}>
            {/* Tab Switcher */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {(['teachers', 'students', 'parents', 'managers'] as const).map(tab => (
                <button key={tab} onClick={() => { setUserGroupView(tab); setCurrentPage(1); setSearchQuery(''); }}
                  className={`px-5 py-2 rounded-xl font-medium capitalize transition-all ${
                    userGroupView === tab
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow'
                      : isDarkMode ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {tab} ({tab === 'teachers' ? teachers.length : tab === 'students' ? students.length : tab === 'parents' ? parents.length : managers.length})
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subTextColor}`} />
              <Input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Search by name, email or USN..." className={`${inputBg} pl-9`} />
            </div>

            {/* Users List */}
            <div className="space-y-3">
              {paginatedUsers().length === 0 ? (
                <p className={`text-center py-8 ${subTextColor}`}>No {userGroupView} found</p>
              ) : (
                paginatedUsers().map((user) => (
                  <div key={user.id} className={`${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'} border rounded-xl p-4 flex items-center justify-between gap-4`}>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold ${textColor} truncate`}>{user.name}</p>
                      <p className={`text-sm ${subTextColor} truncate`}>{user.email}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {user.usn && <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>{user.usn}</span>}
                        {user.batch && <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>{user.batch}</span>}
                        {user.branch && <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-700'}`}>{user.branch}</span>}
                        {user.semester && <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>Sem {user.semester}</span>}
                        {user.section && <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-teal-500/20 text-teal-300' : 'bg-teal-100 text-teal-700'}`}>Sec {user.section}</span>}
                        {user.department && <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-pink-500/20 text-pink-300' : 'bg-pink-100 text-pink-700'}`}>{user.department}</span>}
                        {user.childUSN && <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-yellow-500/20 text-yellow-300' : 'bg-yellow-100 text-yellow-700'}`}>Child: {user.childUSN}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button onClick={() => openEditModal(user)} size="sm"
                        className="bg-blue-500 hover:bg-blue-600 text-white">
                        <Edit size={14} className="mr-1" /> Edit
                      </Button>
                      <Button onClick={() => handleDeleteUser(user.id, user.name, user.role)} size="sm"
                        disabled={deletingId === user.id}
                        className="bg-red-500 hover:bg-red-600 text-white">
                        {deletingId === user.id ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                        ) : (
                          <><Trash2 size={14} className="mr-1" /> Delete</>
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  variant="outline" className={isDarkMode ? 'border-white/20 text-white' : ''}>
                  <ChevronLeft size={16} />
                </Button>
                <span className={textColor}>Page {currentPage} of {totalPages}</span>
                <Button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  variant="outline" className={isDarkMode ? 'border-white/20 text-white' : ''}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </Card>

          {/* ✅ FULL EDIT MODAL */}
          <AnimatePresence>
            {editingUser && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                  className={`${cardBg} rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto`}>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className={`text-xl font-bold ${textColor}`}>Edit User</h3>
                      <p className={`text-sm ${subTextColor} capitalize`}>{editingUser.role} Account</p>
                    </div>
                    <button onClick={() => { setEditingUser(null); setEditForm({}); }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      <X size={16} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Common fields for all roles */}
                    <div>
                      <Label className={`${textColor} mb-1 block text-sm`}>Full Name</Label>
                      <Input value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={inputBg} placeholder="Full name" />
                    </div>
                    <div>
                      <Label className={`${textColor} mb-1 block text-sm`}>Phone</Label>
                      <Input value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className={inputBg} placeholder="Phone number" />
                    </div>

                    {/* Teacher fields */}
                    {editingUser.role === 'teacher' && (
                      <>
                        <div>
                          <Label className={`${textColor} mb-1 block text-sm`}>Department</Label>
                          <Input value={editForm.department || ''} onChange={e => setEditForm({ ...editForm, department: e.target.value })} className={inputBg} placeholder="Department" />
                        </div>
                        <div>
                          <Label className={`${textColor} mb-1 block text-sm`}>Designation</Label>
                          <Input value={editForm.designation || ''} onChange={e => setEditForm({ ...editForm, designation: e.target.value })} className={inputBg} placeholder="Designation" />
                        </div>
                      </>
                    )}

                    {/* Student fields */}
                    {editingUser.role === 'student' && (
                      <>
                        <div>
                          <Label className={`${textColor} mb-1 block text-sm`}>USN</Label>
                          <Input value={editForm.usn || ''} onChange={e => setEditForm({ ...editForm, usn: e.target.value })} className={inputBg} placeholder="USN" />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label className={`${textColor} mb-1 block text-sm`}>Branch</Label>
                            <Input value={editForm.branch || ''} onChange={e => setEditForm({ ...editForm, branch: e.target.value })} className={inputBg} placeholder="CSE" />
                          </div>
                          <div>
                            <Label className={`${textColor} mb-1 block text-sm`}>Semester</Label>
                            <Input value={editForm.semester || ''} onChange={e => setEditForm({ ...editForm, semester: e.target.value })} className={inputBg} placeholder="3" />
                          </div>
                          <div>
                            <Label className={`${textColor} mb-1 block text-sm`}>Section</Label>
                            <Input value={editForm.section || ''} onChange={e => setEditForm({ ...editForm, section: e.target.value })} className={inputBg} placeholder="A" />
                          </div>
                        </div>
                        <div>
                          <Label className={`${textColor} mb-1 block text-sm`}>Batch</Label>
                          <Input value={editForm.batch || ''} onChange={e => setEditForm({ ...editForm, batch: e.target.value })} className={inputBg} placeholder="2021-2025" />
                        </div>
                      </>
                    )}

                    {/* Parent fields */}
                    {editingUser.role === 'parent' && (
                      <>
                        <div>
                          <Label className={`${textColor} mb-1 block text-sm`}>Child Name</Label>
                          <Input value={editForm.childName || ''} onChange={e => setEditForm({ ...editForm, childName: e.target.value })} className={inputBg} placeholder="Child's name" />
                        </div>
                        <div>
                          <Label className={`${textColor} mb-1 block text-sm`}>Child USN</Label>
                          <Input value={editForm.childUSN || ''} onChange={e => setEditForm({ ...editForm, childUSN: e.target.value })} className={inputBg} placeholder="Child's USN" />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex gap-3 mt-6">
                    <Button onClick={handleSaveEdit} className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600">
                      <Save size={16} className="mr-2" /> Save Changes
                    </Button>
                    <Button onClick={() => { setEditingUser(null); setEditForm({}); }} variant="outline"
                      className={`flex-1 ${isDarkMode ? 'border-white/20 text-white' : ''}`}>
                      Cancel
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Create Teacher */}
      {view === 'create-teacher' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-2xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-6`}>Create Teacher Account</h2>
            <form onSubmit={handleCreateTeacher} className="space-y-4">
              <div>
                <Label className={`${textColor} mb-2 block`}>Full Name *</Label>
                <Input type="text" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="John Doe" className={inputBg} required />
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Email *</Label>
                <Input type="email" value={teacherEmail} onChange={(e) => setTeacherEmail(e.target.value)} placeholder="teacher@example.com" className={inputBg} required />
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Phone *</Label>
                <Input type="tel" value={teacherPhone} onChange={(e) => setTeacherPhone(e.target.value)} placeholder="1234567890" className={inputBg} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Department *</Label>
                  <select value={teacherDepartment} onChange={(e) => setTeacherDepartment(e.target.value)} className={`${inputBg} w-full p-2.5 rounded-lg border`}>
                    <option value="">Select Department</option>
                    <option value="CSE">CSE</option>
                    <option value="ECE">ECE</option>
                    <option value="AIML">AIML</option>
                    <option value="ISE">ISE</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Physics">Physics</option>
                    <option value="Chemistry">Chemistry</option>
                    <option value="MBA">MBA</option>
                  </select>
                  <Input type="text" value={teacherDepartment} onChange={(e) => setTeacherDepartment(e.target.value)} className={`${inputBg} mt-1`} placeholder="Or type custom department" autoComplete="off" />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Designation *</Label>
                  <select value={teacherDesignation} onChange={(e) => setTeacherDesignation(e.target.value)} className={`${inputBg} w-full p-2.5 rounded-lg border`}>
                    <option value="">Select Designation</option>
                    <option value="Professor">Professor</option>
                    <option value="Associate Professor">Associate Professor</option>
                    <option value="Assistant Professor">Assistant Professor</option>
                    <option value="Lecturer">Lecturer</option>
                    <option value="HOD">HOD</option>
                  </select>
                  <Input type="text" value={teacherDesignation} onChange={(e) => setTeacherDesignation(e.target.value)} className={`${inputBg} mt-1`} placeholder="Or type custom designation" autoComplete="off" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Password *</Label>
                  <Input type="password" value={teacherPassword} onChange={(e) => setTeacherPassword(e.target.value)} placeholder="Min 6 characters" className={inputBg} required />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Confirm Password *</Label>
                  <Input type="password" value={teacherConfirmPassword} onChange={(e) => setTeacherConfirmPassword(e.target.value)} placeholder="Confirm password" className={inputBg} required />
                </div>
              </div>
              <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-purple-600 py-6">
                <UserPlus className="w-5 h-5 mr-2" /> Create Teacher Account
              </Button>
            </form>
          </Card>
        </motion.div>
      )}

      {/* Batch Management */}
      {/* Create Manager */}
      {view === 'create-manager' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-6`}>Create Manager / HOD Account</h2>
            <form onSubmit={handleCreateManager} className="space-y-4">
              <div>
                <Label className={`${textColor} mb-2 block`}>Full Name *</Label>
                <Input value={managerName} onChange={e => setManagerName(e.target.value)} placeholder="HOD Full Name" className={inputBg} required />
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Email *</Label>
                <Input type="email" value={managerEmail} onChange={e => setManagerEmail(e.target.value)} placeholder="hod@college.com" className={inputBg} required />
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Phone</Label>
                <Input value={managerPhone} onChange={e => setManagerPhone(e.target.value)} placeholder="Phone number" className={inputBg} />
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Department *</Label>
                <select value={managerDepartment} onChange={e => setManagerDepartment(e.target.value)} className={`${inputBg} w-full p-2.5 rounded-lg border`} required>
                  <option value="">Select Department</option>
                  <option value="CSE">CSE</option>
                  <option value="ECE">ECE</option>
                  <option value="ISE">ISE</option>
                  <option value="AIML">AIML</option>
                  <option value="Maths">Maths</option>
                  <option value="Physics">Physics</option>
                  <option value="Chemistry">Chemistry</option>
                  <option value="MBA">MBA</option>
                </select>
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Designation</Label>
                <select value={managerDesignation} onChange={e => setManagerDesignation(e.target.value)} className={`${inputBg} w-full p-2.5 rounded-lg border`}>
                  <option value="HOD">HOD</option>
                  <option value="Professor">Professor</option>
                  <option value="Associate Professor">Associate Professor</option>
                  <option value="Assistant Professor">Assistant Professor</option>
                </select>
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Password *</Label>
                <Input type="password" value={managerPassword} onChange={e => setManagerPassword(e.target.value)} placeholder="Password" className={inputBg} required />
              </div>
              <div className={`flex items-center gap-3 p-3 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-blue-50'}`}>
                <input type="checkbox" id="alsoTeacher" checked={managerAlsoTeacher}
                  onChange={e => setManagerAlsoTeacher(e.target.checked)} className="w-4 h-4" />
                <label htmlFor="alsoTeacher" className={`text-sm ${textColor}`}>
                  Also create a Teacher account for this HOD (to take attendance)
                </label>
              </div>
              <div className="flex gap-4 pt-2">
                <Button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 py-4">
                  <UserPlus className="w-5 h-5 mr-2" /> Create Manager / HOD
                </Button>
                <button type="button" onClick={() => setView('dashboard')}
                  className={`px-6 rounded-xl border ${isDarkMode ? 'border-white/20 text-white bg-white/10' : 'border-gray-300 text-gray-700'}`}>Cancel</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {/* Create Parent */}
      {view === 'create-parent' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-6`}>Create Parent Account</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!parentName || !parentEmail || !parentPassword || !parentChildUSN) { toast.error('❌ Please fill all required fields marked with *'); return; }
              const success = await createTeacherAccount({
                name: parentName, email: parentEmail, phone: parentPhone,
                password: parentPassword, role: 'parent',
                childName: parentChildName, childUSN: parentChildUSN.toUpperCase(),
                department: '', designation: '',
              });
              if (success) {
                setCreatedAccountEmail(parentEmail);
                setCreatedAccountType('Parent');
                setParentName(''); setParentEmail(''); setParentPhone('');
                setParentPassword(''); setParentChildName(''); setParentChildUSN('');
                await refreshUsers();
                setShowCreatedSuccess(true);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Parent Name *</Label>
                  <Input value={parentName} onChange={e => setParentName(e.target.value)} placeholder="Parent Name" className={inputBg} required />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Phone</Label>
                  <Input value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="Phone" className={inputBg} />
                </div>
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Email *</Label>
                <Input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="parent@email.com" className={inputBg} required />
              </div>
              <div>
                <Label className={`${textColor} mb-2 block`}>Password *</Label>
                <Input type="password" value={parentPassword} onChange={e => setParentPassword(e.target.value)} placeholder="Min 6 characters" className={inputBg} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className={`${textColor} mb-2 block`}>Child Name</Label>
                  <Input value={parentChildName} onChange={e => setParentChildName(e.target.value)} placeholder="Student name" className={inputBg} />
                </div>
                <div>
                  <Label className={`${textColor} mb-2 block`}>Child USN *</Label>
                  <Input value={parentChildUSN} onChange={e => setParentChildUSN(e.target.value.toUpperCase())} placeholder="e.g. 2HB24CS001" className={inputBg} required maxLength={10} />
                </div>
              </div>
              <div className="flex gap-4 pt-2">
                <Button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 py-4">
                  <UserPlus className="w-5 h-5 mr-2" /> Create Parent Account
                </Button>
                <Button type="button" variant="outline" onClick={() => setView('dashboard')}
                  className={`px-6 ${isDarkMode ? 'border-white/20 text-white hover:bg-white/10' : ''}`}>Cancel</Button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {/* Batch Management - Delete Only */}
      {view === 'batch-management' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`${cardBg} p-8 max-w-3xl mx-auto`}>
            <h2 className={`text-2xl font-bold ${textColor} mb-2`}>Batch Management</h2>
            <p className={`${subTextColor} text-sm mb-6`}>Delete entire student batches. This will delete all students in that batch.</p>

            {uniqueBatches.length === 0 ? (
              <p className={`text-center py-8 ${subTextColor}`}>No student batches found</p>
            ) : (
              <div className="space-y-4">
                {uniqueBatches.map(batch => {
                  const batchStudents = students.filter(s => s.batch === batch);
                  return (
                    <div key={batch} className={`${isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'} border rounded-xl p-5 flex items-center justify-between`}>
                      <div>
                        <p className={`font-bold text-lg ${textColor}`}>{batch}</p>
                        <p className="text-red-400 text-sm">{batchStudents.length} students will be deleted</p>
                      </div>
                      <Button onClick={() => handleDeleteBatch(batch)}
                        className="bg-red-500 hover:bg-red-600 text-white">
                        <Trash2 size={16} className="mr-2" /> Delete Batch
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {view === 'help' && (
        <HelpContact onBack={() => setView('dashboard')} />
      )}
      {/* Account Created Success Modal */}
      {showCreatedSuccess && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className={`${cardBg} rounded-2xl p-8 w-full max-w-md text-center`}>
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-10 h-10 text-white" />
            </div>
            <h3 className={`text-xl font-bold ${textColor} mb-2`}>{createdAccountType} Account Created! ✅</h3>
            <p className={`${subTextColor} text-sm mb-4`}>Account has been created for:</p>
            <p className="text-blue-400 font-bold mb-6 break-all">{createdAccountEmail}</p>
            {createdAccountType === 'Teacher' && (
              <div className={`${isDarkMode ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'} border rounded-xl p-4 mb-6 text-left`}>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-yellow-300' : 'text-yellow-700'} mb-2`}>📧 Email Verification Required</p>
                <p className={`text-xs ${isDarkMode ? 'text-yellow-200/70' : 'text-yellow-600'}`}>
                  The teacher must verify their email before logging in. A verification link has been sent to their email address.
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${isDarkMode ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>📁 Check Spam</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${isDarkMode ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>📁 Promotions</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${isDarkMode ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>📁 Junk</span>
                </div>
                <p className={`text-xs mt-2 font-semibold ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>
                  ⚠️ Teacher cannot login until email is verified!
                </p>
              </div>
            )}
            {createdAccountType === 'Manager' && (
              <div className={`${isDarkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'} border rounded-xl p-4 mb-6 text-left`}>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-700'} mb-2`}>✅ No Email Verification Needed</p>
                <p className={`text-xs ${isDarkMode ? 'text-blue-200/70' : 'text-blue-600'}`}>
                  Manager can log in immediately using their email and password. Select "Manager" role on the login screen.
                </p>
              </div>
            )}
            <Button onClick={() => { setShowCreatedSuccess(false); setView('dashboard'); }}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 py-4">
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
