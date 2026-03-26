import { z } from "zod";

const resizeHandleAxisSchema = z.enum(["s" , "w" , "e" , "n" , "sw" , "nw" , "se" , "ne"]);

export const layoutItemSchema = z.object({
  i: z.string().min(1),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),

  minW: z.number().int().positive().optional(),
  minH: z.number().int().positive().optional(),
  maxW: z.number().int().positive().optional(),
  maxH: z.number().int().positive().optional(),

  static: z.boolean().optional(),
  isDraggable: z.boolean().optional(),
  isResizable: z.boolean().optional(),

  resizeHandles: z.array(resizeHandleAxisSchema).optional(),
  isBounded: z.boolean().optional(),

  moved: z.boolean().optional(),
})
  .superRefine((v, ctx) => {
    if (v.minW !== undefined && v.minW > v.w) {
      ctx.addIssue({ code: "custom", path: ["minW"], message: "minW cannot be > w" });
    }
    if (v.minH !== undefined && v.minH > v.h) {
      ctx.addIssue({ code: "custom", path: ["minH"], message: "minH cannot be > h" });
    }
    if (v.maxW !== undefined && v.maxW < v.w) {
      ctx.addIssue({ code: "custom", path: ["maxW"], message: "maxW cannot be < w" });
    }
    if (v.maxH !== undefined && v.maxH < v.h) {
      ctx.addIssue({ code: "custom", path: ["maxH"], message: "maxH cannot be < h" });
    }
    if (v.minW !== undefined && v.maxW !== undefined && v.minW > v.maxW) {
      ctx.addIssue({ code: "custom", path: ["minW"], message: "minW cannot be > maxW" });
    }
    if (v.minH !== undefined && v.maxH !== undefined && v.minH > v.maxH) {
      ctx.addIssue({ code: "custom", path: ["minH"], message: "minH cannot be > maxH" });
    }
  });
