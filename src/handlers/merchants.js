const moment = require('moment-timezone');

const { Emitter } = require('../services');
const { EVENTS, FIVE_MINUTES_MS, RARITIES, SERVER_ROLES } = require('../config/constants');
const merchants = require('../../merchants.json');
const Discord = require('../services/discord');
const MerchantsHub = require('../services/merchants');
const { notifyAlert } = require('./helpers/notifications');
const Messages = require('../database/messages');
const Channels = require('../database/channels');
const { formatError, sleep } = require('../utils');

const messagesDB = new Messages();
const channelsDB = new Channels();

const getRemainingTime = appearanceTime => {
  const serverTzOffset = -4;
  const currentDate = moment().utcOffset(serverTzOffset);
  const expirationDate = moment().utcOffset(serverTzOffset).startOf('day');
  const appearanceHour = Number(appearanceTime.split(':')[0]);

  if (currentDate.get('hour') <= 3 && appearanceHour >= 22) {
    expirationDate.set('day', expirationDate.get('day') - 1);
  }

  expirationDate.set('hour', appearanceHour + 5);
  expirationDate.set('minutes', 30);

  return Math.floor(expirationDate.valueOf() / 1000);
};

const getAppearanceTime = appearanceTimes => {
  const serverTzOffset = -4;
  const currentDate = moment().utcOffset(serverTzOffset);

  return appearanceTimes.filter(appearanceTime => {
    const appearanceHour = Number(appearanceTime.split(':')[0]);
    const time = moment().utcOffset(serverTzOffset);
    time.set('hour', appearanceHour);
    time.set('minutes', 0);
    time.set('seconds', 0);
    time.set('milliseconds', 0);

    if (currentDate.get('hour') <= 3 && appearanceHour >= 22) {
      time.set('day', time.get('day') - 1);
    }

    const expiredtime = moment(time);
    expiredtime.set('hour', expiredtime.get('hour') + 5);
    expiredtime.set('minutes', 30);

    return currentDate.isSameOrAfter(time) && currentDate.isSameOrBefore(expiredtime);
  })[0];
};

async function notifyMerchantFound({ channel, merchant }) {
  await Promise.all(
    merchant.activeMerchants.map(async activeMerchant => {
      try {
        const { id, name, zone, cards, rapports, votes, tradeskill } = activeMerchant;
        const { server } = merchant;

        const [exists] = await messagesDB.find([
          {
            key: 'merchantId',
            comparisonOperator: '=',
            value: id
          },
          {
            key: 'channelId',
            comparisonOperator: '=',
            value: channel.id
          }
        ]);

        if (exists) {
          console.log(
            `Merchant ${id} (${name}) (${server}) already notified to channel ${channel.id} (${channel.name})`
          );
          return;
        }

        const isWhiteListed = JSON.parse(process.env.CARD_WHITELIST || '[]').some(card =>
          cards.some(c => c.name.toLowerCase() === card)
        );
        if (
          cards.every(card => card.rarity < Number(process.env.CARD_RARITY_THRESHOLD)) &&
          rapports.every(rapport => rapport.rarity < Number(process.env.RAPPORT_RARITY_THRESHOLD)) &&
          !isWhiteListed
        ) {
          return;
        }

        const appearanceTime = getAppearanceTime(merchants[name].AppearanceTimes);

        const message = await channel.send({
          content: `${
            cards.some(card => card.rarity >= Number(process.env.CARD_RARITY_NOTIFICATION))
              ? `<@&${SERVER_ROLES[server]}>`
              : ''
          }
Expiración: <t:${getRemainingTime(appearanceTime)}:R>

**${server.toUpperCase()}**

\`\`\`
Nombre: ${name}
Región: ${merchants[name]?.Region || '??'}
Zona: ${zone}
Cartas: ${cards.map(card => `${card.name} (${RARITIES[card.rarity]})`).join(' | ')}
Rapports: ${rapports.map(rapport => `${rapport.name} (${RARITIES[rapport.rarity]})`).join(' | ')}
Item: ${tradeskill ? tradeskill : '--'}
Votos: ${votes}
\`\`\``,
          files: [
            {
              attachment: __dirname + '/../../assets/zones/' + zone + '.jpg',
              name: zone + '.jpg'
            }
          ]
        });

        await messagesDB.insert({
          messageId: message.id,
          merchantId: id,
          channelId: channel.id
        });
      } catch (error) {
        console.log(`Error notifying merchant to channel ${channel.id} (${channel.name})`, error);
        Emitter.emit(EVENTS.NOTIFY_ALERT, formatError('notifyMerchantFound', error));
      }
    })
  );
}

async function notifyMerchantVotesChanged({ channel, merchantId, votes }) {
  const [message] = await messagesDB.find([
    {
      key: 'merchantId',
      comparisonOperator: '=',
      value: merchantId
    },
    {
      key: 'channelId',
      comparisonOperator: '=',
      value: channel.id
    }
  ]);
  if (!message) {
    console.log(`No message found for merchantId ${merchantId} and channelId ${channel.id} (${channel.name})`);
    return;
  }

  const regex = new RegExp(/Votos: -?[0-9]+/, 'g');
  const discordMessage = await channel.messages.fetch(message.messageId);
  await discordMessage.edit(discordMessage.content.replace(regex, `Votos: ${votes}`));
}

async function clearMessages(client, hasActiveMerchants, error) {
  if (hasActiveMerchants || error) return;
  console.log('Clearing and reformatting messages');
  try {
    const regex = /Expiración: <t:([0-9]+):R>/;
    const regExp = new RegExp(regex, 'g');
    const dbChannels = await channelsDB.find([
      {
        key: 'type',
        comparisonOperator: '=',
        value: 'merchants'
      },
      {
        key: 'isAlert',
        comparisonOperator: '=',
        value: false
      }
    ]);
    const channels = dbChannels.map(({ channelId }) => client.channels.cache.get(channelId));
    await Promise.all(
      channels.map(async channel => {
        const messages = await messagesDB.find([
          {
            key: 'channelId',
            comparisonOperator: '=',
            value: channel.id
          }
        ]);
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
  await messagesDB.delete([
    {
      key: 'merchantId',
      comparisonOperator: 'is not',
      value: null
    }
  ]);
}

const checkActiveMerchants = async (merchantsHub, channel) => {
  const { merchants, error } = await merchantsHub.getActiveMerchantsList();
  if (!error && merchants.length) {
    console.log(`Attempting to notify ${merchants.length} active merchants`);
    merchants.forEach(merchant => Emitter.emit(EVENTS.MERCHANT_FOUND, { merchant, channel }));
  } else {
    console.log(`No active merchants to notify (Error: ${error})`);
  }
};

/**
 * @param {Object} params
 * @param {Discord} params.discord
 * @param {MerchantsHub} params.merchantsHub
 */
module.exports = ({ discord, merchantsHub }) => {
  Emitter.on(EVENTS.MERCHANTS_READY, async channel => {
    if (merchantsHub.connection?.state !== 'Connected') {
      console.log('MerchantsHub not connected');
      Emitter.emit(EVENTS.MERCHANTS_CONNECTION_ERROR, merchantsHub);
      return;
    }

    await checkActiveMerchants(merchantsHub, channel);
  });

  Emitter.on(EVENTS.MERCHANT_FOUND, async ({ merchant, channel }) => {
    if (!discord.client?.isReady?.()) {
      throw new Error(`${EVENTS.MERCHANT_FOUND} - Discord client not ready`);
    }

    if (!channel) {
      const dbChannels = await channelsDB.find([
        {
          key: 'type',
          comparisonOperator: '=',
          value: 'merchants'
        },
        {
          key: 'isAlert',
          comparisonOperator: '=',
          value: false
        }
      ]);
      await Promise.all(
        dbChannels.map(async ({ channelId }) => {
          const dcChannel = discord.client.channels.cache.get(channelId);
          if (!dcChannel) {
            console.log(`Notification channel ${channelId} not found in Discord cache`);
            return;
          }

          return notifyMerchantFound({ channel: dcChannel, merchant });
        })
      );
    } else {
      return notifyMerchantFound({ channel, merchant });
    }
  });

  Emitter.on(EVENTS.MERCHANT_VOTES_CHANED, async ({ merchantId, votes }) => {
    if (!discord.client?.isReady?.()) {
      throw new Error(`${EVENTS.MERCHANT_VOTES_CHANED} - Discord client not ready`);
    }

    const dbChannels = await channelsDB.find([
      {
        key: 'type',
        comparisonOperator: '=',
        value: 'merchants'
      },
      {
        key: 'isAlert',
        comparisonOperator: '=',
        value: false
      }
    ]);
    await Promise.all(
      dbChannels.map(async ({ channelId }) => {
        const channel = discord.client.channels.cache.get(channelId);
        if (!channel) {
          console.log(`Notification channel ${channelId} not found in Discord cache`);
          return;
        }
        await notifyMerchantVotesChanged({ channel, merchantId, votes });
      })
    );
  });

  Emitter.on(EVENTS.MERCHANTS_LIST_CHECK, async ({ merchants, error }) => {
    if (!discord.client?.isReady?.()) {
      throw new Error(`${EVENTS.MERCHANT_FOUND} - Discord client not ready`);
    }
    await clearMessages(discord.client, Boolean(merchants?.length), error);
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
      Emitter.emit(EVENTS.MERCHANTS_READY);
    }
  });

  Emitter.on(EVENTS.MERCHANTS_HUB_RECONNECTED, async () => {
    if (discord.client?.isReady?.()) {
      await notifyAlert({
        message: `[${new Date().toISOString()}] Reconnected to MerchantsHub`,
        client: discord.client
      });
    }
    Emitter.emit(EVENTS.MERCHANTS_READY);
  });

  Emitter.on(EVENTS.MERCHANTS_HUB_RECONNECTING, async () => {
    if (discord.client?.isReady?.()) {
      await notifyAlert({
        message: `[${new Date().toISOString()}] Reconnecting to MerchantsHub`,
        client: discord.client
      });
    }
  });
};
