const Database = require('./database');

class Messages extends Database {
  constructor() {
    super('messages');
  }
}

module.exports = Messages;
