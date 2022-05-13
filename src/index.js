if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const { Client, Intents } = require('discord.js');
const {
  subscribeMerchantFound,
  subscribeMerchantVote,
  subscribeHasActiveMerchants,
  initialize
} = require('./merchants');
const { findBy, insertMessage, deleteAll, checkConnection, getAllChannels } = require('./database');
const { setChannelId, removeChannelId } = require('./commands');

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
  const foundChannels = channelsList.map(({ channelId }) => client.channels.cache.get(channelId));

  if (!foundChannels || (foundChannels && !foundChannels.length)) {
    channels = [];
  } else {
    channels = foundChannels;
  }
};

const handleMerchantFound = async (server, merchant) => {
  const { activeMerchants } = merchant;
  await Promise.all(
    activeMerchants.map(async activeMerchant => {
      const { id, name, zone, card, rapport } = activeMerchant;

      if (
        card.rarity < Number(process.env.CARD_RARITY_THRESHOLD) &&
        rapport.rarity < Number(process.env.RAPPORT_RARITY_THRESHOLD)
      ) {
        return;
      }

      await Promise.all(
        channels.map(async channel => {
          const [message] = await findBy({ merchantId: id, channelId: channel.id });
          if (message) {
            return;
          }

          const sent = await channel.send(
            `${card.name.toLowerCase() === 'wei' ? '@everyone' : ''}
\`\`\`
Nombre: ${name}
Zona: ${zone}
Carta: ${card.name}
Rapport: ${rapport.name} (${rarities[rapport.rarity]})
Votos: 0
\`\`\``
          );

          await insertMessage(sent.id, id, channel.id);
        })
      );
    })
  );
};

const handleVotesChanged = (merchantId, votes) =>
  channels.forEach(async channel => {
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
  await deleteAll();
};

const handleClientReady = client => async () => {
  console.log('Logged in to Discord...');
  if (!channels.length) {
    await registerChannels(client);
    console.log('Initialized channels', channels.length);
  }

  subscribeMerchantFound(handleMerchantFound);
  subscribeMerchantVote(handleVotesChanged);
  subscribeHasActiveMerchants(handleHasActiveMerchants);
};

async function main() {
  try {
    await checkConnection();
    const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

    await initialize();
    await client.login(process.env.DISCORD_TOKEN);

    if (client.isReady()) {
      handleClientReady(client)();
    } else {
      client.on('ready', handleClientReady(client));
    }

    client.on('messageCreate', async message => {
      const results = await Promise.all([setChannelId(message), removeChannelId(message)]);
      if (results.some(Boolean)) {
        await registerChannels(client);
        console.log('Updated channels', channels.length);
      }
    });
  } catch (error) {
    console.log(error);
    process.exit(0);
  }
}

main();
