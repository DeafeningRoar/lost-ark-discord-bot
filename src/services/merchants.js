if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const signalR = require('@microsoft/signalr');
const emitter = require('./eventEmitter');

const { formatError } = require('../utils');
const { FIVE_MINUTES_MS, MERCHANTS_HUB_ACTIONS, EVENTS } = require('../config/constants');

class MerchantsHub {
  constructor({ server = 'Yorn' } = {}) {
    this.connection = null;
    this.server = server;
    this.interval = null;
  }

  setupConnection() {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(process.env.MERCHANTS_HUB_URL, {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect([FIVE_MINUTES_MS, FIVE_MINUTES_MS, FIVE_MINUTES_MS, FIVE_MINUTES_MS, FIVE_MINUTES_MS])
      .configureLogging(Number(process.env.SIGNALR_LOG_LEVEL || 1))
      .build();

    this.connection.serverTimeoutInMilliseconds = FIVE_MINUTES_MS * 2;
    this.connection.keepAliveIntervalInMilliseconds = FIVE_MINUTES_MS * 1.2;

    return this.connection;
  }

  async getActiveMerchantsList() {
    try {
      const merchants = await this.connection.invoke(
        MERCHANTS_HUB_ACTIONS.GET_KNOWN_ACTIVE_MERCHANT_GROUPS,
        this.server
      );
      return { server: this.server, merchants, error: false };
    } catch (error) {
      console.log('Error fetching active merchants list', error);
      emitter.emit(EVENTS.NOTIFY_ALERT, formatError('getActiveMerchantsList', error));
      return { server: this.server, merchants: [], error: true };
    }
  }

  initializeSubscriptions() {
    this.connection.on(MERCHANTS_HUB_ACTIONS.UPDATE_MERCHANT_GROUP, (server, merchant) => {
      console.log('Received found merchant event', { server, merchant });
      emitter.emit(EVENTS.MERCHANT_FOUND, { server, merchant });
    });

    this.connection.on(MERCHANTS_HUB_ACTIONS.UPDATE_VOTE_TOTAL, (merchantId, votes) => {
      console.log('Received merchant votes updated event', { merchantId, votes });
      emitter.emit(EVENTS.MERCHANT_VOTES_CHANED, { server: this.server, merchantId, votes });
    });

    this.connection.onreconnecting(error => {
      emitter.emit(EVENTS.MERCHANTS_HUB_RECONNECTING, formatError('Reconnecting', error));
    });

    this.connection.onreconnected(() => {
      console.log('Reconnected to MerchantsHub');
      emitter.emit(EVENTS.MERCHANTS_HUB_RECONNECTED);
    });

    this.interval = setInterval(async () => {
      console.log('Fetching active merchants list');
      const merchantsList = await this.getActiveMerchantsList();
      emitter.emit(EVENTS.MERCHANTS_LIST_CHECK, merchantsList);
    }, FIVE_MINUTES_MS);
  }

  async initialize() {
    try {
      if (this.connection !== null || (this.connection && this.connection.status === 'Connected')) {
        return false;
      }
      console.log('Connecting to MerchantsHub');
      this.setupConnection();

      await this.connection.start();
      console.log('Successfully connected to MerchantsHub');

      await this.connection.invoke('SubscribeToServer', this.server);
      console.log('Subscribed to MerchantsHub server', this.server);

      this.initializeSubscriptions();
      console.log('Initialized MerchantsHub subscriptions');

      return true;
    } catch (error) {
      console.log('Error connecting to MerchantsHub', error);
      emitter.emit(EVENTS.MERCHANTS_CONNECTION_ERROR, this);
      emitter.emit(EVENTS.NOTIFY_ALERT, formatError('MerchantsHub - initialize', error));
      clearInterval(this.interval);
      return false;
    }
  }
}

module.exports = MerchantsHub;
