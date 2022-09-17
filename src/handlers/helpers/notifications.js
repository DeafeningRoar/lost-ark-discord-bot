const { inspect } = require('util');
const { getChannel } = require('../../database');

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
          `
\`\`\`
${inspect(message, false, null, false)}
\`\`\``
        )
      )
    );
  } catch (error) {
    console.log('Error notifying alerts', error);
  }
}

module.exports = {
  notifyAlert
};
