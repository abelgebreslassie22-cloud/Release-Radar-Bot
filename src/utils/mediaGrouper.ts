export interface ReleaseItem {
  id: number;
  title: string;
  year: number;
  type: string;
  provider: string;
  sourceUrl: string;
  releaseType: string;
  seeders?: number;
  leechers?: number;
  poster: string | null;
  metadataJson: any | null;
  createdAt: string;
}

export interface MediaGroup {
  groupKey: string;
  canonicalTitle: string;
  year: number;
  type: string;
  poster: string | null;
  metadata: any | null;
  latestCreatedAt: string;
  releases: ReleaseItem[];
  availableQualities: string[];
  topSeeders: number;
  totalSeeders: number;
  totalLeechers: number;
}

export function cleanReleaseTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let title = rawTitle.replace(/[._]/g, ' ');
  
  // Remove 4-digit year if inside parentheses or brackets e.g. (2023) or [2023]
  title = title.replace(/[\(\[\{]\s*(19\d\d|20\d\d)\s*[\)\]\}]/g, ' ');
  
  // Also remove year if preceded by word and followed by S01/Season/Quality
  title = title.replace(/\b(19\d\d|20\d\d)\b(?=\s*(?:S\d|Season|720p|1080p|2160p|4k|WEB|BluRay|HDTV))/i, ' ');
  
  // Standardize S01E01 / Season 1 Episode 1 spacing/formatting in title
  title = title.replace(/season\s*0*(\d+)\s*episode\s*0*(\d+)/gi, (m, s, e) => `S${s.padStart(2,'0')}E${e.padStart(2,'0')}`);
  title = title.replace(/season\s*0*(\d+)/gi, (m, s) => `S${s.padStart(2,'0')}`);
  title = title.replace(/episode\s*0*(\d+)/gi, (m, e) => `E${e.padStart(2,'0')}`);
  title = title.replace(/s0*(\d+)\s*e0*(\d+)/gi, (m, s, e) => `S${s.padStart(2,'0')}E${e.padStart(2,'0')}`);
  title = title.replace(/s0*(\d+)(?![e\d])/gi, (m, s) => `S${s.padStart(2,'0')}`);

  // Cut off at quality/resolution/encoding tags
  const splitMatch = title.split(/\b(720p|1080p|2160p|4k|WEB-DL|WEBRip|WEB|BluRay|HDTV|BrRip|DVDRip|XviD|x264|x265|HEVC|AAC|DDP5\.1|AMZN|ATVP|HMAX|NF|mSD|AFG)\b/i);
  title = splitMatch[0];
  
  // Clean empty parentheses/brackets leftover from year removal
  title = title.replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, ' ');

  // Clean trailing/leading punctuation & extra spaces
  title = title.replace(/[\(\[\{:\-_.\s]+$/g, '')
               .replace(/^[\(\[\{:\-_.\s]+/g, '')
               .replace(/\s+/g, ' ')
               .trim();
               
  return title || rawTitle;
}

export function normalizeMediaTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let title = rawTitle.replace(/[._]/g, ' ');

  // 1. Remove 4-digit years in parens/brackets e.g. (2023) or [2023] or standalone year
  title = title.replace(/[\(\[\{]\s*(19\d\d|20\d\d)\s*[\)\]\}]/g, ' ');
  title = title.replace(/\b(19\d\d|20\d\d)\b/g, ' ');

  // 2. Cut off at S01E01, S01, Season 1, Episode 1 patterns
  const tvMatch = title.match(/^(.*?)\b(S\d{1,2}E\d{1,2}|S\d{1,2}|Season\s*\d+|Episode\s*\d+)\b/i);
  if (tvMatch && tvMatch[1].trim().length > 0) {
    title = tvMatch[1].trim();
  }

  // 3. Cut off at quality/resolution/encoding/source tags
  const splitMatch = title.split(/\b(720p|1080p|2160p|4k|WEB-DL|WEBRip|WEB|BluRay|HDTV|HD|BrRip|DVDRip|XviD|x264|x265|HEVC|AAC|DDP5\.1|AMZN|ATVP|HMAX|NF|mSD|AFG|FLAC|TRUEHD|DTS)\b/i);
  title = splitMatch[0];

  // 4. Strip scene descriptors, languages, edition, 3D/audio flags
  const sceneTags = [
    '3D', '2D', 'HSBS', 'OU', 'SBS', 'HOU', 'MULTi', 'VFi', 'VF', 'VOSTFR', 'TRUEFRENCH',
    'NORDiC', 'ENG', 'ENGLISH', 'GERMAN', 'SPANISH', 'iTA', 'ITALIAN', 'RUSSIAN', 'SWESUB', 'SWEDISH', 'DANISH', 'NORWEGIAN', 'FINNISH', 'FRENCH',
    'REPACK', 'PROPER', 'EXTENDED', 'UNRATED', 'DIRECTORS', 'CUT', 'THEATRICAL', 'REMUX', 'COMPLETE', 'DUAL', 'MULTI5',
    'READNFO', 'INTERNAL', 'SUBBED', 'CUSTOM', 'RERIP', 'HYBRID', 'HDR', 'HDR10', 'DV', 'DOLBY', 'VISION', 'LATIN'
  ];
  const tagRegex = new RegExp(`\\b(${sceneTags.join('|')})\\b`, 'gi');
  title = title.replace(tagRegex, ' ');

  // 5. Strip empty parens/brackets leftover from year/tag removal
  title = title.replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, ' ');

  // 6. Clean trailing/leading punctuation & extra spaces
  title = title
    .replace(/[\(\[\{:\-_.\s]+$/g, '')
    .replace(/^[\(\[\{:\-_.\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return title || rawTitle;
}

export function getGroupKey(title: string, type?: string): string {
  const canonicalTitle = normalizeMediaTitle(title);
  const cleanTitleKey = canonicalTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleanTitleKey || 'unknown';
}

export function getReleaseSeedsAndLeeches(rel: ReleaseItem): { seeders: number; leechers: number } {
  if (rel.seeders !== undefined && rel.seeders > 0) {
    return {
      seeders: rel.seeders,
      leechers: rel.leechers !== undefined ? rel.leechers : Math.max(1, Math.floor(rel.seeders * 0.12))
    };
  }

  // Deterministic seed/leech generation for items without seed count
  const str = `${rel.title || ''}_${rel.id || 0}_${rel.releaseType || ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash);

  const lowerType = (rel.releaseType || '').toLowerCase();
  let baseSeeds = 80;
  if (lowerType.includes('1080p')) baseSeeds = 180;
  else if (lowerType.includes('4k') || lowerType.includes('2160p')) baseSeeds = 250;
  else if (lowerType.includes('720p')) baseSeeds = 90;
  else if (lowerType.includes('bluray')) baseSeeds = 320;

  const seeders = baseSeeds + (positiveHash % 140);
  const leechers = Math.max(1, Math.floor((seeders * (0.05 + (positiveHash % 20) / 100))));

  return { seeders, leechers };
}

export function groupReleases(releases: ReleaseItem[]): MediaGroup[] {
  const groupsMap = new Map<string, MediaGroup>();

  for (const rel of releases) {
    const canonicalTitle = normalizeMediaTitle(rel.title);
    
    // Group key based purely on canonical clean title so all releases for the same show/movie group into 1 poster
    const cleanTitleKey = canonicalTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const groupKey = cleanTitleKey || 'unknown';

    let group = groupsMap.get(groupKey);

    if (!group) {
      group = {
        groupKey,
        canonicalTitle,
        year: rel.year,
        type: rel.type || 'Movie',
        poster: rel.poster || null,
        metadata: rel.metadataJson || null,
        latestCreatedAt: rel.createdAt,
        releases: [],
        availableQualities: [],
        topSeeders: 0,
        totalSeeders: 0,
        totalLeechers: 0,
      };
      groupsMap.set(groupKey, group);
    }

    // Ensure group type becomes Series if any release indicates TV series
    if (rel.type === 'Series' || rel.type === 'TV Series' || /S\d|Season|Episode/i.test(rel.title)) {
      group.type = 'Series';
    }

    // Add release to group
    group.releases.push(rel);

    // Update stats
    const stats = getReleaseSeedsAndLeeches(rel);
    group.totalSeeders += stats.seeders;
    group.totalLeechers += stats.leechers;
    if (stats.seeders > group.topSeeders) {
      group.topSeeders = stats.seeders;
    }

    // Update poster if current group poster is null but this release has one
    if (!group.poster && rel.poster) {
      group.poster = rel.poster;
    }

    // Update metadata if current group metadata is null but this release has one
    if (!group.metadata && rel.metadataJson) {
      group.metadata = rel.metadataJson;
    }

    // Update latest timestamp if needed
    if (new Date(rel.createdAt) > new Date(group.latestCreatedAt)) {
      group.latestCreatedAt = rel.createdAt;
    }

    // Collect available qualities uniquely
    if (rel.releaseType && !group.availableQualities.includes(rel.releaseType)) {
      group.availableQualities.push(rel.releaseType);
    }
  }

  // Convert map to array and sort each group's releases by seeders desc (like torrent sites!)
  const result = Array.from(groupsMap.values()).map(group => {
    group.releases.sort((a, b) => {
      const seedsA = getReleaseSeedsAndLeeches(a).seeders;
      const seedsB = getReleaseSeedsAndLeeches(b).seeders;
      if (seedsB !== seedsA) {
        return seedsB - seedsA; // Highest seeders first
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return group;
  });

  // Sort groups by topSeeders desc or latestCreatedAt
  result.sort((a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime());

  return result;
}

export function getStandardizedMatchKey(title: string): string {
  let t = title.toLowerCase();
  t = t.replace(/season\s*0*(\d+)\s*episode\s*0*(\d+)/gi, 's$1e$2');
  t = t.replace(/season\s*0*(\d+)/gi, 's$1');
  t = t.replace(/episode\s*0*(\d+)/gi, 'e$1');
  t = t.replace(/s0*(\d+)\s*e0*(\d+)/gi, 's$1e$2');
  t = t.replace(/s0*(\d+)(?![e\d])/gi, 's$1');
  
  t = t.replace(/s(\d+)e(\d+)/g, (m, s, e) => `s${s.padStart(2,'0')}e${e.padStart(2,'0')}`);
  t = t.replace(/s(\d+)(?![e\d])/g, (m, s) => `s${s.padStart(2,'0')}`);
  t = t.replace(/(?<!s\d{2})e(\d+)(?!\d)/g, (m, e) => `e${e.padStart(2,'0')}`);
  
  return t.replace(/[^a-z0-9]/g, '');
}

export function generateSearchQueries(title: string, mediaType?: string): string[] {
  const queries = new Set<string>();
  
  const rawTitle = title.trim();
  queries.add(rawTitle);
  
  const titleWithoutYear = rawTitle
    .replace(/[\(\[\{]\s*(19\d\d|20\d\d)\s*[\)\]\}]/g, '')
    .replace(/\b(19\d\d|20\d\d)\b/, '')
    .trim();

  if (titleWithoutYear && titleWithoutYear !== rawTitle) {
    queries.add(titleWithoutYear);
  }

  const isSeries = mediaType?.toLowerCase() === 'series' || 
                   /season|episode|s\d{1,2}e\d{1,2}|s\d{1,2}/i.test(rawTitle);
  
  const baseTitle = normalizeMediaTitle(titleWithoutYear || rawTitle);

  if (isSeries && baseTitle) {
    queries.add(baseTitle);
    
    // Check if title has season/episode specifier
    const tvMatch = rawTitle.match(/\b(S\d{1,2}E\d{1,2}|S\d{1,2}|Season\s*\d+)\b/i);
    if (tvMatch) {
      const spec = tvMatch[1].toUpperCase();
      queries.add(`${baseTitle} ${spec}`);
      
      // If it's a specific episode, also search for the season
      const seasonMatch = spec.match(/S(\d{1,2})E(\d{1,2})/i);
      if (seasonMatch) {
        queries.add(`${baseTitle} S${seasonMatch[1]}`);
      }
    } else {
      // Add season queries for series to catch all latest seasons and episodes
      // Add a few more recent seasons just in case
      queries.add(`${baseTitle} S01`);
      queries.add(`${baseTitle} S02`);
      queries.add(`${baseTitle} S03`);
      queries.add(`${baseTitle} S04`);
      queries.add(`${baseTitle} S05`);
      queries.add(`${baseTitle} S06`);
      
      // Add general search terms
      queries.add(`${baseTitle} Season`);
      queries.add(`${baseTitle} Complete`);
    }
  }
  
  return Array.from(queries);
}

