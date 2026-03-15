const InstallmentSchedule = require('../models/InstallmentSchedule');
const InstallmentPlan = require('../models/InstallmentPlan');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendInstallmentDueReminderEmail } = require('../utils/email');

function getStartOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getReminderField(daysBeforeDue) {
  return daysBeforeDue === 7 ? 'reminder_7d_sent_at' : 'reminder_3d_sent_at';
}

async function sendReminderForScheduleRow(scheduleRow, daysBeforeDue) {
  const reminderField = getReminderField(daysBeforeDue);

  if (scheduleRow.status === 'paid') return;
  if (scheduleRow[reminderField]) return;

  const plan = await InstallmentPlan.findById(scheduleRow.installment_plan_id).lean();
  if (!plan) return;
  if (!plan.down_payment_paid) return;
  if (!['pending', 'active', 'defaulted'].includes(plan.status)) return;

  const order = await Order.findById(plan.order_id).lean();
  if (!order) return;
  if (order.payment_method !== 'installment') return;
  if (['cancelled', 'returned', 'replaced', 'completed'].includes(order.status)) return;

  const customer = await User.findById(plan.user_id).lean();
  if (!customer || !customer.email) return;

  const amountDueLeft = Number((Number(scheduleRow.amount_due || 0) - Number(scheduleRow.amount_paid || 0)).toFixed(2));
  if (amountDueLeft <= 0) return;

  await sendInstallmentDueReminderEmail({
    toEmail: customer.email,
    firstName: customer.first_name,
    orderNumber: order.order_number,
    installmentNumber: scheduleRow.installment_number,
    dueDate: scheduleRow.due_date,
    amountDue: amountDueLeft,
    daysBeforeDue,
  });

  await InstallmentSchedule.updateOne(
    {
      _id: scheduleRow._id,
      status: { $ne: 'paid' },
      [reminderField]: null,
    },
    {
      $set: {
        [reminderField]: new Date(),
      },
    }
  );
}

async function processReminderBatch(daysBeforeDue) {
  const reminderField = getReminderField(daysBeforeDue);
  const todayStart = getStartOfDay(new Date());
  const targetStart = addDays(todayStart, daysBeforeDue);
  const targetEnd = addDays(targetStart, 1);

  const candidates = await InstallmentSchedule.find({
    status: { $in: ['pending', 'partially_paid', 'overdue'] },
    due_date: { $gte: targetStart, $lt: targetEnd },
    [reminderField]: null,
  }).lean();

  let sentCount = 0;
  for (const row of candidates) {
    try {
      await sendReminderForScheduleRow(row, daysBeforeDue);
      sentCount += 1;
    } catch (err) {
      console.error(
        `Installment reminder (${daysBeforeDue}d) failed for schedule ${row._id}:`,
        err.message
      );
    }
  }

  return { daysBeforeDue, candidates: candidates.length, sent: sentCount };
}

let reminderTimer = null;
let isRunning = false;

async function runInstallmentReminderCycle() {
  if (isRunning) return;
  isRunning = true;

  try {
    const first = await processReminderBatch(7);
    const second = await processReminderBatch(3);

    if (first.candidates || second.candidates) {
      console.log(
        `Installment reminders: 7d candidates=${first.candidates}, sent=${first.sent}; 3d candidates=${second.candidates}, sent=${second.sent}`
      );
    }
  } catch (err) {
    console.error('Installment reminder cycle failed:', err.message);
  } finally {
    isRunning = false;
  }
}

function startInstallmentReminderJob() {
  const enabled = String(process.env.INSTALLMENT_REMINDER_ENABLED || 'true').toLowerCase() === 'true';
  if (!enabled) {
    console.log('Installment reminder job is disabled via INSTALLMENT_REMINDER_ENABLED=false');
    return;
  }

  const intervalMinutes = Number(process.env.INSTALLMENT_REMINDER_INTERVAL_MINUTES || 60);
  const safeIntervalMinutes = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 60;
  const intervalMs = safeIntervalMinutes * 60 * 1000;

  // Run shortly after startup, then on interval.
  setTimeout(() => {
    runInstallmentReminderCycle().catch((err) => {
      console.error('Initial installment reminder cycle failed:', err.message);
    });
  }, 5000);

  reminderTimer = setInterval(() => {
    runInstallmentReminderCycle().catch((err) => {
      console.error('Scheduled installment reminder cycle failed:', err.message);
    });
  }, intervalMs);

  console.log(`Installment reminder job started (every ${safeIntervalMinutes} minute(s)).`);
}

function stopInstallmentReminderJob() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}

module.exports = {
  startInstallmentReminderJob,
  stopInstallmentReminderJob,
  runInstallmentReminderCycle,
};
