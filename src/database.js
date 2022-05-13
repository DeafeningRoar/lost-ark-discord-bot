const knex = require('knex');
const uuid = require('uuid').v4;
const config = require('../knexFile');

const db = knex(config[process.env.NODE_ENV || 'development']);

function findBy(params) {
  console.log('Executing findBy', params);
  return db('messages').where(params);
}

function insertMessage(messageId, merchantId, channelId) {
  console.log('Executing Insert', { messageId, merchantId, channelId });
  return db('messages').insert({
    id: uuid(),
    merchantId,
    messageId,
    channelId
  });
}

function deleteAll() {
  console.log('Executing Delete');
  return db('messages').del();
}

async function checkConnection() {
  console.log('Checking DB connection...');
  const result = await db.raw('select 1 + 1 as result');
  console.log('Connection OK');
  return result;
}

async function insertChannel(channelId, guildId) {
  console.log('Exetuing Insert', { channelId, guildId });
  return db('channels').insert({
    id: uuid(),
    channelId,
    guildId
  });
}

function removeChannel(channelId, guildId) {
  console.log('Executing Delete', { channelId, guildId });
  return db('channels').where({ channelId, guildId }).del();
}

function getAllChannels() {
  return db('channels').select();
}

module.exports = {
  findBy,
  insertMessage,
  deleteAll,
  checkConnection,
  insertChannel,
  removeChannel,
  getAllChannels
};
