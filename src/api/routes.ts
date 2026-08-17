import { Express, Request, Response } from 'express';
import { db } from '../database/db';
import { watchlist, releases } from '../database/schema';
import { getSettings, updateSettings } from '../services/settings';
import { restartScheduler } from '../scheduler/cron';
import { eq, desc, count, inArray } from 'drizzle-orm';

export function setupRoutes(app: Express) {
  // Health check for Render
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });

  // Watchlist
  app.get('/api/watchlist', async (req: Request, res: Response) => {
    try {
      const items = await db.select().from(watchlist).orderBy(desc(watchlist.createdAt));
      res.json(items);
    } catch (e: any) { 
      res.json([]); 
    }
  });

  app.post('/api/watchlist', async (req: Request, res: Response) => {
    try {
      const { title, year, type } = req.body;
      const parsedYear = Number(year);
      if (!title || !parsedYear || isNaN(parsedYear) || !type) {
        return res.status(400).json({ error: 'Missing or invalid required fields: title, year, type' });
      }
      await db.insert(watchlist).values({ title, year: parsedYear, type });
      res.status(201).json({ success: true });
    } catch (e: any) { 
      if (e.code === '23505' || e.message?.includes('unique') || e.message?.includes('duplicate')) {
        return res.status(400).json({ error: 'This item (Title, Year, and Type) is already in your watchlist.' });
      }
      res.status(500).json({ error: e.message || 'Failed to add item.' }); 
    }
  });

  app.put('/api/watchlist/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      
      const { title, year, type } = req.body;
      const parsedYear = Number(year);
      if (!title || !parsedYear || isNaN(parsedYear) || !type) {
        return res.status(400).json({ error: 'Missing or invalid required fields: title, year, type' });
      }
      
      await db.update(watchlist)
        .set({ title, year: parsedYear, type, updatedAt: new Date() })
        .where(eq(watchlist.id, id));
      res.json({ success: true });
    } catch (e: any) { 
      if (e.code === '23505' || e.message?.includes('unique') || e.message?.includes('duplicate')) {
        return res.status(400).json({ error: 'This item (Title, Year, and Type) is already in your watchlist.' });
      }
      res.status(500).json({ error: e.message || 'Failed to update item' }); 
    }
  });

  app.delete('/api/watchlist/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      await db.delete(watchlist).where(eq(watchlist.id, id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message || 'Failed to delete item' }); }
  });

  // Releases
  app.get('/api/releases', async (req: Request, res: Response) => {
    try {
      const items = await db.select().from(releases).orderBy(desc(releases.createdAt));
      res.json(items);
    } catch (e: any) { res.json([]); }
  });

  app.delete('/api/releases/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid release ID' });
      await db.delete(releases).where(eq(releases.id, id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to delete release' });
    }
  });

  app.post('/api/releases/delete-batch', async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Array of release IDs is required' });
      }
      const numIds = ids.map(id => Number(id)).filter(id => !isNaN(id));
      if (numIds.length === 0) {
        return res.status(400).json({ error: 'No valid release IDs provided' });
      }
      await db.delete(releases).where(inArray(releases.id, numIds));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to delete releases' });
    }
  });

  // Settings
  app.get('/api/settings', async (req: Request, res: Response) => {
    try {
      const settings = await getSettings();
      res.json(settings || {});
    } catch (e: any) { res.json({}); }
  });

  app.post('/api/scan', async (req: Request, res: Response) => {
    try {
      // Execute without waiting so it doesn't timeout the request
      import('../services/scanner').then(({ runScan }) => runScan().catch(e => console.error('Scan error:', e)));
      res.json({ success: true, message: 'Scan started in background' });
    } catch (e: any) { res.status(500).json({ error: e.message || 'Failed to start scan' }); }
  });

  app.put('/api/settings', async (req: Request, res: Response) => {
    try {
      const { scanInterval, telegramChatId, metadataApiKey, debugMode, providerType, providerUrl, appUrl } = req.body;
      
      if (scanInterval !== undefined && (typeof scanInterval !== 'number' || scanInterval < 1)) {
        return res.status(400).json({ error: 'Invalid scan interval' });
      }

      await updateSettings({ scanInterval, telegramChatId, metadataApiKey, debugMode, providerType, providerUrl, appUrl });
      
      if (scanInterval) {
        restartScheduler();
      }
      
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message || 'Failed to update settings' }); }
  });

  app.post('/api/telegram/test', async (req: Request, res: Response) => {
    try {
      const { sendTestTelegramNotification } = await import('../telegram/bot');
      const result = await sendTestTelegramNotification();
      if (result.success) {
        res.json({ success: true, message: 'Test message sent to Telegram with detail page link!' });
      } else {
        res.status(400).json({ error: result.error || 'Failed to send test message' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to send Telegram test message' });
    }
  });

  app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
    try {
      const { processTelegramUpdate } = await import('../telegram/bot');
      processTelegramUpdate(req.body);
      res.sendStatus(200);
    } catch (e: any) {
      console.error('Webhook error:', e);
      res.sendStatus(500);
    }
  });
  
  // Logs
  app.get('/api/logs', async (req: Request, res: Response) => {
    try {
      const { logs } = await import('../database/schema');
      const items = await db.select().from(logs).orderBy(desc(logs.createdAt)).limit(200);
      res.json(items);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  app.delete('/api/logs', async (req: Request, res: Response) => {
    try {
      const { logs } = await import('../database/schema');
      await db.delete(logs);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to clear logs' });
    }
  });

  // Provider testing
  app.post('/api/provider/test', async (req: Request, res: Response) => {
    try {
      const { providerType, providerUrl } = req.body;
      let ProviderClass;
      
      if (providerType === 'MOCK') {
        const { MockRSSProvider } = await import('../providers/mockRssProvider');
        const provider = new MockRSSProvider();
        const items = await provider.scan();
        return res.json({ success: true, itemsFound: items.length });
      } else if (providerType === 'PIRATEBAY') {
        const { PirateBayProvider } = await import('../providers/pirateBayProvider');
        const provider = new PirateBayProvider();
        const items = await provider.scan();
        return res.json({ success: true, itemsFound: items.length });
      } else if (providerType === 'RSS') {
        if (!providerUrl) {
          return res.status(400).json({ error: 'RSS URL is required' });
        }
        const { RSSProvider } = await import('../providers/rssProvider');
        const provider = new RSSProvider(providerUrl);
        const items = await provider.scan();
        return res.json({ success: true, itemsFound: items.length });
      } else {
        return res.status(400).json({ error: 'Invalid or missing provider configuration' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Provider connection failed' });
    }
  });

  // Dashboard stats
  app.get('/api/dashboard', async (req: Request, res: Response) => {
    try {
      const [{ value: watchlistCount }] = await db.select({ value: count() }).from(watchlist);
      const [{ value: releaseCount }] = await db.select({ value: count() }).from(releases);
      const settings = await getSettings();
      
      res.json({
        watchlistCount,
        releaseCount,
        lastScan: settings?.lastScan,
        scanInterval: settings?.scanInterval || 10,
        providerType: settings?.providerType || 'NONE'
      });
    } catch (e: any) { 
      res.json({ watchlistCount: 0, releaseCount: 0, lastScan: null, scanInterval: 10, error: 'Database connection required', providerType: 'NONE' });
    }
  });

  // Health Status
  app.get('/api/health/status', async (req: Request, res: Response) => {
    try {
      let dbStatus = 'Not Configured';
      if (process.env.DATABASE_URL) {
        try {
          const result = await db.select().from(watchlist).limit(1);
          if (result !== undefined) dbStatus = 'Healthy';
        } catch (e) {
          dbStatus = 'Error';
        }
      }
      
      const settings = await getSettings();
      const providerName = settings?.providerType === 'PIRATEBAY' ? 'The Pirate Bay' : (settings?.providerType === 'RSS' ? 'RSS Feed' : (settings?.providerType === 'MOCK' ? 'MockRSS' : 'None'));
      res.json({
        server: 'Healthy',
        database: dbStatus,
        scheduler: 'Healthy',
        telegram: process.env.TELEGRAM_BOT_TOKEN ? 'Healthy' : 'Not Configured',
        providers: [{ name: providerName, status: 'Healthy', lastScan: settings?.lastScan || 'Never' }],
        lastScan: settings?.lastScan,
      });
    } catch (e: any) {
      res.json({
        server: 'Healthy',
        database: process.env.DATABASE_URL ? 'Error' : 'Not Configured',
        scheduler: 'Healthy',
        telegram: process.env.TELEGRAM_BOT_TOKEN ? 'Healthy' : 'Not Configured',
        providers: [{ name: 'MockRSS', status: 'Healthy', lastScan: 'Never' }],
        lastScan: null,
      });
    }
  });
}
