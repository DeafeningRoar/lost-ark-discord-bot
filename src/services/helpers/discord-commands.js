const Channels = require('../../database/channels');
const channels = new Channels();

const COMMANDS_LIST = {
  SET_CHANNEL: '/setchannel',
  REMOVE_CHANNEL: '/removechannel',
  CLEAR_GUILD: '/clearguild',
  CLEAR_ALL: '/clearall',
  SET_ALERT_CHANNEL: '/setalert',
  REMOVE_ALERT: '/removealert'
};

const CHANNEL_TYPES = ['merchants', 'islands'];

async function setChannelId(message) {
  try {
    if (!message.content.startsWith(COMMANDS_LIST.SET_CHANNEL) || message.author.bot) {
      return false;
    }

    const type = message.split(' ')[1];

    if (!CHANNEL_TYPES.includes(type)) {
      console.log(`Invalid channel type ${type} for channel ${message.channelId} in guild ${message.guildId}`);
      await message.reply(`Invalid channel type. [${CHANNEL_TYPES.join(', ')}]`);
      return false;
    }

    const [channel] = await channels.find([
      {
        key: 'channelId',
        comparisonOperator: '=',
        value: message.channelId
      },
      {
        key: 'guildId',
        comparisonOperator: '=',
        value: message.guildId
      },
      {
        key: 'type',
        comparisonOperator: '=',
        value: type
      },
      {
        key: 'isAlert',
        comparisonOperator: '=',
        value: false
      }
    ]);

    if (channel) {
      console.log(
        `Channel with type ${type} in channel ${message.channelId} of guild ${message.guildId} already registered`
      );
      await message.reply(`Channel is already registered for ${type}`);
      return false;
    }

    await channels.insert({
      channelId: message.channelId,
      guildId: message.guildId,
      isAlert: false,
      type
    });
    await message.reply(`Using current channel for ${type}`);
    return true;
  } catch (error) {
    console.log('Set channel error', error);
    return false;
  }
}

async function removeChannelId(message) {
  try {
    if (!message.content.startsWith(COMMANDS_LIST.REMOVE_CHANNEL) || message.author.bot) {
      return false;
    }

    const type = message.split(' ')[1];

    if (!CHANNEL_TYPES.includes(type)) {
      console.log(`Invalid channel type ${type} for channel ${message.channelId} in guild ${message.guildId}`);
      await message.reply(`Invalid channel type. [${CHANNEL_TYPES.join(', ')}]`);
      return false;
    }

    await channels.delete([
      {
        key: 'channelId',
        comparisonOperator: '=',
        value: message.channelId
      },
      {
        key: 'guildId',
        comparisonOperator: '=',
        value: message.guildId
      },
      {
        key: 'isAlert',
        comparisonOperator: '=',
        value: false
      },
      {
        key: 'type',
        comparisonOperator: '=',
        value: type
      }
    ]);
    await message.reply(`Removed current channel for ${type}`);
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

    let filters = [];
    if (message.content === COMMANDS_LIST.CLEAR_GUILD) {
      filters.push({ key: 'guildId', comparisonOperator: '=', value: message.guildId });
    }

    await channels.delete(filters);
    await message.reply('Removed channels');
    return true;
  } catch (error) {
    console.log('Clear channels error', error);
    return false;
  }
}

async function setAlertChannel(message) {
  try {
    if (message.content !== COMMANDS_LIST.SET_ALERT_CHANNEL || message.author.bot) {
      return false;
    }

    const [channel] = await channels.find([
      {
        key: 'channelId',
        comparisonOperator: '=',
        value: message.channelId
      },
      {
        key: 'guildId',
        comparisonOperator: '=',
        value: message.guildId
      },
      {
        key: 'isAlert',
        comparisonOperator: '=',
        value: true
      }
    ]);

    if (channel) {
      console.log(`Alert Channel ${message.channelId} in guild ${message.guildId} already registered`);
      await message.reply('Channel is already registered');
      return false;
    }

    await channels.insert({
      channelId: message.channelId,
      guildId: message.guildId,
      isAlert: true,
      type: 'alerts'
    });
    await message.reply('Using current channel as alert');
    return true;
  } catch (error) {
    console.log('Set channel error', error);
    return false;
  }
}

async function removeAlertChannel(message) {
  try {
    if (message.content !== COMMANDS_LIST.REMOVE_ALERT || message.author.bot) {
      return false;
    }

    await channels.delete([
      {
        key: 'channelId',
        comparisonOperator: '=',
        value: message.channelId
      },
      {
        key: 'guildId',
        comparisonOperator: '=',
        value: message.guildId
      },
      {
        key: 'isAlert',
        comparisonOperator: '=',
        value: true
      }
    ]);
    await message.reply('Removed current channel');
    return true;
  } catch (error) {
    console.log('Remove channel error', error);
    return false;
  }
}

const COMMAND_HANDLERS = {
  [COMMANDS_LIST.SET_CHANNEL]: setChannelId,
  [COMMANDS_LIST.REMOVE_CHANNEL]: '',
  [COMMANDS_LIST.CLEAR_GUILD]: '',
  [COMMANDS_LIST.CLEAR_ALL]: '',
  [COMMANDS_LIST.SET_ALERT_CHANNEL]: '',
  [COMMANDS_LIST.REMOVE_ALERT]: ''
};

module.exports = {
  setChannelId,
  removeChannelId,
  clearChannels,
  setAlertChannel,
  removeAlertChannel
};
