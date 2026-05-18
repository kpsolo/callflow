import { useEffect, useState } from "react";
import { useCollab, type Comment, type CommentAnchor } from "@/api";
import "./CommentsPanel.css";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 5_000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Renders the comments anchored to a specific subject (a node, an edge, or
 * the whole flow). Subscribes to the collab client for live updates so
 * other tabs / future collaborators show up without polling.
 */
export function CommentsPanel({
  flowId,
  anchor,
  flowRevisionAtPost,
  emptyHint,
}: {
  flowId: string;
  anchor: CommentAnchor;
  flowRevisionAtPost?: number;
  emptyHint?: string;
}) {
  const collab = useCollab();
  const [all, setAll] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    return collab.observeComments(flowId, setAll);
  }, [collab, flowId]);

  const relevant = all.filter((c) => sameAnchor(c.anchor, anchor));
  const visible = showResolved ? relevant : relevant.filter((c) => !c.resolvedAt);
  const resolvedCount = relevant.length - relevant.filter((c) => !c.resolvedAt).length;

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await collab.addComment({ flowId, anchor, body, flowRevisionAtPost });
  };

  return (
    <div className="comments-panel">
      <ul className="comments-list">
        {visible.length === 0 ? (
          <li className="comments-empty">{emptyHint ?? "No comments yet."}</li>
        ) : (
          visible.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              onResolve={async () => {
                await collab.resolveComment(c.id);
              }}
              onUnresolve={async () => {
                await collab.unresolveComment(c.id);
              }}
              onDelete={async () => {
                if (window.confirm("Delete this comment?")) await collab.deleteComment(c.id);
              }}
              canManage={c.authorId === collab.currentUser().id}
            />
          ))
        )}
      </ul>

      {resolvedCount > 0 && (
        <button
          type="button"
          className="comments-show-resolved"
          onClick={() => setShowResolved((v) => !v)}
        >
          {showResolved
            ? `Hide resolved (${resolvedCount})`
            : `Show resolved (${resolvedCount})`}
        </button>
      )}

      <div className="comments-compose">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Leave a comment…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={3}
        />
        <div className="comments-compose-row">
          <small>Ctrl+Enter to post</small>
          <button type="button" onClick={submit} disabled={!draft.trim()}>
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  onResolve,
  onUnresolve,
  onDelete,
  canManage,
}: {
  comment: Comment;
  onResolve: () => void;
  onUnresolve: () => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  return (
    <li className={"comment-row" + (comment.resolvedAt ? " is-resolved" : "")}>
      <div className="comment-meta">
        <strong>{comment.authorDisplayName}</strong>
        <small title={comment.createdAt}>{relativeTime(comment.createdAt)}</small>
        {comment.resolvedAt && <span className="comment-tag">resolved</span>}
      </div>
      <div className="comment-body">{comment.body}</div>
      <div className="comment-actions">
        {comment.resolvedAt ? (
          <button type="button" onClick={onUnresolve}>
            Reopen
          </button>
        ) : (
          <button type="button" onClick={onResolve}>
            Resolve
          </button>
        )}
        {canManage && (
          <button type="button" className="comment-delete" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

function sameAnchor(a: CommentAnchor, b: CommentAnchor): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "node" && b.kind === "node") return a.nodeId === b.nodeId;
  if (a.kind === "edge" && b.kind === "edge") return a.edgeId === b.edgeId;
  return true;
}
