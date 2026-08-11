import { Provider, ReleaseItem } from '../types';
import { generateSearchQueries } from '../utils/mediaGrouper';
import { logInfo, logWarning, logError } from '../services/logger';

export class PirateBayProvider implements Provider {
  name = 'The Pirate Bay';

  async initialize() {
    console.log('PirateBayProvider initialized.');
  }

  private parseTorrentData(data: any[], processedIds: Set<string>, items: ReleaseItem[]) {
    if (!Array.isArray(data)) return;

    for (const torrent of data) {
      if (!torrent.id || torrent.id === '0' || torrent.name === 'No results found') continue;
      if (processedIds.has(torrent.id)) continue;
      
      // Allow video categories (200-299 except 206 porn) or missing category
      const cat = parseInt(torrent.category || '0', 10);
      if (cat !== 0 && !(cat >= 200 && cat <= 299 && cat !== 206)) continue;
      
      processedIds.add(torrent.id);

      const rawTitle: string = torrent.name || '';
      
      // Parse year
      const yearMatch = rawTitle.match(/\b(19\d\d|20\d\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

      // Format title with spaces instead of dots
      const title = rawTitle.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim() || rawTitle;

      // Determine quality
      let releaseType = 'WEB-DL';
      if (/2160p|4k/i.test(rawTitle)) releaseType = '4K WEB-DL';
      else if (/1080p/i.test(rawTitle)) releaseType = '1080p WEB-DL';
      else if (/720p/i.test(rawTitle)) releaseType = '720p HD';
      else if (/BluRay/i.test(rawTitle)) releaseType = 'BluRay';
      else if (/HDTV/i.test(rawTitle)) releaseType = 'HDTV';

      // Determine type
      let type = 'Movie';
      if (/[sS]\d+[eE]\d+/i.test(rawTitle) || /season|complete/i.test(rawTitle) || cat === 205 || cat === 208 || cat === 212) {
        type = 'Series';
      }

      // Parse seeders and leechers
      const seeders = parseInt(torrent.seeders || '0', 10);
      const leechers = parseInt(torrent.leechers || '0', 10);

      items.push({
        title,
        year,
        type,
        releaseType,
        seeders,
        leechers,
        sourceUrl: `https://thepiratebay.org/description.php?id=${torrent.id}`
      });
    }
  }

  async scan(watchlistItems?: { title: string; year: number; type: string }[]): Promise<ReleaseItem[]> {
    const items: ReleaseItem[] = [];
    const processedIds = new Set<string>();

    // 1. WATCHLIST PRIORITY: Query PirateBay specifically for each watchlist item
    if (watchlistItems && watchlistItems.length > 0) {
      await logInfo(`PirateBay: Searching queries for ${watchlistItems.length} watchlist item(s)...`, 'PirateBay');
      const watchlistQueries = new Set<string>();
      watchlistItems.forEach(w => {
        if (w.title) {
          const generated = generateSearchQueries(w.title, w.type);
          generated.forEach(q => watchlistQueries.add(q));
        }
      });

      const queries = Array.from(watchlistQueries);
      const BATCH_SIZE = 3;

      for (let i = 0; i < queries.length; i += BATCH_SIZE) {
        const batch = queries.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (q) => {
          let fetched = false;
          const urls = [
            `https://apibay.org/q.php?q=${encodeURIComponent(q)}`,
            `https://bayapi.xyz/q.php?q=${encodeURIComponent(q)}`
          ];

          for (const url of urls) {
            if (fetched) break;
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000);

              const res = await fetch(url, { 
                signal: controller.signal,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
              });
              clearTimeout(timeoutId);

              if (!res.ok) continue;
              const data = await res.json();
              if (Array.isArray(data)) {
                this.parseTorrentData(data, processedIds, items);
                fetched = true;
              }
            } catch (e: any) {
              console.warn(`PirateBay watchlist fetch failed for query "${q}" at ${url}:`, e?.message || e);
            }
          }
        }));
      }
      await logInfo(`PirateBay watchlist search finished. Items found so far: ${items.length}`, 'PirateBay');
    }

    // 2. Fetch top100 precompiled endpoints to discover general recent releases
    const endpoints = [
      'https://apibay.org/precompiled/data_top100_recent.json',
      'https://apibay.org/precompiled/data_top100_201.json',
      'https://apibay.org/precompiled/data_top100_205.json',
      'https://apibay.org/precompiled/data_top100_207.json',
      'https://apibay.org/precompiled/data_top100_208.json',
      'https://apibay.org/precompiled/data_top100_211.json',
      'https://apibay.org/precompiled/data_top100_212.json'
    ];

    await Promise.all(endpoints.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        clearTimeout(timeoutId);

        if (!res.ok) return;
        const data = await res.json();
        this.parseTorrentData(data, processedIds, items);
      } catch (e: any) {
        console.warn(`PirateBay fetch failed for "${url}":`, e?.message || e);
      }
    }));

    await logInfo(`PirateBay total releases parsed: ${items.length}`, 'PirateBay');
    return items;
  }
}


