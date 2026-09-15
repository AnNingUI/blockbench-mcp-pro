/** 质量门工具 */
import {
  auditComplexity as auditComplexityPure,
  checkModel as checkModelPure,
  checkRig as checkRigPure,
} from "@bbmcp/shared";
import { requireProject, snapshotElements, uvIslands } from "../bb.js";
import type { ToolHandler } from "../dispatch.js";

export const qualityTools: Record<string, ToolHandler> = {
  check_model: (args: { allow_overlaps?: Array<{ a: string; b: string }> }) => {
    requireProject();
    const elements = snapshotElements();
    const result = checkModelPure(elements, {
      textureWidth: Project?.texture_width ?? 16,
      textureHeight: Project?.texture_height ?? 16,
      uvIslands: uvIslands(),
      allowOverlaps: args?.allow_overlaps,
    });
    return {
      ...result,
      ready: result.summary.errors === 0,
      note:
        result.summary.errors === 0
          ? "No blocking errors. Address warnings before texturing, then re-run after painting."
          : "Fix every error before texturing or exporting.",
    };
  },

  audit_complexity: (args: any) => {
    requireProject();
    return auditComplexityPure(snapshotElements(), args ?? {});
  },

  check_rig: () => {
    requireProject();
    const result = checkRigPure(snapshotElements());
    return {
      ...result,
      note: result.summary.ready
        ? "Rig looks animation-ready (3 segments per limb, every cube parented)."
        : "Fix the errors before authoring animation.",
    };
  },
};
