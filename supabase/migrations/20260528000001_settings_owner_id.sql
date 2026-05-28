-- Add owner_id to settings so tenants can look up the owner's user_id for push notifications
alter table public.settings add column if not exists owner_id uuid references auth.users(id);
