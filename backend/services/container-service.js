/**
 * Container Service
 *
 * Docker backend via Hetzner dedicated servers.
 *
 * Uses Object.assign to copy properties onto the original exports object,
 * avoiding circular dependency issues with module.exports reassignment.
 */

console.log('🐳 [Infra] Using Docker backend (Hetzner)');
const service = require('./docker-service');

// Copy all properties and prototype methods onto this module's exports
// This preserves the original exports reference for circular dependencies
const proto = Object.getPrototypeOf(service);
const protoMethods = Object.getOwnPropertyNames(proto)
    .filter(k => k !== 'constructor' && typeof service[k] === 'function')
    .reduce((acc, k) => { acc[k] = service[k].bind(service); return acc; }, {});

Object.assign(module.exports, service, protoMethods);
