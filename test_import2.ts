import * as TelegramBotLib from 'node-telegram-bot-api';
const TelegramBot = (TelegramBotLib as any).default || TelegramBotLib;
console.log(typeof TelegramBot, typeof (TelegramBotLib as any).default);
