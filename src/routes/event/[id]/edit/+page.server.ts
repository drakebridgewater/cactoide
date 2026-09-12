import { database } from '$lib/database/db';
import { events, eventSections, inviteTokens } from '$lib/database/schema';
import { eq, and, asc } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { logger } from '$lib/logger';
import { parseSections, toSectionRows } from '$lib/sectionHelpers';

export const load: PageServerLoad = async ({ params, cookies }) => {
	const eventId = params.id;
	const userId = cookies.get('cactoideUserId');

	if (!userId) {
		throw redirect(303, '/');
	}

	// Fetch the event and verify ownership
	const event = await database
		.select()
		.from(events)
		.where(and(eq(events.id, eventId), eq(events.userId, userId)))
		.limit(1);

	if (event.length === 0) {
		throw redirect(303, '/event');
	}

	// Fetch the event's sections in display order
	const sections = await database
		.select()
		.from(eventSections)
		.where(eq(eventSections.eventId, eventId))
		.orderBy(asc(eventSections.position));

	// Fetch invite token if this is an invite-only event
	let inviteToken = null;
	if (event[0].visibility === 'invite-only') {
		const tokenData = await database
			.select()
			.from(inviteTokens)
			.where(eq(inviteTokens.eventId, eventId))
			.limit(1);

		if (tokenData.length > 0) {
			inviteToken = {
				id: tokenData[0].id,
				event_id: tokenData[0].eventId,
				token: tokenData[0].token,
				expires_at: tokenData[0].expiresAt.toISOString(),
				created_at: tokenData[0].createdAt?.toISOString() || new Date().toISOString()
			};
		}
	}

	// Strip the owner id — it is the credential, and the load above already proved ownership
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { userId: _owner, ...eventRow } = event[0];

	return {
		event: eventRow,
		sections: sections.map((section) => ({
			id: section.id,
			title: section.title,
			body: section.body,
			position: section.position
		})),
		inviteToken
	};
};

export const actions: Actions = {
	default: async ({ request, params, cookies }) => {
		const eventId = params.id;
		const userId = cookies.get('cactoideUserId');
		const formData = await request.formData();

		if (!userId) {
			return fail(401, { error: 'Unauthorized' });
		}

		// Verify event ownership before allowing edit
		const existingEvent = await database
			.select()
			.from(events)
			.where(and(eq(events.id, eventId), eq(events.userId, userId)))
			.limit(1);

		if (existingEvent.length === 0) {
			return fail(403, { error: 'You can only edit your own events' });
		}

		const name = formData.get('name') as string;
		const date = formData.get('date') as string;
		const time = formData.get('time') as string;
		const location = formData.get('location') as string;
		const locationType = formData.get('locationType') as string;
		const locationUrl = formData.get('location_url') as string;
		const type = formData.get('type') as 'limited' | 'unlimited';
		const attendeeLimit = formData.get('attendee_limit') as string;
		const visibility = formData.get('visibility') as 'public' | 'private';
		const sections = parseSections(formData);

		// Validation
		const missingFields: string[] = [];

		if (!name?.trim()) missingFields.push('name');
		if (!date) missingFields.push('date');
		if (!time) missingFields.push('time');
		if (!locationType) missingFields.push('location_type');
		if (locationType === 'text' && !location?.trim()) missingFields.push('location');
		if (locationType === 'maps' && !locationUrl?.trim()) missingFields.push('location_url');

		if (missingFields.length > 0) {
			return fail(400, {
				error: `Missing or empty fields: ${missingFields.join(', ')}`,
				values: {
					name,
					date,
					time,
					location,
					location_type: locationType,
					location_url: locationUrl,
					type,
					attendee_limit: attendeeLimit,
					visibility,
					sections
				}
			});
		}

		// Check if date is in the past using local timezone
		const [year, month, day] = date.split('-').map(Number);
		const eventDate = new Date(year, month - 1, day);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		if (eventDate < today) {
			return fail(400, {
				error: 'Date cannot be in the past.',
				values: {
					name,
					date,
					time,
					location,
					location_type: locationType,
					location_url: locationUrl,
					type,
					attendee_limit: attendeeLimit,
					visibility,
					sections
				}
			});
		}

		if (type === 'limited' && (!attendeeLimit || parseInt(attendeeLimit) < 2)) {
			return fail(400, {
				error: 'Limit must be at least 2 for limited events.',
				values: {
					name,
					date,
					time,
					location,
					location_type: locationType,
					location_url: locationUrl,
					type,
					attendee_limit: attendeeLimit,
					visibility,
					sections
				}
			});
		}
		// Update the event and replace its sections in one transaction. Sections
		// carry no child rows, so replacing them wholesale is simpler and safer
		// than diffing, and it keeps positions dense.
		try {
			await database.transaction(async (tx) => {
				await tx
					.update(events)
					.set({
						name: name.trim(),
						date: date,
						time: time,
						location: location?.trim() || '',
						locationType: locationType as 'none' | 'text' | 'maps',
						locationUrl: locationType === 'maps' ? locationUrl?.trim() : null,
						type: type,
						attendeeLimit: type === 'limited' ? parseInt(attendeeLimit) : null,
						visibility: visibility,
						updatedAt: new Date()
					})
					.where(and(eq(events.id, eventId), eq(events.userId, userId)));

				await tx.delete(eventSections).where(eq(eventSections.eventId, eventId));

				const sectionRows = toSectionRows(eventId, sections, 'Description');
				if (sectionRows.length > 0) {
					await tx.insert(eventSections).values(sectionRows);
				}
			});
		} catch (error) {
			logger.error({ error, eventId, userId }, 'Unexpected error updating event');
			throw error;
		}

		throw redirect(303, `/event/${eventId}`);
	}
};
