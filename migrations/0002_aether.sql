create table if not exists documents (
  id text primary key,
  title text not null,
  filename text not null,
  collection text not null,
  version integer not null default 1,
  content text not null,
  source_uri text not null,
  content_hash text not null,
  page_count integer not null default 1,
  valid_from text not null,
  valid_to text,
  superseded_by text,
  classification text not null default 'internal',
  author text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'indexed'
);

create table if not exists eval_ratings (
  id text primary key,
  question text not null,
  expected_answer text,
  actual_answer text,
  rating text not null,
  created_at timestamptz not null default now()
);

create table if not exists query_metrics (
  id text primary key,
  kind text not null,
  path text not null,
  latency_ms integer not null,
  confidence real not null,
  citation_count integer not null,
  used_llm integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists documents_collection_idx on documents (collection);
create index if not exists query_metrics_created_idx on query_metrics (created_at);
