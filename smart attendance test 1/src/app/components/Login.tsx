import { authAPI, attendanceAPI, classesAPI, usersAPI, leavesAPI, reportsAPI } from './api';
import { ref, get, rtdb } from './firebaseCompat';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff, LogIn, UserPlus, Shield, GraduationCap, Users, BookOpen, Mail, KeyRound, ArrowLeft, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useAuth, UserRole } from './AuthContext';
import { useTheme } from './ThemeContext';


import { toast } from 'sonner';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import CustomSelect from './CustomSelect';

type Mode = 'login' | 'signup' | 'forgot-password' | 'verify-email' | 'verify-email-token' | 'reset-password-token';

export default function Login() {
  const { login, signup, isAdminExists, forgotPassword, resendVerificationEmail } = useAuth();
  const { isDarkMode } = useTheme();
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [loading, setLoading] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [verifyEmailAddress, setVerifyEmailAddress] = useState('');

  // Token-based verification and reset state
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [verificationError, setVerificationError] = useState('');
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetConfirmPasswordInput, setResetConfirmPasswordInput] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [resetError, setResetError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [usn, setUsn] = useState('');
  const [branch, setBranch] = useState('');
  const [semester, setSemester] = useState('');
  const [section, setSection] = useState('');
  const [childName, setChildName] = useState('');
  const [childUSN, setChildUSN] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [batch, setBatch] = useState('');
  const [admissionType, setAdmissionType] = useState<'regular' | 'lateral'>('regular');




  useEffect(() => {
    if (mode !== 'signup') return;
    const checkAdmin = async () => {
      try {
        const exists = await isAdminExists();
        setAdminExists(exists);
      } catch {
        setAdminExists(false);
      }
    };
    checkAdmin();
  }, [mode]);

  // Detect URL token-based modes on mount
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/verify-email/')) {
      setMode('verify-email-token');
    } else if (path.startsWith('/reset-password/')) {
      setMode('reset-password-token');
    }
  }, []);

  // Process email verification API call when in verification mode
  useEffect(() => {
    if (mode !== 'verify-email-token') return;
    const token = window.location.pathname.split('/verify-email/')[1];
    if (!token) {
      setVerificationStatus('error');
      setVerificationError('No verification token found in URL.');
      return;
    }

    const verify = async () => {
      setVerifyingEmail(true);
      try {
        await authAPI.verifyEmail(token);
        setVerificationStatus('success');
        toast.success('Email verified successfully! You can now log in.');
      } catch (err: any) {
        setVerificationStatus('error');
        setVerificationError(err.message || 'Verification failed.');
        toast.error(err.message || 'Verification failed.');
      } finally {
        setVerifyingEmail(false);
      }
    };
    verify();
  }, [mode]);

  const clearAllFields = () => {
    setEmail(''); setPassword(''); setConfirmPassword('');
    setName(''); setPhone(''); setUsn(''); setBranch('');
    setSemester(''); setSection(''); setChildName(''); setChildUSN('');
    setRollNo('');
    setBatch('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Please fill in all fields'); return; }
    setLoading(true);
    const result = await login(email, password, selectedRole) as any;
    setLoading(false);
    if (result === 'unverified') {
      setVerifyEmailAddress(email);
      setMode('verify-email');
    } else if (result) {
      toast.success('Login successful!');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !phone || !password) { toast.error('Please fill in all required fields'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (selectedRole === 'admin' && adminExists === true) { toast.error('Admin account already exists'); return; }
    if (selectedRole === 'teacher') { toast.error('Teachers cannot self-signup. Contact admin.'); return; }
    if (selectedRole === 'manager') { toast.error('Manager accounts are created by admin only.'); return; }
    if (selectedRole === 'parent') { toast.error('Parent accounts are created by admin or manager only.'); return; }
    if (selectedRole === 'student' && (!usn || !branch || !semester || !section || !batch)) { toast.error('Please fill in all student details including batch'); return; }
    if (selectedRole === 'student' && usn.length !== 10) { toast.error('USN must be exactly 10 characters'); return; }

    setLoading(true);
    const success = await signup({ email, password, name, phone, usn, rollNo, branch, semester, section, batch, childName, childUSN, role: selectedRole });
    setLoading(false);

    if (success) {
      if (selectedRole === 'admin') {
        toast.success('Admin account created! You can now log in.');
        setMode('login');
      } else {
        setVerifyEmailAddress(email);
        setMode('verify-email');
      }
      clearAllFields();
      const exists = await isAdminExists();
      setAdminExists(exists);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) { toast.error('Please enter your email'); return; }
    setLoading(true);
    const success = await forgotPassword(forgotEmail);
    setLoading(false);
    if (success) setResetSent(true);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordInput || !resetConfirmPasswordInput) {
      toast.error('Please fill in all fields');
      return;
    }
    if (resetPasswordInput.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (resetPasswordInput !== resetConfirmPasswordInput) {
      toast.error('Passwords do not match');
      return;
    }

    const token = window.location.pathname.split('/reset-password/')[1];
    if (!token) {
      toast.error('No reset token found in URL.');
      return;
    }

    setResetSubmitting(true);
    try {
      await authAPI.resetPassword(token, resetPasswordInput);
      setResetStatus('success');
      toast.success('Password reset successfully! You can now log in.');
    } catch (err: any) {
      setResetError(err.message || 'Failed to reset password.');
      toast.error(err.message || 'Failed to reset password.');
    } finally {
      setResetSubmitting(false);
    }
  };

  const roleIcons: Record<string, React.ReactNode> = {
    admin: <Shield className="w-6 h-6" />,
    teacher: <GraduationCap className="w-6 h-6" />,
    student: <BookOpen className="w-6 h-6" />,
    parent: <Users className="w-6 h-6" />,
    manager: <Shield className="w-6 h-6" />,
  };

  const availableSignupRoles: UserRole[] = adminExists === true ? ['student', 'parent'] : ['admin', 'student', 'parent'];
  const canSignup = !['teacher', 'manager'].includes(selectedRole);
  const toggleMode = () => {
    if (mode === 'signup') {
      setMode('login');
    } else {
      if (!canSignup) {
        setSelectedRole('student');
      }
      setMode('signup');
    }
    clearAllFields();
  };

  const cardBg = isDarkMode ? 'backdrop-blur-xl bg-white/10 border border-white/20' : 'bg-white border border-gray-200 shadow-2xl';
  const textColor = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextColor = isDarkMode ? 'text-blue-200' : 'text-gray-600';
  const inputBg = isDarkMode ? 'bg-white/10 border-white/20 text-white placeholder:text-white/50' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400';
  const linkColor = isDarkMode ? 'text-blue-300 hover:text-white' : 'text-blue-600 hover:text-blue-800';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {isDarkMode && (
        <div className="absolute inset-0 overflow-hidden">
          <motion.div className="absolute top-1/4 -left-10 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }} transition={{ duration: 8, repeat: Infinity }} />
          <motion.div className="absolute bottom-1/4 -right-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"
            animate={{ scale: [1, 1.3, 1], x: [0, -50, 0], y: [0, -30, 0] }} transition={{ duration: 10, repeat: Infinity }} />
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative w-full max-w-md">
        <div className={`${cardBg} rounded-3xl p-8 shadow-2xl`}>

          {/* Header */}
          <div className="text-center mb-8">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }} className="inline-block mb-4">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg ${
                mode === 'forgot-password' ? 'bg-gradient-to-br from-orange-500 to-red-600' :
                mode === 'verify-email' ? 'bg-gradient-to-br from-green-500 to-emerald-600' :
                'bg-gradient-to-br from-blue-500 to-purple-600'
              }`}>
                {mode === 'forgot-password' ? <KeyRound className="w-10 h-10 text-white" /> :
                 mode === 'verify-email' ? <Mail className="w-10 h-10 text-white" /> :
                 <Shield className="w-10 h-10 text-white" />}
              </div>
            </motion.div>
            <h1 className={`text-3xl font-bold ${textColor} mb-2`}>
              {mode === 'forgot-password' ? 'Reset Password' :
               mode === 'verify-email' ? 'Verify Email' :
               'Smart Attendance'}
            </h1>
            <p className={subTextColor}>
              {mode === 'forgot-password' ? 'Enter your email to reset password' :
               mode === 'verify-email' ? 'Check your inbox and verify your email' :
               'Anuvartik Mirji Bharatesh Institute of Technology'}
            </p>
          </div>

          <AnimatePresence mode="wait">

            {/* ✅ VERIFY EMAIL SCREEN */}
            {mode === 'verify-email' && (
              <motion.div key="verify" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-5 text-center">
                {/* Big email icon with animation */}
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex justify-center">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                    <Mail className="w-12 h-12 text-white" />
                  </div>
                </motion.div>

                <div>
                  <h3 className={`text-xl font-bold ${textColor} mb-2`}>Check Your Email! 📬</h3>
                  <p className={`${subTextColor} text-sm`}>We sent a verification link to:</p>
                  <p className={`font-bold text-blue-400 mt-1 text-sm break-all`}>{verifyEmailAddress || 'your email'}</p>
                </div>

                {/* Step guide */}
                <div className={`${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-blue-50 border-blue-100'} border rounded-2xl p-4 text-left space-y-3`}>
                  {[
                    { step: '1', text: 'Open your email inbox' },
                    { step: '2', text: 'Find email from Attendance App' },
                    { step: '3', text: 'Click the "Verify Email" link' },
                    { step: '4', text: 'Come back here and login!' },
                  ].map(({ step, text }) => (
                    <div key={step} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-bold">{step}</span>
                      </div>
                      <p className={`text-sm ${textColor}`}>{text}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className={`${isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'} border rounded-xl p-3 text-center`}>
                    <p className={`text-xs font-semibold ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>
                      ⚠️ You CANNOT login until you verify your email!
                    </p>
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-red-200/70' : 'text-red-500'}`}>
                      Open your email, click the verify link, then come back here to login.
                    </p>
                  </div>
                  <Button onClick={() => { setMode('login'); }}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 py-5 text-base font-semibold">
                    <LogIn className="w-5 h-5 mr-2" /> I've Verified — Go to Login ✅
                  </Button>
                  <button onClick={async () => {
                      setLoading(true);
                      await resendVerificationEmail(verifyEmailAddress || email);
                      setLoading(false);
                    }}
                    disabled={loading}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border transition-all text-sm ${
                      isDarkMode ? 'border-white/20 text-white/60 hover:text-white hover:bg-white/10' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}>
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Resend Verification Email
                  </button>
                </div>

                <div className={`${isDarkMode ? 'bg-orange-500/10 border-orange-500/20' : 'bg-orange-50 border-orange-200'} border rounded-xl p-3`}>
                  <p className={`text-xs font-semibold ${isDarkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                    📁 Can't find the email? Check these folders:
                  </p>
                  <div className="flex gap-2 mt-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${isDarkMode ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>📂 Spam</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${isDarkMode ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>📂 Promotions</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${isDarkMode ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>📂 Junk</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 🔑 FORGOT PASSWORD SCREEN */}
            {mode === 'forgot-password' && (
              <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                {!resetSent ? (
                  <>
                    <div className={`${isDarkMode ? 'bg-orange-500/20' : 'bg-orange-50'} rounded-2xl p-4`}>
                      <p className={`text-sm ${isDarkMode ? 'text-orange-200' : 'text-orange-700'}`}>
                        Enter your registered email and we'll send you a password reset link.
                      </p>
                    </div>
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div>
                        <Label className={`${textColor} mb-2 block`}>Email Address *</Label>
                        <Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                          required className={inputBg} placeholder="Enter your email" autoComplete="off" />
                      </div>
                      <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-orange-500 to-red-600 py-6">
                        {loading ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                        ) : (
                          <><Mail className="w-5 h-5 mr-2" /> Send Reset Link</>
                        )}
                      </Button>
                    </form>
                  </>
                ) : (
                  <div className="space-y-6 text-center">
                    <div className={`${isDarkMode ? 'bg-green-500/20' : 'bg-green-50'} rounded-2xl p-6`}>
                      <Mail className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? 'text-green-300' : 'text-green-600'}`} />
                      <p className={`font-bold text-lg ${textColor} mb-2`}>Reset Link Sent!</p>
                      <p className={`${subTextColor} text-sm`}>
                        Check your email <strong>{forgotEmail}</strong> for the password reset link.
                      </p>
                    </div>
                    <button onClick={() => { setResetSent(false); setForgotEmail(''); }}
                      className={`text-sm ${linkColor} transition-colors`}>
                      Try a different email
                    </button>
                  </div>
                )}
                <div className="text-center mt-4">
                  <button onClick={() => { setMode('login'); setResetSent(false); setForgotEmail(''); }}
                    className={`flex items-center gap-2 mx-auto ${linkColor} transition-colors`}>
                    <ArrowLeft className="w-4 h-4" /> Back to Login
                  </button>
                </div>
              </motion.div>
            )}

            {/* VERIFY EMAIL TOKEN PROCESSOR */}
            {mode === 'verify-email-token' && (
              <motion.div key="verify-token" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-5 text-center">
                <div className="flex justify-center">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg ${
                    verificationStatus === 'success' ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/30' :
                    verificationStatus === 'error' ? 'bg-gradient-to-br from-red-500 to-orange-600 shadow-red-500/30' :
                    'bg-gradient-to-br from-blue-500 to-purple-600 shadow-blue-500/30'
                  }`}>
                    {verifyingEmail ? <RefreshCw className="w-12 h-12 text-white animate-spin" /> :
                     verificationStatus === 'success' ? <CheckCircle className="w-12 h-12 text-white" /> :
                     <XCircle className="w-12 h-12 text-white" />}
                  </div>
                </div>

                <div>
                  <h3 className={`text-xl font-bold ${textColor} mb-2`}>
                    {verifyingEmail ? 'Verifying Your Email...' :
                     verificationStatus === 'success' ? 'Verification Successful!' :
                     'Verification Failed'}
                  </h3>
                  <p className={`${subTextColor} text-sm`}>
                    {verifyingEmail ? 'Please wait while we confirm your email address.' :
                     verificationStatus === 'success' ? 'Your email has been verified. You can now access your account.' :
                     verificationError}
                  </p>
                </div>

                {!verifyingEmail && (
                  <Button onClick={() => { setMode('login'); window.history.replaceState({}, '', '/'); }} className="w-full">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
                  </Button>
                )}
              </motion.div>
            )}

            {/* RESET PASSWORD TOKEN PROCESSOR */}
            {mode === 'reset-password-token' && (
              <motion.div key="reset-token" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                {resetStatus === 'success' ? (
                  <div className="text-center space-y-4">
                    <div className="flex justify-center">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                        <CheckCircle className="w-12 h-12 text-white" />
                      </div>
                    </div>
                    <div>
                      <h3 className={`text-xl font-bold ${textColor} mb-2`}>Success!</h3>
                      <p className={subTextColor}>Your password has been successfully reset. You can now login with your new password.</p>
                    </div>
                    <Button onClick={() => { setMode('login'); window.history.replaceState({}, '', '/'); }} className="w-full">
                      Go to Login
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                    <div className="text-center mb-2">
                      <p className={subTextColor}>Please enter your new password below.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password" className={textColor}>New Password</Label>
                      <Input
                        id="new-password"
                        type={showPassword ? 'text' : 'password'}
                        value={resetPasswordInput}
                        onChange={(e) => setResetPasswordInput(e.target.value)}
                        placeholder="••••••••"
                        className={inputBg}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-new-password" className={textColor}>Confirm Password</Label>
                      <Input
                        id="confirm-new-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={resetConfirmPasswordInput}
                        onChange={(e) => setResetConfirmPasswordInput(e.target.value)}
                        placeholder="••••••••"
                        className={inputBg}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-red-600 py-6" disabled={resetSubmitting}>
                      {resetSubmitting ? <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> : <KeyRound className="w-5 h-5 mr-2" />}
                      Reset Password
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setMode('login'); window.history.replaceState({}, '', '/'); }}
                      className={`w-full flex items-center justify-center text-sm font-medium ${linkColor} mt-2`}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
                    </button>
                  </form>
                )}
              </motion.div>
            )}

            {/* 🔐 LOGIN / SIGNUP SCREEN */}
            {(mode === 'login' || mode === 'signup') && (
              <motion.div key="auth" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                {/* Role Selector */}
                <div className="mb-6">
                  <Label className={`${textColor} mb-2 block`}>Select Role</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(mode === 'signup' ? availableSignupRoles : (['admin', 'teacher', 'student', 'parent', 'manager'] as UserRole[])).map((role) => (
                      <motion.button key={role} type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedRole(role)}
                        className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                          selectedRole === role
                            ? 'bg-gradient-to-br from-blue-500 to-purple-600 border-transparent text-white shadow-lg'
                            : isDarkMode ? 'bg-white/5 border-white/20 text-white hover:bg-white/10' : 'bg-gray-50 border-gray-300 text-gray-900 hover:bg-gray-100'
                        }`}>
                        {roleIcons[role]}
                        <span className="text-sm font-medium capitalize">{role}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <form onSubmit={mode === 'signup' ? handleSignup : handleLogin} className="space-y-4">
                  {mode === 'signup' && (
                    <>
                      <div>
                        <Label className={`${textColor} mb-2 block`}>Full Name *</Label>
                        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} required className={inputBg} placeholder="Enter your full name" autoComplete="off" />
                      </div>
                      <div>
                        <Label className={`${textColor} mb-2 block`}>Phone *</Label>
                        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className={inputBg} placeholder="Enter phone number" autoComplete="off" />
                      </div>
                      {selectedRole === 'student' && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className={`${textColor} mb-2 block`}>USN * (10 digits)</Label>
                              <Input type="text" value={usn}
                                onChange={(e) => {
                                  const val = e.target.value.toUpperCase().slice(0, 10);
                                  setUsn(val);
                                }}
                                required className={`${inputBg} ${usn.length > 0 && usn.length !== 10 ? 'border-red-500' : ''}`}
                                placeholder="e.g., 2HB24CS001" autoComplete="off" maxLength={10} />
                              {usn.length > 0 && usn.length !== 10 && (
                                <p className="text-red-400 text-xs mt-1">USN must be exactly 10 characters</p>
                              )}
                            </div>
                            <div>
                              <Label className={`${textColor} mb-2 block`}>Roll No *</Label>
                              <Input type="text" value={rollNo} onChange={(e) => setRollNo(e.target.value)} required className={inputBg} placeholder="e.g., 35" autoComplete="off" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <CustomSelect
                              label="Branch *"
                              value={branch}
                              onChange={setBranch}
                              required
                              inputBg={inputBg}
                              textColor={textColor}
                              placeholder="Select Branch"
                              customPlaceholder="Enter Branch (e.g. Mechanical AI)"
                              options={[
                                { label: 'CSE', value: 'CSE' },
                                { label: 'ECE', value: 'ECE' },
                                { label: 'AIML', value: 'AIML' },
                                { label: 'ISE', value: 'ISE' },
                                { label: 'CIVIL', value: 'CIVIL' },
                                { label: 'MECH', value: 'MECH' },
                              ]}
                            />
                            <div>
                              <Label className={`${textColor} mb-2 block`}>Semester *</Label>
                              <select value={semester} onChange={(e) => setSemester(e.target.value)} required className={`${inputBg} w-full p-2.5 rounded-lg border text-sm font-medium`}>
                                <option value="">Select Sem</option>
                                {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s.toString()}>{s}</option>)}
                              </select>
                            </div>
                          </div>
                          <CustomSelect
                            label="Section *"
                            value={section}
                            onChange={setSection}
                            required
                            inputBg={inputBg}
                            textColor={textColor}
                            placeholder="Select Section"
                            customPlaceholder="Enter Section Name"
                            options={['A','B','C','D','E','F'].map(s => ({ label: `Section ${s}`, value: s }))}
                          />
                          <div className="space-y-1.5">
                            <Label className={`${textColor} block text-xs font-semibold uppercase tracking-wider`}>Admission Type *</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setAdmissionType('regular')}
                                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                                  admissionType === 'regular'
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700'
                                }`}
                              >
                                Regular Student (4-Yr)
                              </button>
                              <button
                                type="button"
                                onClick={() => setAdmissionType('lateral')}
                                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                                  admissionType === 'lateral'
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700'
                                }`}
                              >
                                Lateral Entry (3-Yr)
                              </button>
                            </div>
                          </div>
                          <CustomSelect
                            label="Batch / Graduation Year *"
                            value={batch}
                            onChange={setBatch}
                            required
                            inputBg={inputBg}
                            textColor={textColor}
                            placeholder="Select Batch"
                            customPlaceholder={admissionType === 'lateral' ? 'Enter Lateral Batch e.g. 2025-2028' : 'Enter Batch e.g. 2024-2028'}
                            options={
                              admissionType === 'regular'
                                ? Array.from({length: 8}, (_, i) => {
                                    const startYear = new Date().getFullYear() - 4 + i;
                                    const endYear = startYear + 4;
                                    return { label: `${startYear}–${endYear} (Grad ${endYear})`, value: `${startYear}-${endYear}` };
                                  })
                                : Array.from({length: 8}, (_, i) => {
                                    const startYear = new Date().getFullYear() - 3 + i;
                                    const endYear = startYear + 3;
                                    return { label: `${startYear}–${endYear} (Lateral Entry - Grad ${endYear})`, value: `${startYear}-${endYear} (Lateral Entry)` };
                                  })
                            }
                          />
                        </>
                      )}
                      {selectedRole === 'parent' && (
                        <>
                          <div>
                            <Label className={`${textColor} mb-2 block`}>Student Name *</Label>
                            <Input type="text" value={childName} onChange={(e) => setChildName(e.target.value)} required className={inputBg} placeholder="Enter student full name" autoComplete="off" />
                          </div>
                          <div>
                            <Label className={`${textColor} mb-2 block`}>Student USN *</Label>
                            <Input type="text" value={childUSN} onChange={(e) => setChildUSN(e.target.value)} required className={inputBg} placeholder="e.g., 1BI21EC001" autoComplete="off" />
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <div>
                    <Label className={`${textColor} mb-2 block`}>Email *</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputBg} placeholder="Enter your email" autoComplete="off" />
                  </div>

                  <div>
                    <Label className={`${textColor} mb-2 block`}>Password *</Label>
                    <div className="relative">
                      <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                        required className={`${inputBg} pr-10`} placeholder="Enter your password" autoComplete="off" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {mode === 'signup' && (
                    <div>
                      <Label className={`${textColor} mb-2 block`}>Confirm Password *</Label>
                      <div className="relative">
                        <Input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                          required className={`${inputBg} pr-10`} placeholder="Confirm your password" autoComplete="off" />
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Forgot Password Link - only on login */}
                  {mode === 'login' && (
                    <div className="text-right">
                      <button type="button" onClick={() => setMode('forgot-password')}
                        className={`text-sm ${linkColor} transition-colors`}>
                        Forgot Password?
                      </button>
                    </div>
                  )}

                  <Button type="submit" disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white py-6 rounded-xl font-medium shadow-lg">
                    {loading ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                    ) : mode === 'signup' ? (
                      <><UserPlus className="w-5 h-5 mr-2" />Sign Up</>
                    ) : (
                      <><LogIn className="w-5 h-5 mr-2" />Login</>
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  {mode === 'signup' ? (
                    <button type="button" onClick={toggleMode} className={`${linkColor} transition-colors`}>
                      Already have an account? Login
                    </button>
                  ) : canSignup ? (
                    <button type="button" onClick={toggleMode} className={`${linkColor} transition-colors`}>
                      Don't have an account? Sign Up
                    </button>
                  ) : (
                    <p className={`${subTextColor} text-sm`}>
                      Teacher and manager accounts must be created by admin.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
