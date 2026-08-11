import { db } from '../database/db';
import { watchlist, releases, settings } from '../database/schema';
import { fetchMetadata } from '../metadata/tmdb';
import { sendTelegramNotification } from '../telegram/bot';
import { and, eq } from 'drizzle-orm';
import { logInfo, logError, logWarning, logSuccess, logDebug } from './logger';
import { Provider } from '../types';
import { getStandardizedMatchKey, normalizeMediaTitle } from '../utils/mediaGrouper';
import { generateCustomPoster } from '../utils/posterGenerator';

let isScanning = false;

export function isWatchlistMatch(
  release: { title: string; year: number; type: string },
  watchlistItems: { title: string; year: number; type: string }[]
): boolean {
  if (!watchlistItems || watchlistItems.length === 0) return false;

  return watchlistItems.some((w) => {
    const isSeries = w.type?.toLowerCase() === 'series' || release.type?.toLowerCase() === 'series';

    // Base titles without quality/tags/seasons
    const normWBase = normalizeMediaTitle(w.title).toLowerCase().replace(/[^a-z0-9]/g, '');
    const normIBase = normalizeMediaTitle(release.title).toLowerCase().replace(/[^a-z0-9]/g, '');

    const normWKey = getStandardizedMatchKey(w.title);
    const normIKey = getStandardizedMatchKey(release.title);

    let titleMatches = false;

    if (normWBase && normIBase) {
      if (normWBase === normIBase || normIBase.startsWith(normWBase) || normWBase.startsWith(normIBase)) {
        titleMatches = true;
      }
    }
    if (!titleMatches) {
      if (normWKey === normIKey || normIKey.includes(normWKey) || normWKey.includes(normIKey)) {
        titleMatches = true;
      }
    }

    if (!titleMatches) return false;

    // Year matching: TV series span multiple years across seasons; ignore strict year check for series
    const yearMatches = isSeries || Math.abs(w.year - release.year) <= 2;

    return yearMatches;
  });
}

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
    } else if (activeSettings.providerType === 'TORZNAB' && activeSettings.providerUrl) {
      const { TorznabProvider } = await import('../providers/torznabProvider');
      providers.push(new TorznabProvider(activeSettings.providerUrl));
    } else if (activeSettings.providerType === 'RSS' && activeSettings.providerUrl) {
      const { RSSProvider } = await import('../providers/rssProvider');
      providers.push(new RSSProvider(activeSettings.providerUrl));
    } else {
      // Default fallback to PirateBayProvider for PIRATEBAY, NONE, or unset
      const { PirateBayProvider } = await import('../providers/pirateBayProvider');
      providers.push(new PirateBayProvider());
    }

    const items = await db.select().from(watchlist);
    if (items.length === 0) {
      console.log('Watchlist is empty, but will fetch new releases from providers.');
      await logInfo('Watchlist is empty, but fetching new releases from providers.', 'Scanner');
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

        // Pre-fetch existing release identifiers for O(1) in-memory lookup
        const existingReleases = await db.select({
          title: releases.title,
          year: releases.year,
          provider: releases.provider,
          releaseType: releases.releaseType,
          sourceUrl: releases.sourceUrl
        }).from(releases);

        const isFirstRun = existingReleases.length === 0;

        const existingSet = new Set<string>();
        for (const r of existingReleases) {
          if (r.sourceUrl) existingSet.add(r.sourceUrl);
          existingSet.add(`${r.title}|${r.year}|${r.provider}|${r.releaseType}`);
        }

        const toInsert: any[] = [];
        const matchedNotifications: any[] = [];

        for (const item of foundItems) {
          const key = `${item.title}|${item.year}|${provider.name}|${item.releaseType}`;
          const isAlreadyStored = (item.sourceUrl && existingSet.has(item.sourceUrl)) || existingSet.has(key);

          if (!isAlreadyStored) {
            if (item.sourceUrl) existingSet.add(item.sourceUrl);
            existingSet.add(key); // prevent duplicate processing in same scan batch

            const baseTitle = normalizeMediaTitle(item.title);
            let metadata: any = await fetchMetadata(baseTitle, item.year, item.type);

            // Check if a poster exists for it; if not, create a new custom poster containing name, file name, and link!
            let posterUrl = metadata?.poster || null;
            if (!posterUrl) {
              posterUrl = generateCustomPoster({
                title: item.title,
                year: item.year,
                type: item.type,
                releaseType: item.releaseType,
                sourceUrl: item.sourceUrl,
                provider: provider.name,
              });
              if (!metadata) {
                metadata = {
                  poster: posterUrl,
                  overview: `Discovered from ${provider.name}. File: ${item.title}`,
                  sourceUrl: item.sourceUrl,
                };
              } else {
                metadata.poster = posterUrl;
              }
            }

            const isMatchedToWatchlist = isWatchlistMatch(item, items);

            if (isMatchedToWatchlist) {
              matchingCount++;
              await logSuccess(`Watchlist match found: ${item.title} (${item.year}) [${item.releaseType}]`, 'Matcher');

              if (!isFirstRun) {
                matchedNotifications.push({ item, metadata: { ...metadata, poster: posterUrl } });
              }
            } else {
              await logInfo(`Discovered release stored: ${item.title} (${item.year}) [${item.releaseType}]`, 'Scanner');
            }

            toInsert.push({
              title: item.title,
              year: item.year,
              type: item.type,
              provider: provider.name,
              sourceUrl: item.sourceUrl,
              releaseType: item.releaseType,
              seeders: item.seeders || 0,
              leechers: item.leechers || 0,
              poster: posterUrl,
              metadataJson: metadata || null,
            });
          } else {
            if (activeSettings.debugMode === 1) {
              await logDebug(`Skipping watched release: ${item.title} (${item.releaseType})`, 'Scanner');
            }
          }
        }

        // Batch insert new releases in chunks of 50
        const CHUNK_SIZE = 50;
        for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
          const chunk = toInsert.slice(i, i + CHUNK_SIZE);
          try {
            await db.insert(releases).values(chunk);
          } catch (e: any) {
            // Fallback to individual inserts if batch fails due to a unique constraint conflict
            for (const row of chunk) {
              try {
                await db.insert(releases).values(row);
              } catch (innerErr: any) {
                // ignore duplicate
              }
            }
          }
        }

        // Send notifications for matches
        for (const { item, metadata } of matchedNotifications) {
          try {
            await sendTelegramNotification({
              id: 0,
              ...item,
              provider: provider.name,
              poster: metadata?.poster || null,
              metadataJson: metadata,
              createdAt: new Date().toISOString()
            });
            notificationsCount++;
          } catch (notifErr: any) {
            await logError(`Failed to send notification: ${notifErr.message}`, 'Telegram');
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
