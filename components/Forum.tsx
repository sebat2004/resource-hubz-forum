"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowBigDown,
  ArrowBigUp,
  MessageCircle,
  Plus,
  Search,
  Send,
  X,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
  description: string;
  accent: string;
  postCount: number;
  replyCount: number;
  lastActivity: string | null;
};

type Post = {
  id: number;
  categoryId: string;
  categoryName: string;
  categoryAccent: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  votes: number;
  replyCount: number;
  lastActivity: string;
};

type Reply = {
  id: number;
  postId: number;
  body: string;
  authorName: string;
  createdAt: string;
};

type PostDetail = Post & { replies: Reply[] };

type NewPost = {
  categoryId: string;
  title: string;
  body: string;
};

const anonymousNames = [
  "Anonymous Neighbor",
  "Quiet Helper",
  "Resource Friend",
  "Hopeful Guest",
  "Community Member",
  "Kind Stranger",
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
}) {
  return (
    <button
      className={cn("ui-button", `ui-button-${variant}`, className)}
      {...props}
    />
  );
}

function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <article className={cn("ui-card", className)} {...props} />;
}

function Badge({
  className,
  active,
  accent,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  accent?: string;
}) {
  return (
    <button
      className={cn("ui-badge", active && "ui-badge-active", className)}
      style={{ "--accent": accent } as CSSProperties}
      {...props}
    />
  );
}

function Dialog({
  children,
  open,
  onOpenChange,
}: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="dialog-content">
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DialogTitle({
  className,
  ...props
}: DialogPrimitive.DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      className={cn("dialog-title", className)}
      {...props}
    />
  );
}

function DialogCloseButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <DialogPrimitive.Close asChild>
      <Button variant="ghost" className={className} {...props}>
        <X size={18} />
      </Button>
    </DialogPrimitive.Close>
  );
}

type CategoryRow = {
  id: string;
  name: string;
  description: string;
  accent: string;
  illustration?: string;
  sort_order?: number;
};

type ReplyRow = {
  id: number;
  post_id: number;
  body: string;
  author_name: string;
  created_at: string;
};

type PostRow = {
  id: number;
  category_id: string;
  title: string;
  body: string;
  author_name: string;
  created_at: string;
  votes: number;
  categories?: { name: string; accent: string } | null;
  replies?: Array<Pick<ReplyRow, "id" | "created_at">>;
};

function mapSupabasePost(row: PostRow): Post {
  const replies = row.replies ?? [];
  const lastReply = replies
    .map((reply) => reply.created_at)
    .sort()
    .at(-1);

  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? "Resource",
    categoryAccent: row.categories?.accent ?? "#71717a",
    title: row.title,
    body: row.body,
    authorName: row.author_name,
    createdAt: row.created_at,
    votes: row.votes,
    replyCount: replies.length,
    lastActivity:
      lastReply && lastReply > row.created_at ? lastReply : row.created_at,
  };
}

function mapSupabaseReply(row: ReplyRow): Reply {
  return {
    id: row.id,
    postId: row.post_id,
    body: row.body,
    authorName: row.author_name,
    createdAt: row.created_at,
  };
}

async function fetchCategories() {
  if (!supabase) throw new Error("Supabase is not configured.");

  const [
    { data: categories, error: categoriesError },
    { data: posts, error: postsError },
    { data: replies, error: repliesError },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase.from("posts").select("id, category_id, created_at"),
    supabase.from("replies").select("post_id, created_at"),
  ]);

  if (categoriesError) throw categoriesError;
  if (postsError) throw postsError;
  if (repliesError) throw repliesError;

  return (categories as CategoryRow[]).map((category) => {
    const categoryPosts = (posts ?? []).filter(
      (post) => post.category_id === category.id
    );
    const postIds = new Set(categoryPosts.map((post) => post.id));
    const categoryReplies = (replies ?? []).filter((reply) =>
      postIds.has(reply.post_id)
    );
    const lastActivity =
      [
        ...categoryPosts.map((post) => post.created_at),
        ...categoryReplies.map((reply) => reply.created_at),
      ]
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      accent: category.accent,
      postCount: categoryPosts.length,
      replyCount: categoryReplies.length,
      lastActivity,
    };
  });
}

async function fetchPosts(query = "") {
  if (!supabase) throw new Error("Supabase is not configured.");

  let request = supabase
    .from("posts")
    .select("*, categories(name, accent), replies(id, created_at)")
    .order("created_at", { ascending: false });

  if (query.trim()) {
    const search = query.trim().replaceAll(",", " ");
    request = request.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
  }

  const { data, error } = await request;
  if (error) throw error;
  return (data as PostRow[])
    .map(mapSupabasePost)
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

async function fetchPost(postId: number) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const [
    { data: post, error: postError },
    { data: replies, error: repliesError },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select("*, categories(name, accent), replies(id, created_at)")
      .eq("id", postId)
      .single(),
    supabase
      .from("replies")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
  ]);

  if (postError) throw postError;
  if (repliesError) throw repliesError;

  return {
    ...mapSupabasePost(post as PostRow),
    replies: (replies as ReplyRow[]).map(mapSupabaseReply),
  };
}

async function createPost(payload: NewPost & { authorName: string }) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("posts")
    .insert({
      category_id: payload.categoryId,
      title: payload.title.trim(),
      body: payload.body.trim(),
      author_name: payload.authorName,
    })
    .select("*, categories(name, accent), replies(id, created_at)")
    .single();

  if (error) throw error;
  return mapSupabasePost(data as PostRow);
}

async function createReply(
  postId: number,
  body: string,
  authorName: string
) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("replies")
    .insert({
      post_id: postId,
      body: body.trim(),
      author_name: authorName,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapSupabaseReply(data as ReplyRow);
}

async function votePost(postId: number, delta: 1 | -1) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: post, error: fetchError } = await supabase
    .from("posts")
    .select("votes")
    .eq("id", postId)
    .single();

  if (fetchError) throw fetchError;

  const { data, error } = await supabase
    .from("posts")
    .update({ votes: (post.votes ?? 0) + delta })
    .eq("id", postId)
    .select("votes")
    .single();

  if (error) throw error;
  return { votes: data.votes };
}

function getAnonymousName() {
  const stored = localStorage.getItem("resource-hubz-name");
  if (stored) return stored;
  const next =
    anonymousNames[Math.floor(Math.random() * anonymousNames.length)];
  localStorage.setItem("resource-hubz-name", next);
  return next;
}

function relativeTime(value: string | null) {
  if (!value) return "No activity yet";
  const then = new Date(value.replace(" ", "T"));
  const diff = Date.now() - then.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ name }: { name: string }) {
  return <span className="avatar">{initials(name)}</span>;
}

export default function Forum() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostDetail | null>(null);
  const [query, setQuery] = useState("");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [newPost, setNewPost] = useState<NewPost>({
    categoryId: "",
    title: "",
    body: "",
  });
  const [replyBody, setReplyBody] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setAuthorName(getAnonymousName());
  }, []);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    fetchPosts(query)
      .then(setPosts)
      .catch((err) => setError(err.message));
  }, [query]);

  useEffect(() => {
    if (!selectedPostId) {
      setSelectedPost(null);
      return;
    }
    fetchPost(selectedPostId)
      .then(setSelectedPost)
      .catch((err) => setError(err.message));
  }, [selectedPostId]);

  const filteredPosts = useMemo(() => {
    if (activeTags.length === 0) return posts;
    return posts.filter((post) => activeTags.includes(post.categoryId));
  }, [activeTags, posts]);

  const selectedCategoryName = useMemo(() => {
    if (activeTags.length === 0) return "All topics";
    return categories
      .filter((category) => activeTags.includes(category.id))
      .map((category) => category.name)
      .join(", ");
  }, [activeTags, categories]);

  async function refreshAfterChange(postId: number) {
    const [nextCategories, nextPosts, detail] = await Promise.all([
      fetchCategories(),
      fetchPosts(query),
      fetchPost(postId),
    ]);
    setCategories(nextCategories);
    setPosts(nextPosts);
    setSelectedPost(detail);
    setSelectedPostId(postId);
  }

  function toggleTag(categoryId: string) {
    setActiveTags((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    );
  }

  function openComposer() {
    setModalError("");
    setNewPost((current) => ({
      ...current,
      categoryId: activeTags.length === 1 ? activeTags[0] : current.categoryId,
    }));
    setIsComposerOpen(true);
  }

  async function submitPost(event: React.FormEvent) {
    event.preventDefault();
    setIsBusy(true);
    setError("");
    setModalError("");
    try {
      const created = await createPost({ ...newPost, authorName });
      setIsComposerOpen(false);
      setNewPost({ categoryId: "", title: "", body: "" });
      await refreshAfterChange(created.id);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Could not create post"
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function submitReply(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPost) return;
    setIsBusy(true);
    setError("");
    setModalError("");
    try {
      await createReply(selectedPost.id, replyBody, authorName);
      setReplyBody("");
      await refreshAfterChange(selectedPost.id);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Could not add reply"
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function vote(postId: number, delta: 1 | -1) {
    await votePost(postId, delta);
    await refreshAfterChange(postId);
  }

  return (
    <main className="app-shell">
      <section className="search-section" aria-label="Forum search and filters">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search anonymous posts"
          />
        </label>

        <div className="tag-row" aria-label="Filter by category">
          {categories.map((category) => (
            <Badge
              key={category.id}
              active={activeTags.includes(category.id)}
              accent={category.accent}
              onClick={() => toggleTag(category.id)}
              aria-pressed={activeTags.includes(category.id)}
            >
              {category.name}
            </Badge>
          ))}
        </div>
      </section>

      {error && (
        <div className="notice" role="alert">
          {error}
          <Button
            variant="ghost"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </Button>
        </div>
      )}

      <section className="feed-header">
        <div>
          <p>{selectedCategoryName}</p>
          <h1>Community posts</h1>
        </div>
        <Button onClick={openComposer}>
          <Plus size={17} />
          New Post
        </Button>
      </section>

      <section className="post-list" aria-label="Community posts">
        {filteredPosts.map((post) => (
          <Card
            key={post.id}
            className="post-card"
            onClick={() => {
              setModalError("");
              setSelectedPostId(post.id);
            }}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setModalError("");
                setSelectedPostId(post.id);
              }
            }}
          >
            <div className="vote-stack">
              <Button
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  vote(post.id, 1);
                }}
                aria-label="Upvote"
              >
                <ArrowBigUp size={19} />
              </Button>
              <strong>{post.votes}</strong>
              <Button
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  vote(post.id, -1);
                }}
                aria-label="Downvote"
              >
                <ArrowBigDown size={19} />
              </Button>
            </div>

            <div className="post-copy">
              <span
                className="category-chip"
                style={{ "--accent": post.categoryAccent } as CSSProperties}
              >
                {post.categoryName}
              </span>
              <h2>{post.title}</h2>
              <p>{post.body}</p>
              <footer>
                <span>
                  <Avatar name={post.authorName} />
                  {post.authorName}
                </span>
                <span>{relativeTime(post.lastActivity)}</span>
                <span>
                  <MessageCircle size={15} />
                  {post.replyCount}
                </span>
              </footer>
            </div>
          </Card>
        ))}

        {filteredPosts.length === 0 && (
          <Card className="empty-card">
            <strong>No matching posts yet</strong>
            <span>Try removing a pill or start a new anonymous post.</span>
          </Card>
        )}
      </section>

      <Dialog
        open={Boolean(selectedPost)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPostId(null);
            setModalError("");
            setReplyBody("");
          }
        }}
      >
        {selectedPost && (
          <>
            <div className="dialog-header">
              <span
                className="category-chip"
                style={
                  { "--accent": selectedPost.categoryAccent } as CSSProperties
                }
              >
                {selectedPost.categoryName}
              </span>
              <DialogCloseButton aria-label="Close post" />
            </div>

            <div className="post-detail">
              <DialogTitle>{selectedPost.title}</DialogTitle>
              <p>{selectedPost.body}</p>
              <footer>
                <Avatar name={selectedPost.authorName} />
                Posted by {selectedPost.authorName} ·{" "}
                {relativeTime(selectedPost.createdAt)}
              </footer>
            </div>

            <div className="reply-list">
              <h3>Replies</h3>
              {selectedPost.replies.map((reply) => (
                <article className="reply-card" key={reply.id}>
                  <Avatar name={reply.authorName} />
                  <div>
                    <strong>{reply.authorName}</strong>
                    <p>{reply.body}</p>
                    <span>{relativeTime(reply.createdAt)}</span>
                  </div>
                </article>
              ))}
              {selectedPost.replies.length === 0 && (
                <p className="quiet">
                  No replies yet. A kind first response can make a hard day
                  easier.
                </p>
              )}
            </div>

            <form className="reply-form" onSubmit={submitReply}>
              {modalError && (
                <div className="modal-error" role="alert">
                  {modalError}
                </div>
              )}
              <label>
                Reply anonymously
                <textarea
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder="Share a helpful resource, next step, or words of support."
                />
              </label>
              <Button disabled={isBusy}>
                <Send size={16} />
                Reply
              </Button>
            </form>
          </>
        )}
      </Dialog>

      <Dialog
        open={isComposerOpen}
        onOpenChange={(open) => {
          setIsComposerOpen(open);
          setModalError("");
        }}
      >
        {isComposerOpen && (
          <form className="composer" onSubmit={submitPost}>
            <div className="dialog-header">
              <div>
                <p>Anonymous post</p>
                <DialogTitle>Start a new post</DialogTitle>
              </div>
              <DialogCloseButton type="button" aria-label="Close composer" />
            </div>

            {modalError && (
              <div className="modal-error composer-error" role="alert">
                {modalError}
              </div>
            )}

            <label>
              Category
              <select
                value={newPost.categoryId}
                onChange={(event) =>
                  setNewPost({ ...newPost, categoryId: event.target.value })
                }
                required
              >
                <option value="">Choose a category</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Post title
              <input
                value={newPost.title}
                onChange={(event) =>
                  setNewPost({ ...newPost, title: event.target.value })
                }
                placeholder="What do you need help with?"
                minLength={8}
                maxLength={120}
                required
              />
            </label>

            <label>
              Details
              <textarea
                value={newPost.body}
                onChange={(event) =>
                  setNewPost({ ...newPost, body: event.target.value })
                }
                placeholder="Share what is going on, roughly where you are if useful, and what kind of help would be welcome."
                minLength={16}
                maxLength={2200}
                required
              />
            </label>

            <div className="composer-footer">
              <span>
                Posting as <strong>{authorName}</strong>
              </span>
              <Button disabled={isBusy}>
                <Send size={16} />
                Post
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </main>
  );
}
