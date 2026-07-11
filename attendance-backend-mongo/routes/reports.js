const express = require('express');
const nodemailer = require('nodemailer');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { protect, restrictTo } = require('../middleware/auth');
const router = express.Router();

// POST /api/reports/send - Send email reports
router.post('/send', protect, restrictTo('manager'), async (req, res) => {
  try {
    const { emails } = req.body;
    if (!emails?.length) return res.status(400).json({ error: 'No emails to send' });

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });

    let sent = 0, failed = 0;
    for (const email of emails) {
      try {
        const periodLabel = email.period === 'weekly' ? 'Weekly (Last 7 Days)' : 'Monthly (Last 30 Days)';
        const html = `
          <div style="font-family:Arial;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;">
            <div style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:24px;border-radius:12px;text-align:center;margin-bottom:24px;">
              <h1 style="color:white;margin:0;">Attendance Report ${email.percentage >= 75 ? '✅' : '⚠️'}</h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;">${periodLabel}</p>
            </div>
            <p>Dear <strong>${email.parentName || 'Parent'}</strong>,</p>
            <p>Attendance for <strong>${email.studentName}</strong> (${email.usn}):</p>
            <div style="background:white;border-radius:12px;padding:20px;text-align:center;">
              <div style="font-size:48px;font-weight:bold;color:${email.percentage>=75?'#16a34a':'#dc2626'};">${email.percentage}%</div>
              <p>Present: ${email.present} | Absent: ${email.absent} | Total: ${email.total}</p>
            </div>
            ${email.percentage < 75 ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;color:#dc2626;margin:16px 0;">⚠️ Attendance below 75%. Please ensure regular attendance.</div>' : ''}
            <p style="color:#9ca3af;font-size:12px;text-align:center;">Automated report from Attendance Aura</p>
          </div>`;

        await transporter.sendMail({
          from: `"Attendance Aura" <${process.env.GMAIL_USER}>`,
          to: email.to, subject: `${periodLabel} Attendance - ${email.studentName}`, html,
        });
        sent++;
      } catch (err) {
        console.error('Failed to send to', email.to, err.message);
        failed++;
      }
    }

    res.json({ success: true, sent, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
