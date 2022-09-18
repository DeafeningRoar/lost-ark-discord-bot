const { CronJob } = require('cron');
const moment = require('moment-timezone');
const emitter = require('./eventEmitter');
const { EVENTS } = require('../config/constants');
const islandsList = require('../config/islands.json');
const { formatError } = require('../utils');

const tzOffset = -4;
const schedules = [11, 13, 15, 19, 21, 23];

class IslandTracker {
  constructor() {
    this.islands = islandsList;
    this.dailyIslands = this.getDailyIslands();
    this.job = null;
    this.isStartingSoon = false;
  }

  getDailyIslands() {
    const current = moment().utcOffset(tzOffset);
    const currentDate = current.date();
    const currentMonth = current.month() + 1;
    const isWeekend = [0, 6].includes(current.day());
    const isSecondSchedule = current.get('hour') > 15;

    return this.islands.filter(island => {
      const appearanceDate = new Date(island.date).getUTCDate();
      const appearanceMonth = new Date(island.date).getUTCMonth() + 1;
      const isToday = appearanceDate === currentDate && appearanceMonth === currentMonth;

      if (!isToday) return false;

      if (isWeekend) {
        if ((isSecondSchedule && !island.isSecondSchedule) || (!isSecondSchedule && island.isSecondSchedule)) {
          return false;
        }
        return isToday;
      }

      return isToday;
    });
  }

  setupTracker() {
    if (this.job) {
      emitter.emit(EVENTS.NOTIFY_ALERT, formatError('setupTracker', { message: 'Cron job already started' }));
      return null;
    }

    this.job = new CronJob({
      cronTime: '*/5 * * * *', // Every 5 minutes
      onTick: () => {
        console.log('Executing islands cronjob');
        try {
          const islands = this.getDailyIslands();
          const currentTime = moment().utcOffset(tzOffset);
          const isWeekend = [0, 6].includes(currentTime.day());
          let upcomingTime;
          const isStartingSoon = schedules.some(schedule => {
            if (schedule === 15 && !isWeekend) {
              return false;
            }

            const islandSchedule = moment().utcOffset(tzOffset).startOf('D');
            islandSchedule.set('hour', schedule);
            const minutesDiff = islandSchedule.diff(currentTime, 'minutes');

            if (minutesDiff > 0 && minutesDiff <= 25) {
              upcomingTime = islandSchedule.valueOf();

              return true;
            }

            return false;
          });

          if (isStartingSoon) {
            emitter.emit(EVENTS.ISLAND_ALERT, islands, upcomingTime);
          }

          if (!isStartingSoon) {
            emitter.emit(EVENTS.ISLANDS_CLEANUP);
          }
        } catch (error) {
          emitter.emit(EVENTS.NOTIFY_ALERT, formatError('setupTracker - onTick', error));
        }
      },
      onComplete: () => {
        emitter.emit(EVENTS.NOTIFY_ALERT, formatError('setupTracker - onComplete', { message: 'Finished Cron job' }));
      },
      start: true,
      utcOffset: tzOffset
    });
  }

  stopTracker() {
    if (!this.job) {
      emitter.emit(EVENTS.NOTIFY_ALERT, formatError('stopTracker', { message: 'No active cron job found!' }));
      return null;
    }

    this.job.stop();
  }
}

module.exports = IslandTracker;
