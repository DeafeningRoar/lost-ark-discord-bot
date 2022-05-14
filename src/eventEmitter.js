const EventEmitter = require('events');

let emitter = null;

if (emitter === null) {
  emitter = new EventEmitter({ captureRejections: true });

  emitter.on('error', console.log);
}

module.exports = emitter;
