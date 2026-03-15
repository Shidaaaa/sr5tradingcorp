const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { connectDatabase } = require('../config/database');
const { runInstallmentReminderCycle } = require('../services/installmentReminderJob');

async function main() {
  await connectDatabase();
  await runInstallmentReminderCycle();
  console.log('Installment reminder cycle executed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to run installment reminder cycle:', err.message);
  process.exit(1);
});
