import { Request, Response } from 'express';
import { sendSuccess } from '../../../shared/utils/response';
import { HttpError } from '../../../shared/errors/http-error';
import { DeadLetterRepository } from '../interfaces/dead-letter-repository';
import { validateNotificationId } from '../../notifications/validators/notification-validator';

/**
 * Controller for Dead-Letter Queue (DLQ) investigation endpoints.
 */
export class DlqController {
  constructor(private readonly repository: DeadLetterRepository) {}

  /**
   * GET /api/v1/notifications/:notificationId/dlq
   *
   * Returns the dead-letter record for the given notification.
   */
  async getDeadLetterByNotificationId(req: Request, res: Response): Promise<void> {
    const notificationId = validateNotificationId(req.params.notificationId);

    const deadLetter = await this.repository.findDeadLetterByNotificationId(notificationId);
    if (!deadLetter) {
      throw new HttpError('Dead-letter record not found', 404, 'NOT_FOUND', [
        { field: 'notificationId', message: 'no dead-letter record found for this notification' },
      ]);
    }

    sendSuccess(res, deadLetter, 'Dead letter record retrieved successfully');
  }
}
