import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.env.PORT || 3002);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ROOT = resolve(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const DB_PATH = join(DATA_DIR, "resource-hubz.sqlite");
const VITE_ORIGIN = "http://localhost:5174";

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    accent TEXT NOT NULL,
    illustration TEXT NOT NULL,
    sort_order INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id TEXT NOT NULL REFERENCES categories(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    author_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    votes INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    author_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const seedCategories = [
  ["housing", "Housing", "Shelter, rent help, tenant rights, and safe temporary stays.", "#7c8df6", "home", 1],
  ["education", "Education Resources", "School support, tutoring, financial aid, and adult learning.", "#65b7a6", "book", 2],
  ["domestic-violence", "Domestic Violence", "Safety planning, confidential support, and survivor resources.", "#f08ba2", "shield", 3],
  ["healthcare", "Healthcare", "Clinics, insurance questions, medication access, and care navigation.", "#55a6d9", "heart", 4],
  ["food", "Food Insecurity", "Food banks, meal programs, SNAP, and emergency groceries.", "#f4b95f", "bowl", 5],
  ["immigration", "Undocumented Immigrants", "Know-your-rights resources, legal aid, and local support.", "#b88be8", "hands", 6],
  ["mental-health", "Mental Health / Suicide Prevention", "Emotional support, crisis resources, and peer encouragement.", "#68c7c2", "mind", 7]
];

const categoryCount = db.prepare("SELECT COUNT(*) AS count FROM categories").get().count;
if (categoryCount === 0) {
  const insertCategory = db.prepare(
    "INSERT INTO categories (id, name, description, accent, illustration, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const category of seedCategories) {
    insertCategory.run(...category);
  }
}

const postCount = db.prepare("SELECT COUNT(*) AS count FROM posts").get().count;
if (postCount === 0) {
  const insertPost = db.prepare(
    "INSERT INTO posts (category_id, title, body, author_name, votes) VALUES (?, ?, ?, ?, ?)"
  );
  const insertReply = db.prepare(
    "INSERT INTO replies (post_id, body, author_name) VALUES (?, ?, ?)"
  );

  const first = insertPost.run(
    "housing",
    "Where can I look for emergency rent help this week?",
    "I got behind after missing work and I am worried about a notice. Has anyone found local programs that reply quickly?",
    "Anonymous Neighbor",
    12
  ).lastInsertRowid;
  insertReply.run(
    first,
    "Calling 211 is a good first step. If you are comfortable sharing your county, people may know more specific options.",
    "Quiet Helper"
  );

  const second = insertPost.run(
    "mental-health",
    "I need support tonight but I do not want to panic my family",
    "I am not in immediate danger, but I feel overwhelmed and could use ideas for getting through the next few hours.",
    "Anonymous Friend",
    24
  ).lastInsertRowid;
  insertReply.run(
    second,
    "You deserve support. In the U.S., calling or texting 988 can connect you with someone right now, even if you are unsure it is serious enough.",
    "Care Team"
  );
}

const statements = {
  categories: db.prepare(`
    SELECT
      c.*,
      COUNT(DISTINCT p.id) AS post_count,
      COUNT(DISTINCT r.id) AS reply_count,
      MAX(COALESCE(r.created_at, p.created_at)) AS last_activity
    FROM categories c
    LEFT JOIN posts p ON p.category_id = c.id
    LEFT JOIN replies r ON r.post_id = p.id
    GROUP BY c.id
    ORDER BY c.sort_order
  `),
  posts: db.prepare(`
    SELECT
      p.*,
      c.name AS category_name,
      c.accent AS category_accent,
      COUNT(r.id) AS reply_count,
      MAX(COALESCE(r.created_at, p.created_at)) AS last_activity
    FROM posts p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN replies r ON r.post_id = p.id
    WHERE (? IS NULL OR p.category_id = ?)
      AND (? IS NULL OR LOWER(p.title || ' ' || p.body || ' ' || c.name) LIKE ?)
    GROUP BY p.id
    ORDER BY last_activity DESC, p.created_at DESC
  `),
  postById: db.prepare(`
    SELECT p.*, c.name AS category_name, c.accent AS category_accent
    FROM posts p
    JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `),
  repliesByPost: db.prepare("SELECT * FROM replies WHERE post_id = ? ORDER BY created_at ASC"),
  createPost: db.prepare(
    "INSERT INTO posts (category_id, title, body, author_name) VALUES (?, ?, ?, ?)"
  ),
  createReply: db.prepare(
    "INSERT INTO replies (post_id, body, author_name) VALUES (?, ?, ?)"
  ),
  votePost: db.prepare("UPDATE posts SET votes = votes + ? WHERE id = ?")
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { error: "Not found" });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanBody(value, maxLength) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    accent: row.accent,
    illustration: row.illustration,
    postCount: row.post_count,
    replyCount: row.reply_count,
    lastActivity: row.last_activity
  };
}

function mapPost(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryAccent: row.category_accent,
    title: row.title,
    body: row.body,
    authorName: row.author_name,
    createdAt: row.created_at,
    votes: row.votes,
    replyCount: row.reply_count ?? 0,
    lastActivity: row.last_activity ?? row.created_at
  };
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/categories") {
    json(res, 200, statements.categories.all().map(mapCategory));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/posts") {
    const category = url.searchParams.get("category") || null;
    const query = cleanText(url.searchParams.get("q"), 80).toLowerCase();
    const search = query ? `%${query}%` : null;
    const posts = statements.posts.all(category, category, search, search).map(mapPost);
    json(res, 200, posts);
    return;
  }

  const postMatch = url.pathname.match(/^\/api\/posts\/(\d+)$/);
  if (req.method === "GET" && postMatch) {
    const post = statements.postById.get(Number(postMatch[1]));
    if (!post) {
      notFound(res);
      return;
    }
    json(res, 200, {
      ...mapPost({ ...post, reply_count: 0, last_activity: post.created_at }),
      replies: statements.repliesByPost.all(post.id).map((reply) => ({
        id: reply.id,
        postId: reply.post_id,
        body: reply.body,
        authorName: reply.author_name,
        createdAt: reply.created_at
      }))
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/posts") {
    const payload = await readJson(req);
    const categoryId = cleanText(payload.categoryId, 80);
    const title = cleanText(payload.title, 120);
    const body = cleanBody(payload.body, 2200);
    const authorName = cleanText(payload.authorName, 60) || "Anonymous Neighbor";

    if (!categoryId || title.length < 8 || body.length < 16) {
      json(res, 400, { error: "Please choose a category, add a clear title, and share a few details." });
      return;
    }

    const result = statements.createPost.run(categoryId, title, body, authorName);
    const post = statements.postById.get(result.lastInsertRowid);
    json(res, 201, mapPost({ ...post, reply_count: 0, last_activity: post.created_at }));
    return;
  }

  const replyMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/replies$/);
  if (req.method === "POST" && replyMatch) {
    const postId = Number(replyMatch[1]);
    if (!statements.postById.get(postId)) {
      notFound(res);
      return;
    }
    const payload = await readJson(req);
    const body = cleanBody(payload.body, 1600);
    const authorName = cleanText(payload.authorName, 60) || "Anonymous Neighbor";

    if (body.length < 8) {
      json(res, 400, { error: "Please write a little more before replying." });
      return;
    }

    const result = statements.createReply.run(postId, body, authorName);
    const reply = db.prepare("SELECT * FROM replies WHERE id = ?").get(result.lastInsertRowid);
    json(res, 201, {
      id: reply.id,
      postId: reply.post_id,
      body: reply.body,
      authorName: reply.author_name,
      createdAt: reply.created_at
    });
    return;
  }

  const voteMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/vote$/);
  if (req.method === "POST" && voteMatch) {
    const payload = await readJson(req);
    const delta = payload.delta === -1 ? -1 : 1;
    statements.votePost.run(delta, Number(voteMatch[1]));
    const post = statements.postById.get(Number(voteMatch[1]));
    if (!post) {
      notFound(res);
      return;
    }
    json(res, 200, { votes: post.votes });
    return;
  }

  notFound(res);
}

async function serveStatic(req, res, url) {
  const dist = join(ROOT, "dist");
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = join(dist, requested);
  const safePath = filePath.startsWith(dist) ? filePath : join(dist, "index.html");
  const finalPath = existsSync(safePath) && (await stat(safePath)).isFile() ? safePath : join(dist, "index.html");
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon"
  }[extname(finalPath)] || "application/octet-stream";
  res.writeHead(200, { "content-type": mime });
  res.end(await readFile(finalPath));
}

async function proxyToVite(req, res, url) {
  try {
    const viteResponse = await fetch(`${VITE_ORIGIN}${url.pathname}${url.search}`, {
      method: req.method,
      headers: req.headers
    });
    res.writeHead(viteResponse.status, Object.fromEntries(viteResponse.headers.entries()));
    res.end(Buffer.from(await viteResponse.arrayBuffer()));
  } catch {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end("Vite is still starting. Refresh in a moment.");
  }
}

if (!IS_PRODUCTION) {
  spawn(process.execPath, [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--host", "localhost"], {
    cwd: ROOT,
    stdio: "inherit"
  });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (IS_PRODUCTION) {
      await serveStatic(req, res, url);
      return;
    }
    await proxyToVite(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Something went wrong." });
  }
}).listen(PORT, () => {
  console.log(`Resource Hubz Forum running at http://localhost:${PORT}`);
});
