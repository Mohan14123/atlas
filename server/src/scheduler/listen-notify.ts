import { Client } from 'pg';
import { env } from '../shared/config/env';
import { logger } from '../shared/lib/logger';

export type NotifyCallback = (channel: string, payload: string) => void;

export class ListenNotifyClient {
  private client: Client;
  private isShuttingDown = false;
  private callback: NotifyCallback | null = null;
  private channels: string[] = [];

  constructor() {
    this.client = new Client({
      connectionString: env.DATABASE_URL,
    });
  }

  async connect(channels: string[], callback: NotifyCallback) {
    this.channels = channels;
    this.callback = callback;

    try {
      await this.client.connect();
      logger.info('LISTEN/NOTIFY client connected', { service: 'scheduler' });

      this.client.on('notification', (msg) => {
        if (!this.isShuttingDown && this.callback) {
          this.callback(msg.channel, msg.payload || '');
        }
      });

      for (const channel of channels) {
        await this.client.query(`LISTEN ${channel}`);
        logger.info(`Listening on channel: ${channel}`, { service: 'scheduler' });
      }

      this.client.on('error', (err) => {
        if (!this.isShuttingDown) {
          logger.error('LISTEN/NOTIFY client error', { error: err.message, service: 'scheduler' });
          this.reconnect();
        }
      });
    } catch (err: any) {
      logger.error('LISTEN/NOTIFY connect failed', { error: err.message, service: 'scheduler' });
      this.reconnect();
    }
  }

  private reconnect() {
    if (this.isShuttingDown) return;
    logger.info('Attempting LISTEN/NOTIFY reconnect in 5s...', { service: 'scheduler' });
    setTimeout(() => {
      this.client.end().catch(() => {});
      this.client = new Client({ connectionString: env.DATABASE_URL });
      if (this.callback) {
        this.connect(this.channels, this.callback).catch(() => {});
      }
    }, 5000);
  }

  async disconnect() {
    this.isShuttingDown = true;
    try {
      await this.client.end();
      logger.info('LISTEN/NOTIFY client disconnected', { service: 'scheduler' });
    } catch (err: any) {
      logger.error('Error disconnecting LISTEN/NOTIFY client', { error: err.message, service: 'scheduler' });
    }
  }
}
