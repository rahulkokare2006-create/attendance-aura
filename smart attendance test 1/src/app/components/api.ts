// ============================================
// API SERVICE - Replaces Firebase completely
// ============================================

const API_URL = (window as any).__API_URL__ || 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  '';

// Get token from localStorage
const getToken = () => localStorage.getItem('attendance_token');

// Base fetch with auth header
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = getToken();
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong') as any;
    error.status = response.status;
    throw error;
  }
  return data;
};

// AUTH APIs
export const authAPI = {
  login: (email: string, password: string, role: string) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role }) }),
  register: (userData: any) =>
    apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
  me: () => apiFetch('/api/auth/me'),
  forgotPassword: (email: string) =>
    apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    apiFetch(`/api/auth/reset-password/${token}`, { method: 'POST', body: JSON.stringify({ password }) }),
  verifyEmail: (token: string) => apiFetch(`/api/auth/verify-email/${token}`),
  resendVerification: (email: string) =>
    apiFetch('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
  adminExists: () => apiFetch('/api/auth/admin-exists'),
};

// USERS APIs
export const usersAPI = {
  getAll: () => apiFetch('/api/users'),
  create: (userData: any) =>
    apiFetch('/api/users', { method: 'POST', body: JSON.stringify(userData) }),
  update: (id: string, updates: any) =>
    apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  delete: (id: string) => apiFetch(`/api/users/${id}`, { method: 'DELETE' }),
  deleteCascade: (id: string) => apiFetch(`/api/users/${id}/cascade`, { method: 'DELETE' }),
  deleteBatch: (batch: string) => apiFetch(`/api/users/batch/${encodeURIComponent(batch)}`, { method: 'DELETE' }),
  getByUSN: (usn: string) => apiFetch(`/api/users/student/${usn}`),
};

// CLASSES APIs
export const classesAPI = {
  getAll: () => apiFetch('/api/classes'),
  create: (classData: any) =>
    apiFetch('/api/classes', { method: 'POST', body: JSON.stringify(classData) }),
  update: (id: string, updates: any) =>
    apiFetch(`/api/classes/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  delete: (id: string) => apiFetch(`/api/classes/${id}`, { method: 'DELETE' }),
};

// ATTENDANCE APIs
export const attendanceAPI = {
  startSession: (sessionData: any) =>
    apiFetch('/api/attendance/start-session', { method: 'POST', body: JSON.stringify(sessionData) }),
  updateOTP: (sessionId: string, otp: string, qrData?: string) =>
    apiFetch('/api/attendance/update-otp', { method: 'PUT', body: JSON.stringify({ sessionId, otp, qrData }) }),
  getActiveSession: () => apiFetch('/api/attendance/active-session'),
  markAttendance: (sessionId: string, otp: string, deviceId?: string, lat?: number, lng?: number) =>
    apiFetch('/api/attendance/mark', { method: 'POST', body: JSON.stringify({ sessionId, otp, deviceId, lat, lng }) }),
  manualToggle: (sessionId: string, usn: string, status: string) =>
    apiFetch('/api/attendance/manual-toggle', { method: 'PUT', body: JSON.stringify({ sessionId, usn, status }) }),
  endSession: (sessionId: string, save: boolean) =>
    apiFetch('/api/attendance/end-session', { method: 'POST', body: JSON.stringify({ sessionId, save }) }),
  getStudentHistory: (usn: string) => apiFetch(`/api/attendance/student/${usn}`),
  getTeacherHistory: (teacherId: string) => apiFetch(`/api/attendance/teacher/${teacherId}`),
  getLiveRecords: (sessionId: string) => apiFetch(`/api/attendance/session/${sessionId}/live`),
  getOutsideAlerts: (sessionId: string) => apiFetch(`/api/attendance/outside-alerts/${sessionId}`),
  sendOutsideAlert: (payload: any) => apiFetch('/api/attendance/outside-alert', { method: 'POST', body: JSON.stringify(payload) }),
  editPastAttendance: (id: string, records: any[]) =>
    apiFetch(`/api/attendance/${id}`, { method: 'PUT', body: JSON.stringify({ records }) }),
  delete: (id: string) =>
    apiFetch(`/api/attendance/${id}`, { method: 'DELETE' }),
};

// LEAVE APIs
export const leavesAPI = {
  submit: (leaveData: any) =>
    apiFetch('/api/leaves', { method: 'POST', body: JSON.stringify(leaveData) }),
  getMyLeaves: () => apiFetch('/api/leaves/my'),
  getInbox: () => apiFetch('/api/leaves/inbox'),
  getNotifications: () => apiFetch('/api/leaves/notifications'),
  review: (id: string, status: string, reviewNote: string) =>
    apiFetch(`/api/leaves/${id}/review`, { method: 'PUT', body: JSON.stringify({ status, reviewNote }) }),
  delete: (id: string) => apiFetch(`/api/leaves/${id}`, { method: 'DELETE' }),
};

// REPORTS APIs
export const reportsAPI = {
  sendReports: (emails: any[]) =>
    apiFetch('/api/reports/send', { method: 'POST', body: JSON.stringify({ emails }) }),
};

export { API_URL };
export default apiFetch;
