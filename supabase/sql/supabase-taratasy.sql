-- ============================================================
-- Taratasy : fanamarinam-ponenana sy fifindra-monina
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Ce que garde cette table, c'est ce qui a été délivré : à qui, quand, et
-- ce qui était écrit dessus. Le PDF, lui, se refabrique à partir de ces
-- lignes — un papier réimprimé doit dire exactement ce que disait le premier.
--
-- Le papier ne vaut que signé et cacheté par l'autorité compétente : la
-- table ne remplace pas le fokontany, elle prépare et garde la trace.
--
-- Tout appartient au compte qui l'a créé, et chacun ne voit que le sien.
-- ============================================================

create table if not exists public.taratasy (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,

  -- 'fonenana' : certificat de résidence
  -- 'fifindramonina' : changement de résidence
  karazana text not null check (karazana in ('fonenana', 'fifindramonina')),

  -- Le numéro porté sur le papier.
  laharana text,

  anarana text not null,
  laharana_cin text,
  teraka_daty date,
  teraka_toerana text,

  -- Résidence actuelle ; et pour un départ, l'ancienne et la nouvelle.
  fonenana text,
  fonenana_taloha text,
  fonenana_vaovao text,

  daty date not null default current_date,
  fanamarihana text,

  created_at timestamptz not null default now()
);

create index if not exists taratasy_owner_idx on public.taratasy (owner_email, daty desc);

alter table public.taratasy enable row level security;

drop policy if exists "taratasy lecture proprietaire" on public.taratasy;
create policy "taratasy lecture proprietaire"
  on public.taratasy for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "taratasy ecriture proprietaire" on public.taratasy;
create policy "taratasy ecriture proprietaire"
  on public.taratasy for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "taratasy modification proprietaire" on public.taratasy;
create policy "taratasy modification proprietaire"
  on public.taratasy for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "taratasy suppression proprietaire" on public.taratasy;
create policy "taratasy suppression proprietaire"
  on public.taratasy for delete to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Vérification ----------
select table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'taratasy';
