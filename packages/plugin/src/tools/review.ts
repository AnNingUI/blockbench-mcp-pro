/** 人审门 —— 让用户来确认,而不是模型自己给自己打分 */
import { CommandError } from "../errors.js";
import { requireProject } from "../bb.js";
import { captureView, showBlockingDialog } from "../host.js";
import { resolveCard, type CardImages } from "../ui/card.js";
import type { CardComponent } from "@bbmcp/shared";
import { referenceTools } from "./reference.js";
import {
  answerReview,
  dismissReview,
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
  components: CardComponent[] = [],
  images: CardImages = {},
): Promise<void> {
  const dialog = showBlockingDialog({
    id: review.id,
    title,
    message: `${question}${details ? `\n\n${details}` : ""}`,
    lines: [
      "<i>下面是可选的:写意见,或者选一张参考图。</i>",
    ],
    buttons: review.options,
    components,
    images,
    // 人要点“Needs changes”时得能说清楚哪里不对 —— 以前只有两个按钮,意见无处可输
    comment: { label: "意见 / 哪里不对(可留空)", placeholder: "例如:披风太宽、腿太短……" },
    // “把图片拖进面板”这种话别再写了:卡上直接给选文件
    filePick: { label: "参考图(可选,选了就直接加载)", accept: "image/*" },
  });
  // 卡片到期必须自己消失,否则会在 Blockbench 里越堆越多
  const expiry = setTimeout(
    () => {
      dialog.close();
      dismissReview(review);
    },
    Math.max(1000, review.expiresAt - Date.now()),
  );
  const result = await dialog.result;
  clearTimeout(expiry);
  if (result.file?.dataUrl) {
    // 用户当场选的图 
    try {
      await referenceTools.load_reference({
        data_url: result.file.dataUrl,
        name: result.file.name.replace(/\.[^.]+$/, ""),
      });
      review.loadedReference = result.file.name;
    } catch {
      /* 图片载不进去也不能把人的回答弄丢 */
    }
  }
  answerReview(review.id, result.index, result.comment, result.values);
}

export const reviewTools: Record<string, ToolHandler> = {
  ask_user: async (args: {
    question: string;
    title?: string;
    details?: string;
    options?: string[];
    views?: string[];
    components?: CardComponent[];
    wait_seconds?: number;
    timeout_seconds?: number;
  }) => {
    const card = resolveCard(
      args?.components ?? [],
      args?.options?.length ? args.options : ["Yes", "No"],
    );
    const waitSeconds = Math.min(args?.wait_seconds ?? 25, 120);
    const review = openReview({
      kind: "question",
      title: args?.title ?? "Blockbench MCP — question",
      question: args?.question,
      options: card.buttons,
      timeoutSeconds: args?.timeout_seconds ?? 900,
    });
    // 先截屏再弹卡:卡片里的 views 组件要用这些图
    const views = await captureViewsSafe(args?.views, undefined, undefined, card.rest);
    void showCard(
      review,
      args?.title ?? "Question from the AI",
      args?.question,
      args?.details,
      card.rest,
      cardImages(views),
    );
    await waitForReview(review, waitSeconds);
    return {
      ...reviewPayload(review, waitSeconds),
      views,
      note: review.answer
        ? "The user answered."
        : review.dismissed
          ? "The user closed the dialog without answering (dismissed) — still pending. Re-ask with a shorter question, or keep waiting with wait_review."
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
    components?: CardComponent[];
    wait_seconds?: number;
    timeout_seconds?: number;
  }) => {
    requireProject();
    const card = resolveCard(
      args?.components ?? [],
      args?.options?.length ? args.options : REVIEW_OPTIONS,
    );
    const waitSeconds = Math.min(args?.wait_seconds ?? 25, 120);
    const review = openReview({
      kind: "review",
      title: args?.title ?? "Blockbench MCP — review",
      question: args?.question,
      options: card.buttons,
      timeoutSeconds: args?.timeout_seconds ?? 900,
    });
    // 先截屏再弹卡(卡片里的 views 组件要显示渲染结果)
    const views = await captureViewsSafe(args?.views, args?.animation, args?.times, card.rest);
    void showCard(
      review,
      args?.title ?? "Please review the current model",
      args?.question,
      args?.details,
      card.rest,
      cardImages(views),
    );
    await waitForReview(review, waitSeconds);
    return {
      ...reviewPayload(review, waitSeconds),
      views,
      note: review.answer
        ? review.answer.index === 0
          ? "Approved. Continue."
          : "Needs changes: fix exactly what the user said, then ask again. Do not argue with the verdict."
        : review.dismissed
          ? "The user dismissed the dialog without answering — still pending, not approval. Ask again later or keep polling with wait_review."
          : "pending — the dialog stays open in Blockbench. Poll with wait_review; pending is not approval and neither is a timeout.",
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

/** 卡片里的 views 组件要哪些视角/时间点 */
function viewRequests(components: CardComponent[]): {
  views: string[];
  animation?: string;
  times?: number[];
} {
  const component = components.find(
    (item): item is Extract<CardComponent, { type: "views" }> => item.type === "views",
  );
  if (!component) return { views: [] };
  return { views: component.views, animation: component.animation, times: component.times };
}

/** captures 以 `${view}` / `${view}@${time}` 为 key,供卡片内联显示 */
function cardImages(views: Array<Record<string, unknown>>): CardImages {
  const captures: Record<string, string> = {};
  for (const entry of views) {
    const key =
      entry.time === null || entry.time === undefined
        ? String(entry.view)
        : `${entry.view}@${entry.time}`;
    if (typeof entry.data_url === "string") captures[key] = entry.data_url;
  }
  return {
    captures,
    references: session.references.map((reference) => ({
      name: reference.name,
      data_url: reference.data_url,
    })),
  };
}

async function captureViewsSafe(
  views?: string[],
  animation?: string,
  times?: number[],
  components: CardComponent[] = [],
): Promise<Array<Record<string, unknown>>> {
  const requested = viewRequests(components);
  const wantedViews = [...new Set([...(views ?? []), ...requested.views])];
  const wantedAnimation = animation ?? requested.animation;
  const wantedTimes = times ?? requested.times;
  const wanted = wantedViews.length ? wantedViews : ["north", "east"];
  const out: Array<Record<string, unknown>> = [];
  for (const time of wantedAnimation ? (wantedTimes?.length ? wantedTimes : [0]) : [null]) {
    if (time !== null) {
      try {
        if (wantedAnimation) {
          Animation.all.find((item) => item.name === wantedAnimation)?.select();
        }
        Timeline.setTime(time);
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
