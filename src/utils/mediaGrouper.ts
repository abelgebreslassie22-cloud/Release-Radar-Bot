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

export function normalizeMediaTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let title = rawTitle;

  // Trim trailing brackets, dashes, dots, spaces
  title = title.replace(/[\(\[\{:\-_.\s]+$/g, '').trim();

  // Strip known collection, book format, audio tags from title
  title = title
    .replace(/\b(by\s+[\w\s]+)?(epub|azw3|mobi|pdf|audiobook)\b/gi, '')
    .replace(/\b1,\s*2,?\s*3,?\s*4(\s*Collection)?\b/gi, '')
    .replace(/\b(Collection|Tetralogy|Quadrilogy|Trilogy|Anthology)\b/gi, '')
    .replace(/\b1\s+4\b/g, '')
    .replace(/\(BDrip.*?\)/gi, '')
    .replace(/\b(x264|x265|bluray|brrip|dvdrip|web-dl|hdrip|webrip)\b/gi, '')
    // Strip TV season/episode identifiers (e.g., S01E01, S01, E01, Season 1, Episode 1)
    .replace(/\bS\d{1,2}E\d{1,2}\b/gi, '')
    .replace(/\bS\d{1,2}\b/gi, '')
    .replace(/\bE\d{1,2}\b/gi, '')
    .replace(/\bSeason\s*\d+\b/gi, '')
    .replace(/\bEpisode\s*\d+\b/gi, '')
    // Strip resolution
    .replace(/\b(4k|2160p|1080p|720p|480p)\b/gi, '')
    .replace(/[\(\[\{:\-_.\s]+$/g, '')
    .replace(/^[\(\[\{:\-_.\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return title || rawTitle;
}

export function getGroupKey(title: string, type: string): string {
  const canonicalTitle = normalizeMediaTitle(title);
  const cleanTitleKey = canonicalTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  const typeKey = (type || 'movie').toLowerCase();
  return `${cleanTitleKey}_${typeKey}`;
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
    
    // Key based on cleaned title and type
    const cleanTitleKey = canonicalTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const typeKey = (rel.type || 'movie').toLowerCase();
    
    // Group key
    const groupKey = `${cleanTitleKey}_${typeKey}`;

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
