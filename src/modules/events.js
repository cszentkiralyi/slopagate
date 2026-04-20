const events = require('node:events');

class Wrapper extends events.EventEmitter {
  emit(event, ...args) {
    console.log('Event', event, args);
    super.emit(event, ...args);
  }
}

const Events = new events.EventEmitter();
//const Events = new Wrapper();

module.exports = Events;