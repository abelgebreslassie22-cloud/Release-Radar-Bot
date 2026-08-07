import { eq } from 'drizzle-orm';
import { db } from '../database/db';
import { settings } from '../database/schema';

export async function initializeSettings(instanceId?: string) {
  try {
    const allSettings = await db.select().from(settings);
    if (allSettings.length === 0) {
      await db.insert(settings).values({ scanInterval: 10, activeInstanceId: instanceId });
    } else {
      const active = allSettings[0];
      if (instanceId) {
        if (active.activeInstanceId && active.activeInstanceId !== instanceId) {
          console.warn(`WARNING: Another instance might be running (Previous ID: ${active.activeInstanceId}, Current ID: ${instanceId}). Duplicate background services may occur.`);
          import('./logger').then(({ logWarning }) => {
             logWarning(`Another instance started. Previous ID: ${active.activeInstanceId}, New ID: ${instanceId}. Duplicate background services may occur.`, 'System');
          }).catch(console.error);
        }
        await db.update(settings).set({ activeInstanceId: instanceId }).where(eq(settings.id, active.id));
      }
    }
  } catch (e) {
    console.error('Error initializing settings (DB might not be configured properly):', e);
  }
}

export async function getSettings() {
  try {
    const allSettings = await db.select().from(settings);
    return allSettings[0] || null;
  } catch (e) {
    return null;
  }
}

export async function updateSettings(data: any) {
  try {
    const allSettings = await db.select().from(settings);
    if (allSettings && allSettings.length > 0) {
      await db.update(settings).set(data).where(eq(settings.id, allSettings[0].id));
    } else {
      await db.insert(settings).values(data);
    }
  } catch (e) {
    console.error('Failed to update settings in DB:', e);
  }
}
