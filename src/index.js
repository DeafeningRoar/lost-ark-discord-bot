if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const { findBy, insertMessage, deleteAll, checkConnection, getAllChannels, getChannel } = require('./database');
const {
  setChannelId,
  removeChannelId,
  clearChannels,
  setAlertChannel,
  removeAlertChannel
} = require('./services/helpers/discord-commands');
const merchants = require('../merchants.json');
const { Discord, Emitter, MerchantsHub } = require('./services');
const { FIVE_MINUTES_MS, EVENTS, RARITIES } = require('./config/constants');
const { sleep, formatError } = require('./utils');

const getRemainingTime = () => {
  const currentDate = new Date();
  currentDate.setUTCMinutes(55, 0, 0);
  return Math.floor(currentDate.getTime() / 1000);
};

async function notifyMerchantFound({ channel, merchant, server }) {
  await Promise.all(
    merchant.activeMerchants.map(async activeMerchant => {
      try {
        const { id, name, zone, card, rapport, votes } = activeMerchant;

        const [exists] = await findBy({ merchantId: id, channelId: channel.id });
        if (exists) {
          console.log(`Merchant ${id} (${name}) already notified to channel ${channel.id} (${channel.name})`);
          return;
        }

        if (
          card.rarity < Number(process.env.CARD_RARITY_THRESHOLD) &&
          rapport.rarity < Number(process.env.RAPPORT_RARITY_THRESHOLD)
        ) {
          return;
        }

        const message = await channel.send({
          content: `${card.name.toLowerCase() === 'wei' ? '@everyone' : ''}
Expiración: <t:${getRemainingTime()}:R>\`\`\`
Nombre: ${name}
Región: ${merchants[name]?.Region || '??'}
Zona: ${zone}
Carta: ${card.name} (${RARITIES[card.rarity]})
Rapport: ${rapport.name} (${RARITIES[rapport.rarity]})
Votos: ${votes}
\`\`\``,
          files: [
            {
              attachment: __dirname + '/../assets/zones/' + zone + '.jpg',
              name: zone + '.jpg'
            }
          ]
        });

        await insertMessage(message.id, id, channel.id);
      } catch (error) {
        console.log(`Error notifying merchant to channel ${channel.id} (${channel.name})`, error);
        Emitter.emit(EVENTS.NOTIFY_ALERT, formatError('motifyMerchantFound', error));
      }
    })
  );
}

async function notifyMerchantVotesChanged({ channel, merchantId, votes, server }) {
  const [message] = await findBy({ merchantId, channelId: channel.id });
  if (!message) {
    console.log(`No message found for merchantId ${merchantId} and channelId ${channel.id} (${channel.name})`);
    return;
  }

  const regex = new RegExp(/Votos: -?[0-9]+/, 'g');
  const discordMessage = await channel.messages.fetch(message.messageId);
  await discordMessage.edit(discordMessage.content.replace(regex, `Votos: ${votes}`));
}

async function notifyAlert({ message, client }) {
  try {
    console.log('Notifying alert');
    const dbChannels = await getChannel({ isAlert: true });
    if (!dbChannels?.length) {
      console.log('No alert channels to notify');
      return;
    }
    const alertChannels = dbChannels.map(({ channelId }) => client.channels.cache.get(channelId));
    await Promise.all(
      alertChannels.map(async channel =>
        channel.send(
          `Error:
\`\`\`
${JSON.stringify(message, null, 2)}
\`\`\``
        )
      )
    );
  } catch (error) {
    console.log('Error notifying alerts', error);
  }
}

async function clearMessages(client, hasActiveMerchants, server) {
  if (hasActiveMerchants) return;
  console.log('Clearing and reformatting messages');
  try {
    const regex = /Expiración: <t:([0-9]+):R>/;
    const regExp = new RegExp(regex, 'g');
    const dbChannels = await getAllChannels();
    const channels = dbChannels.map(({ channelId }) => client.channels.cache.get(channelId));
    await Promise.all(
      channels.map(async channel => {
        const messages = await findBy({ channelId: channel.id });
        console.log(`Found ${messages.length} messages for channel ${channel.id} (${channel.name})`);
        await Promise.all(
          messages.map(async ({ messageId }) => {
            const message = await channel.messages.fetch(messageId);
            const timestamp = message.content.match(regex)?.[1];
            console.log(`Clearing message ${message.id}`);
            if (!timestamp) return;
            await message.edit(message.content.replace(regExp, `Expirado: <t:${timestamp}:f>`));
          })
        );
      })
    );
  } catch (error) {
    console.log('Error formatting messages', error);
    Emitter.emit(EVENTS.NOTIFY_ALERT, formatError('clearMessages', error));
  }
  await deleteAll();
}

async function start() {
  try {
    const discord = new Discord();
    const merchantsHub = new MerchantsHub({ server: 'Yorn' });

    Emitter.on(EVENTS.DISCORD_READY, async channel => {
      if (!discord.client?.isReady?.()) {
        throw new Error(`${EVENTS.DISCORD_READY} - Discord client not ready`);
      }

      if (merchantsHub.connection?.state !== 'Connected') {
        console.log('MerchantsHub not connected');
        return;
      }

      const dbChannels = await getAllChannels();
      if (!dbChannels.length) {
        console.log('No channels registered');
        return;
      }
      console.log(
        'Registered channels:',
        dbChannels.map(({ channelId, guildId }) => ({ guildId, channelId }))
      );

      const { merchants, server, error } = await merchantsHub.getActiveMerchantsList();
      if (!error && merchants.length) {
        console.log(`Attempting to notify ${merchants.length} active merchants`);
        merchants.forEach(merchant => Emitter.emit(EVENTS.MERCHANT_FOUND, { merchant, server, channel }));
      } else {
        console.log(`No active merchants to notify (error? ${error})`);
      }
    });

    Emitter.on(EVENTS.DISCORD_MESSAGE_CREATED, async ({ message, client }) => {
      if (message.author.bot) return;
      const [successSet] = await Promise.all([
        setChannelId(message),
        removeChannelId(message),
        clearChannels(message),
        setAlertChannel(message),
        removeAlertChannel(message)
      ]);

      if (successSet) {
        console.log(`Notifying active merchants to new channel ${message.channelId} (${message.channel.name})`);
        Emitter.emit(EVENTS.DISCORD_READY, client.channels.cache.get(message.channelId));
      }
    });

    Emitter.on(EVENTS.MERCHANT_FOUND, async ({ merchant, server, channel }) => {
      if (!discord.client?.isReady?.()) {
        throw new Error(`${EVENTS.MERCHANT_FOUND} - Discord client not ready`);
      }

      if (!channel) {
        const dbChannels = await getAllChannels();
        await Promise.all(
          dbChannels.map(async ({ channelId }) => {
            const dcChannel = discord.client.channels.cache.get(channelId);
            if (!dcChannel) {
              console.log(`Notification channel ${channelId} not found in Discord cache`);
              return;
            }

            return notifyMerchantFound({ channel: dcChannel, merchant, server });
          })
        );
      } else {
        return notifyMerchantFound({ channel, merchant, server });
      }
    });

    Emitter.on(EVENTS.MERCHANT_VOTES_CHANED, async ({ server, merchantId, votes }) => {
      if (!discord.client?.isReady?.()) {
        throw new Error(`${EVENTS.MERCHANT_VOTES_CHANED} - Discord client not ready`);
      }

      const dbChannels = await getAllChannels();
      await Promise.all(
        dbChannels.map(async ({ channelId }) => {
          const channel = discord.client.channels.cache.get(channelId);
          if (!channel) {
            console.log(`Notification channel ${channelId} not found in Discord cache`);
            return;
          }
          await notifyMerchantVotesChanged({ channel, merchantId, votes, server });
        })
      );
    });

    Emitter.on(EVENTS.MERCHANTS_LIST_CHECK, async ({ merchants, server }) => {
      if (!discord.client?.isReady?.()) {
        throw new Error(`${EVENTS.MERCHANT_FOUND} - Discord client not ready`);
      }
      await clearMessages(discord.client, Boolean(merchants?.length), server);
    });

    /******* Error Event Listeners *******/

    Emitter.on(EVENTS.MERCHANTS_CONNECTION_ERROR, async merchantsHubInstance => {
      if (discord.client?.isReady?.()) {
        await notifyAlert({ client: discord.client, message: 'Attempting to reconnect to MerchantsHub' });
      }
      console.log(`Reinitializing MerchantsHub in ${FIVE_MINUTES_MS}ms`);
      await sleep(FIVE_MINUTES_MS);
      console.log('Reinitializing MerchantsHub connection');
      await merchantsHubInstance.initialize();

      if (discord.client?.isReady?.()) {
        await notifyAlert({ client: discord.client, message: 'Successfully reconnected to MerchantsHub' });
        Emitter.emit(EVENTS.DISCORD_READY);
      }
    });

    Emitter.on(EVENTS.ERROR, async error => {
      if (discord.client?.isReady?.()) {
        const alertChannels = await getChannel({ isAlert: true });
        await Promise.all(
          alertChannels.map(async ({ channelId }) => {
            const channel = discord.client.channels.cache.get(channelId);
            if (!channel) {
              console.log(`Alerts channel ${channelId} not found in Discord cache`);
              return;
            }

            await notifyAlert({ meesage: formatError('Event error', error), client: discord.client });
          })
        );
      }
    });

    Emitter.on(EVENTS.NOTIFY_ALERT, async message => {
      if (discord.client?.isReady?.()) {
        await notifyAlert({ message, client: discord.client });
      }
    });

    Emitter.on(EVENTS.MERCHANTS_HUB_RECONNECTED, async () => {
      if (discord.client?.isReady?.()) {
        await notifyAlert({ message: 'Reconnected to MerchantsHub', client: discord.client });
      }
      Emitter.emit(EVENTS.DISCORD_READY);
    });

    Emitter.on(EVENTS.MERCHANTS_HUB_RECONNECTING, async () => {
      if (discord.client?.isReady?.()) {
        await notifyAlert({ message: 'Reconnecting to MerchantsHub', client: discord.client });
      }
    });

    await checkConnection();
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
      EVENTS.MERCHANTS_HUB_RECONNECTING
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
