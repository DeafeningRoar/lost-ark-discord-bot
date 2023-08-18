const { inspect } = require('util');

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const formatError = (context, error) =>
  inspect(
    {
      timestamp: new Date().toISOString(),
      context,
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
