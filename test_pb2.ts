import { db } from './src/database/db';
import { releases } from './src/database/schema';
import { eq } from 'drizzle-orm';

async function test() {
  const rs = await db.select().from(releases).where(eq(releases.title, "My Adventures with Superman S03E09 1080p HEVC x265-MeGusta"));
  console.log(rs);
}
test().catch(console.error);
