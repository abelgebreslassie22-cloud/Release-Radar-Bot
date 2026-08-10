const fs = require('fs');
let content = fs.readFileSync('src/utils/mediaGrouper.ts', 'utf8');

const newFunctions = `
export function getStandardizedMatchKey(title: string): string {
  let t = title.toLowerCase();
  t = t.replace(/season\\s*0*(\\d+)\\s*episode\\s*0*(\\d+)/gi, 's$1e$2');
  t = t.replace(/season\\s*0*(\\d+)/gi, 's$1');
  t = t.replace(/episode\\s*0*(\\d+)/gi, 'e$1');
  t = t.replace(/s0*(\\d+)\\s*e0*(\\d+)/gi, 's$1e$2');
  t = t.replace(/s0*(\\d+)(?!e)/gi, 's$1');
  
  t = t.replace(/s(\\d+)e(\\d+)/g, (m, s, e) => \`s\${s.padStart(2,'0')}e\${e.padStart(2,'0')}\`);
  t = t.replace(/s(\\d+)(?!e)/g, (m, s) => \`s\${s.padStart(2,'0')}\`);
  t = t.replace(/(?<!s\\d{2})e(\\d+)/g, (m, e) => \`e\${e.padStart(2,'0')}\`);
  
  return t.replace(/[^a-z0-9]/g, '');
}

export function generateSearchQueries(title: string): string[] {
  const queries = new Set<string>();
  
  const rawTitle = title.trim();
  queries.add(rawTitle);
  
  const titleWithoutYear = rawTitle.replace(/\\b(19\\d\\d|20\\d\\d)\\b/, '').trim();
  if (titleWithoutYear && titleWithoutYear !== rawTitle) {
    queries.add(titleWithoutYear);
  }
  
  const tvMatch = rawTitle.match(/^(.*?)\\b(?:S\\d{1,2}E\\d{1,2}|S\\d{1,2}|Season\\s*\\d+\\s*Episode\\s*\\d+|Season\\s*\\d+|Episode\\s*\\d+)\\b/i);
  
  if (tvMatch && tvMatch[1].trim()) {
    const base = tvMatch[1].trim();
    let remainder = rawTitle.substring(base.length);
    
    remainder = remainder.replace(/season\\s*0*(\\d+)\\s*episode\\s*0*(\\d+)/gi, 's$1e$2');
    remainder = remainder.replace(/season\\s*0*(\\d+)/gi, 's$1');
    remainder = remainder.replace(/episode\\s*0*(\\d+)/gi, 'e$1');
    remainder = remainder.replace(/s0*(\\d+)\\s*e0*(\\d+)/gi, 's$1e$2');
    remainder = remainder.replace(/s0*(\\d+)(?!e)/gi, 's$1');
    
    remainder = remainder.replace(/s(\\d+)e(\\d+)/gi, (m, s, e) => \`S\${s.padStart(2,'0')}E\${e.padStart(2,'0')}\`);
    remainder = remainder.replace(/s(\\d+)(?!e)/gi, (m, s) => \`S\${s.padStart(2,'0')}\`);
    
    const stdMatch = remainder.match(/\\b(S\\d{2}E\\d{2}|S\\d{2})\\b/);
    if (stdMatch) {
        queries.add(\`\${base} \${stdMatch[1]}\`);
    }
  }
  
  return Array.from(queries);
}
`;

content = content + '\n' + newFunctions;
fs.writeFileSync('src/utils/mediaGrouper.ts', content);
