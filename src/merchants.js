if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const signalR = require('@microsoft/signalr');

let connection = null;

const serverName = 'Yorn';
const FIVE_MINUTES_MS = 300000;

const connectionSetup = () => {
  connection = new signalR.HubConnectionBuilder()
    .withUrl(process.env.MERCHANTS_HUB_URL, {
      skipNegotiation: true,
      transport: signalR.HttpTransportType.WebSockets
    })
    .withAutomaticReconnect([FIVE_MINUTES_MS, FIVE_MINUTES_MS, FIVE_MINUTES_MS, FIVE_MINUTES_MS, FIVE_MINUTES_MS])
    .configureLogging(Number(process.env.SIGNALR_LOG_LEVEL || 1))
    .build();
  connection.serverTimeoutInMilliseconds = FIVE_MINUTES_MS * 2;
  connection.keepAliveIntervalInMilliseconds = FIVE_MINUTES_MS * 1.2;
};

async function initialize() {
  try {
    if (connection !== null) return;

    connectionSetup();

    await connection.start();
    console.log('Started LostMerchants connection...');

    await connection.invoke('SubscribeToServer', serverName);
    console.log('Subscribed to server', serverName);

    setInterval(async () => {
      try {
        if (connection.state !== 'Connected') {
          return;
        }

        await connection.invoke('HasNewerClient', 1);
      } catch (error) {
        console.log('Error calling HasNewerClient', error);
      }
    }, FIVE_MINUTES_MS);
  } catch (error) {
    console.log('Merchants Initialize error', error);
    return Promise.reject(error);
  }
}

function subscribeMerchantFound(callback) {
  if (connection.state !== 'Connected') return;

  connection.on('UpdateMerchantGroup', callback);
}

function subscribeMerchantVote(callback) {
  if (connection.state !== 'Connected') return;

  connection.on('UpdateVoteTotal', callback);
}

function subscribeHasActiveMerchants(callback) {
  if (connection.state !== 'Connected') return;

  setInterval(async () => {
    try {
      if (connection.state !== 'Connected') return;
      const hasMerchants = await connection.invoke('GetKnownActiveMerchantGroups', serverName);
      callback(hasMerchants);
    } catch (error) {
      console.log('Error calling GetKnownActiveMerchantGroups (Interval)', error);
      return true;
    }
  }, FIVE_MINUTES_MS * 2);
}

async function getActiveMerchants() {
  try {
    if (connection.state !== 'Connected') return;

    return connection.invoke('GetKnownActiveMerchantGroups', serverName);
  } catch (error) {
    console.log('Error calling GetKnownActiveMerchantGroups', error);
    return [];
  }
}

async function subscribeOnReconnect(callback) {
  try {
    connection.onreconnected(async () => {
      console.log('Successfully reconnected to Merchants');
      await callback();
    });
  } catch (error) {
    console.log('Error onReconnected handler', error);
  }
}

module.exports = {
  initialize,
  subscribeMerchantFound,
  subscribeMerchantVote,
  subscribeHasActiveMerchants,
  getActiveMerchants,
  subscribeOnReconnect
};
