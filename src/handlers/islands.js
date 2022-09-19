const { Emitter, Discord, IslandsTracker } = require('../services');
const { EVENTS } = require('../config/constants');
const Channels = require('../database/channels');
const Messages = require('../database/messages');

const channelsDB = new Channels();
const messagesDB = new Messages();

/**
 * @param {Object} params
 * @param {Discord} params.discord
 * @param {IslandsTracker} params.islandsTracker
 */
module.exports = ({ discord, islandsTracker }) => {
  Emitter.on(EVENTS.DISCORD_READY, async () => {
    islandsTracker.setupTracker();
  });

  Emitter.on(EVENTS.ISLAND_ALERT, async (islands, upcomingTime) => {
    if (!discord.client?.isReady?.()) {
      throw new Error(`${EVENTS.ISLAND_ALERT} - Discord client not ready`);
    }

    const dbChannels = await channelsDB.find([
      {
        key: 'type',
        comparisonOperator: '=',
        value: 'islands'
      }
    ]);

    await Promise.all(
      dbChannels.map(async ({ channelId }) => {
        const dcChannel = discord.client.channels.cache.get(channelId);
        if (!dcChannel) {
          console.log(`Islands channel ${channelId} not found in Discord cache`);
          return;
        }

        const channelMessages = await messagesDB.find([
          {
            key: 'islandName',
            comparisonOperator: 'in',
            value: islands.map(island => island.name)
          },
          {
            key: 'channelId',
            comparisonOperator: '=',
            value: dcChannel.id
          },
          {
            key: 'merchantId',
            comparisonOperator: 'is',
            value: null
          }
        ]);

        if (channelMessages.length) {
          console.log(`Islands already notified to channel ${dcChannel.id}`);
          return;
        }

        await Promise.all(
          islands.map(async island => {
            const message = await dcChannel.send({
              content: `
**${island.name}**
Empieza En: <t:${Math.floor(Number(upcomingTime) / 1000)}:R>
Recompenzas: ${island.rewards.join(', ')}`,
              files: [
                {
                  attachment: __dirname + '/../../assets/islands/' + island.name + '.png',
                  name: island.name + '.png'
                }
              ]
            });

            await messagesDB.insert({
              messageId: message.id,
              islandName: island.name,
              channelId: dcChannel.id,
              merchantId: null
            });
          })
        );
      })
    );
  });

  Emitter.on(EVENTS.ISLANDS_CLEANUP, async () => {
    if (!discord.client?.isReady?.()) {
      throw new Error(`${EVENTS.MERCHANT_FOUND} - Discord client not ready`);
    }
    const regex = /Empieza En: <t:([0-9]+):R>/;
    const regExp = new RegExp(regex, 'g');

    const dbChannels = await channelsDB.find([
      {
        key: 'type',
        comparisonOperator: '=',
        value: 'islands'
      }
    ]);

    await Promise.all(
      dbChannels.map(async ({ channelId }) => {
        const dcChannel = discord.client.channels.cache.get(channelId);
        if (!dcChannel) {
          console.log(`Islands channel ${channelId} not found in Discord cache`);
          return;
        }

        const channelMessages = await messagesDB.find([
          {
            key: 'channelId',
            comparisonOperator: '=',
            value: dcChannel.id
          },
          {
            key: 'islandName',
            comparisonOperator: 'is not',
            value: null
          }
        ]);

        if (!channelMessages.length) {
          return;
        }

        await Promise.all(
          channelMessages.map(async ({ messageId }) => {
            const message = await dcChannel.messages.fetch(messageId);
            const timestamp = message.content.match(regex)?.[1];
            console.log(`Clearing message ${message.id}`);
            if (!timestamp) return;
            await message.edit(message.content.replace(regExp, `Terminó: <t:${timestamp}:f>`));
          })
        );

        await messagesDB.delete([
          {
            key: 'channelId',
            comparisonOperator: '=',
            value: dcChannel.id
          },
          {
            key: 'islandName',
            comparisonOperator: 'is not',
            value: null
          }
        ]);
      })
    );
  });
};
