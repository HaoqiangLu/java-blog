import { useState } from 'react';
import { useComments, useCreateComment } from '../api/queries';
import { useAuthStore } from '../stores/authStore';

export function CommentSection({ postId }: { postId: string }) {
    const { data: comments, isLoading } = useComments(postId);
    const createComment = useCreateComment();
    const [content, setContent] = useState('');
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;
        await createComment.mutateAsync({ postId, content: content.trim() });
        setContent('');
    };

    return (
        <div>
            <h3 className="text-xl font-bold mb-4">Comments</h3>

            {isAuthenticated && (
                <form onSubmit={handleSubmit} className="mb-6">
          <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a comment..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500"
          />
                    <button type="submit" disabled={createComment.isPending}
                            className="mt-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                        {createComment.isPending ? 'Posting...' : 'Post Comment'}
                    </button>
                </form>
            )}

            {isLoading ? (
                <p className="text-gray-500">Loading comments...</p>
            ) : comments?.length === 0 ? (
                <p className="text-gray-500">No comments yet.</p>
            ) : (
                <div className="space-y-4">
                    {comments?.map((comment) => (
                        <div key={comment.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <p className="text-sm">{comment.is_deleted ? '[Deleted]' : comment.content}</p>
                            <p className="text-xs text-gray-400 mt-1">
                                {new Date(comment.created_at).toLocaleString()}
                            </p>
                            {comment.replies?.map((reply) => (
                                <div key={reply.id} className="ml-6 mt-2 p-3 bg-white dark:bg-gray-700 rounded-lg">
                                    <p className="text-sm">{reply.is_deleted ? '[Deleted]' : reply.content}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {new Date(reply.created_at).toLocaleString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}