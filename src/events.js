const events = require('node:events');

const { Logger } = require('./util.js');

class Wrapper extends events.EventEmitter {
  emit(event, ...args) {
    Logger.log(`EVENT(${event}) ${JSON.stringify(args)}`);
    super.emit(event, ...args);
  }
}

const Events = new events.EventEmitter();
//const Events = new Wrapper();

module.exports = Events;