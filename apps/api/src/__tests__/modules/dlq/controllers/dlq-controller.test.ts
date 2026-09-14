import { Request, Response } from "express";
import { DlqController } from "../../../../modules/dlq/controllers/dlq-controller";
import { DeadLetterRepository } from "../../../../modules/dlq/interfaces/dead-letter-repository";
import { HttpError } from "../../../../shared/errors/http-error";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("DlqController", () => {
  let repository: jest.Mocked<DeadLetterRepository>;
  let controller: DlqController;
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    repository = {
      createDeadLetter: jest.fn(),
      findDeadLetterByNotificationId: jest.fn(),
      resolveDeadLetter: jest.fn(),
      countDeadLetters: jest.fn().mockResolvedValue(0),
    };
    controller = new DlqController(repository);
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe("getDeadLetterByNotificationId", () => {
    it("returns 200 with dead letter details when found", async () => {
      const now = new Date();
      repository.findDeadLetterByNotificationId.mockResolvedValue({
        id: "dlq-1",
        notificationId: VALID_UUID,
        originalPayload: { name: "Test" },
        failedAttempts: 5,
        lastErrorCode: "MAX_RETRIES_EXCEEDED",
        lastErrorMessage: "Delivery failed after 5 attempts",
        errorDetails: [{ attempt: 1, error: "Network timeout" }],
        createdAt: now,
        resolvedAt: null,
        resolvedBy: null,
      });

      req = { params: { notificationId: VALID_UUID } };

      await controller.getDeadLetterByNotificationId(req as Request, res as Response);

      expect(repository.findDeadLetterByNotificationId).toHaveBeenCalledWith(VALID_UUID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: "dlq-1",
            notificationId: VALID_UUID,
            failedAttempts: 5,
            lastErrorCode: "MAX_RETRIES_EXCEEDED",
            lastErrorMessage: "Delivery failed after 5 attempts",
            errorDetails: [{ attempt: 1, error: "Network timeout" }],
            resolvedAt: null,
            resolvedBy: null,
          }),
        }),
      );
    });

    it("throws 404 NOT_FOUND when dead letter does not exist", async () => {
      repository.findDeadLetterByNotificationId.mockResolvedValue(null);
      req = { params: { notificationId: VALID_UUID } };

      await expect(
        controller.getDeadLetterByNotificationId(req as Request, res as Response),
      ).rejects.toThrow(HttpError);
      try {
        await controller.getDeadLetterByNotificationId(req as Request, res as Response);
      } catch (error) {
        expect((error as HttpError).statusCode).toBe(404);
        expect((error as HttpError).code).toBe("NOT_FOUND");
      }
    });

    it("throws 400 INVALID_REQUEST when notificationId is invalid UUID", async () => {
      req = { params: { notificationId: "invalid-uuid" } };

      await expect(
        controller.getDeadLetterByNotificationId(req as Request, res as Response),
      ).rejects.toThrow(HttpError);
      try {
        await controller.getDeadLetterByNotificationId(req as Request, res as Response);
      } catch (error) {
        expect((error as HttpError).statusCode).toBe(400);
        expect((error as HttpError).code).toBe("INVALID_REQUEST");
      }
    });
  });
});
