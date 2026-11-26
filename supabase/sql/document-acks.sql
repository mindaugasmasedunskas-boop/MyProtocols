-- Dokumentai, 2 etapas: „Susipažinau“. Paleisti Supabase SQL Editor vieną kartą.
-- Susipažinimo įrašą darbuotojas gali tik sukurti; keisti ar trinti jo negali.
-- Įrašas susietas su konkrečia failo versija (version_key = sha256 arba kelias).

alter table public.documents
    add column if not exists requires_ack boolean not null default false,
    add column if not exists audience_groups text[] not null default '{}',
    add column if not exists audience_departments text[] not null default '{}',
    add column if not exists version_at timestamptz not null default now();

grant update (title, category, file_path, file_name, sha256, requires_ack,
    audience_groups, audience_departments, version_at) on public.documents to authenticated;
drop policy if exists documents_admin_update on public.documents;
create policy documents_admin_update on public.documents for update to authenticated
    using (public.is_admin()) with check (public.is_admin());

create table if not exists public.document_acks (
    id bigint generated always as identity primary key,
    document_id bigint not null references public.documents(id) on delete cascade,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    version_key text not null,
    full_name text not null default '',
    acknowledged_at timestamptz not null default now(),
    unique (document_id, user_id, version_key)
);

-- Owner, name and time come from the server; the version must be the
-- document's current one and the document must require acknowledgement.
create or replace function public.document_acks_fill()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare d record; p record;
begin
    select requires_ack, coalesce(sha256, file_path) as version_key into d
    from public.documents where id = new.document_id;
    if not found or not d.requires_ack then
        raise exception 'Šiam dokumentui susipažinimas nereikalingas.';
    end if;
    if new.version_key is distinct from d.version_key then
        raise exception 'Dokumentas buvo atnaujintas. Atidarykite naują versiją.';
    end if;
    select full_name, username into p from public.profiles where id = auth.uid();
    new.user_id := auth.uid();
    new.full_name := coalesce(nullif(p.full_name, ''), p.username, '');
    new.acknowledged_at := now();
    return new;
end;
$$;
revoke all on function public.document_acks_fill() from public, anon, authenticated;
drop trigger if exists document_acks_fill on public.document_acks;
create trigger document_acks_fill before insert on public.document_acks
    for each row execute function public.document_acks_fill();

alter table public.document_acks enable row level security;
revoke all on public.document_acks from anon, authenticated;
grant select, insert on public.document_acks to authenticated;

drop policy if exists document_acks_read on public.document_acks;
create policy document_acks_read on public.document_acks for select to authenticated
    using (user_id = auth.uid() or public.is_admin());

drop policy if exists document_acks_insert on public.document_acks;
create policy document_acks_insert on public.document_acks for insert to authenticated
    with check (user_id = auth.uid());
