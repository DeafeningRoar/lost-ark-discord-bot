if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const { Discord, Emitter, MerchantsHub, IslandsTracker } = require('./services');
const { FIVE_MINUTES_MS, EVENTS } = require('./config/constants');
const { sleep, formatError } = require('./utils');
const { discordHandlers, merchantsHandlers, islandsHandlers } = require('./handlers');
const { notifyAlert } = require('./handlers/helpers/notifications');
const Channels = require('./database/channels');

const channelsDB = new Channels();

async function start() {
  try {
    const discord = new Discord();
    const merchantsHub = new MerchantsHub({ servers: ['Blackfang', 'Arthetine'] });
    const islandsTracker = new IslandsTracker();

    discordHandlers({ discord });
    merchantsHandlers({ discord, merchantsHub });
    islandsHandlers({ discord, islandsTracker });

    /******* Error Event Listeners *******/

    Emitter.on(EVENTS.ERROR, async error => {
      if (discord.client?.isReady?.()) {
        const alertChannels = await channelsDB.find([{ key: 'isAlert', comparisonOperator: '=', value: true }]);
        await Promise.all(
          alertChannels.map(async ({ channelId }) => {
            const channel = discord.client.channels.cache.get(channelId);
            if (!channel) {
              console.log(`Alerts channel ${channelId} not found in Discord cache`);
              return;
            }

            await notifyAlert({ message: formatError('Event error', error), client: discord.client });
          })
        );
      }
    });

    Emitter.on(EVENTS.NOTIFY_ALERT, async message => {
      if (discord.client?.isReady?.()) {
        await notifyAlert({ message: `[${new Date().toISOString()}] ${message}`, client: discord.client });
      }
    });

    await channelsDB.connectionCheck();
    await merchantsHub.initialize();
    await discord.initialize();
  } catch (error) {
    console.log('Process error', error);
    [
      EVENTS.DISCORD_READY,
      EVENTS.DISCORD_MESSAGE_CREATED,
      EVENTS.MERCHANT_FOUND,
      EVENTS.MERCHANT_VOTES_CHANED,
      EVENTS.MERCHANTS_LIST_CHECK,
      EVENTS.MERCHANTS_CONNECTION_ERROR,
      EVENTS.ERROR,
      EVENTS.NOTIFY_ALERT,
      EVENTS.MERCHANTS_HUB_RECONNECTED,
      EVENTS.MERCHANTS_HUB_RECONNECTING,
      EVENTS.ISLAND_ALERT,
      EVENTS.ISLANDS_CLEANUP,
      EVENTS.MERCHANTS_READY
    ].forEach(e => Emitter.removeAllListeners(e));
    Emitter.emit(EVENTS.PROCESS_ERROR);
  }
}

Emitter.on(EVENTS.DISCORD_CONNECTION_ERROR, async discordInstance => {
  console.log(`Reinitializing Discord in ${FIVE_MINUTES_MS / 5}ms`);
  await sleep(FIVE_MINUTES_MS / 5);
  console.log('Reinitializing Discord connection');
  await discordInstance.initialize();
});

Emitter.on(EVENTS.PROCESS_ERROR, async () => {
  console.log('Attempting to restart process in', FIVE_MINUTES_MS / 10, 'ms');
  await sleep(FIVE_MINUTES_MS / 10);
  await start();
});

start();
