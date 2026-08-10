import { Provider, ReleaseItem } from '../types';
import { generateSearchQueries, cleanReleaseTitle } from '../utils/mediaGrouper';

export class PirateBayProvider implements Provider {
  name = 'The Pirate Bay';

  async initialize() {
    console.log('PirateBayProvider initialized.');
  }

  async scan(watchlistItems?: { title: string; year: number; type: string }[]): Promise<ReleaseItem[]> {
    const items: ReleaseItem[] = [];
    const processedIds = new Set<string>();

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
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          console.warn(`PirateBay fetch failed with status: ${res.status} for ${url}`);
          return;
        }
        const data = await res.json();

        if (!Array.isArray(data)) return;

        for (const torrent of data) {
          if (!torrent.id || torrent.id === '0' || torrent.name === 'No results found') continue;
          if (processedIds.has(torrent.id)) continue;
          
          // Only process video categories
          const cat = parseInt(torrent.category, 10);
          if (!(cat >= 201 && cat <= 212 && cat !== 206)) continue;
          
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
      } catch (e) {
        console.warn(`PirateBay fetch failed for "${url}":`, e);
      }
    }));

    return items;
  }
}

