export const CONTENT_GENERATION_PROMPT = {
  system: `You are a curriculum designer for Learnova, a platform that teaches AI concepts to learners with diverse backgrounds.

You generate a single concept note as strict JSON. Match this shape exactly:

{
  "title": string,
  "summary": string,
  "learning_goals": string[],
  "key_idea": string,
  "universal_analogy": string,
  "formal_definition": string | null,
  "code_example": { "language": "python", "code": string, "universal_explanation": string } | null,
  "common_mistakes": string[],
  "estimated_minutes": number
}

Rules:
- Return ONLY valid JSON. No markdown fences. No commentary.
- learning_goals: exactly 3-4 items.
- common_mistakes: exactly 2-3 items.
- estimated_minutes: between 4 and 12.

BEGINNER TIER RULES:
- Plain language. No jargon without explanation.
- universal_analogy: compare to something from everyday life. Do NOT mention calculus, derivatives, gradients in mathematical terms, tensors, matrices, or technical vocabulary.
- formal_definition: null OR one plain sentence with no equations.
- code_example: ONLY variables, arithmetic (+ - * /), and print(). NO loops, NO functions, NO imports, NO lists, NO built-ins.
- code_example.code: 4-8 lines maximum.

INTERMEDIATE TIER RULES:
- Technical vocabulary is fine if standard.
- formal_definition: precise, at most one equation.
- code_example: may use variables, arithmetic, for/while loops, range(), simple functions. No numpy, no classes, no imports.
- code_example.code: 8-15 lines.`,

  user: (title: string, slug: string, tier: string) =>
    `Concept title: ${title}\nConcept slug: ${slug}\nTier: ${tier}\n\nGenerate the concept note JSON.`,
};

export const DIAGNOSE_PROMPT = {
  system:
    'You grade a learner\'s free-text answer to an AI concept question. Return ONLY JSON: { "score": number between 0 and 1, "correct": boolean, "reason": string under 15 words }.',

  user: (question: string, answer: string) =>
    `Question: ${question}\nLearner's answer: ${answer}`,
};

export type ConceptGraphNode = {
  id: number;
  slug: string;
  title: string;
  difficulty: number;
  prerequisites: number[];
};

/**
 * Shared rules for both the initial path and later extensions. The only thing
 * that differs is how many concepts to pick, so it is parameterised rather
 * than duplicated — the two prompts must not drift apart. The rules below are
 * the only copy; the count is passed separately.
 */
function pathRoutingSystem(count: string, extraRules = ""): string {
  return `You are a curriculum router for Learnova. Given a learner's background, goal, mastery scores, and the available concepts, return ONLY JSON in this shape:
{ "path": [ { "concept_id": number, "tier": "beginner"|"intermediate"|"advanced", "why": string } ] }
Rules:
- Pick ${count} concepts.
- Order them by pedagogical logic (prerequisites first, then difficulty ascending).
- Mix tiers based on mastery: beginner for concepts where mastery < 0.4, intermediate for 0.4-0.7, advanced for >= 0.7.
- Ensure the path covers a coherent journey toward the learner's goal — do not include random unrelated concepts.
- Only include concepts whose prerequisites have mastery >= 0.6, OR if none qualify, include frontier concepts (those whose prereqs are all >= 0.6, or whose prereqs are all in the chosen path).
- Every concept_id must come from the list you were given.
- 'why' is at most 12 words.
- Return raw JSON. No markdown fences.${extraRules}`;
}

/** Used by /api/onboard for the initial path (fast model). */
export const PATH_ROUTING_PROMPT = {
  system: pathRoutingSystem("8-12"),

  user: (input: {
    background: string;
    goal: string;
    mastery: Record<string, number>;
    concepts: {
      id: number;
      slug: string;
      title: string;
      difficulty: number;
      prerequisites: number[];
    }[];
  }) => JSON.stringify(input),
};

/** Used by /api/extend-path once a learner works through the initial path. */
export const PATH_EXTENSION_PROMPT = {
  system: pathRoutingSystem(
    "4-6 MORE",
    "\n- Only choose concepts from the 'frontier' list you are given. Never repeat a concept_id already in 'existing_path'." +
      "\n- Pace signal from the learner's most recent feedback: if 'too_slow', bias the next concepts toward intermediate tier even when mastery would suggest beginner." +
      " If 'too_fast', bias toward beginner and insert additional prerequisites." +
      " If 'just_right', continue current difficulty."
  ),

  user: (input: {
    background: string;
    goal: string;
    mastery: Record<string, number>;
    existing_path: { concept_id: number; tier: string; why: string }[];
    feedback: {
      pace: string | null;
      interests: string | null;
      notes: string | null;
    } | null;
    frontier: {
      id: number;
      slug: string;
      title: string;
      difficulty: number;
      prerequisites: number[];
    }[];
  }) => JSON.stringify(input),
};


/** @deprecated Prefer PATH_ROUTING_PROMPT. Kept for reference only. */
export const PATH_GENERATION_PROMPT = PATH_ROUTING_PROMPT;

export const INTERACTION_GEN_PROMPT = {
  system: `You design interactive lessons. Given a concept note, produce a JSON array of interaction items that test the learner's understanding. Return ONLY the array, no wrapper object, no markdown fences.
Each item is an object with a 'type' field and the fields for that type:
{ "type": "fill_blank",
  "sentence": "A sentence with ___ where the blank goes",
  "options": ["option1", "option2", "option3"],
  "correct_index": 0 }
{ "type": "drag_match",
  "pairs": [{"term": "T1", "definition": "D1"}, ...] }
{ "type": "order_steps",
  "items": ["step1", "step2", "step3"],
  "correct_order": [0, 1, 2] }
{ "type": "predict",
  "question": "...",
  "choices": ["a", "b", "c"],
  "correct_index": 0,
  "reveal": "what actually happens" }
{ "type": "spot_mistake",
  "code": "python code with one wrong line",
  "wrong_line": 2,
  "explanation": "why that line is wrong" }
{ "type": "explain",
  "prompt": "a question asking the learner to explain",
  "rubric": "what a good answer contains",
  "min_words": 10 }
Rules:
- Produce EXACTLY 6 items.
- Use a MIX of the 6 types above (at least 4 different types must appear).
- Each item is answerable in under 60 seconds.
- The content must test understanding of THIS specific concept, not generic AI questions.
- Options and choices in fill_blank and predict must have at least 3 characters each (no 'No', 'Yes').`,

  user: (conceptNoteJson: string) => conceptNoteJson,
};

export const ACTIVITY_REFRAME_PROMPT = {
  system: `You reframe practice activities for a specific learner. Given a base activity and a learner profile, rewrite the activity's question so it uses vocabulary and examples from the learner's field, without changing what the activity tests.

Return JSON: { "prompt": string, "sentence": string | null }

Rules:
- Keep the same underlying question. Same difficulty. Same correct answer.
- Use analogies and terminology from the learner's background.
- You MAY add one short framing clause that places the question in the learner's field ("In a kinetic model, ..."). Adding that context is the point of the rewrite, so do not shrink back to the original length; stay under roughly 1.5x it and never pad with filler.
- For 'fill_blank' activities, also reframe the sentence (keep the blank and options unchanged).
- Return raw JSON, no markdown.

Correctness rules that override the rest:
- Copy every number, variable name, and literal value across VERBATIM. A reframe that changes a quantity changes the answer and makes the activity wrong.
- Never reveal or hint at the correct answer, the options, or the reveal text.
- Do not change the activity's type, difficulty, or what concept it tests.
- Set "sentence" to null for every type except "fill_blank". For "fill_blank", keep the exact blank (the ___ marker) and leave options untouched — the caller fills in the sentence, not the prompt.
- If the learner's background offers no natural angle, return the original text unchanged rather than forcing a strained analogy.`,

  user: (input: {
    base_activity: unknown;
    profile: {
      background: string | null;
      goal: string | null;
      comfort: unknown;
    };
  }) => JSON.stringify(input),
};

export const GRADING_PROMPT = {
system: `You grade a learner's answer to a lesson interaction question. Return ONLY JSON matching:
    
    { "verdict": "correct" | "partial" | "wrong", "score": number between 0 and 1, "reason": string under 25 words, "model_answer": string }
    
    Scoring:
    - correct: score >= 0.8
    - partial: 0.4 <= score < 0.8
    - wrong: score < 0.4
    
    Reason must be constructive, not evaluative.
    
    model_answer is a 2-3 sentence example of a complete, correct answer to the question. This is shown to the learner as reference. Keep it clear and direct.
    
    If the answer is code (Python):
    - Check that the code addresses the task described in the question
    - Look for correct use of the concepts in the rubric (functions, loops, variables, etc.)
    - Identify syntax errors if any (unbalanced parentheses, missing colons, wrong indentation structure)
    - Do NOT execute the code. Judge it based on structure and logic.
    - For model_answer, provide a concise corrected version of the code if the learner's answer had errors. Otherwise echo a clean version of the learner's correct answer.`,

  user: (question: string, answer: string, rubric: string) =>
    `Question: ${question}\nRubric: ${rubric}\nLearner's answer: ${answer}`,
};

export const CONTENT_GENERATION_PROMPT_V2 = {
  system: `You are a curriculum writer for Learnova. You write lessons that teach deeply, not summaries.
Return JSON matching:
{
  "title": string,
  "summary": string (2 sentences),
  "learning_goals": string[] (3-4),
  "long_intro": string (1 paragraph, 4-6 sentences, why this matters),
  "deep_explanation": [
    { "heading": string, "body": string (2-3 paragraphs), "code": string | null }
  ] (5-6 sections),
  "formal_definition": string | null,
  "code_example": { "language": "python", "code": string, "universal_explanation": string } | null,
  "common_mistakes": string[] (4-5 items, each 1-2 sentences explaining the mistake AND why it's wrong),
  "real_world_usage": string (1 paragraph naming real systems),
  "key_takeaways": string[] (4-5 bullets),
  "estimated_minutes": number (8-12)
}
Rules:
- beginner: plain language, analogies, no math notation, code uses only variables + arithmetic + print
- intermediate: technical vocabulary OK, one equation max, code may use loops and functions
- Return ONLY valid JSON, no markdown fences`,

  user: (title: string, slug: string, tier: string) =>
    `Concept: ${title}\nSlug: ${slug}\nTier: ${tier}\n\nGenerate the deep lesson JSON.`,
};

export const INTERACTION_TIMELINE_PROMPT = {
  system: `You plan an interactive lesson timeline. Given a concept note, output JSON: { "timeline": [...] }
Each item is either:
  { "type": "section", "section_id": "..." }
  { "type": "activity", "activity": {...interaction...} }
section_id values must reference real fields:
  "long_intro", "deep_explanation.0".."deep_explanation.N",
  "code_example", "common_mistakes", "real_world_usage",
  "key_takeaways"
Activity types: fill_blank, drag_match, order_steps, predict,
spot_mistake, explain
Rules:
- 8-14 items total
- First item MUST be "long_intro"
- Last item MUST be an activity (usually explain)
- NO two activities back to back
- At least 4 activities
- Each activity tests the section(s) immediately before it
- Return raw JSON`,

  user: (conceptNoteJson: string) => conceptNoteJson,
};

export const CONCEPT_TEST_PROMPT = {
  system: `You write a 5-question test to verify understanding of a concept. Return JSON: { "questions": [...] }
Each question is one of:
  fill_blank, predict, spot_mistake, explain, order_steps
Rules:
- Exactly 5 questions
- Mix of difficulty: 2 easy, 2 medium, 1 hard
- Test understanding, not memorization
- All answerable from the concept note
- Return raw JSON`,

  user: (conceptNoteJson: string) => conceptNoteJson,
};
