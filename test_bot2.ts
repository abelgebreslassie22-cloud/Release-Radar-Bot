import TelegramBotLib from 'node-telegram-bot-api';
const Bot = (TelegramBotLib as any).default || TelegramBotLib;
console.log(typeof Bot, typeof (TelegramBotLib as any).default);
