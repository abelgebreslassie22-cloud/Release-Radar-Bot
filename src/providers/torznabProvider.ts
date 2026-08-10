import Parser from 'rss-parser';
import { Provider, ReleaseItem } from '../types';
import { generateSearchQueries } from '../utils/mediaGrouper';

export class TorznabProvider implements Provider {
  name = 'Torznab';
  url: string;
  parser: Parser;

  constructor(url: string) {
    this.url = url;
    this.parser = new Parser({
      customFields: {
        item: [
          ['torznab:attr', 'torznabAttr', {keepArray: true}],
        ]
      }
    });
  }

  async initialize() {
    console.log(`TorznabProvider initialized with URL: ${this.url}`);
  }

  async scan(watchlistItems?: { title: string; year: number; type: string }[]): Promise<ReleaseItem[]> {
    if (!this.url) return [];
    
    const items: ReleaseItem[] = [];
    const processedIds = new Set<string>();

    const queries: string[] = ['']; // Empty query to get latest

    if (watchlistItems && watchlistItems.length > 0) {
      watchlistItems.forEach(w => {
        if (w.title) {
          const generated = generateSearchQueries(w.title, w.type);
          generated.forEach(q => queries.push(q));
        }
      });
    }

    // Determine the base url and query param separator
    const sep = this.url.includes('?') ? '&' : '?';

    for (const q of queries) {
      try {
        const searchUrl = `${this.url}${sep}t=search&q=${encodeURIComponent(q)}`;
        const feed = await this.parser.parseURL(searchUrl);
        
        for (const item of feed.items) {
          if (!item.title) continue;
          
          const rawTitle = item.title;
          const guid = item.guid || item.link || rawTitle;
          
          if (processedIds.has(guid)) continue;
          processedIds.add(guid);

          // Parse year
          const yearMatch = rawTitle.match(/\b(19\d\d|20\d\d)\b/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

          // Format title
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
          if (/[sS]\d+[eE]\d+/i.test(rawTitle) || /season/i.test(rawTitle)) {
            type = 'Series';
          }

          // Parse torznab attributes for seeders/leechers if available
          let seeders = 0;
          let leechers = 0;
          
          if (item.torznabAttr && Array.isArray(item.torznabAttr)) {
            item.torznabAttr.forEach((attr: any) => {
              if (attr.$ && attr.$.name === 'seeders') seeders = parseInt(attr.$.value || '0', 10);
              if (attr.$ && attr.$.name === 'peers') leechers = parseInt(attr.$.value || '0', 10) - seeders;
            });
          }

          items.push({
            title,
            year,
            type,
            releaseType,
            seeders,
            leechers: leechers > 0 ? leechers : 0,
            sourceUrl: item.link || this.url,
          });
        }
      } catch (e: any) {
        console.warn(`Torznab fetch failed for query "${q}":`, e.message);
      }
    }

    return items;
  }
}
