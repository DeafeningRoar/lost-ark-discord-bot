const FIVE_MINUTES_MS = 300000;

const MERCHANTS_HUB_ACTIONS = {
  GET_KNOWN_ACTIVE_MERCHANT_GROUPS: 'GetKnownActiveMerchantGroups',
  UPDATE_MERCHANT_GROUP: 'UpdateMerchantGroup',
  UPDATE_VOTES: 'UpdateVotes',
  SUBSCRIBE_TO_SERVER: 'SubscribeToServer'
};

const DISCORD_ACTIONS = {
  MESSAGE_CREATE: 'messageCreate'
};

const EVENTS = {
  MERCHANT_FOUND: 'MerchantFound',
  MERCHANT_VOTES_CHANED: 'MerchantVotesChanged',
  MERCHANTS_HUB_RECONNECTED: 'MerchantsHubReconnected',
  MERCHANTS_CONNECTION_ERROR: 'MerchantsConnectionError',
  MERCHANTS_HUB_RECONNECTING: 'MerchantsHubReconnecting',
  MERCHANTS_READY: 'MerchantsReady',
  ERROR: 'error',
  DISCORD_CONNECTION_ERROR: 'DiscordConnectionError',
  DISCORD_READY: 'DiscordReady',
  DISCORD_MESSAGE_CREATED: 'DiscordMessageCreated',
  NOTIFY_ALERT: 'NotifyAlert',
  PROCESS_ERROR: 'ProcessError',
  MERCHANTS_LIST_CHECK: 'MerchantsListCheck',
  ISLAND_ALERT: 'IslandAlert',
  ISLANDS_CLEANUP: 'IslandsCleanup'
};

const RARITIES = {
  0: 'Common',
  1: 'Uncommon',
  2: 'Rare',
  3: 'Epic',
  4: 'Legendary'
};

const SERVER_ROLES = {
  Arthetine: process.env.ARTHETINE,
  Blackfang: process.env.BLACKFANG
};

module.exports = {
  FIVE_MINUTES_MS,
  MERCHANTS_HUB_ACTIONS,
  DISCORD_ACTIONS,
  EVENTS,
  RARITIES,
  SERVER_ROLES
};
