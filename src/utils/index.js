const { inspect } = require('util');

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const formatError = (context, error, data = null) =>
  inspect(
    {
      timestamp: new Date().toISOString(),
      context,
      data,
      message: error?.message || error,
      stack: error?.stack
    },
    false,
    null,
    false
  );

module.exports = {
  sleep,
  formatError
};
