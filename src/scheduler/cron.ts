import * as cron from 'node-cron';
import { runScan } from '../services/scanner';
import { getSettings } from '../services/settings';
import { logInfo, logSuccess } from '../services/logger';

let currentTask: cron.ScheduledTask | null = null;

export async function startScheduler() {
  try {
    const settings = await getSettings();
    const intervalMinutes = settings?.scanInterval || 10;
    
    if (currentTask) {
      currentTask.stop();
      logInfo(`Scheduler updated. New interval: ${intervalMinutes} minutes`, 'Scheduler');
    } else {
      logSuccess('Scheduler started successfully', 'Scheduler');
    }

    const cronExpression = intervalMinutes === 1 
      ? '* * * * *' 
      : intervalMinutes < 60 
        ? `*/${intervalMinutes} * * * *` 
        : `0 */${Math.floor(intervalMinutes / 60)} * * *`;

    console.log(`Starting scheduler with interval: ${intervalMinutes} minutes (${cronExpression})`);
    logInfo(`Next scan scheduled (Interval: ${intervalMinutes}m)`, 'Scheduler');
    
    currentTask = cron.schedule(cronExpression, async () => {
      await runScan();
      logInfo(`Next scan scheduled (Interval: ${intervalMinutes}m)`, 'Scheduler');
    });

    // Run initially
    runScan();
  } catch (error) {
    console.error('Failed to start scheduler:', error);
  }
}

export function restartScheduler() {
  console.log('Restarting scheduler...');
  startScheduler();
}
