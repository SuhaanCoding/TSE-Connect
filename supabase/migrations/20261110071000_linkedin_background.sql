begin;
alter table public.alumni add column if not exists linkedin_about text;
alter table public.alumni add column if not exists linkedin_background text;
alter table public.alumni add constraint alumni_linkedin_about_length check (char_length(linkedin_about) <= 6000);
alter table public.alumni add constraint alumni_linkedin_background_length check (char_length(linkedin_background) <= 18000);

create or replace function public.protect_scraped_companies()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.current_company is distinct from old.current_company
    or new.past_companies is distinct from old.past_companies
    or new.linkedin_about is distinct from old.linkedin_about
    or new.linkedin_background is distinct from old.linkedin_background
  ) then
    raise exception 'LinkedIn details are synced automatically. Update your LinkedIn profile to change them.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create or replace function public.valid_profile_keywords(values_to_check text[])
returns boolean language sql immutable set search_path = ''
as $$
  select cardinality(values_to_check) <= 10 and coalesce(bool_and(
    keyword is not null and char_length(trim(keyword)) between 1 and 40 and strpos(keyword, ',') = 0
  ), true) from unnest(values_to_check) as keyword;
$$;
alter table public.alumni add constraint alumni_keywords_entry_limits check (public.valid_profile_keywords(keywords));

create or replace function public.search_alumni(search_query text)
returns setof public.alumni language sql stable security invoker set search_path = ''
as $$
  select * from public.alumni
  where strpos(lower(concat_ws(' ', full_name, current_company, current_role,
    array_to_string(past_companies, ','), array_to_string(keywords, ','), bio,
    linkedin_about, linkedin_background)), lower(search_query)) > 0
  order by full_name;
$$;
commit;
