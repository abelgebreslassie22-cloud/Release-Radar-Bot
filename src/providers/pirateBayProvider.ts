import { Provider, ReleaseItem } from '../types';

export class PirateBayProvider implements Provider {
  name = 'The Pirate Bay';

  async initialize() {
    console.log('PirateBayProvider initialized.');
  }

  async scan(watchlistItems?: { title: string; year: number; type: string }[]): Promise<ReleaseItem[]> {
    const items: ReleaseItem[] = [];
    const processedIds = new Set<string>();

    const queries: string[] = [
      'top100:201', // Top Movies
      'top100:205'  // Top TV Shows
    ];

    if (watchlistItems && watchlistItems.length > 0) {
      watchlistItems.forEach(w => {
        if (w.title) {
          const rawTitle = w.title.trim();
          queries.push(rawTitle);
          // Also add title without trailing year if present (e.g. "Shrek 2001" -> "Shrek")
          const titleWithoutYear = rawTitle.replace(/\b(19\d\d|20\d\d)\b/, '').trim();
          if (titleWithoutYear && titleWithoutYear !== rawTitle) {
            queries.push(titleWithoutYear);
          }
        }
      });
    }

    for (const q of queries) {
      try {
        const url = `https://apibay.org/q.php?q=${encodeURIComponent(q)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const data = await res.json();

        if (!Array.isArray(data)) continue;

        for (const torrent of data) {
          if (!torrent.id || torrent.id === '0' || torrent.name === 'No results found') continue;
          if (processedIds.has(torrent.id)) continue;
          processedIds.add(torrent.id);

          const rawTitle: string = torrent.name || '';
          
          // Parse year
          const yearMatch = rawTitle.match(/\b(19\d\d|20\d\d)\b/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

          // Clean title
          let title = rawTitle;
          if (yearMatch && yearMatch.index !== undefined && yearMatch.index > 0) {
            title = rawTitle.substring(0, yearMatch.index).trim();
          } else {
            title = rawTitle.split(/720p|1080p|2160p|4k|WEB-DL|WEBRip|BluRay|HDTV|BrRip|DVDRip/i)[0].trim();
          }

          title = title.replace(/[._-]/g, ' ')
                       .replace(/[\(\[\{:\-_.\s]+$/g, '')
                       .replace(/^[\(\[\{:\-_.\s]+/g, '')
                       .replace(/\s+/g, ' ')
                       .trim();

          // Determine quality
          let releaseType = 'WEB-DL';
          if (/2160p|4k/i.test(rawTitle)) releaseType = '4K WEB-DL';
          else if (/1080p/i.test(rawTitle)) releaseType = '1080p WEB-DL';
          else if (/720p/i.test(rawTitle)) releaseType = '720p HD';
          else if (/BluRay/i.test(rawTitle)) releaseType = 'BluRay';
          else if (/HDTV/i.test(rawTitle)) releaseType = 'HDTV';

          // Determine type
          let type = 'Movie';
          if (/[sS]\d+[eE]\d+/i.test(rawTitle) || /season/i.test(rawTitle) || torrent.category === '205') {
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
        console.warn(`PirateBay fetch failed for "${q}":`, e);
      }
    }

    return items;
  }
}

