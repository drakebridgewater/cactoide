import type { SectionInput } from './types';

export const MAX_SECTIONS = 20;
export const MAX_SECTION_TITLE_LENGTH = 100;
export const MAX_SECTION_BODY_LENGTH = 5000;

/**
 * Reads the indexed `sections[i].title` / `sections[i].body` fields the
 * create and edit forms emit. Indexed names are used so the sections survive
 * a submit without JavaScript, where `use:enhance` never runs.
 *
 * Sections with an empty body are dropped, and the survivors keep their
 * original relative order — the caller assigns dense positions from the
 * returned array index.
 */
export const parseSections = (formData: FormData): SectionInput[] => {
	const byIndex = new Map<number, { title: string; body: string }>();

	for (const [key, value] of formData.entries()) {
		const match = /^sections\[(\d+)\]\.(title|body)$/.exec(key);
		if (!match) continue;

		const index = Number(match[1]);
		const field = match[2] as 'title' | 'body';
		const section = byIndex.get(index) ?? { title: '', body: '' };
		section[field] = typeof value === 'string' ? value : '';
		byIndex.set(index, section);
	}

	return [...byIndex.entries()]
		.sort(([a], [b]) => a - b)
		.map(([, section]) => ({
			title: section.title.trim().slice(0, MAX_SECTION_TITLE_LENGTH),
			body: section.body.trim().slice(0, MAX_SECTION_BODY_LENGTH)
		}))
		.filter((section) => section.body.length > 0)
		.slice(0, MAX_SECTIONS);
};

/** Turns parsed sections into rows ready for insert, numbering them densely. */
export const toSectionRows = (eventId: string, sections: SectionInput[], fallbackTitle: string) =>
	sections.map((section, position) => ({
		eventId,
		title: section.title || fallbackTitle,
		body: section.body,
		position
	}));
