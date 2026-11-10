begin;
do $$
declare rid uuid; affected integer;
begin
  insert into public.scrape_runs(status, trigger, profile_count)
    values ('running', 'manual_test', 0) returning id into rid;
  begin
    insert into public.scrape_runs(status, trigger, profile_count)
      values ('running', 'manual_test', 0);
    raise exception 'FAIL: overlapping scrape reservation was accepted';
  exception when unique_violation then null;
  end;
  update public.scrape_runs set processing_token='11111111-1111-4111-8111-111111111111', processing_started_at=now()
    where id=rid and processing_started_at is null;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'FAIL: initial lease rejected'; end if;
  update public.scrape_runs set processing_token='22222222-2222-4222-8222-222222222222'
    where id=rid and (processing_started_at is null or processing_started_at<now()-interval '5 minutes');
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL: active lease was stolen'; end if;
  update public.scrape_runs set processing_started_at=now()-interval '6 minutes' where id=rid;
  update public.scrape_runs set processing_token='22222222-2222-4222-8222-222222222222', processing_started_at=now()
    where id=rid and (processing_started_at is null or processing_started_at<now()-interval '5 minutes');
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'FAIL: expired lease could not be resumed'; end if;
end $$;
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.scrape_runs;
    raise exception 'FAIL: member can read operational receipts directly';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'PASS: duplicate runs blocked, active lease protected, expired lease resumed, member receipt access denied; test changes rolled back' as result;
