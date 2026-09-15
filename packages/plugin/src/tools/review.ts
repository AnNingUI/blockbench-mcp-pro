/** 人审门 —— 让用户来确认,而不是模型自己给自己打分 */
import { CommandError } from "../errors.js";
import { requireProject } from "../bb.js";
import { captureView, showBlockingDialog } from "../host.js";
import {
  answerReview,
  latestOpenReview,
  openReview,
  reviewPayload,
  session,
  waitForReview,
  type PendingReview,
} from "../session.js";
import type { ToolHandler } from "../dispatch.js";

const REVIEW_OPTIONS = ["Approve", "Needs changes"];

async function showCard(
  review: PendingReview,
  title: string,
  question: string,
  details: string | undefined,
): Promise<void> {
  const result = await showBlockingDialog({
    id: review.id,
    title,
    message: `${question}${details ? `\n\n${details}` : ""}`,
    buttons: review.options,
  });
  answerReview(review.id, result.index, result.comment);
}

export const reviewTools: Record<string, ToolHandler> = {
  ask_user: async (args: {
    question: string;
    title?: string;
    details?: string;
    options?: string[];
    views?: string[];
    wait_seconds?: number;
    timeout_seconds?: number;
  }) => {
    const options = args?.options?.length ? args.options : ["Yes", "No"];
    const waitSeconds = Math.min(args?.wait_seconds ?? 25, 120);
    const review = openReview({
      kind: "question",
      title: args?.title ?? "Blockbench MCP — question",
      question: args?.question,
      options,
      timeoutSeconds: args?.timeout_seconds ?? 900,
    });
    void showCard(review, args?.title ?? "Question from the AI", args?.question, args?.details);
    const views = await captureViewsSafe(args?.views);
    await waitForReview(review, waitSeconds);
    return {
      ...reviewPayload(review, waitSeconds),
      views,
      note: review.answer
        ? "The user answered."
        : "pending:true means the card is still open. Call wait_review with this review_id to keep waiting — pending is NOT approval.",
    };
  },

  request_review: async (args: {
    question: string;
    title?: string;
    details?: string;
    views?: string[];
    animation?: string;
    times?: number[];
    options?: string[];
    wait_seconds?: number;
    timeout_seconds?: number;
  }) => {
    requireProject();
    const options = args?.options?.length ? args.options : REVIEW_OPTIONS;
    const waitSeconds = Math.min(args?.wait_seconds ?? 25, 120);
    const review = openReview({
      kind: "review",
      title: args?.title ?? "Blockbench MCP — review",
      question: args?.question,
      options,
      timeoutSeconds: args?.timeout_seconds ?? 900,
    });
    void showCard(
      review,
      args?.title ?? "Please review the current model",
      args?.question,
      args?.details,
    );
    const views = await captureViewsSafe(args?.views, args?.animation, args?.times);
    await waitForReview(review, waitSeconds);
    return {
      ...reviewPayload(review, waitSeconds),
      views,
      note: review.answer
        ? review.answer.index === 0
          ? "Approved. Continue."
          : "Needs changes: fix exactly what the user said, then ask again. Do not argue with the verdict."
        : "pending:true — the card stays open in Blockbench. Poll with wait_review; pending is not approval and neither is a timeout.",
    };
  },

  wait_review: async (args: { review_id?: string; wait_seconds?: number }) => {
    const waitSeconds = Math.min(args?.wait_seconds ?? 25, 120);
    const review = args?.review_id
      ? session.pending.get(args.review_id)
      : latestOpenReview(true);
    if (!review)
      throw new CommandError(
        "E_NOT_FOUND",
        "No review/question found. Call request_review or ask_user first.",
      );
    await waitForReview(review, waitSeconds);
    return {
      ...reviewPayload(review, waitSeconds),
      open_cards: [...session.pending.values()].filter((r) => !r.answer).length,
      note: review.answer
        ? "Answered."
        : "Still waiting for the user. Keep polling and tell them in chat that you are waiting; do not proceed as if it were approved.",
    };
  },
};

async function captureViewsSafe(
  views?: string[],
  animation?: string,
  times?: number[],
): Promise<Array<Record<string, unknown>>> {
  const wanted = views?.length ? views : ["north", "east"];
  const out: Array<Record<string, unknown>> = [];
  for (const time of animation ? (times?.length ? times : [0]) : [null]) {
    if (time !== null) {
      try {
        if (animation) {
          const found = (Animation?.all ?? []).find((a: any) => a.name === animation);
          if (found) Timeline?.setAnimation?.(found, false);
        }
        Timeline?.setTime?.(time);
      } catch {
        /* optional */
      }
    }
    for (const view of wanted) {
      try {
        const shot = await captureView(view, 256);
        out.push({
          view,
          time,
          caption: `${view}${time !== null ? ` @ t=${time}s` : ""}`,
          data_url: shot.dataUrl,
        });
      } catch {
        /* a review must not fail because a screenshot did */
      }
    }
  }
  return out;
}
