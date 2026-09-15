/** 工具参数契约 (zod) —— 插件与网关共用,双端校验 */
import { z } from "zod";
import { VIEW_PRESETS } from "./protocol.js";

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
const vec2Schema = z.tuple([z.number(), z.number()]);

/** 面局部绘制操作 (eyes/nose 等,坐标相对该面,自动处理翻转/旋转) */
export const paintOpSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fill"), color: z.string() }),
  z.object({
    type: z.literal("rect"),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    color: z.string(),
  }),
  z.object({
    type: z.literal("ellipse"),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    color: z.string(),
  }),
  z.object({
    type: z.literal("line"),
    x: z.number(),
    y: z.number(),
    x2: z.number(),
    y2: z.number(),
    width: z.number().optional(),
    color: z.string(),
  }),
]);
export type PaintOp = z.infer<typeof paintOpSchema>;

export const faceFeatureSchema = z.object({
  cube: z.string(),
  face: z.enum(["north", "south", "east", "west", "up", "down"]),
  ops: z.array(paintOpSchema),
});
export type FaceFeature = z.infer<typeof faceFeatureSchema>;

export const facePaintParamsSchema = z.object({
  texture: z.string().optional(),
  faces: z.array(faceFeatureSchema),
});

export const paintGridParamsSchema = z.object({
  texture: z.string().optional(),
  cube: z.string(),
  face: z.enum(["north", "south", "east", "west", "up", "down"]),
  rows: z.array(z.string()),
  palette: z.record(z.string(), z.string()),
  expected_revision: z.string().optional(),
});

export const transformElementsParamsSchema = z.object({
  refs: z.array(z.string()),
  translate: vec3Schema.optional(),
  scale: vec3Schema.optional(),
  pivot: vec3Schema.optional(),
  rotate: vec3Schema.optional(),
  uv_policy: z.enum(["preserve", "auto"]).optional(),
});

/** 程序化体素化: 字符矩阵 → 几何 */
export const voxelizeMatrixParamsSchema = z.object({
  matrix: z.array(z.string().min(1)),
  palette: z
    .record(
      z.string().length(1),
      z.object({
        name: z.string().optional(),
        depth: z.number().optional(),
        offset_z: z.number().optional(),
        inflate: z.number().optional(),
      }),
    )
    .optional(),
  pixel_size: z.number().positive().optional(),
  plane: z.enum(["xy", "xz", "yz"]).optional(),
  origin: vec3Schema.optional(),
  parent: z.string().optional(),
  merge_adjacent: z.boolean().optional(),
  max_cubes: z.number().int().positive().optional(),
  z_fight_guard: z.boolean().optional(),
});

export const checkModelParamsSchema = z.object({
  allow_overlaps: z
    .array(z.object({ a: z.string(), b: z.string() }))
    .optional(),
});

export const captureViewsParamsSchema = z.object({
  views: z.array(z.enum(VIEW_PRESETS)).optional(),
  max_edge: z.number().int().positive().optional(),
  format: z.enum(["png", "jpeg"]).optional(),
  quality: z.number().min(10).max(100).optional(),
});

export const getTextureParamsSchema = z.object({
  texture: z.string().optional(),
  max_edge: z.number().int().positive().optional(),
});

export const exportParamsSchema = z.object({
  path: z.string(),
  overwrite: z.boolean().optional(),
  codec: z.string().optional(),
  format: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

export type VoxelizeMatrixParams = z.infer<typeof voxelizeMatrixParamsSchema>;
export type CaptureViewsParams = z.infer<typeof captureViewsParamsSchema>;
export type FaceFeatureParams = z.infer<typeof facePaintParamsSchema>;