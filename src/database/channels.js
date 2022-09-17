const Database = require('./database');

class Channels extends Database {
  constructor() {
    super('channels');
  }
}

module.exports = Channels;
