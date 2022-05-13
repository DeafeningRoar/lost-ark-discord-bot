const knex = require('knex');
const uuid = require('uuid').v4;
const config = require('./knexFile');

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
  console.log('Executing delete');
  return db('messages').del();
}

module.exports = {
  findBy,
  insertMessage,
  deleteAll
};
