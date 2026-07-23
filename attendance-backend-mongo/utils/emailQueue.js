const nodemailer = require('nodemailer');

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

const sendEmailDirect = async (to, subject, html) => {
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

// In-memory async non-blocking queue for email delivery
const queue = [];
let processing = false;

const processQueue = async () => {
  if (processing || queue.length === 0) return;
  processing = true;

  while (queue.length > 0) {
    const task = queue.shift();
    try {
      await sendEmailDirect(task.to, task.subject, task.html);
      console.log(`[EmailQueue] 📧 Successfully sent email to ${task.to} (${task.subject})`);
      if (task.resolve) task.resolve({ success: true });
    } catch (err) {
      console.error(`[EmailQueue] ❌ Error sending email to ${task.to}:`, err.message);
      if (task.attempts < 3) {
        task.attempts += 1;
        queue.push(task); // retry up to 3 times
      } else if (task.resolve) {
        task.resolve({ success: false, error: err.message });
      }
    }
    // Small delay between email dispatches to respect rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  processing = false;
};

const queueEmail = (to, subject, html) => {
  return new Promise((resolve) => {
    queue.push({ to, subject, html, attempts: 1, resolve });
    setImmediate(processQueue);
  });
};

const safeSendEmailAsync = (to, subject, html) => {
  // Dispatches email in background without blocking caller
  queueEmail(to, subject, html).catch((err) =>
    console.error(`[EmailQueue] Background error:`, err.message)
  );
  return { success: true, queued: true };
};

module.exports = {
  sendEmailDirect,
  queueEmail,
  safeSendEmailAsync,
};
