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

async function sendInstallmentDueReminderEmail({
  toEmail,
  firstName,
  orderNumber,
  installmentNumber,
  dueDate,
  amountDue,
  daysBeforeDue,
}) {
  if (String(process.env.MAIL_DISABLE || '').toLowerCase() === 'true') {
    console.log(`[DEV] Installment reminder (${daysBeforeDue}d) for ${toEmail} | Order ${orderNumber} | Month ${installmentNumber}`);
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
  const dueDateText = new Date(dueDate).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const amountText = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(amountDue || 0));
  const urgencyText = daysBeforeDue === 3
    ? 'This is a second reminder. Your due date is very near.'
    : 'This is a friendly reminder for your upcoming due date.';

  await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject: `SR-5 Trading - Installment Payment Reminder (${daysBeforeDue} days before due)` ,
    text:
`Hi ${safeName},

${urgencyText}

Order: ${orderNumber}
Installment: Month ${installmentNumber}
Due Date: ${dueDateText}
Amount Due: ${amountText}

Please pay your installment on or before the due date to avoid penalties or account issues.

Thank you,
SR-5 Trading Corporation`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; line-height: 1.5; color: #111827;">
        <h2 style="margin-bottom: 8px;">Installment Payment Reminder</h2>
        <p style="margin-top: 0;">Hi ${safeName},</p>
        <p>${urgencyText}</p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; margin: 12px 0;">
          <p style="margin: 0 0 6px 0;"><strong>Order:</strong> ${orderNumber}</p>
          <p style="margin: 0 0 6px 0;"><strong>Installment:</strong> Month ${installmentNumber}</p>
          <p style="margin: 0 0 6px 0;"><strong>Due Date:</strong> ${dueDateText}</p>
          <p style="margin: 0;"><strong>Amount Due:</strong> ${amountText}</p>
        </div>
        <p>Please pay your installment on or before the due date to avoid penalties or account issues.</p>
        <p style="font-size: 12px; color: #6b7280;">This is an automated reminder from SR-5 Trading Corporation.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationCodeEmail, sendInstallmentDueReminderEmail };
