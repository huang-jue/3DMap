export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

export interface Logger {
  error(...args: unknown[]): void
  warn(...args: unknown[]): void
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
}

let currentLevel: LogLevel = 'warn'

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

export function getLogLevel(): LogLevel {
  return currentLevel
}

export function createLogger(scope: string): Logger {
  const prefix = `[cesium-kit:${scope}]`

  const enabled = (level: LogLevel): boolean =>
    LEVEL_WEIGHT[level] <= LEVEL_WEIGHT[currentLevel]

  return {
    error(...args) {
      if (enabled('error')) console.error(prefix, ...args)
    },
    warn(...args) {
      if (enabled('warn')) console.warn(prefix, ...args)
    },
    info(...args) {
      if (enabled('info')) console.info(prefix, ...args)
    },
    debug(...args) {
      if (enabled('debug')) console.debug(prefix, ...args)
    }
  }
}
