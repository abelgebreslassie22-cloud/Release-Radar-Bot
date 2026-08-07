import { db } from '../database/db';
import { logs, settings } from '../database/schema';

type LogLevel = 'INFO' | 'ERROR' | 'WARNING' | 'SUCCESS';

async function writeLog(level: LogLevel, message: string, service: string, details?: any) {
  try {
    const s = await db.select({ debugMode: settings.debugMode }).from(settings).limit(1);
    const isDebug = s.length > 0 && s[0].debugMode === 1;

    if (level === 'INFO' && !isDebug) {
      // If not in debug mode, maybe we still want some info logs, but we can filter detailed ones.
      // Wait, the prompt says: "When ON: Store detailed scanner logs. When OFF: Store only important logs."
      // Let's rely on a separate logDebug function or check an `isDebugLog` flag.
    }

    await db.insert(logs).values({
      level,
      message,
      service,
      details: details ? details : null,
    });
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

export async function logInfo(message: string, service: string, details?: any) {
  await writeLog('INFO', message, service, details);
}

export async function logError(message: string, service: string, details?: any) {
  await writeLog('ERROR', message, service, details);
}

export async function logWarning(message: string, service: string, details?: any) {
  await writeLog('WARNING', message, service, details);
}

export async function logSuccess(message: string, service: string, details?: any) {
  await writeLog('SUCCESS', message, service, details);
}

export async function logDebug(message: string, service: string, details?: any) {
  try {
    const s = await db.select({ debugMode: settings.debugMode }).from(settings).limit(1);
    const isDebug = s.length > 0 && s[0].debugMode === 1;
    if (isDebug) {
      await writeLog('INFO', message, service, details);
    }
  } catch (err) {
    console.error('Failed to write debug log:', err);
  }
}
