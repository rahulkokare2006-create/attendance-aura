const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

const rateLimits = new Map();
const createRateLimiter = (action, maxRequests = 5, windowMs = 60 * 1000) => (req, res, next) => {
  const key = `${action}:${req.ip || req.connection.remoteAddress || 'unknown'}`;
  const now = Date.now();
  const entry = rateLimits.get(key) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  rateLimits.set(key, entry);
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.start + windowMs - now) / 1000);
    return res.status(429).json({ error: `Too many requests. Try again in ${retryAfter} seconds.` });
  }
  next();
};

const createMailTransporter = () => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD;

  if (!gmailUser || !gmailPass) {
    throw new Error('Missing Gmail credentials. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
    secure: true,
  });
};

const sendEmail = async (to, subject, html) => {
  const transporter = createMailTransporter();
  await transporter.verify();
  return await transporter.sendMail({
    from: `"Attendance Aura" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    text: html.replace(/<[^>]*>/g, ''),
    replyTo: process.env.GMAIL_USER,
  });
};

const safeSendEmail = async (to, subject, html) => {
  try {
    const info = await sendEmail(to, subject, html);
    return { success: true, info };
  } catch (err) {
    const message = err?.message || String(err);
    console.error('Email error:', message);
    return { success: false, error: message };
  }
};

// POST /api/auth/register
router.post('/register', createRateLimiter('register', 5, 2 * 60 * 1000), async (req, res) => {
  try {
    const { name, email, password, role, phone, usn, rollNo, branch, semester, section, batch, childName, childUSN, department, designation } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength (min 6 chars)
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if admin already exists
    if (role === 'admin') {
      const adminExists = await User.findOne({ role: 'admin' });
      if (adminExists) return res.status(400).json({ error: 'Admin account already exists!' });
    }

    // Teacher/Manager/Parent cannot self-register
    if (['teacher', 'manager'].includes(role)) {
      return res.status(403).json({ error: `${role} accounts are created by admin only` });
    }

    const normalizedEmail = email ? email.toLowerCase() : '';
    const normalizedUsn = usn ? usn.toUpperCase() : null;

    // Check if user record already exists for the same email or USN (for reconnecting after account recreation)
    let existing = await User.findOne({ email: normalizedEmail });
    if (!existing && role === 'student' && normalizedUsn) {
      existing = await User.findOne({ usn: normalizedUsn, role: 'student' });
    }

    if (existing) {
      if (existing.isActive) {
        return res.status(400).json({ error: 'Email or USN already registered. Try logging in.' });
      }

      // Reconnect to existing database record and restore previous data automatically
      const needsVerification = ['student', 'teacher'].includes(role);
      const verifyToken = needsVerification ? crypto.randomBytes(32).toString('hex') : null;
      const verifyTokenExpires = needsVerification ? Date.now() + 24 * 60 * 60 * 1000 : null;

      existing.name = name;
      existing.email = normalizedEmail;
      existing.password = password;
      existing.role = role;
      existing.phone = phone || existing.phone;
      if (normalizedUsn) existing.usn = normalizedUsn;
      if (rollNo) existing.rollNo = rollNo;
      if (branch) existing.branch = branch;
      if (semester) existing.semester = semester;
      if (section) existing.section = section;
      if (batch) existing.batch = batch;
      if (childName) existing.childName = childName;
      if (childUSN) existing.childUSN = childUSN.toUpperCase();
      if (department) existing.department = department;
      if (designation) existing.designation = designation;

      existing.isActive = true;
      existing.isEmailVerified = !needsVerification;
      existing.emailVerifyToken = verifyToken;
      existing.emailVerifyTokenExpires = verifyTokenExpires;

      await existing.save();

      let verifyUrl = null;
      if (needsVerification && verifyToken) {
        verifyUrl = `${FRONTEND_URL}/verify-email/${verifyToken}`;
        const emailResult = await safeSendEmail(normalizedEmail, 'Verify your Attendance Aura account', `
          <div style="font-family:Arial;padding:20px;">
            <h2>Welcome back to Attendance Aura!</h2>
            <p>Your account has been restored. Click the button below to verify your email:</p>
            <a href="${verifyUrl}" style="background:#3b82f6;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
              Verify Email
            </a>
            <p style="color:#666;margin-top:16px;">This link expires in 24 hours.</p>
          </div>
        `);
        if (!emailResult.success) {
          console.error(`❌ Failed to send verification email to ${normalizedEmail}:`, emailResult.error);
        }
      }

      return res.status(200).json({
        success: true,
        message: needsVerification ? 'Account restored! Check your email to verify.' : 'Account restored successfully!',
        verifyUrl,
        restored: true,
      });
    }

    // Max 2 parents per student USN
    if (role === 'parent' && childUSN) {
      const parentCount = await User.countDocuments({ role: 'parent', childUSN, isActive: { $ne: false } });
      if (parentCount >= 2) return res.status(400).json({ error: 'Maximum 2 parent accounts already exist for this student' });
    }

    // Create verify token for student/teacher
    const needsVerification = ['student', 'teacher'].includes(role);
    const verifyToken = needsVerification ? crypto.randomBytes(32).toString('hex') : null;

    const verifyTokenExpires = needsVerification ? Date.now() + 24 * 60 * 60 * 1000 : null;
    const user = await User.create({
      name, email: normalizedEmail, password, role, phone: phone || '',
      usn: normalizedUsn, rollNo: rollNo || null,
      branch: branch || null, semester: semester || null,
      section: section || null, batch: batch || null,
      childName: childName || null, childUSN: childUSN?.toUpperCase() || null,
      department: department || null, designation: designation || null,
      isEmailVerified: !needsVerification,
      emailVerifyToken: verifyToken,
      emailVerifyTokenExpires: verifyTokenExpires,
    });

    // Send verification email
    let verifyUrl = null;
    if (needsVerification && verifyToken) {
      verifyUrl = `${FRONTEND_URL}/verify-email/${verifyToken}`;
      const emailResult = await safeSendEmail(normalizedEmail, 'Verify your Attendance Aura account', `
        <div style="font-family:Arial;padding:20px;">
          <h2>Welcome to Attendance Aura!</h2>
          <p>Click the button below to verify your email:</p>
          <a href="${verifyUrl}" style="background:#3b82f6;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
            Verify Email
          </a>
          <p style="color:#666;margin-top:16px;">This link expires in 24 hours. If you do not receive it quickly, check your spam folder.</p>
        </div>
      `);
      if (!emailResult.success) {
        console.error(`❌ Failed to send verification email to ${normalizedEmail}:`, emailResult.error);
        await User.deleteOne({ _id: user._id });
        return res.status(500).json({
          error: 'Failed to send verification email. Check email credentials and try again.',
          detail: emailResult.error,
        });
      }
      console.log(`📧 Verification email sent to ${normalizedEmail}`);
    }

    res.status(201).json({
      success: true,
      message: needsVerification ? 'Account created! Check your email to verify.' : 'Account created successfully!',
      verifyUrl,
    });
  } catch (err) {
    console.error('Register error:', err.message);
    if (err.code === 11000) return res.status(400).json({ error: 'Email already registered' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', createRateLimiter('login', 5, 60 * 1000), async (req, res) => {
  try {
    const { email, password, role } = req.body;
    
    // Validate required fields
    if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required' });
    if (!password) return res.status(400).json({ error: 'Password is required' });
    if (!role) return res.status(400).json({ error: 'Role is required' });

    // Validate role is valid
    const validRoles = ['admin', 'teacher', 'student', 'parent', 'manager'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role selected' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'No account found with this email' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    if (user.role !== role) return res.status(401).json({ error: `Role mismatch. Please select "${user.role}" role` });
    if (!user.isActive) return res.status(401).json({ error: 'Account deactivated. Contact administrator.' });

    // Check email verification
    if (['student', 'teacher'].includes(role) && !user.isEmailVerified) {
      return res.status(401).json({ error: 'EMAIL_NOT_VERIFIED', userId: user._id });
    }

    const token = signToken(user._id);
    const userData = user.toObject();
    delete userData.password;
    delete userData.emailVerifyToken;

    res.json({ success: true, token, user: userData });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', async (req, res) => {
  try {
    const user = await User.findOne({ emailVerifyToken: req.params.token });
    if (!user || !user.emailVerifyTokenExpires || user.emailVerifyTokenExpires.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }
    user.isEmailVerified = true;
    user.emailVerifyToken = null;
    user.emailVerifyTokenExpires = null;
    await user.save();
    res.json({ success: true, message: 'Email verified! You can now login.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', createRateLimiter('resend-verification', 5, 60 * 1000), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required' });
    
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'No account found with this email' });
    if (user.isEmailVerified) return res.status(400).json({ error: 'Email already verified' });
    
    const verifyToken = crypto.randomBytes(32).toString('hex');
    user.emailVerifyToken = verifyToken;
    user.emailVerifyTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();
    
    const verifyUrl = `${FRONTEND_URL}/verify-email/${verifyToken}`;
    const emailResult = await safeSendEmail(email, 'Verify your Attendance Aura account', `
      <div style="font-family:Arial;padding:20px;">
        <h2>Verify Your Email</h2>
        <p>Click the button below to verify your email:</p>
        <a href="${verifyUrl}" style="background:#3b82f6;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
          Verify Email
        </a>
        <p style="color:#666;margin-top:16px;">Link expires in 24 hours.</p>
      </div>
    `);
    if (!emailResult.success) {
      console.error('Failed to send verification email:', emailResult.error);
      return res.status(500).json({
        error: 'Failed to send verification email. Please check your email settings.',
        detail: emailResult.error,
      });
    }
    
    res.json({ success: true, message: 'Verification email sent!', verifyUrl });
  } catch (err) {
    console.error('Resend verification error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', createRateLimiter('forgot-password', 5, 60 * 1000), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required' });
    
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'No account found with this email' });
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();
    
    const resetUrl = `${FRONTEND_URL}/reset-password/${resetToken}`;
    const emailResult = await safeSendEmail(user.email, 'Password Reset - Attendance Aura', `
      <div style="font-family:Arial;padding:20px;">
        <h2>Password Reset Request</h2>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}" style="background:#3b82f6;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
          Reset Password
        </a>
        <p style="color:#666;margin-top:16px;">Link expires in 1 hour.</p>
        <p style="color:#dc2626;">If you didn't request this, please ignore this email.</p>
      </div>
    `);
    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
    }
    
    res.json({ success: true, message: 'Password reset email sent!', resetUrl });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-password/:token
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    const { token } = req.params;
    
    if (!token) return res.status(400).json({ error: 'Reset token is required' });
    if (!password) return res.status(400).json({ error: 'New password is required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset link' });
    
    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    
    res.json({ success: true, message: 'Password reset successfully! You can now login with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ⚠️ SECURITY: manual-verify endpoint REMOVED - was vulnerable testing backdoor
// Do not add back this endpoint in production

// GET /api/auth/admin-exists
router.get('/admin-exists', async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'admin' });
    res.json({ exists: !!admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
