import { Request, Response } from 'express';
import { ReadinessService } from '../interfaces/readiness-service';
import { asyncHandler } from '../../../shared/utils/async-handler';

export class ReadinessController {
  constructor(private readonly service: ReadinessService) {}

  getReadiness = asyncHandler(async (_req: Request, res: Response) => {
    const readiness = await this.service.getReadiness();

    const httpStatus = readiness.status === 'ready' ? 200 : 503;

    res.status(httpStatus).json({
      success: readiness.status === 'ready',
      message: readiness.status === 'ready' ? 'Application is ready' : 'Application is not ready',
      data: readiness,
    });
  });
}