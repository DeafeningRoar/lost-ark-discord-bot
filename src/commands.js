const { insertChannel, removeChannel, getChannel, removeChannels } = require('./database');

const COMMANDS_LIST = {
  SET_CHANNEL: '/setchannel',
  REMOVE_CHANNEL: '/removechannel',
  CLEAR_GUILD: '/clearguild',
  CLEAR_ALL: '/clearall'
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

async function clearChannels(message) {
  try {
    if (
      (message.content !== COMMANDS_LIST.CLEAR_GUILD && message.content !== COMMANDS_LIST.CLEAR_ALL) ||
      message.author.bot ||
      message.author.id !== process.env.ADMIN_ID
    ) {
      return false;
    }

    let params;
    if (message.content === COMMANDS_LIST.CLEAR_GUILD) {
      params = { guildId: message.guildId };
    }

    await removeChannels(params);
    await message.reply('Removed channels');
    return true;
  } catch (error) {
    console.log('Clear channels error', error);
    return false;
  }
}

module.exports = {
  setChannelId,
  removeChannelId,
  clearChannels
};
