begin;
alter table public.alumni add column if not exists bio text;
alter table public.alumni add constraint alumni_bio_length check (char_length(bio) <= 1000);

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
    or strpos(lower(bio), lower(search_query)) > 0
  order by full_name;
$$;
commit;
