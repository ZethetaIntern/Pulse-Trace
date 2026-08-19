import { Request, Response } from 'express';
import { sendSuccess } from '../../../shared/utils/response';
import { toReplayExecutionResponse, ReplayExecutionResponse } from '../dto/replay-response';
import { ReplayService } from '../services/replay-service';
import { validateReplayNotificationId, validateReplayRequest } from '../validators/replay-validator';

/**
 * HTTP layer for replay. Only parses requests, validates input, calls the
 * service and formats responses. No business logic or database access.
 */
export class ReplayController {
  constructor(private readonly service: ReplayService) {}

  /**
   * POST /api/v1/notifications/:notificationId/replay
   *
   * Accepts a replay request. Returns 202 Accepted with the replay id and
   * the new notification id.
   */
  async replayNotification(req: Request, res: Response): Promise<void> {
    const notificationId = validateReplayNotificationId(req.params.notificationId);
    const dto = validateReplayRequest(notificationId, req.body);

    const result = await this.service.replayNotification(dto);

    sendSuccess(res, result, 'Replay started', 202);
  }

  /**
   * GET /api/v1/notifications/:notificationId/replays
   *
   * Returns all replay executions for the given notification.
   */
  async getReplayHistory(req: Request, res: Response): Promise<void> {
    const notificationId = validateReplayNotificationId(req.params.notificationId);

    const executions = await this.service.getReplayHistory(notificationId);

    // Fetch new notification statuses in a single pass for the response.
    const data: ReplayExecutionResponse[] = executions.map((e) =>
      toReplayExecutionResponse(e),
    );

    sendSuccess(res, data, 'Replay history retrieved successfully');
  }
}
