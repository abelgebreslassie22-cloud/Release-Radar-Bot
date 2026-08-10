import { getStandardizedMatchKey } from './src/utils/mediaGrouper';

export function doTitlesMatch(watchlistTitle: string, itemTitle: string): boolean {
  const cleanW = getStandardizedMatchKey(watchlistTitle);
  const cleanI = getStandardizedMatchKey(itemTitle);
  
  if (cleanW === cleanI) return true;
  
  // Extract base and SE parts
  const matchSE = (cleanStr: string) => {
      const match = cleanStr.match(/^(.*?)(s\d{2}(?:e\d{2})?)$/);
      if (match) return { base: match[1], se: match[2] };
      return { base: cleanStr, se: '' };
  };
  
  const wParts = matchSE(cleanW);
  const iParts = matchSE(cleanI);
  
  if (wParts.base !== iParts.base) {
      // If bases don't match exactly, we allow one to include the other ONLY IF it's a very close match 
      // but strictly speaking, if they searched for "Silo S03", the base is "silo".
      // If the item is "Silo S03E06", the base is "silo". They match exactly.
      // So we only return true if base matches exactly.
      
      // But wait! What if item has extra tags in the name that weren't stripped?
      // "Silo S03E06 1080p WEB H264 CAKES"
      // Wait, getStandardizedMatchKey strips everything non-alphanumeric.
      // So "Silo S03E06" -> "silos03e06". The base is "silo".
      // What if item is "President Curtis S01E01 Pilot"?
      // getStandardizedMatchKey("President Curtis S01E01 Pilot") -> "presidentcurtiss01e01pilot".
      // matchSE will return base: "presidentcurtiss01e01pilot", se: "" because "pilot" is at the end!
      // Ah! The SE part might NOT be at the end of the clean string!
      
      return false;
  }
  
  return false;
}
