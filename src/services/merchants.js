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
      .withAutomaticReconnect([
        FIVE_MINUTES_MS / 10,
        FIVE_MINUTES_MS / 2.5,
        FIVE_MINUTES_MS,
        FIVE_MINUTES_MS,
        FIVE_MINUTES_MS
      ])
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

  cleanUp() {
    try {
      this.connection.off(MERCHANTS_HUB_ACTIONS.UPDATE_MERCHANT_GROUP);
      this.connection.off(MERCHANTS_HUB_ACTIONS.UPDATE_VOTE_TOTAL);
    } catch (error) {
      console.log('Error cleaning up event listeners', error);
      emitter.emit(EVENTS.NOTIFY_ALERT, formatError('cleanUp', error));
    }
  }

  async initializeSubscriptions() {
    await this.connection.invoke(MERCHANTS_HUB_ACTIONS.SUBSCRIBE_TO_SERVER, this.server);
    console.log('Subscribed to MerchantsHub server', this.server);

    this.connection.on(MERCHANTS_HUB_ACTIONS.UPDATE_MERCHANT_GROUP, (server, merchant) => {
      console.log('Received found merchant event', { server, merchant });
      emitter.emit(EVENTS.MERCHANT_FOUND, { server, merchant });
    });

    this.connection.on(MERCHANTS_HUB_ACTIONS.UPDATE_VOTE_TOTAL, (merchantId, votes) => {
      console.log('Received merchant votes updated event', { merchantId, votes });
      emitter.emit(EVENTS.MERCHANT_VOTES_CHANED, { server: this.server, merchantId, votes });
    });
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

      await this.initializeSubscriptions();

      this.interval = setInterval(async () => {
        console.log('Fetching active merchants list');
        const merchantsList = await this.getActiveMerchantsList();
        emitter.emit(EVENTS.MERCHANTS_LIST_CHECK, merchantsList);
      }, FIVE_MINUTES_MS);

      console.log('Initialized MerchantsHub subscriptions');

      this.connection.onreconnecting(error => {
        emitter.emit(EVENTS.MERCHANTS_HUB_RECONNECTING, formatError('Reconnecting', error));
      });

      this.connection.onreconnected(async () => {
        try {
          console.log('Reconnected to MerchantsHub');
          this.cleanUp();
          await this.initializeSubscriptions();
          emitter.emit(EVENTS.MERCHANTS_HUB_RECONNECTED);
        } catch (error) {
          console.log('Error after reconnection', error);
          emitter.emit(EVENTS.NOTIFY_ALERT, formatError('onreconnected', error));
        }
      });

      return true;
    } catch (error) {
      console.log('Error connecting to MerchantsHub', error);
      clearInterval(this.interval);
      this.cleanUp();
      emitter.emit(EVENTS.MERCHANTS_CONNECTION_ERROR, this);
      emitter.emit(EVENTS.NOTIFY_ALERT, formatError('MerchantsHub - initialize', error));
      return false;
    }
  }
}

module.exports = MerchantsHub;
