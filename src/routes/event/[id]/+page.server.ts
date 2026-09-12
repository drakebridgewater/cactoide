import { database } from '$lib/database/db';
import { events, rsvps, eventSections, comments } from '$lib/database/schema';
import { eq, and, asc } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { logger } from '$lib/logger';
import type { Comment } from '$lib/types';

const MAX_COMMENT_LENGTH = 2000;
const MAX_COMMENT_AUTHOR_LENGTH = 50;

export const load: PageServerLoad = async ({ params, cookies }) => {
	const eventId = params.id;
	const userId = cookies.get('cactoideUserId');

	if (!eventId) {
		throw error(404, 'EventId not found');
	}

	try {
		// Fetch event, RSVPs, sections and comments in parallel
		const [eventData, rsvpData, sectionData, commentData] = await Promise.all([
			database.select().from(events).where(eq(events.id, eventId)).limit(1),
			database.select().from(rsvps).where(eq(rsvps.eventId, eventId)).orderBy(asc(rsvps.createdAt)),
			database
				.select()
				.from(eventSections)
				.where(eq(eventSections.eventId, eventId))
				.orderBy(asc(eventSections.position)),
			database
				.select()
				.from(comments)
				.where(eq(comments.eventId, eventId))
				.orderBy(asc(comments.createdAt))
		]);

		if (!eventData[0]) {
			throw error(404, 'Event not found');
		}

		const event = eventData[0];
		const eventRsvps = rsvpData;

		// Check if this is an invite-only event
		if (event.visibility === 'invite-only') {
			// For invite-only events, check if user is the event creator
			if (event.userId !== userId) {
				// User is not the creator, redirect to a message about needing invite
				throw error(403, 'This event requires an invite link to view');
			}
		}

		// Transform the data to match the expected interface
		const transformedEvent = {
			id: event.id,
			name: event.name,
			date: event.date,
			time: event.time,
			location: event.location,
			location_type: event.locationType,
			location_url: event.locationUrl,
			type: event.type,
			attendee_limit: event.attendeeLimit,
			visibility: event.visibility,
			// Never send raw user ids to the client — they are the credential
			is_creator: !!userId && event.userId === userId,
			created_at: event.createdAt?.toISOString() || new Date().toISOString(),
			updated_at: event.updatedAt?.toISOString() || new Date().toISOString()
		};

		const transformedRsvps = eventRsvps.map((rsvp) => ({
			id: rsvp.id,
			event_id: rsvp.eventId,
			name: rsvp.name,
			is_mine: !!userId && rsvp.userId === userId,
			created_at: rsvp.createdAt?.toISOString() || new Date().toISOString()
		}));

		const transformedSections = sectionData.map((section) => ({
			id: section.id,
			title: section.title,
			body: section.body,
			position: section.position
		}));

		// Flatten to client shape first (dropping user_id, which is the credential),
		// then nest replies under their parent. The tree is only ever one level deep.
		const isCreator = transformedEvent.is_creator;
		const flatComments: Comment[] = commentData.map((comment) => {
			const isMine = !!userId && comment.userId === userId;
			return {
				id: comment.id,
				event_id: comment.eventId,
				parent_id: comment.parentId,
				author_name: comment.authorName,
				body: comment.body,
				is_mine: isMine,
				can_delete: isMine || isCreator,
				created_at: comment.createdAt?.toISOString() || new Date().toISOString(),
				replies: []
			};
		});

		const byId = new Map(flatComments.map((comment) => [comment.id, comment]));
		const threadedComments = flatComments.filter((comment) => {
			if (!comment.parent_id) return true;
			byId.get(comment.parent_id)?.replies?.push(comment);
			return false;
		});

		// Prefill the comment form with this visitor's RSVP name, when they have one
		const myRsvpName =
			eventRsvps.find(
				(rsvp) => !!userId && rsvp.userId === userId && !rsvp.name.includes("'s Guest")
			)?.name ?? '';

		return {
			event: { ...transformedEvent, sections: transformedSections },
			rsvps: transformedRsvps,
			comments: threadedComments,
			myRsvpName
		};
	} catch (err) {
		if (err instanceof Response) throw err; // This is the 404 error

		logger.error({ error: err, eventId }, 'Error loading event');
		throw error(500, 'Failed to load event');
	}
};

export const actions: Actions = {
	addRSVP: async ({ request, params, cookies }) => {
		const eventId = params.id;
		const formData = await request.formData();

		const name = formData.get('newAttendeeName') as string;
		const numberOfGuests = parseInt(formData.get('numberOfGuests') as string) || 0;
		const userId = cookies.get('cactoideUserId');

		if (!name?.trim() || !userId) {
			return fail(400, { error: 'Name and user ID are required' });
		}

		try {
			// Check if event exists and get its details
			const [eventData] = await database.select().from(events).where(eq(events.id, eventId));
			if (!eventData) {
				return fail(404, { error: 'Event not found' });
			}

			// Check if this is an invite-only event
			if (eventData.visibility === 'invite-only') {
				return fail(403, { error: 'This event requires an invite link to RSVP' });
			}

			// Get current RSVPs
			const currentRSVPs = await database.select().from(rsvps).where(eq(rsvps.eventId, eventId));

			// Calculate remaining spots and ensure main attendee + guests fit
			const newAttendeesCount = 1 + numberOfGuests;
			const remainingSpots = (eventData.attendeeLimit ?? 0) - currentRSVPs.length;

			// Check if event is full (for limited type events)
			if (eventData.type === 'limited' && eventData.attendeeLimit) {
				if (newAttendeesCount > remainingSpots) {
					return fail(400, {
						error: `Event capacity exceeded. You're trying to add ${newAttendeesCount} attendee${newAttendeesCount === 1 ? '' : 's'} (including yourself), but only ${remainingSpots} spot${remainingSpots === 1 ? '' : 's'} remain.`
					});
				}
			}

			// Check if name is already in the list
			if (currentRSVPs.some((rsvp) => rsvp.name.toLowerCase() === name.toLowerCase())) {
				return fail(400, { error: 'Name already exists for this event' });
			}

			// Prepare RSVPs to insert
			const rsvpsToInsert = [
				{
					eventId: eventId,
					name: name.trim(),
					userId: userId,
					createdAt: new Date()
				}
			];

			// Add guest entries
			for (let i = 1; i <= numberOfGuests; i++) {
				rsvpsToInsert.push({
					eventId: eventId,
					name: `${name.trim()}'s Guest #${i}`,
					userId: userId,
					createdAt: new Date()
				});
			}

			// Insert all RSVPs
			await database.insert(rsvps).values(rsvpsToInsert);

			return { success: true, type: 'add' };
		} catch (err) {
			logger.error({ error: err, eventId, userId, name }, 'Error adding RSVP');
			return fail(500, { error: 'Failed to add RSVP' });
		}
	},

	removeRSVP: async ({ request }) => {
		const formData = await request.formData();

		const rsvpId = formData.get('rsvpId') as string;

		if (!rsvpId) {
			return fail(400, { error: 'RSVP ID is required' });
		}

		try {
			await database.delete(rsvps).where(eq(rsvps.id, rsvpId));
			return { success: true, type: 'remove' };
		} catch (err) {
			logger.error({ error: err, rsvpId }, 'Error removing RSVP');
			return fail(500, { error: 'Failed to remove RSVP' });
		}
	},

	addComment: async ({ request, params, cookies }) => {
		const eventId = params.id;
		const formData = await request.formData();

		const body = (formData.get('body') as string)?.trim();
		const authorName = (formData.get('authorName') as string)?.trim();
		const parentId = (formData.get('parentId') as string) || null;
		const userId = cookies.get('cactoideUserId');

		if (!userId) {
			return fail(401, { error: 'Unauthorized' });
		}
		if (!body || !authorName) {
			return fail(400, { error: 'Name and comment are required' });
		}
		if (body.length > MAX_COMMENT_LENGTH) {
			return fail(400, { error: 'Comment is too long' });
		}

		try {
			const [eventData] = await database.select().from(events).where(eq(events.id, eventId));
			if (!eventData) {
				return fail(404, { error: 'Event not found' });
			}

			// Same gate the event page applies: invite-only events are creator-only here
			if (eventData.visibility === 'invite-only' && eventData.userId !== userId) {
				return fail(403, { error: 'This event requires an invite link to comment' });
			}

			// Keep the thread exactly one level deep: a reply must point at a
			// top-level comment on this same event.
			let resolvedParentId: string | null = null;
			if (parentId) {
				const [parent] = await database
					.select()
					.from(comments)
					.where(and(eq(comments.id, parentId), eq(comments.eventId, eventId)))
					.limit(1);

				if (!parent) {
					return fail(400, { error: 'Comment to reply to was not found' });
				}
				// Replying to a reply attaches to that reply's parent instead of nesting
				resolvedParentId = parent.parentId ?? parent.id;
			}

			await database.insert(comments).values({
				eventId,
				parentId: resolvedParentId,
				authorName: authorName.slice(0, MAX_COMMENT_AUTHOR_LENGTH),
				body,
				userId
			});

			return { success: true, type: 'comment-add' };
		} catch (err) {
			logger.error({ error: err, eventId, userId }, 'Error adding comment');
			return fail(500, { error: 'Failed to post comment' });
		}
	},

	deleteComment: async ({ request, params, cookies }) => {
		const eventId = params.id;
		const formData = await request.formData();

		const commentId = formData.get('commentId') as string;
		const userId = cookies.get('cactoideUserId');

		if (!userId) {
			return fail(401, { error: 'Unauthorized' });
		}
		if (!commentId) {
			return fail(400, { error: 'Comment ID is required' });
		}

		try {
			const [comment] = await database
				.select()
				.from(comments)
				.where(and(eq(comments.id, commentId), eq(comments.eventId, eventId)))
				.limit(1);

			if (!comment) {
				return fail(404, { error: 'Comment not found' });
			}

			const [eventData] = await database.select().from(events).where(eq(events.id, eventId));

			// The author may delete their own; the event creator may delete any on
			// their event. Enforced here, not just hidden in the UI.
			const isAuthor = comment.userId === userId;
			const isEventCreator = !!eventData && eventData.userId === userId;
			if (!isAuthor && !isEventCreator) {
				return fail(403, { error: 'You can only delete your own comments' });
			}

			// Replies cascade with their parent via the self-referencing FK
			await database.delete(comments).where(eq(comments.id, commentId));

			return { success: true, type: 'comment-remove' };
		} catch (err) {
			logger.error({ error: err, eventId, commentId }, 'Error deleting comment');
			return fail(500, { error: 'Failed to delete comment' });
		}
	}
};
