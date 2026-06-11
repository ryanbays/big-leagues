const { startBot } = require('./src/discord/bot');
const { createLogger } = require('./src/logger');

const logger = createLogger('index');

logger.info('Starting application bootstrap.');

startBot();
