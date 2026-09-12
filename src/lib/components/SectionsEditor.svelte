<script lang="ts">
	import { t } from '$lib/i18n/i18n.js';
	import type { SectionInput } from '$lib/types';
	import { MAX_SECTIONS, MAX_SECTION_TITLE_LENGTH } from '$lib/sectionHelpers';

	export let sections: SectionInput[] = [];

	// Always keep at least one section on screen — the first one is the event
	// description, pre-titled but still editable.
	$: if (sections.length === 0) {
		sections = [{ title: t('event.descriptionTitle'), body: '' }];
	}

	const addSection = () => {
		if (sections.length >= MAX_SECTIONS) return;
		sections = [...sections, { title: '', body: '' }];
	};

	const removeSection = (index: number) => {
		sections = sections.filter((_, i) => i !== index);
	};
</script>

<div class="space-y-4">
	<span class="text-dark-800 block text-sm font-semibold">{t('event.sectionsTitle')}</span>

	{#each sections as section, i (i)}
		<div class="border-dark-300 space-y-3 rounded-sm border-2 p-4">
			<div class="flex items-start gap-3">
				<div class="flex-1">
					<label for="section-title-{i}" class="text-dark-800 mb-2 block text-sm font-semibold">
						{t('event.sectionTitleLabel')}
					</label>
					<input
						id="section-title-{i}"
						name="sections[{i}].title"
						type="text"
						bind:value={section.title}
						class="border-dark-300 w-full rounded-sm border-2 px-4 py-3 text-slate-900 shadow-sm"
						placeholder={t('event.sectionTitlePlaceholder')}
						maxlength={MAX_SECTION_TITLE_LENGTH}
					/>
				</div>
				{#if i > 0}
					<button
						type="button"
						class="mt-8 rounded-sm border-2 border-red-300 px-3 py-3 text-sm font-medium text-red-600 transition-all duration-200 hover:scale-105 hover:bg-red-50"
						on:click={() => removeSection(i)}
						aria-label={t('event.removeSection')}
					>
						{t('common.delete')}
					</button>
				{/if}
			</div>

			<div>
				<label for="section-body-{i}" class="text-dark-800 mb-2 block text-sm font-semibold">
					{t('event.sectionBodyLabel')}
				</label>
				<textarea
					id="section-body-{i}"
					name="sections[{i}].body"
					rows="4"
					bind:value={section.body}
					class="border-dark-300 w-full rounded-sm border-2 px-4 py-3 text-slate-900 shadow-sm"
					placeholder={t('event.sectionBodyPlaceholder')}
					maxlength="5000"
				></textarea>
			</div>
		</div>
	{/each}

	{#if sections.length < MAX_SECTIONS}
		<button
			type="button"
			class="border-dark-300 text-dark-700 w-full rounded-sm border-2 border-dashed px-4 py-3 font-medium transition-all duration-200 hover:scale-105 hover:border-violet-500 hover:bg-violet-400/20"
			on:click={addSection}
		>
			{t('event.addSection')}
		</button>
	{/if}
</div>
