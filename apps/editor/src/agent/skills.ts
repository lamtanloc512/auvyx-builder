/**
 * Skills (docs/play-sandbox.md): expert instructions, and sometimes a starter, for one kind of work. The agent sees each
 * skill's name and one line in the skill tool's description and loads the one that fits. Where skills come from is a
 * SkillSource: Auvyx's own (shared/skills, built into the editor).
 */
import { BUILT_IN_SKILLS } from "./skills.generated";

export interface SkillTemplate {
  readonly html: string;
  readonly css: string;
  readonly js: string;
}

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly template?: SkillTemplate;
  /** The passes of the work it is for (build, system, audit…): the system prompt routes by them. */
  readonly pass?: readonly string[];
  /** false: left out of the skill tool's list (the system prompt's routing names it), so a routed skill costs nothing per call. */
  readonly listed?: boolean;
}

export type SkillSummary = Pick<Skill, "name" | "description">;

export interface SkillSource {
  readonly list: () => readonly SkillSummary[];
  readonly load: (name: string) => Promise<Skill | undefined>;
}

export const builtInSkills = (skills: readonly Skill[] = BUILT_IN_SKILLS): SkillSource => ({
  list: () => skills.filter((s) => s.listed !== false).map(({ name, description }) => ({ name, description })),
  load: async (name) => skills.find((s) => s.name === name),
});

/**
 * The routed skills by pass, one short line for the system prompt (`build: craft-build; audit: craft-audit`).
 * Only skills the tool's list leaves out are named here: a listed one is already in the tool's description.
 */
export const routes = (skills: readonly Skill[] = BUILT_IN_SKILLS): string => {
  const byPass = new Map<string, string[]>();
  for (const s of skills) if (s.listed === false) for (const p of s.pass ?? []) byPass.set(p, [...(byPass.get(p) ?? []), s.name]);
  return [...byPass].map(([p, names]) => `${p}: ${names.join(", ")}`).join("; ");
};


/** What the skill tool answers: the instructions, then the starter as the parts of a game element. */
export const skillText = (skill: Skill): string =>
  `# Skill: ${skill.name}\n\n${skill.body}` +
  (skill.template
    ? `\n\n## Starter (the game element's parts)\n\ntitle: (yours)\n\nhtml:\n\`\`\`html\n${skill.template.html}\n\`\`\`\n\ncss:\n\`\`\`css\n${skill.template.css}\n\`\`\`\n\njs:\n\`\`\`js\n${skill.template.js}\n\`\`\``
    : "");
