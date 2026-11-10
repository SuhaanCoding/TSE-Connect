begin;

alter table public.alumni add column if not exists keywords text[] not null default '{}';
alter table public.alumni add constraint alumni_keywords_limits
  check (cardinality(keywords) <= 10 and array_position(keywords, null) is null
    and char_length(array_to_string(keywords, '')) <= 400);

create or replace function public.search_alumni(search_query text)
returns setof public.alumni
language sql stable security invoker set search_path = ''
as $$
  select * from public.alumni
  where strpos(lower(full_name), lower(search_query)) > 0
    or strpos(lower(current_company), lower(search_query)) > 0
    or strpos(lower(current_role), lower(search_query)) > 0
    or strpos(lower(array_to_string(past_companies, ',')), lower(search_query)) > 0
    or strpos(lower(array_to_string(keywords, ',')), lower(search_query)) > 0
  order by full_name;
$$;

create or replace function public.protect_scraped_companies()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.current_company is distinct from old.current_company
    or new.past_companies is distinct from old.past_companies
  ) then
    raise exception 'Companies are synced from LinkedIn. Update your LinkedIn profile to change them.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_scraped_companies before update on public.alumni
for each row execute function public.protect_scraped_companies();

commit;
