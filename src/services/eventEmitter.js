const EventEmitter = require('events');

let emitter = null;

if (emitter === null) {
  emitter = new EventEmitter({ captureRejections: true });
}

module.exports = emitter;
