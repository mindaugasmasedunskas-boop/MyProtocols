-- Susipažinimo ataskaitos atsakingam asmeniui. Paleisti Supabase SQL Editor vieną kartą.
-- Teisę „Mato ataskaitas“ suteikia tik administratorius. Toks asmuo mato
-- tik tų darbuotojų profilius ir susipažinimus, kurių skyriai sutampa su jo
-- paties skyriais. Keisti nieko negali.

alter table public.profiles
    add column if not exists can_view_reports boolean not null default false;
grant update (can_view_reports) on public.profiles to authenticated;

create or replace function public.is_reporter()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select can_view_reports from public.profiles where id = auth.uid()), false) $$;

-- Whether a user shares at least one department with the caller.
create or replace function public.in_my_departments(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select coalesce((select p.departments && public.my_departments()
        from public.profiles p where p.id = target), false)
$$;

revoke all on function public.is_reporter() from public, anon;
revoke all on function public.in_my_departments(uuid) from public, anon;
grant execute on function public.is_reporter() to authenticated;
grant execute on function public.in_my_departments(uuid) to authenticated;

drop policy if exists profiles_reporter_read on public.profiles;
create policy profiles_reporter_read on public.profiles for select to authenticated
    using (public.is_reporter() and public.in_my_departments(id));

drop policy if exists document_acks_reporter_read on public.document_acks;
create policy document_acks_reporter_read on public.document_acks for select to authenticated
    using (public.is_reporter() and public.in_my_departments(user_id));

-- Only an admin may change the right or the departments (which define what
-- a reporter sees), whatever other UPDATE policies exist on profiles.
create or replace function public.profiles_guard_reports()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
    -- No signed-in user: the admin-users function (service role) or the
    -- dashboard SQL editor. Anonymous visitors cannot update profiles at all.
    if auth.uid() is null or public.is_admin() then
        return new;
    end if;
    if new.can_view_reports is distinct from old.can_view_reports
        or new.departments is distinct from old.departments then
        raise exception 'Teises ir skyrius keičia tik administratorius.';
    end if;
    return new;
end;
$$;
revoke all on function public.profiles_guard_reports() from public, anon, authenticated;
drop trigger if exists profiles_guard_reports on public.profiles;
create trigger profiles_guard_reports before update on public.profiles
    for each row execute function public.profiles_guard_reports();
