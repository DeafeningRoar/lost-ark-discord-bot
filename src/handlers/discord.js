const { Emitter } = require('../services');
const { EVENTS } = require('../config/constants');
const { getCommandHandler, CHANNEL_TYPES } = require('../services/helpers/discord-commands');
const Discord = require('../services/discord');
const MerchantsHub = require('../services/merchants');
const Channels = require('../database/channels');

const channelsDB = new Channels();

/**
 * @param {Object} params
 * @param {Discord} params.discord
 */
module.exports = ({ discord }) => {
  Emitter.on(EVENTS.DISCORD_READY, async () => {
    if (!discord.client?.isReady?.()) {
      throw new Error(`${EVENTS.DISCORD_READY} - Discord client not ready`);
    }

    const dbChannels = await channelsDB.find([]);
    if (!dbChannels.length) {
      console.log('No channels registered');
      return;
    }

    console.log(
      'Registered channels:',
      dbChannels.map(({ channelId, guildId }) => ({ guildId, channelId }))
    );

    Emitter.emit(EVENTS.MERCHANTS_READY);
  });

  Emitter.on(EVENTS.DISCORD_MESSAGE_CREATED, async ({ message, client }) => {
    if (message.author.bot || !message.member.permissions.has('ADMINISTRATOR')) return;
    const commandHandler = getCommandHandler(message);

    if (!commandHandler) return;
    const result = await commandHandler(message);

    if (result?.isInsert === true && result?.type === CHANNEL_TYPES[0]) {
      console.log(`Notifying active merchants to new channel ${message.channelId} (${message.channel.name})`);
      Emitter.emit(EVENTS.MERCHANTS_READY, client.channels.cache.get(message.channelId));
    }
  });
};
