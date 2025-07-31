class Logger {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  formatMessage(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...data
    };

    if (this.isDevelopment) {
      // Pretty print for development with emojis
      const emoji = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
        debug: '🐛'
      }[level] || 'ℹ️';
      
      console.log(`${emoji} [${timestamp}] ${level.toUpperCase()}: ${message}`);
      if (Object.keys(data).length > 0) {
        console.log('   Data:', JSON.stringify(data, null, 2));
      }
    } else {
      // JSON format for production
      console.log(JSON.stringify(logEntry));
    }
  }

  info(message, data = {}) {
    this.formatMessage('info', message, data);
  }

  warn(message, data = {}) {
    this.formatMessage('warn', message, data);
  }

  error(message, data = {}) {
    this.formatMessage('error', message, data);
  }

  debug(message, data = {}) {
    if (this.isDevelopment) {
      this.formatMessage('debug', message, data);
    }
  }
}

export const logger = new Logger();
