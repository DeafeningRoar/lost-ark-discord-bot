const knex = require('knex');
const uuid = require('uuid').v4;
const config = require('../../knexFile');

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

async function insertChannel(channelId, guildId, isAlert = false) {
  console.log('Exetuing Insert', { channelId, guildId, isAlert });
  return db('channels').insert({
    id: uuid(),
    channelId,
    guildId,
    isAlert
  });
}

function removeChannel(channelId, guildId, isAlert) {
  console.log('Executing Delete', { channelId, guildId, isAlert });
  return db('channels').where({ channelId, guildId, isAlert }).del();
}

function getAllChannels() {
  return db('channels').where({ isAlert: false }).select();
}

function getChannel(params) {
  return db('channels').where(params);
}

function removeChannels(params) {
  if (params) {
    console.log('Executing Delete Channels', params);
    return db('channels').where(params).del();
  }
  console.log('Executing Delete All Channels');
  return db('channels').del();
}

module.exports = {
  findBy,
  insertMessage,
  deleteAll,
  checkConnection,
  insertChannel,
  removeChannel,
  getAllChannels,
  getChannel,
  removeChannels
};
