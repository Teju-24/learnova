/**
 * Plain text of a lesson section, for text-to-speech. Returns an empty string
 * when a section has nothing readable (or is unknown), which hides the play
 * button. Kept free of React so the extraction can be read and tested alone.
 */

export type SpeechSectionNote = {
  summary: string;
  long_intro: string | null;
  deep_explanation: { heading: string; body: string; code: string | null }[] | null;
  formal_definition: string | null;
  code_example: {
    language: string;
    code: string;
    universal_explanation: string;
  } | null;
  common_mistakes: string[] | null;
  real_world_usage: string | null;
  key_takeaways: string[] | null;
};

export function sectionSpeechText(
  sectionId: string,
  note: SpeechSectionNote
): string {
  const deepMatch = /^deep_explanation\.(\d+)$/.exec(sectionId);
  if (deepMatch) {
    const section = note.deep_explanation?.[Number.parseInt(deepMatch[1], 10)];
    if (!section) return "";
    return [section.heading, section.body].filter(Boolean).join(". ");
  }
  switch (sectionId) {
    case "long_intro":
      return note.long_intro ?? note.summary ?? "";
    case "code_example":
      return note.code_example?.universal_explanation ?? "";
    case "common_mistakes":
      return (note.common_mistakes ?? []).join(". ");
    case "real_world_usage":
      return note.real_world_usage ?? "";
    case "key_takeaways":
      return (note.key_takeaways ?? []).join(". ");
    case "formal_definition":
      return note.formal_definition ?? "";
    default:
      return "";
  }
}
