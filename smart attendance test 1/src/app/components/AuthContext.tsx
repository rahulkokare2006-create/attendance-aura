import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { authAPI, usersAPI, API_URL } from './api';

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent' | 'manager';

export interface User {
  id: string;
  _id?: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  department?: string | null;
  designation?: string | null;
  rollNo?: string | null;
  usn?: string | null;
  branch?: string | null;
  semester?: string | null;
  section?: string | null;
  batch?: string | null;
  childName?: string | null;
  childUSN?: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
}

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string, role: UserRole) => Promise<any>;
  logout: () => void;
  signup: (userData: any) => Promise<boolean>;
  isAdminExists: () => Promise<boolean>;
  getAllUsers: () => Promise<User[]>;
  createTeacherAccount: (teacherData: any) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<boolean>;
  deleteUserCascade: (userId: string) => Promise<boolean>;
  deleteBatch: (batch: string) => Promise<boolean>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<boolean>;
  getStudentByUSN: (usn: string) => Promise<User | null>;
  forgotPassword: (email: string) => Promise<boolean>;
  resendVerificationEmail: (email?: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const normalizeUser = (u: any): User => ({
  ...u,
  id: u._id || u.id,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Setup error logger
  useEffect(() => {
    (window as any).__logError = (context: string, error: any, portal: string = 'App') => {
      console.error(`[${portal}][${context}]`, error);
    };
    console.log('[System][AppStarted] App loaded successfully');
  }, []);

  // Restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem('attendance_token');
    const savedUser = localStorage.getItem('attendance_user');
    if (token && savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
        // Verify token still valid
        authAPI.me()
          .then((data: any) => {
            const u = normalizeUser(data.user);
            setCurrentUser(u);
            localStorage.setItem('attendance_user', JSON.stringify(u));
          })
          .catch((err: any) => {
            if (err?.status === 401) {
              localStorage.removeItem('attendance_token');
              localStorage.removeItem('attendance_user');
              setCurrentUser(null);
            }
          });
      } catch {
        localStorage.removeItem('attendance_token');
        localStorage.removeItem('attendance_user');
      }
    }
  }, []);

  const login = async (email: string, password: string, role: UserRole): Promise<any> => {
    try {
      const data = await authAPI.login(email, password, role);
      localStorage.setItem('attendance_token', data.token);
      const u = normalizeUser(data.user);
      localStorage.setItem('attendance_user', JSON.stringify(u));
      setCurrentUser(u);
      return true;
    } catch (error: any) {
      if (error.message?.includes('EMAIL_NOT_VERIFIED')) return 'unverified';
      toast.error(error.message || '❌ Login failed');
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('attendance_token');
    localStorage.removeItem('attendance_user');
    localStorage.removeItem('admin_view');
    localStorage.removeItem('teacher_view');
    localStorage.removeItem('student_view');
    localStorage.removeItem('parent_view');
    localStorage.removeItem('manager_view');
    localStorage.removeItem('manager_mode');
    localStorage.removeItem('teacher_selected_class');
    localStorage.removeItem('teacher_attendance_session');
    localStorage.removeItem('teacher_otp');
    localStorage.removeItem('teacher_qrcode');
    setCurrentUser(null);
  };

  const signup = async (userData: any): Promise<boolean> => {
    try {
      const data = await authAPI.register(userData);
      const needsVerify = ['student', 'teacher'].includes(userData.role);
      toast.success(needsVerify
        ? 'Account created! Please check your email to verify.'
        : 'Account created successfully!');
      return true;
    } catch (error: any) {
      toast.error(error.message || '❌ Signup failed');
      return false;
    }
  };

  const isAdminExists = async (): Promise<boolean> => {
    try {
      const data = await authAPI.adminExists();
      return data.exists;
    } catch { return false; }
  };

  const createTeacherAccount = async (teacherData: any): Promise<boolean> => {
    try {
      await usersAPI.create(teacherData);
      toast.success(`${teacherData.role || 'Teacher'} account created successfully!`);
      return true;
    } catch (error: any) {
      toast.error(error.message || '❌ Failed to create account');
      return false;
    }
  };

  const getAllUsers = async (): Promise<User[]> => {
    try {
      const data = await usersAPI.getAll();
      return data.users.map(normalizeUser);
    } catch { return []; }
  };

  const deleteUser = async (userId: string): Promise<boolean> => {
    try {
      await usersAPI.delete(userId);
      return true;
    } catch (error: any) {
      toast.error(error.message || '❌ Failed to delete! Try again.');
      return false;
    }
  };

  const deleteUserCascade = async (userId: string): Promise<boolean> => {
    try {
      await usersAPI.deleteCascade(userId);
      return true;
    } catch (error: any) {
      toast.error(error.message || '❌ Failed to delete!');
      return false;
    }
  };

  const deleteBatch = async (batch: string): Promise<boolean> => {
    try {
      await usersAPI.deleteBatch(batch);
      return true;
    } catch (error: any) {
      toast.error(error.message || '❌ Failed to delete batch!');
      return false;
    }
  };

  const updateUser = async (userId: string, updates: Partial<User>): Promise<boolean> => {
    try {
      await usersAPI.update(userId, updates);
      if (currentUser && currentUser.id === userId) {
        const updated = normalizeUser({ ...currentUser, ...updates });
        setCurrentUser(updated);
        localStorage.setItem('attendance_user', JSON.stringify(updated));
      }
      return true;
    } catch (error: any) {
      toast.error(error.message || '❌ Failed to update!');
      return false;
    }
  };

  const getStudentByUSN = async (usn: string): Promise<User | null> => {
    try {
      const data = await usersAPI.getByUSN(usn);
      return normalizeUser(data.student);
    } catch { return null; }
  };

  const forgotPassword = async (email: string): Promise<boolean> => {
    try {
      await authAPI.forgotPassword(email);
      toast.success('Password reset email sent! Check your inbox.');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset email');
      return false;
    }
  };

  const resendVerificationEmail = async (email?: string): Promise<boolean> => {
    try {
      const userEmail = email || currentUser?.email;
      if (!userEmail) { toast.error('No email provided'); return false; }
      await authAPI.resendVerification(userEmail);
      toast.success('Verification email sent! Check your inbox.');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend verification');
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{
      currentUser, login, logout, signup, isAdminExists,
      getAllUsers, createTeacherAccount, deleteUser, deleteUserCascade,
      deleteBatch, updateUser, getStudentByUSN, forgotPassword, resendVerificationEmail,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
