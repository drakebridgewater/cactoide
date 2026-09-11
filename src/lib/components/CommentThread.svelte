<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n/i18n.js';
	import type { Comment } from '$lib/types';

	export let comments: Comment[] = [];
	/** Prefilled from the viewer's RSVP on this event, when they have one. */
	export let defaultName = '';

	let newName = defaultName;
	let newBody = '';
	let replyingTo: string | null = null;
	let replyName = defaultName;
	let replyBody = '';
	let isSubmitting = false;

	// Adopt the RSVP name once it becomes known, but never clobber typing.
	$: if (defaultName && !newName) newName = defaultName;
	$: if (defaultName && !replyName) replyName = defaultName;

	const formatTimestamp = (iso: string) =>
		new Date(iso).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	const openReply = (commentId: string) => {
		replyingTo = replyingTo === commentId ? null : commentId;
		replyBody = '';
		replyName = replyName || defaultName;
	};

	const submitComment = () => {
		isSubmitting = true;
		// enhance resets the form on success, which would also wipe the name the
		// visitor just typed — they usually comment more than once, so put it back.
		const submittedName = newName || replyName;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			isSubmitting = false;
			newBody = '';
			replyBody = '';
			replyingTo = null;
			if (submittedName) {
				newName = submittedName;
				replyName = submittedName;
			}
		};
	};
</script>

<div class="border-dark-300 rounded-sm border-2 p-6">
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-xl font-bold">{t('event.commentsTitle')}</h3>
		<span class="text-2xl font-bold">{comments.length}</span>
	</div>

	{#if comments.length === 0}
		<div class="text-dark-600 py-6 text-center">
			<p>{t('event.noCommentsYet')}</p>
			<p class="text-sm">{t('event.beFirstToComment')}</p>
		</div>
	{:else}
		<ul class="space-y-4">
			{#each comments as comment (comment.id)}
				<li class="border-dark-300 rounded-sm border-2 p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-2">
								<span class="font-semibold">{comment.author_name}</span>
								<span class="text-dark-600 text-xs">{formatTimestamp(comment.created_at)}</span>
							</div>
							<p class="mt-1 break-words whitespace-pre-wrap">{comment.body}</p>
						</div>
						{#if comment.can_delete}
							<form method="POST" action="?/deleteComment" use:enhance={submitComment}>
								<input type="hidden" name="commentId" value={comment.id} />
								<button
									type="submit"
									class="rounded-sm border-2 border-red-300 px-2 py-1 text-xs font-medium text-red-600 transition-all duration-200 hover:scale-105 hover:bg-red-50"
									aria-label={t('event.deleteComment')}
								>
									{t('common.delete')}
								</button>
							</form>
						{/if}
					</div>

					<button
						type="button"
						class="mt-2 text-sm font-medium text-violet-400 hover:underline"
						on:click={() => openReply(comment.id)}
					>
						{replyingTo === comment.id ? t('event.cancelReply') : t('event.reply')}
					</button>

					{#if comment.replies && comment.replies.length > 0}
						<ul class="mt-3 space-y-3 border-l-2 border-violet-400/40 pl-4">
							{#each comment.replies as reply (reply.id)}
								<li class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<div class="flex items-baseline gap-2">
											<span class="font-semibold">{reply.author_name}</span>
											<span class="text-dark-600 text-xs">{formatTimestamp(reply.created_at)}</span>
										</div>
										<p class="mt-1 break-words whitespace-pre-wrap">{reply.body}</p>
									</div>
									{#if reply.can_delete}
										<form method="POST" action="?/deleteComment" use:enhance={submitComment}>
											<input type="hidden" name="commentId" value={reply.id} />
											<button
												type="submit"
												class="rounded-sm border-2 border-red-300 px-2 py-1 text-xs font-medium text-red-600 transition-all duration-200 hover:scale-105 hover:bg-red-50"
												aria-label={t('event.deleteComment')}
											>
												{t('common.delete')}
											</button>
										</form>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if replyingTo === comment.id}
						<form
							method="POST"
							action="?/addComment"
							use:enhance={submitComment}
							class="mt-3 space-y-3 border-l-2 border-violet-400/40 pl-4"
						>
							<input type="hidden" name="parentId" value={comment.id} />
							<input
								name="authorName"
								type="text"
								bind:value={replyName}
								class="border-dark-300 w-full rounded-sm border-2 px-3 py-2 text-slate-900 shadow-sm"
								placeholder={t('event.yourNameCommentLabel')}
								maxlength="50"
								required
							/>
							<textarea
								name="body"
								rows="3"
								bind:value={replyBody}
								class="border-dark-300 w-full rounded-sm border-2 px-3 py-2 text-slate-900 shadow-sm"
								placeholder={t('event.replyPlaceholder')}
								maxlength="2000"
								required
							></textarea>
							<button
								type="submit"
								disabled={isSubmitting}
								class="rounded-sm border-2 border-violet-500 bg-violet-400/20 px-4 py-2 font-semibold transition-all duration-200 hover:scale-105 hover:bg-violet-400/70 disabled:opacity-50"
							>
								{isSubmitting ? t('event.posting') : t('event.postReply')}
							</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<form method="POST" action="?/addComment" use:enhance={submitComment} class="mt-6 space-y-3">
		<div>
			<label for="comment-author" class="text-dark-800 mb-2 block text-sm font-semibold">
				{t('event.yourNameCommentLabel')} <span class="text-red-400">{t('common.required')}</span>
			</label>
			<input
				id="comment-author"
				name="authorName"
				type="text"
				bind:value={newName}
				class="border-dark-300 w-full rounded-sm border-2 px-4 py-3 text-slate-900 shadow-sm"
				placeholder={t('event.yourNameCommentLabel')}
				maxlength="50"
				required
			/>
		</div>
		<div>
			<label for="comment-body" class="text-dark-800 mb-2 block text-sm font-semibold">
				{t('event.commentLabel')} <span class="text-red-400">{t('common.required')}</span>
			</label>
			<textarea
				id="comment-body"
				name="body"
				rows="3"
				bind:value={newBody}
				class="border-dark-300 w-full rounded-sm border-2 px-4 py-3 text-slate-900 shadow-sm"
				placeholder={t('event.commentPlaceholder')}
				maxlength="2000"
				required
			></textarea>
		</div>
		<button
			type="submit"
			disabled={isSubmitting}
			class="w-full rounded-sm border-2 border-violet-500 bg-violet-400/20 px-4 py-3 font-semibold transition-all duration-200 hover:scale-105 hover:bg-violet-400/70 disabled:opacity-50"
		>
			{isSubmitting ? t('event.posting') : t('event.postComment')}
		</button>
	</form>
</div>
