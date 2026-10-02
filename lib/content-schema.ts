import { z } from "zod";

export const CodeExampleSchema = z.object({
  language: z.literal("python"),
  code: z.string().min(10),
  universal_explanation: z.string().min(20),
});

export const ConceptNoteContentSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(20),
  learning_goals: z.array(z.string().min(3)).min(3).max(5),
  key_idea: z.string().min(10),
  universal_analogy: z.string().min(20),
  formal_definition: z.string().nullable(),
  code_example: CodeExampleSchema.nullable(),
  common_mistakes: z.array(z.string().min(5)).min(2).max(4),
  estimated_minutes: z.number().int().min(3).max(20),
});

export const ConceptTierSchema = z.enum(["beginner", "intermediate", "advanced"]);

/**
 * A written Python task. The learner types code, the model grades it against
 * the rubric, and the reference solution is revealed for comparison. Nothing
 * is executed — the judgement is made by reading the code.
 */
export const CodeEditorSchema = z.object({
  type: z.literal("code_editor"),
  prompt: z.string().min(10),
  starter_code: z.string(),
  reference_code: z.string().min(5),
  rubric: z.string().min(10),
  language: z.literal("python"),
  min_lines: z.number().int().min(1).max(30).optional(),
});

export const InteractionItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("comfort_opener"),
    content: z.string().min(10),
  }),
  z.object({
    type: z.literal("key_idea"),
    content: z.string().min(10),
  }),
  z.object({
    type: z.literal("analogy"),
    content: z.string().min(20),
  }),
  z.object({
    type: z.literal("python_code"),
    code: z.string().min(10),
    universal_explanation: z.string().min(20),
    symbols: z
      .array(
        z.object({
          token: z.string(),
          tier: z.enum(["essential", "encountered", "future"]),
          note: z.string().optional(),
        })
      )
      .optional(),
  }),
  z.object({
    type: z.literal("fill_blank"),
    sentence: z.string().min(10),
    options: z.array(z.string().min(1)).length(3),
    correct_index: z.number().int().min(0).max(2),
  }),
  z.object({
    type: z.literal("drag_match"),
    pairs: z
      .array(
        z.object({
          term: z.string().min(1),
          definition: z.string().min(3),
        })
      )
      .min(3)
      .max(4),
  }),
  z.object({
    type: z.literal("order_steps"),
    items: z.array(z.string().min(1)).min(3).max(8),
    correct_order: z.array(z.number().int().min(0)),
  }),
  z.object({
    type: z.literal("predict"),
    question: z.string().min(10),
    choices: z.array(z.string().min(1)).length(3),
    correct_index: z.number().int().min(0).max(2),
    reveal: z.string().min(20),
  }),
  z.object({
    type: z.literal("spot_mistake"),
    code: z.string().min(1),
    wrong_line: z.number().int().min(0),
    explanation: z.string().min(1),
  }),
  z.object({
    type: z.literal("explain"),
    prompt: z.string().min(10),
    rubric: z.string().min(10),
    min_words: z.number().int().min(5).max(50),
  }),
  CodeEditorSchema,
]);

/** Pre-generated interaction sequences: 4–8 items (prompt asks for 6). */
export const InteractionSequenceSchema = z
  .array(InteractionItemSchema)
  .min(4)
  .max(8);

export type InteractionItem = z.infer<typeof InteractionItemSchema>;
export type InteractionSequence = z.infer<typeof InteractionSequenceSchema>;
export type CodeEditor = z.infer<typeof CodeEditorSchema>;

export const GradingResultSchema = z.object({
    verdict: z.enum(["correct", "partial", "wrong"]),
    score: z.number().min(0).max(1),
    reason: z.string(),
    model_answer: z.string(),
    });

export type GradingResult = z.infer<typeof GradingResultSchema>;

export type CodeExample = z.infer<typeof CodeExampleSchema>;
export type ConceptNoteContent = z.infer<typeof ConceptNoteContentSchema>;
export type ConceptTier = z.infer<typeof ConceptTierSchema>;

export const DeepSectionSchema = z.object({
  heading: z.string().min(3),
  body: z.string().min(50),
  code: z.string().nullable(),
});

export const ConceptNoteContentSchemaV2 = z.object({
  title: z.string().min(3),
  summary: z.string().min(20),
  learning_goals: z.array(z.string()).min(3).max(5),
  long_intro: z.string().min(100),
  deep_explanation: z.array(DeepSectionSchema).min(3).max(7),
  formal_definition: z.string().nullable(),
  code_example: CodeExampleSchema.nullable(),
  common_mistakes: z.array(z.string().min(20)).min(3).max(6),
  real_world_usage: z.string().min(50),
  key_takeaways: z.array(z.string().min(10)).min(3).max(6),
  estimated_minutes: z.number().int().min(6).max(20),
});

export const TimelineItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("section"), section_id: z.string() }),
  z.object({ type: z.literal("activity"), activity: InteractionItemSchema }),
]);

export const TimelineSchema = z.array(TimelineItemSchema).min(8).max(16);

export const TestSchema = z.object({
  questions: z.array(InteractionItemSchema).length(5),
});

export type ConceptNoteContentV2 = z.infer<typeof ConceptNoteContentSchemaV2>;
export type TimelineItem = z.infer<typeof TimelineItemSchema>;
export type Timeline = z.infer<typeof TimelineSchema>;
export type ConceptTest = z.infer<typeof TestSchema>;
