import type { FastifyPluginAsync } from "fastify/types/plugin.js";
import type {
  OrchestratorController,
  ManualApprovalRequestInput
} from "../controller.js";

interface ApprovalsPluginOptions {
  controller: OrchestratorController;
}

interface ApprovalDecisionBody {
  decision?: string;
  comment?: string;
  decidedBy?: string;
}

export const approvalsPlugin: FastifyPluginAsync<ApprovalsPluginOptions> = async (
  app,
  options
) => {
  const { controller } = options;
  const basePath = "/api/v1";
  const approvalsRoute = `${basePath}/approvals`;

  // GET /api/v1/approvals/pending - 获取待审批列表
  app.get(`${approvalsRoute}/pending`, async () => {
    const approvals = await controller.listPendingApprovals();
    return { approvals };
  });

  // POST /api/v1/approvals/request - 创建审批请求
  app.post<{ Body: ManualApprovalRequestInput }>(
    `${approvalsRoute}/request`,
    async (request, reply) => {
      const body = request.body;
      if (!body) {
        reply.code(400);
        return { error: { code: "bad_request", message: "请求体不能为空" } };
      }
      if (!body.executionId && (!body.planId || !body.nodeId)) {
        reply.code(400);
        return {
          error: {
            code: "bad_request",
            message: "缺少 executionId 或 planId/nodeId 信息"
          }
        };
      }
      try {
        const approval = await controller.requestApproval(body);
        reply.code(201);
        return { approval };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reply.code(500);
        return { error: { code: "approval_request_failed", message } };
      }
    }
  );

  // POST /api/v1/approvals/:id/decision - 记录审批决策
  app.post<{
    Params: { id: string };
    Body: ApprovalDecisionBody;
  }>(
    `${approvalsRoute}/:id/decision`,
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;
      const decision = body?.decision;
      if (decision !== "approved" && decision !== "rejected") {
        reply.code(400);
        return {
          error: {
            code: "bad_request",
            message: "decision 必须为 approved 或 rejected"
          }
        };
      }
      try {
        const decisionReq: any = {
          id,
          decision,
          decidedBy: body?.decidedBy ?? "web-ui"
        };
        if (typeof body?.comment === "string") decisionReq.comment = body.comment;
        const approval = await controller.recordApprovalDecision(decisionReq);
        return { approval };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("找不到待审批项")) {
          reply.code(404);
          return { error: { code: "approval_not_found", message } };
        }
        reply.code(422);
        return { error: { code: "approval_update_failed", message } };
      }
    }
  );
};
