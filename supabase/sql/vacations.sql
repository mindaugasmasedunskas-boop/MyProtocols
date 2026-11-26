-- Atostogų planavimas. Paleisti Supabase SQL Editor vieną kartą.
-- Matomumas: savo įrašai; tų pačių pareigų ir bent vieno bendro skyriaus
-- kolegų įrašai; administratorius mato viską.

create table if not exists public.vacations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    full_name text not null default '',
    staff_group text not null default '',
    departments text[] not null default '{}',
    start_date date not null,
    end_date date not null,
    status text not null default 'planned' check (status in ('planned', 'approved', 'rejected')),
    note text not null default '' check (char_length(note) <= 300),
    created_at timestamptz not null default now(),
    check (end_date >= start_date),
    check (end_date - start_date <= 92)
);
create index if not exists vacations_dates on public.vacations (start_date, end_date);

-- The row takes the owner, name, position and departments from the profile,
-- so the client cannot claim another person or another department.
create or replace function public.vacations_fill()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare p record;
begin
    select full_name, username, staff_group, departments into p
    from public.profiles where id = auth.uid();
    new.user_id := auth.uid();
    new.full_name := coalesce(nullif(p.full_name, ''), p.username, '');
    new.staff_group := coalesce(p.staff_group, '');
    new.departments := coalesce(p.departments, '{}');
    new.status := 'planned';
    new.created_at := now();
    return new;
end;
$$;
drop trigger if exists vacations_fill on public.vacations;
create trigger vacations_fill before insert on public.vacations
    for each row execute function public.vacations_fill();

create or replace function public.my_staff_group()
returns text language sql stable security definer set search_path = public
as $$ select coalesce(staff_group, '') from public.profiles where id = auth.uid() $$;

create or replace function public.my_departments()
returns text[] language sql stable security definer set search_path = public
as $$ select coalesce(departments, '{}') from public.profiles where id = auth.uid() $$;

revoke all on function public.vacations_fill() from public, anon, authenticated;
revoke all on function public.my_staff_group() from public, anon;
revoke all on function public.my_departments() from public, anon;
grant execute on function public.my_staff_group() to authenticated;
grant execute on function public.my_departments() to authenticated;

alter table public.vacations enable row level security;
revoke all on public.vacations from anon, authenticated;
grant select, insert, delete on public.vacations to authenticated;
grant update (status) on public.vacations to authenticated;

drop policy if exists vacations_read on public.vacations;
create policy vacations_read on public.vacations for select to authenticated
using (
    user_id = auth.uid()
    or public.is_admin()
    or (staff_group <> ''
        and staff_group = public.my_staff_group()
        and departments && public.my_departments())
);

drop policy if exists vacations_insert on public.vacations;
create policy vacations_insert on public.vacations for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists vacations_update on public.vacations;
create policy vacations_update on public.vacations for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists vacations_delete on public.vacations;
create policy vacations_delete on public.vacations for delete to authenticated
using ((user_id = auth.uid() and status = 'planned') or public.is_admin());
