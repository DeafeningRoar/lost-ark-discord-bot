function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const formatError = (context, error) => ({
  context,
  message: error?.message || error,
  stack: error?.stack
});

module.exports = {
  sleep,
  formatError
};
