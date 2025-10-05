export class PnLLogger {
  // ...existing properties and constructor

  logInfo(message: string, meta?: any) {
    this.logger.info(message, meta);
  }

  logWarn(message: string, meta?: any) {
    this.logger.warn(message, meta);
  }

  logError(message: string | Error, meta?: any) {
    if (message instanceof Error) {
      this.logger.error('Bot Error', { message: message.message, stack: message.stack, ...meta });
    } else {
      this.logger.error(message, meta);
    }
  }

  // ...rest of existing methods
}
