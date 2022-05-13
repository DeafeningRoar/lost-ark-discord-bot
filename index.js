if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const { Client, Intents } = require('discord.js');
const {
  subscribeMerchantFound,
  subscribeMerchantVote,
  subscribeHasActiveMerchants,
  initialize
} = require('./merchants');

const channelIds = JSON.parse(process.env.CHANNEL_IDS);

const sentMessagesIdsMap = new Map();

const rarities = {
  0: 'Common',
  1: 'Uncommon',
  2: 'Rare',
  3: 'Epic',
  4: 'Legendary'
};

const handleMerchantFound = channels => (server, merchant) => {
  const { activeMerchants } = merchant;
  const { id, name, zone, card, rapport } = activeMerchants[0];
  if (
    card.rarity !== Number(process.env.CARD_RARITY_THRESHOLD) &&
    rapport.rarity !== Number(process.env.RAPPORT_RARITY_THRESHOLD)
  ) {
    return;
  }

  channels.map(async channel => {
    const sent = await channel.send(
      `
\`\`\`
Nombre: ${name}
Zona: ${zone}
Carta: ${card.name}
Rapport: ${rapport.name} (${rarities[rapport.rarity]})
Votos: 0
\`\`\``
    );

    if (sentMessagesIdsMap.has(id)) {
      const messages = sentMessagesIdsMap.get(id);
      messages.push(sent);
      sentMessagesIdsMap.set(id, messages);
    } else {
      sentMessagesIdsMap.set(id, [sent]);
    }
  });
};

const handleVotesChanged = async (merchantId, votes) => {
  const messages = sentMessagesIdsMap.get(merchantId);
  if (!messages || (messages && !messages.length)) {
    console.log('No message found for merchantId', merchantId);
    return;
  }
  const regex = new RegExp(/Votos: -?[0-9]+/, 'g');
  messages.forEach(message => message.edit(message.content.replace(regex, `Votos: ${votes}`)));
};

const handleHasActiveMerchants = hasActiveMerchants => {
  if (hasActiveMerchants) return;
  sentMessagesIdsMap.clear();
};

const handleClientReady = client => () => {
  console.log('Logged in to Discord...');
  const channels = channelIds.map(channelId => client.channels.cache.get(channelId));
  subscribeMerchantFound(handleMerchantFound(channels));
  subscribeMerchantVote(handleVotesChanged);
  subscribeHasActiveMerchants(handleHasActiveMerchants);
};

async function main() {
  try {
    const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

    await initialize();
    await client.login(process.env.DISCORD_TOKEN);

    if (client.isReady()) {
      handleClientReady(client)();
    } else {
      client.on('ready', handleClientReady(client));
    }
  } catch (error) {
    console.log(error);
    process.exit(0);
  }
}

main();
