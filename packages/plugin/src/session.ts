/** 会话状态:文件作用域、参考图、待回答的审查卡片、活动日志 */
import { CommandError } from "./errors.js";
import { requireNodeModule } from "./host.js";

export type PendingReview = {
  id: string;
  kind: "review" | "question";
  title: string;
  question: string;
  options: string[];
  createdAt: number;
  expiresAt: number;
  /** 已经回答时存在 */
  answer?: { index: number; option: string; comment?: string; at: number };
  resolve?: (answer: { index: number; option: string; comment?: string; at: number }) => void;
};

export type ReferenceImage = {
  id: string;
  name: string;
  data_url: string;
  width: number;
  height: number;
  source: string;
  addedAt: number;
};

export type ActivityEntry = { at: number; tool: string; ok: boolean; ms: number; note?: string };

export const session = {
  scopedDirectory: null as string | null,
  references: [] as ReferenceImage[],
  pending: new Map<string, PendingReview>(),
  activity: [] as ActivityEntry[],
  reviewSeq: 0,
  referenceSeq: 0,
};

export function logActivity(entry: ActivityEntry): void {
  session.activity.push(entry);
  if (session.activity.length > 200) session.activity.splice(0, session.activity.length - 200);
}

/* ------------------------------------------------------------------ scoping */

type FsApi = {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string) => Uint8Array;
  writeFileSync: (p: string, data: string | Uint8Array) => void;
  mkdirSync?: (p: string, opts?: { recursive?: boolean }) => void;
};
type PathApi = {
  isAbsolute: (p: string) => boolean;
  resolve: (...p: string[]) => string;
  relative: (from: string, to: string) => string;
  dirname: (p: string) => string;
};

export function fsApi(): FsApi {
  const fs = requireNodeModule<Partial<FsApi>>("fs");
  if (!fs?.existsSync || !fs.readFileSync || !fs.writeFileSync)
    throw new CommandError("E_BLOCKBENCH_ERROR", "Filesystem not available (use the desktop app).");
  return fs as FsApi;
}

export function pathApi(): PathApi {
  const path = requireNodeModule<Partial<PathApi>>("path");
  if (!path?.resolve || !path.relative)
    throw new CommandError("E_BLOCKBENCH_ERROR", "path module unavailable (use the desktop app).");
  return path as PathApi;
}

/**
 * 所有文件读写都必须落在这个用户批准过的目录里。
 * 这修正了"保存到任意路径"的弱点:AI 拿不到目录外的任何东西。
 */
export function scopedPath(target: string): string {
  if (!session.scopedDirectory)
    throw new CommandError(
      "E_SCOPE_DENIED",
      "Call propose_scoped_directory first and get the user's approval (the user must click Allow).",
    );
  const paths = pathApi();
  if (!paths.isAbsolute(target))
    throw new CommandError("E_SCOPE_DENIED", "Destination path must be absolute.");
  const root = paths.resolve(session.scopedDirectory);
  const resolved = paths.resolve(target);
  const relative = paths.relative(root, resolved);
  if (
    relative === ".." ||
    relative.startsWith("..\\") ||
    relative.startsWith("../") ||
    paths.isAbsolute(relative)
  )
    throw new CommandError(
      "E_SCOPE_DENIED",
      `Path must stay inside the approved directory: ${root}`,
    );
  return resolved;
}

export function readScopedFile(target: string): Uint8Array {
  const resolved = scopedPath(target);
  const fs = fsApi();
  if (!fs.existsSync(resolved))
    throw new CommandError("E_NOT_FOUND", `File not found: ${resolved}`);
  return fs.readFileSync(resolved);
}

export function writeScopedFile(
  target: string,
  data: string | Uint8Array,
  overwrite?: boolean,
): { path: string; bytes: number } {
  const resolved = scopedPath(target);
  const fs = fsApi();
  if (fs.existsSync(resolved) && overwrite !== true)
    throw new CommandError("E_SCOPE_DENIED", `File exists; pass overwrite:true — ${resolved}`);
  fs.writeFileSync(resolved, data);
  return {
    path: resolved,
    bytes:
      typeof data === "string" ? new TextEncoder().encode(data).byteLength : data.byteLength,
  };
}

/* ------------------------------------------------------------------- reviews */

export function newReviewId(): string {
  session.reviewSeq += 1;
  return `rev-${Date.now().toString(36)}-${session.reviewSeq}`;
}

export function openReview(entry: Omit<PendingReview, "id" | "createdAt" | "expiresAt"> & { timeoutSeconds: number }): PendingReview {
  const review: PendingReview = {
    id: newReviewId(),
    kind: entry.kind,
    title: entry.title,
    question: entry.question,
    options: entry.options,
    createdAt: Date.now(),
    expiresAt: Date.now() + Math.max(5, entry.timeoutSeconds) * 1000,
    resolve: entry.resolve,
  };
  session.pending.set(review.id, review);
  // 只保留最近 50 条,避免内存无限增长
  if (session.pending.size > 50) {
    const oldest = [...session.pending.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest && !oldest.resolve) session.pending.delete(oldest.id);
  }
  return review;
}

export function answerReview(
  id: string,
  index: number,
  comment?: string,
): PendingReview | undefined {
  const review = session.pending.get(id);
  if (!review) return undefined;
  const option = review.options[index] ?? String(index);
  review.answer = { index, option, comment, at: Date.now() };
  review.resolve?.(review.answer);
  return review;
}

export function latestOpenReview(includeAnswered = false): PendingReview | undefined {
  const all = [...session.pending.values()].sort((a, b) => b.createdAt - a.createdAt);
  return includeAnswered ? all[0] : all.find((r) => !r.answer);
}

export function reviewPayload(review: PendingReview, waitSeconds: number) {
  return {
    review_id: review.id,
    kind: review.kind,
    title: review.title,
    question: review.question,
    options: review.options,
    answered: Boolean(review.answer),
    answer: review.answer?.option ?? null,
    answer_index: review.answer?.index ?? null,
    comment: review.answer?.comment ?? null,
    pending: !review.answer,
    waited_seconds: waitSeconds,
    seconds_until_card_closes: Math.max(
      0,
      Math.round((review.expiresAt - Date.now()) / 1000),
    ),
  };
}

/** 等待用户回答,最多 waitSeconds 秒;仍未回答就返回 pending */
export async function waitForReview(
  review: PendingReview,
  waitSeconds: number,
): Promise<PendingReview> {
  if (review.answer) return review;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0.05, waitSeconds) * 1000);
    const previous = review.resolve;
    review.resolve = (answer) => {
      previous?.(answer);
      finish();
    };
  });
  return review;
}
