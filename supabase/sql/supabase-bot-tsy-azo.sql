-- ============================================================
-- 🤖 Bot : ny fanontaniana tsy azony, voatahiry ho an'ny admin.
--
-- Taloha (2cb6afb) dia broadcast fotsiny ny marika « ❓ Tsy azon'ny bot » :
-- tsy tonga raha tsy teo ny admin, ary very rehefa naverina nalaina ny
-- pejy. Eto dia voatahiry ilay fanontaniana, ka hitan'ny admin ao amin'ny
-- lisitry ny 💬 Message (bokotra ❓) na efa ela aza, miaraka amin'ny
-- marika raha mbola tsy voavaly (29/10/2026).
--
-- À exécuter dans Supabase > SQL Editor. Rejouable sans risque.
-- ============================================================

create table if not exists public.bot_tsy_azo (
  id uuid primary key default gen_random_uuid(),
  avy text not null,                 -- email, na « mpitsidika-… »
  anarana text,
  soratra text not null check (char_length(soratra) <= 1000),
  hafatra_id text,                   -- ny id-n'ilay hafatra ao amin'ny resaka
  navaliana boolean not null default false,
  navaliana_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bot_tsy_azo_avy on public.bot_tsy_azo (avy, created_at desc);
alter table public.bot_tsy_azo enable row level security;

-- Ny mpanjifa no manoratra (kaonty : ny email-ny ihany ; mpitsidika : id
-- « mpitsidika-… »), ary « tsy voavaly » foana ny vaovao.
drop policy if exists "bot_tsy_azo alefa" on public.bot_tsy_azo;
create policy "bot_tsy_azo alefa" on public.bot_tsy_azo for insert to anon, authenticated
  with check (
    navaliana = false
    and (avy = lower(coalesce(auth.jwt() ->> 'email', ''))
         or (avy like 'mpitsidika-%' and coalesce(auth.jwt() ->> 'email', '') = ''))
  );

-- Ny admin ihany no mahita, mamaly ary mamafa.
drop policy if exists "bot_tsy_azo admin mijery" on public.bot_tsy_azo;
create policy "bot_tsy_azo admin mijery" on public.bot_tsy_azo for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "bot_tsy_azo admin mamaly" on public.bot_tsy_azo;
create policy "bot_tsy_azo admin mamaly" on public.bot_tsy_azo for update to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "bot_tsy_azo admin mamafa" on public.bot_tsy_azo;
create policy "bot_tsy_azo admin mamafa" on public.bot_tsy_azo for delete to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

grant insert on public.bot_tsy_azo to anon, authenticated;
grant select, update, delete on public.bot_tsy_azo to authenticated;
