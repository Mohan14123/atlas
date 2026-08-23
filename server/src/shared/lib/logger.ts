type Level = 'info' | 'warn' | 'error' | 'debug';

let _service = 'app';

function log(level: Level, message: string, meta?: object): void {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, service: _service, message, ...meta }) + '\n',
  );
}

export const logger = {
  setService: (s: string) => { _service = s; },
  info:  (msg: string, meta?: object) => log('info',  msg, meta),
  warn:  (msg: string, meta?: object) => log('warn',  msg, meta),
  error: (msg: string, meta?: object) => log('error', msg, meta),
  debug: (msg: string, meta?: object) => log('debug', msg, meta),
};
