const knex = require('knex');
const uuid = require('uuid').v4;
const config = require('../../knexFile');

/**
 * @typedef QueryFilter
 *
 * @property {string} key
 * @property {'='|'!='|'>'|'<'|'<='|'>='|'is not'|'is'} comparisonOperator
 * @property {string|number|null} value
 */

const db = knex(config[process.env.NODE_ENV || 'development']);

class Database {
  constructor(entity) {
    this.db = db;
    this.entity = entity;
  }

  /**
   * @param {Object} query - Knex query instance
   * @param {QueryFilter[]}filters
   */
  parseFilters(query, filters) {
    for (const filter of filters) {
      const { key, comparisonOperator, value } = filter;
      query.where(key, comparisonOperator, value);
    }
  }

  async connectionCheck() {
    console.log('Checking DB connection...');
    const result = await this.db.raw('select 1 + 1 as result');
    console.log('Connection OK');
    return result;
  }

  /**
   * @param {QueryFilter[]} filters
   */
  async find(filters) {
    console.log('Executing Find', this.entity, JSON.stringify(filters));
    const query = this.db(this.entity);
    this.parseFilters(query, filters);

    return query;
  }

  /**
   * @param {object} data
   */
  async insert(data) {
    console.log('Executing Insert', this.entity, JSON.stringify(data));
    return this.db(this.entity).insert({
      id: uuid(),
      ...data
    });
  }

  /**
   * @param {QueryFilter[]} filters
   */
  async delete(filters) {
    console.log('Executing Delete', this.entity, JSON.stringify(filters));
    const query = this.db(this.entity);
    this.parseFilters(query, filters);
    return query.del();
  }

  /**
   * @param {QueryFilter[]} filters
   * @param {object} data
   */
  async update(filters, data) {
    console.log('Executing Update', this.entity, JSON.stringify(filters), JSON.stringify(data));
    const query = this.db(this.entity);
    this.parseFilters(query, filters);
    return query.update(data);
  }
}

module.exports = Database;
