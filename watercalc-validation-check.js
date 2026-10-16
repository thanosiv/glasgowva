const fs = require('fs');
const vm = require('vm');

function makeEl(id) {
  return {
    id,
    value: '',
    textContent: '',
    className: '',
    attributes: {},
    classList: { add() {}, remove() {} },
    addEventListener(event, handler) {
      this._events = this._events || {};
      this._events[event] = handler;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}

const ids = ['water-calc-form','water-calc-input','water-calc-status','water-calc-output'];
const elements = Object.fromEntries(ids.map(id => [id, makeEl(id)]));
const document = {
  getElementById(id) { return elements[id] || null; },
  addEventListener(event, callback) {
    if (event === 'DOMContentLoaded') this._domReady = callback;
  }
};

const context = { document, console, Number, Math, String, Object, Array, parseFloat, isNaN, Intl, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(fs.readFileSync('c:/Users/cgibb/Documents/GlasgowWebsite-Final/watercalc.js', 'utf8'), context);
document._domReady();

const form = elements['water-calc-form'];
const input = elements['water-calc-input'];
const status = elements['water-calc-status'];

input.value = '4000';
form._events.submit({ preventDefault() {} });
console.log(status.textContent);
