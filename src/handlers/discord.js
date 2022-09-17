const { Emitter } = require('../services');
const { EVENTS } = require('../config/constants');
const {
  setChannelId,
  removeChannelId,
  clearChannels,
  setAlertChannel,
  removeAlertChannel
} = require('../services/helpers/discord-commands');
const Discord = require('../services/discord');
const MerchantsHub = require('../services/merchants');
const Channels = require('../database/channels');

const channelsDB = new Channels();

/**
 * @param {Object} params
 * @param {Discord} params.discord
 * @param {MerchantsHub} params.merchantsHub
 */
module.exports = ({ discord, merchantsHub }) => {
  Emitter.on(EVENTS.DISCORD_READY, async channel => {
    if (!discord.client?.isReady?.()) {
      throw new Error(`${EVENTS.DISCORD_READY} - Discord client not ready`);
    }

    if (merchantsHub.connection?.state !== 'Connected') {
      console.log('MerchantsHub not connected');
      Emitter.emit(EVENTS.MERCHANTS_CONNECTION_ERROR, merchantsHub);
      return;
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

    const { merchants, server, error } = await merchantsHub.getActiveMerchantsList();
    if (!error && merchants.length) {
      console.log(`Attempting to notify ${merchants.length} active merchants`);
      merchants.forEach(merchant => Emitter.emit(EVENTS.MERCHANT_FOUND, { merchant, server, channel }));
    } else {
      console.log(`No active merchants to notify (Error: ${error})`);
    }
  });

  Emitter.on(EVENTS.DISCORD_MESSAGE_CREATED, async ({ message, client }) => {
    if (message.author.bot || !message.member.permissions.has('ADMINISTRATOR')) return;
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
};
