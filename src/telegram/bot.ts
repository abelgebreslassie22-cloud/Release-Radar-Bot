import TelegramBot from 'node-telegram-bot-api';
import { getSettings } from '../services/settings';
import { ReleaseItem } from '../utils/mediaGrouper';
import { logInfo, logError, logSuccess } from '../services/logger';
import { getGroupKey } from '../utils/mediaGrouper';
import { db } from '../database/db';
import { watchlist, releases } from '../database/schema';
import { desc } from 'drizzle-orm';

let bot: TelegramBot | null = null;

function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getBaseUrl(): string {
  const url = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  return url.replace(/\/$/, '');
}

export function initTelegramBot() {
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
      
      bot.onText(/\/start/, async (msg) => {
        const baseUrl = getBaseUrl();
        const text = `<b>🍿 Release Radar Bot</b>\n\nWelcome! Your Telegram Chat ID is: <code>${msg.chat.id}</code>\n\nPlease copy this Chat ID and paste it into the <b>Settings</b> page of your application to receive instant notifications when new releases match your watchlist!\n\n<b>Commands:</b>\n/watchlist - View your watchlist with detail links\n/releases - View recent releases with detail links\n/ping - Check bot status`;
        
        bot?.sendMessage(msg.chat.id, text, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌐 Open Release Radar App', url: baseUrl }]
            ]
          }
        });
      });

      bot.onText(/\/ping/, (msg) => {
        bot?.sendMessage(msg.chat.id, '<b>Pong!</b> ⚡ Release Radar Bot is online and active.', { parse_mode: 'HTML' });
      });

      bot.onText(/\/watchlist/, async (msg) => {
        try {
          const items = await db.select().from(watchlist).orderBy(desc(watchlist.createdAt));
          const baseUrl = getBaseUrl();
          if (items.length === 0) {
            bot?.sendMessage(msg.chat.id, '📋 Your Watchlist is currently empty.\n\nAdd movies or series in the web app!', {
              reply_markup: {
                inline_keyboard: [[{ text: '➕ Manage Watchlist', url: `${baseUrl}/#/watchlist` }]]
              }
            });
            return;
          }

          let listText = `<b>📋 Your Watchlist (${items.length} items):</b>\n\n`;
          const buttons: any[] = [];

          items.forEach((item, idx) => {
            const groupKey = getGroupKey(item.title, item.type);
            const detailUrl = `${baseUrl}/#/media/${groupKey}`;
            listText += `${idx + 1}. <b>${escapeHtml(item.title)}</b> (${item.year}) [<i>${escapeHtml(item.type)}</i>]\n   👉 <a href="${detailUrl}">View Release Page</a>\n\n`;
            if (idx < 5) {
              buttons.push([{ text: `🎬 ${item.title} (${item.year})`, url: detailUrl }]);
            }
          });

          buttons.push([{ text: '🌐 Open Full Watchlist', url: `${baseUrl}/#/watchlist` }]);

          bot?.sendMessage(msg.chat.id, listText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: buttons }
          } as any);
        } catch (err: any) {
          bot?.sendMessage(msg.chat.id, 'Error loading watchlist.');
        }
      });

      bot.onText(/\/releases|\/latest/, async (msg) => {
        try {
          const items = await db.select().from(releases).orderBy(desc(releases.createdAt)).limit(5);
          const baseUrl = getBaseUrl();
          if (items.length === 0) {
            bot?.sendMessage(msg.chat.id, '🎬 No discovered releases yet.', {
              reply_markup: { inline_keyboard: [[{ text: '🌐 Open App', url: baseUrl }]] }
            });
            return;
          }

          let relText = `<b>🎬 Recent Discovered Releases:</b>\n\n`;
          const buttons: any[] = [];

          items.forEach((item, idx) => {
            const groupKey = getGroupKey(item.title, item.type);
            const detailUrl = `${baseUrl}/#/media/${groupKey}`;
            relText += `${idx + 1}. <b>${escapeHtml(item.title)}</b> (${item.year}) - <i>${escapeHtml(item.releaseType)}</i>\n   👉 <a href="${detailUrl}">View Details & Qualities</a>\n\n`;
            buttons.push([{ text: `🍿 ${item.title} (${item.releaseType})`, url: detailUrl }]);
          });

          buttons.push([{ text: '🌐 View All Recent Releases', url: `${baseUrl}/#/releases` }]);

          bot?.sendMessage(msg.chat.id, relText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: buttons }
          } as any);
        } catch (err: any) {
          bot?.sendMessage(msg.chat.id, 'Error loading releases.');
        }
      });

      console.log('Telegram bot initialized.');
      logSuccess('Telegram bot started and listening for commands', 'Telegram');
    } catch (e: any) {
      console.error('Failed to initialize Telegram Bot:', e);
      logError(`Failed to start Telegram bot: ${e.message}`, 'Telegram');
    }
  } else {
    console.log('TELEGRAM_BOT_TOKEN not provided, skipping Telegram bot initialization.');
    logInfo('TELEGRAM_BOT_TOKEN not provided. Notifications disabled.', 'Telegram');
  }
}

export async function sendTelegramNotification(item: ReleaseItem) {
  try {
    const settings = await getSettings();
    if (bot && settings?.telegramChatId) {
      const groupKey = getGroupKey(item.title, item.type);
      const baseUrl = getBaseUrl();
      const detailUrl = `${baseUrl}/#/media/${groupKey}`;

      const seedsText = item.seeders ? `\n<b>Seeds/Peers:</b> ⬆️ ${item.seeders} Seeds / ⬇️ ${item.leechers || 0} Peers` : '';

      const caption = `<b>🎬 New Release Discovered!</b>

<b>Title:</b> ${escapeHtml(item.title)} (${item.year})
<b>Type:</b> ${escapeHtml(item.type)}
<b>Quality:</b> ${escapeHtml(item.releaseType)}${seedsText}
<b>Source:</b> ${escapeHtml(item.provider)}

🍿 <b>View Details & All Available Qualities:</b>
<a href="${detailUrl}">${detailUrl}</a>`;

      const options: any = {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🍿 Open Detailed Release Page', url: detailUrl }
            ]
          ]
        }
      };

      let sent = false;
      if (item.poster && (item.poster.startsWith('http://') || item.poster.startsWith('https://'))) {
        try {
          await bot.sendPhoto(settings.telegramChatId, item.poster, {
            caption,
            ...options
          });
          sent = true;
        } catch (photoErr: any) {
          console.warn('Failed to send photo in Telegram, falling back to text:', photoErr?.message || photoErr);
        }
      }

      if (!sent) {
        await bot.sendMessage(settings.telegramChatId, caption, options);
      }

      console.log('Telegram notification sent successfully.');
      await logSuccess(`Telegram notification sent with detailed link: ${item.title}`, 'Telegram');
      return { success: true };
    } else {
      await logInfo(`Telegram notification skipped (No Chat ID or Bot not initialized)`, 'Telegram');
      return { success: false, error: 'Telegram bot not initialized or Chat ID missing in Settings.' };
    }
  } catch (error: any) {
    console.error('Error sending Telegram notification:', error);
    await logError(`Telegram notification failed: ${error.message}`, 'Telegram');
    return { success: false, error: error.message };
  }
}

export async function sendTestTelegramNotification() {
  const sampleItem: ReleaseItem = {
    id: 0,
    title: 'Project Hail Mary',
    year: 2026,
    type: 'Movie',
    provider: 'The Pirate Bay',
    sourceUrl: 'https://thepiratebay.org',
    releaseType: '4K WEB-DL',
    seeders: 245,
    leechers: 18,
    poster: 'https://image.tmdb.org/t/p/w500/sample.jpg',
    metadataJson: null,
    createdAt: new Date().toISOString()
  };
  return await sendTelegramNotification(sampleItem);
}
