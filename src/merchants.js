if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const signalR = require('@microsoft/signalr');

let connection = null;

const serverName = 'Yorn';
const FIVE_MINUTES_MS = 300000;

async function initialize() {
  if (connection !== null) return;

  connection = new signalR.HubConnectionBuilder()
    .withUrl(process.env.MERCHANTS_HUB_URL, {
      skipNegotiation: true,
      transport: signalR.HttpTransportType.WebSockets
    })
    .withAutomaticReconnect([FIVE_MINUTES_MS, FIVE_MINUTES_MS, FIVE_MINUTES_MS, FIVE_MINUTES_MS, FIVE_MINUTES_MS])
    .configureLogging(Number(process.env.SIGNALR_LOG_LEVEL || 1))
    .build();
  connection.serverTimeoutInMilliseconds = 120000;
  connection.keepAliveIntervalInMilliseconds = 60000;

  await connection.start();
  console.log('Started LostMerchants connection...');

  await connection.invoke('SubscribeToServer', serverName);
  console.log('Subscribed to server', serverName);

  setInterval(() => connection.invoke('HasNewerClient', 1), 50000);
}

function subscribeMerchantFound(callback) {
  if (connection === null) return;

  connection.on('UpdateMerchantGroup', callback);
}

function subscribeMerchantVote(callback) {
  if (connection === null) return;

  connection.on('UpdateVoteTotal', callback);
}

function subscribeHasActiveMerchants(callback) {
  if (connection === null) return;

  setInterval(async () => {
    const hasMerchants = await connection.invoke('GetKnownActiveMerchantGroups', serverName);
    callback(hasMerchants);
  }, FIVE_MINUTES_MS * 2);
}

async function getActiveMerchants() {
  if (connection === null) return;

  return connection.invoke('GetKnownActiveMerchantGroups', serverName);
}

module.exports = {
  initialize,
  subscribeMerchantFound,
  subscribeMerchantVote,
  subscribeHasActiveMerchants,
  getActiveMerchants
};
