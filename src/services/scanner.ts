import { db } from '../database/db';
import { watchlist, releases, settings } from '../database/schema';
import { fetchMetadata } from '../metadata/tmdb';
import { sendTelegramNotification } from '../telegram/bot';
import { and, eq } from 'drizzle-orm';
import { logInfo, logError, logWarning, logSuccess, logDebug } from './logger';
import { Provider } from '../types';

let isScanning = false;

export async function runScan() {
  if (isScanning) {
    console.log('Scan already in progress. Skipping...');
    return;
  }
  isScanning = true;
  console.log('Starting provider scan...');
  await logInfo('Scanner started', 'Scanner');
  
  try {
    const currentSettings = await db.select().from(settings).limit(1);
    if (currentSettings.length > 0) {
      await db.update(settings).set({ lastScan: new Date() }).where(eq(settings.id, currentSettings[0].id));
    }
    
    const activeSettings: any = currentSettings[0] || {};
    let providers: Provider[] = [];
    
    if (activeSettings.providerType === 'MOCK') {
      const { MockRSSProvider } = await import('../providers/mockRssProvider');
      providers.push(new MockRSSProvider());
    } else if (activeSettings.providerType === 'PIRATEBAY') {
      const { PirateBayProvider } = await import('../providers/pirateBayProvider');
      providers.push(new PirateBayProvider());
    } else if (activeSettings.providerType === 'RSS' && activeSettings.providerUrl) {
      const { RSSProvider } = await import('../providers/rssProvider');
      providers.push(new RSSProvider(activeSettings.providerUrl));
    } else {
      console.log('No valid active provider configured.');
      await logWarning('No valid active provider configured.', 'Scanner');
      isScanning = false;
      return;
    }

    const items = await db.select().from(watchlist);
    if (items.length === 0) {
      console.log('Watchlist is empty. Skipping scan.');
      await logInfo('Watchlist is empty. Skipping scan.', 'Scanner');
      isScanning = false;
      return;
    }

    for (const provider of providers) {
      try {
        let matchingCount = 0;
        let notificationsCount = 0;
        
        await logInfo(`Provider started:\n${provider.name}`, 'Scanner');
        await logInfo(`Fetching data...`, 'Scanner');
        
        const foundItems = await provider.scan(items);
        
        await logSuccess(`Items received:\n${foundItems.length}`, 'Scanner');
        await logSuccess(`Parsed releases:\n${foundItems.length}`, 'Scanner');

        for (const item of foundItems) {
          // Flexible title matching
          const match = items.find((w) => {
            const cleanW = w.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanI = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            // Check if title matches (or if one contains the other)
            const titleMatches = cleanW === cleanI || cleanI.includes(cleanW) || cleanW.includes(cleanI);
            
            // Allow matching if year matches, or if watchlist year is within 1 year, or if item year is close
            const yearMatches = Math.abs(w.year - item.year) <= 1;
            
            // Check type match
            const typeMatches = w.type.toLowerCase() === item.type.toLowerCase();

            return titleMatches && yearMatches && typeMatches;
          });

          if (match) {
            matchingCount++;
            await logSuccess(`Watchlist match found: ${item.title} (${item.year}) [${item.releaseType}]`, 'Matcher');
            
            // Check if already stored
            const existing = await db.select().from(releases).where(
              and(
                eq(releases.title, item.title),
                eq(releases.year, item.year),
                eq(releases.provider, provider.name),
                eq(releases.releaseType, item.releaseType)
              )
            ).limit(1);

            if (existing.length === 0) {
              // Fetch metadata
              const metadata = await fetchMetadata(item.title, item.year, item.type);

              // Save release
              try {
                await db.insert(releases).values({
                  title: item.title,
                  year: item.year,
                  type: item.type,
                  provider: provider.name,
                  sourceUrl: item.sourceUrl,
                  releaseType: item.releaseType,
                  seeders: item.seeders || 0,
                  leechers: item.leechers || 0,
                  poster: metadata?.poster,
                  metadataJson: metadata,
                });

                // Send notification
                await sendTelegramNotification({
                  id: 0,
                  ...item,
                  provider: provider.name,
                  poster: metadata?.poster || null,
                  metadataJson: metadata,
                  createdAt: new Date().toISOString()
                });
                notificationsCount++;
              } catch (e: any) {
                if (e.code === '23505') { // Unique constraint violation
                  if (activeSettings.debugMode === 1) await logWarning(`Duplicate release ignored: ${item.title}`, 'Scanner');
                } else {
                  await logError(`Failed to insert release: ${e.message}`, 'Database');
                }
              }
            } else {
               if (activeSettings.debugMode === 1) await logWarning(`Duplicate release ignored: ${item.title} (${item.releaseType})`, 'Scanner');
            }
          }
        }
        
        await logSuccess(`Matching watchlist:\n${matchingCount}`, 'Scanner');
        await logSuccess(`Notifications sent:\n${notificationsCount}`, 'Scanner');
        
        await logInfo(`Provider scan completed: ${provider.name}`, 'Provider');
      } catch (error: any) {
        console.error(`Error scanning provider ${provider.name}:`, error);
        await logError(`Provider connection failed: ${provider.name}`, 'Provider', { error: error.message });
      }
    }
  } catch (error: any) {
    console.error('Error during runScan execution:', error);
    await logError(`Error during runScan execution: ${error.message}`, 'Scanner');
  } finally {
    isScanning = false;
  }
  
  console.log('Provider scan finished.');
}
