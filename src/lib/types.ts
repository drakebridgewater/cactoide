export type EventType = 'limited' | 'unlimited';
export type EventVisibility = 'public' | 'private' | 'invite-only';
export type ActionType = 'add' | 'remove';
export type LocationType = 'none' | 'text' | 'maps';

export interface Event {
	id: string;
	name: string;
	date: string;
	time: string;
	location: string;
	location_type: LocationType;
	location_url?: string;
	type: EventType;
	attendee_limit?: number;
	visibility: EventVisibility;
	sections?: EventSection[];
	is_creator?: boolean; // Optional: absent on events fetched from federated instances
	created_at: string;
	updated_at: string;
	federation?: boolean; // Optional: true if event is from a federated instance
	federation_url?: string; // Optional: URL of the federated instance this event came from
}

export interface EventSection {
	id: string;
	title: string;
	body: string;
	position: number;
}

/** A section as it travels through a form, before it has an id. */
export interface SectionInput {
	title: string;
	body: string;
}

export interface Comment {
	id: string;
	event_id: string;
	parent_id: string | null;
	author_name: string;
	body: string;
	is_mine: boolean;
	can_delete: boolean;
	created_at: string;
	replies?: Comment[]; // Only populated on top-level comments
}

export interface RSVP {
	id: string;
	event_id: string;
	name: string;
	is_mine: boolean;
	created_at: string;
}

export interface CreateEventData {
	name: string;
	date: string;
	time: string;
	location: string;
	location_type: LocationType;
	location_url?: string;
	type: EventType;
	attendee_limit?: number;
	visibility: EventVisibility;
}

export interface DatabaseEvent {
	id: string;
	name: string;
	date: string;
	time: string;
	location: string;
	location_type: LocationType;
	location_url?: string;
	type: EventType;
	attendee_limit?: number;
	visibility: EventVisibility;
	user_id: string;
	created_at: string;
	updated_at: string;
}

export interface DatabaseRSVP {
	id: string;
	event_id: string;
	name: string;
	user_id: string;
	created_at: string;
}

export interface InviteToken {
	id: string;
	event_id: string;
	token: string;
	expires_at: string;
	created_at: string;
}
