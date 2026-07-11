import React, { useState } from 'react';
import { AuthProvider, useAuth } from './components/AuthContext';
import { ThemeProvider, useTheme } from './components/ThemeContext';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import StudentDashboard from './components/StudentDashboard';
import ParentDashboard from './components/ParentDashboard';
import ManagerDashboard from './components/ManagerDashboard';
import { Toaster } from 'sonner';

function AppContent() {
  const { currentUser } = useAuth();
  const { isDarkMode } = useTheme();
  const [managerMode, setManagerMode] = useState<'manager' | 'teacher'>(() => {
    const stored = localStorage.getItem('manager_mode');
    return (stored === 'teacher' || stored === 'manager') ? stored : 'manager';
  });

  if (!currentUser) {
    return <Login />;
  }

  switch (currentUser.role) {
    case 'admin':
      return <AdminDashboard />;
    case 'teacher':
      return <TeacherDashboard />;
    case 'student':
      return <StudentDashboard />;
    case 'parent':
      return <ParentDashboard />;
    case 'manager':
      return (
        <div>
          {/* Mode switcher for manager */}
          <div className={`flex justify-center gap-3 pt-4 px-6 ${isDarkMode ? 'bg-transparent' : 'bg-transparent'}`}>
            <button
              onClick={() => { setManagerMode('manager'); localStorage.setItem('manager_mode', 'manager'); }}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                managerMode === 'manager'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow'
                  : isDarkMode ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🏢 Manager Mode
            </button>
            <button
              onClick={() => { setManagerMode('teacher'); localStorage.setItem('manager_mode', 'teacher'); }}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                managerMode === 'teacher'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow'
                  : isDarkMode ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🎓 Teacher Mode
            </button>
          </div>
          {managerMode === 'manager' ? <ManagerDashboard /> : <TeacherDashboard />}
        </div>
      );
    default:
      return <Login />;
  }
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppWrapper />
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppWrapper() {
  const { isDarkMode } = useTheme();
  
  return (
    <div 
      className={`min-h-screen transition-colors duration-300 ${
        isDarkMode 
          ? 'bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a]' 
          : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50'
      }`} 
      style={{ fontFamily: 'Poppins, sans-serif' }}
    >
      <AppContent />
      <Toaster position="top-right" richColors theme={isDarkMode ? 'dark' : 'light'} />
    </div>
  );
}
