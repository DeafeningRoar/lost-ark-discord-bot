if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const { Client, Intents } = require('discord.js');
const {
  subscribeMerchantFound,
  subscribeMerchantVote,
  subscribeHasActiveMerchants,
  subscribeOnReconnect,
  getActiveMerchants,
  initialize
} = require('./merchants');
const { findBy, insertMessage, deleteAll, checkConnection, getAllChannels, getChannel } = require('./database');
const { setChannelId, removeChannelId, clearChannels, setAlertChannel, removeAlertChannel } = require('./commands');
const merchants = require('../merchants.json');
const emitter = require('./eventEmitter');
const { formatError } = require('./utils');

const rarities = {
  0: 'Common',
  1: 'Uncommon',
  2: 'Rare',
  3: 'Epic',
  4: 'Legendary'
};

let channels = [];

const registerChannels = async client => {
  const channelsList = await getAllChannels();
  const foundChannels = channelsList.map(({ channelId }) => client.channels.cache.get(channelId)).filter(Boolean);

  if (!foundChannels || (foundChannels && !foundChannels.length)) {
    channels = [];
  } else {
    channels = foundChannels;
  }
};

const getRemainingTime = () => {
  const currentDate = new Date();
  currentDate.setUTCMinutes(55, 0, 0);
  return Math.floor(currentDate.getTime() / 1000);
};

const handleMerchantFound = (channelsList = channels) => async (server, merchant) => {
  const { activeMerchants } = merchant;
  await Promise.all(
    activeMerchants.map(async activeMerchant => {
      const { id, name, zone, card, rapport, votes } = activeMerchant;

      if (
        card.rarity < Number(process.env.CARD_RARITY_THRESHOLD) &&
        rapport.rarity < Number(process.env.RAPPORT_RARITY_THRESHOLD)
      ) {
        return;
      }

      await Promise.all(
        channelsList.map(async channel => {
          const [message] = await findBy({ merchantId: id, channelId: channel.id });
          if (message) {
            return;
          }

          const sent = await channel.send({
            content: `${card.name.toLowerCase() === 'wei' ? '@everyone' : ''}
Expiración: <t:${getRemainingTime()}:R>\`\`\`
Nombre: ${name}
Región: ${merchants[name]?.Region || '??'}
Zona: ${zone}
Carta: ${card.name} (${rarities[card.rarity]})
Rapport: ${rapport.name} (${rarities[rapport.rarity]})
Votos: ${votes}
\`\`\``,
            files: [
              {
                attachment: __dirname + '/../assets/zones/' + zone + '.jpg',
                name: zone + '.jpg'
              }
            ]
          });

          await insertMessage(sent.id, id, channel.id);
        })
      );
    })
  );
};

const handleVotesChanged = (channelsList = channels) => (merchantId, votes) =>
  channelsList.forEach(async channel => {
    const [message] = await findBy({ merchantId, channelId: channel.id });
    if (!message) {
      console.log(`No message found for merchantId ${merchantId} and channelId ${channel.id}`);
      return;
    }
    const regex = new RegExp(/Votos: -?[0-9]+/, 'g');
    const discordMessage = await channel.messages.fetch(message.messageId);
    await discordMessage.edit(discordMessage.content.replace(regex, `Votos: ${votes}`));
  });

const handleHasActiveMerchants = async hasActiveMerchants => {
  if (hasActiveMerchants) return;
  try {
    const regex = /Expiración: <t:([0-9]+):R>/;
    const regExp = new RegExp(regex, 'g');
    await Promise.all(
      channels.map(async channel => {
        const messages = await findBy({ channelId: channel.id });
        await Promise.all(
          messages.map(async ({ messageId }) => {
            const message = await channel.messages.fetch(messageId);
            const timestamp = message.content.match(regex)?.[1];
            if (!timestamp) return;
            await message.edit(message.content.replace(regExp, `Expiración: <t:${timestamp}:f>`));
          })
        );
      })
    );
  } catch (error) {
    console.log('Error formatting timestamps', error);
    emitter.emit('HandlerError', formatError('handleHasActiveMerchants', error));
  }
  await deleteAll();
};

const notifiyInitialMerchants = async (channelsList = channels) => {
  console.log('Notifiying initial merchants to channels', channelsList.map(c => c.id).filter(Boolean));
  if (!channelsList.length) return;
  // Initial merchants setup in case server restarts during notifications
  const activeMerchants = await getActiveMerchants();
  console.log('Initial merchants count', activeMerchants?.length || null);
  if (activeMerchants && activeMerchants.length) {
    await Promise.all(
      activeMerchants.map(async activeMerchant => handleMerchantFound(channelsList)(null, activeMerchant))
    );
  }
};

const handleClientReady = client => async () => {
  console.log('Logged in to Discord...');
  if (!channels.length) {
    await registerChannels(client);
    console.log('Initialized channels', channels.length);
  }
  await initialize();
};

const notifyAlertChannels = client => async message => {
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
};

async function main() {
  try {
    await checkConnection();
    const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

    await client.login(process.env.DISCORD_TOKEN);

    if (client.isReady()) {
      handleClientReady(client)();
    } else {
      client.on('ready', handleClientReady(client));
    }

    client.on('messageCreate', async message => {
      if (message.author.bot) return;
      const [successSet, successRemove] = await Promise.all([
        setChannelId(message),
        removeChannelId(message),
        clearChannels(message),
        setAlertChannel(message),
        removeAlertChannel(message)
      ]);
      if (successSet || successRemove) {
        await registerChannels(client);
        console.log('Updated channels', channels.length);
      }

      if (successSet) {
        const channel = channels.find(c => c.id === message.channelId && c.guildId === message.guildId);
        await notifiyInitialMerchants([channel]);
      }
    });

    emitter.on('MerchantsError', notifyAlertChannels(client));
    emitter.on('HandlerError', notifyAlertChannels(client));
  } catch (error) {
    console.log(error);
    emitter.emit('ProcessError');
  }
}

emitter.on('MerchantsReady', async () => {
  console.log('MerchantsHub Initialized');
  console.log('Subscribing to events');
  await notifiyInitialMerchants();

  subscribeMerchantFound(handleMerchantFound());
  subscribeMerchantVote(handleVotesChanged());
  subscribeHasActiveMerchants(handleHasActiveMerchants);
  subscribeOnReconnect(notifiyInitialMerchants);
});

emitter.on('ProcessError', async () => {
  await main();
});

main();
