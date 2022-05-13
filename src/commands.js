const { insertChannel, removeChannel, getChannel } = require('./database');

const COMMANDS_LIST = {
  SET_CHANNEL: '/setchannel',
  REMOVE_CHANNEL: '/removechannel'
};

async function setChannelId(message) {
  try {
    if (message.content !== COMMANDS_LIST.SET_CHANNEL || message.author.bot) {
      return false;
    }
    const [channel] = await getChannel({ channelId: message.channelId, guildId: message.guildId });

    if (channel) {
      console.log(`Channel ${message.channelId} in guild ${message.guildId} already registered`);
      return false;
    }

    await insertChannel(message.channelId, message.guildId);
    await message.reply('Using current channel');
    return true;
  } catch (error) {
    console.log('Set channel error', error);
    return false;
  }
}

async function removeChannelId(message) {
  try {
    if (message.content !== COMMANDS_LIST.REMOVE_CHANNEL || message.author.bot) {
      return false;
    }

    await removeChannel(message.channelId, message.guildId);
    await message.reply('Removed current channel');
    return true;
  } catch (error) {
    console.log('Remove channel error', error);
    return false;
  }
}

module.exports = {
  setChannelId,
  removeChannelId
};
