// src/lib/logger.ts
'use client';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isDev = process.env.NODE_ENV === 'development';

  log(level: LogLevel, message: string, ...args: unknown[]) {
    const prefix = `[${level.toUpperCase()}]`;
    if (level === 'debug' && this.isDev) {
      console.log(prefix, message, ...args);
    } else if (level === 'info' && this.isDev) {
      console.info(prefix, message, ...args);
    } else if (level === 'warn') {
      console.warn(prefix, message, ...args);
    } else if (level === 'error') {
      console.error(prefix, message, ...args);
    }
  }

  debug(message: string, ...args: unknown[]) {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]) {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]) {
    this.log('error', message, ...args);
  }
}

export const logger = new Logger();

export function logError(error: unknown, context?: string) {
  if (error instanceof Error) {
    logger.error(`${context ?? 'Error'}: ${error.message}`, { stack: error.stack });
  } else {
    logger.error(context ?? 'Unknown error', { error });
  }
}