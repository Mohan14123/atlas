import parser from 'cron-parser';
import { AppError, HttpStatus } from './errors';

/**
 * Calculates the next run time for a given cron expression.
 * @param cronExpression The cron expression to parse
 * @param timezone The timezone to use (defaults to UTC)
 * @returns A Date object representing the next run time
 * @throws AppError if the cron expression or timezone is invalid
 */
export function getNextRunAt(cronExpression: string, timezone: string = 'UTC'): Date {
  try {
    const interval = parser.parse(cronExpression, { tz: timezone });
    return interval.next().toDate();
  } catch (err: any) {
    throw new AppError(
      `Invalid cron expression or timezone: ${err.message}`,
      'INVALID_CRON_EXPRESSION',
      HttpStatus.BAD_REQUEST
    );
  }
}
