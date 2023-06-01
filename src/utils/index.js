function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const formatError = (context, error) => ({
  timestamp: new Date().toISOString(),
  context,
  message: error?.message || error,
  stack: error?.stack
});

module.exports = {
  sleep,
  formatError
};
