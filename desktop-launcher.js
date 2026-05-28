const { startServer } = require("./server");

startServer({ openApp: true }).catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start desktop launcher:", error);
  process.exit(1);
});