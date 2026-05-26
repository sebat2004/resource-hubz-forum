create table if not exists public.categories (
  id text primary key,
  name text not null,
  description text not null,
  accent text not null,
  illustration text not null default 'tag',
  sort_order integer not null default 0
);

create table if not exists public.posts (
  id bigint generated always as identity primary key,
  category_id text not null references public.categories(id),
  title text not null check (char_length(trim(title)) >= 8),
  body text not null check (char_length(trim(body)) >= 16),
  author_name text not null default 'Anonymous Neighbor',
  created_at timestamptz not null default now(),
  votes integer not null default 0
);

create table if not exists public.replies (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  body text not null check (char_length(trim(body)) >= 8),
  author_name text not null default 'Anonymous Neighbor',
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;
alter table public.posts enable row level security;
alter table public.replies enable row level security;

drop policy if exists "Public can read categories" on public.categories;
drop policy if exists "Public can read posts" on public.posts;
drop policy if exists "Public can create posts" on public.posts;
drop policy if exists "Public can vote on posts" on public.posts;
drop policy if exists "Public can read replies" on public.replies;
drop policy if exists "Public can create replies" on public.replies;

create policy "Public can read categories"
on public.categories for select
to anon
using (true);

create policy "Public can read posts"
on public.posts for select
to anon
using (true);

create policy "Public can create posts"
on public.posts for insert
to anon
with check (true);

create policy "Public can vote on posts"
on public.posts for update
to anon
using (true)
with check (true);

create policy "Public can read replies"
on public.replies for select
to anon
using (true);

create policy "Public can create replies"
on public.replies for insert
to anon
with check (true);

insert into public.categories (id, name, description, accent, illustration, sort_order)
values
  ('housing', 'Housing', 'Shelter, rent help, tenant rights, and safe temporary stays.', '#7c8df6', 'home', 1),
  ('education', 'Education Resources', 'School support, tutoring, financial aid, and adult learning.', '#65b7a6', 'book', 2),
  ('domestic-violence', 'Domestic Violence', 'Safety planning, confidential support, and survivor resources.', '#f08ba2', 'shield', 3),
  ('healthcare', 'Healthcare', 'Clinics, insurance questions, medication access, and care navigation.', '#55a6d9', 'heart', 4),
  ('food', 'Food Insecurity', 'Food banks, meal programs, SNAP, and emergency groceries.', '#f4b95f', 'bowl', 5),
  ('immigration', 'Undocumented Immigrants', 'Know-your-rights resources, legal aid, and local support.', '#b88be8', 'hands', 6),
  ('mental-health', 'Mental Health / Suicide Prevention', 'Emotional support, crisis resources, and peer encouragement.', '#68c7c2', 'mind', 7)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  accent = excluded.accent,
  illustration = excluded.illustration,
  sort_order = excluded.sort_order;

insert into public.posts (category_id, title, body, author_name, votes)
select 'housing',
  'Where can I look for emergency rent help this week?',
  'I got behind after missing work and I am worried about a notice. Has anyone found local programs that reply quickly?',
  'Anonymous Neighbor',
  12
where not exists (
  select 1 from public.posts where title = 'Where can I look for emergency rent help this week?'
);

insert into public.posts (category_id, title, body, author_name, votes)
select 'mental-health',
  'I need support tonight but I do not want to panic my family',
  'I am not in immediate danger, but I feel overwhelmed and could use ideas for getting through the next few hours.',
  'Anonymous Friend',
  24
where not exists (
  select 1 from public.posts where title = 'I need support tonight but I do not want to panic my family'
);
