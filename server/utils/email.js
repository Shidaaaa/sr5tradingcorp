const nodemailer = require('nodemailer');

function getTlsOptions() {
  const rejectUnauthorized = String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true') === 'true';
  return { rejectUnauthorized };
}

function createTransporter() {
  const hasOauthConfig =
    !!process.env.MAIL_OAUTH_CLIENT_ID &&
    !!process.env.MAIL_OAUTH_CLIENT_SECRET &&
    !!process.env.MAIL_OAUTH_REFRESH_TOKEN &&
    !!process.env.MAIL_USER;

  if (hasOauthConfig) {
    return nodemailer.createTransport({
      service: process.env.MAIL_SERVICE || 'gmail',
      tls: getTlsOptions(),
      auth: {
        type: 'OAuth2',
        user: process.env.MAIL_USER,
        clientId: process.env.MAIL_OAUTH_CLIENT_ID,
        clientSecret: process.env.MAIL_OAUTH_CLIENT_SECRET,
        refreshToken: process.env.MAIL_OAUTH_REFRESH_TOKEN,
      },
    });
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      tls: getTlsOptions(),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return null;
}

async function sendVerificationCodeEmail({ toEmail, firstName, code }) {
  if (String(process.env.MAIL_DISABLE || '').toLowerCase() === 'true') {
    console.log(`[DEV] Verification code for ${toEmail}: ${code}`);
    return;
  }

  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('Mail server is not configured. Set OAuth2 or SMTP mail credentials.');
  }

  const fromAddress = process.env.MAIL_FROM || process.env.MAIL_USER || process.env.SMTP_USER;
  if (!fromAddress) {
    throw new Error('MAIL_FROM is not configured.');
  }

  const safeName = firstName || 'Customer';

  await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject: 'SR-5 Trading - Email Verification Code',
    text: `Hi ${safeName},\n\nYour SR-5 verification code is: ${code}\nThis code expires in 10 minutes.\n\nIf you did not create an account, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; line-height: 1.5; color: #111827;">
        <h2 style="margin-bottom: 8px;">Verify your SR-5 account</h2>
        <p style="margin-top: 0;">Hi ${safeName},</p>
        <p>Use this verification code to activate your account:</p>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 8px; padding: 12px 16px; background: #f3f4f6; border-radius: 8px; display: inline-block;">${code}</div>
        <p style="margin-top: 16px;">This code expires in <strong>10 minutes</strong>.</p>
        <p style="font-size: 12px; color: #6b7280;">If you did not create an account, you can ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationCodeEmail };
