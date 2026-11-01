-- Profile picture: one of the app's own avatars, "piece:<colour+piece>:<background>".
-- Only additive, so the previous release keeps working (manifest E9).
alter table public.profiles
  add column avatar text check (avatar ~ '^piece:[wb][pnbrqk]:(green|blue|amber|violet|red|slate)$');
revoke update on public.profiles from authenticated;
grant update (display_name, avatar) on public.profiles to authenticated;
