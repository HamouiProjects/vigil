# GDPR erasure runbook

## Self-serve path

Authenticated users can delete their account via `POST /api/jobs?action=delete-account` with header `Authorization: Bearer <Supabase JWT>` and body `{ "confirm": "DELETE" }`.

The handler deletes, for that user id only:

- `workspaces`
- `sources`
- `subscriptions`
- `briefs`
- `alerts`
- `alert_events`
- `email_signups` rows where `lower(email)` matches the account email
- the Supabase Auth user via `auth.admin.deleteUser`

Rate limit: 3 requests per minute per IP.

## Not covered automatically

**Stripe customer object.** If the user had a subscription row with `stripe_customer_id`, the API logs `[delete-account] stripe customer for manual cleanup` plus the id. Stripe is in TEST mode. In the Stripe Dashboard (test), search for that customer id and delete the customer (and cancel any active test subscription first if needed).

**Resend logs.** Outbound brief and alert emails are sent through Resend. Deleting the Vigil account does not purge Resend delivery logs or copies stored at Resend. For a full erasure request, open Resend support or use their data tools if available, and reference the user's email address and approximate send dates.

**Shared or public rooms.** If the user published a workspace (`is_public = true`), deleting the account removes that workspace row. Cached copies (CDN, search engines, third-party scrapers) are outside Vigil.

## Verify zero rows for a uid

Replace `USER_UUID` with the Supabase auth user id.

```sql
select
  (select count(*) from public.workspaces    where user_id = 'USER_UUID') as workspaces,
  (select count(*) from public.sources       where user_id = 'USER_UUID') as sources,
  (select count(*) from public.subscriptions where user_id = 'USER_UUID') as subscriptions,
  (select count(*) from public.briefs        where user_id = 'USER_UUID') as briefs,
  (select count(*) from public.alerts        where user_id = 'USER_UUID') as alerts,
  (select count(*) from public.alert_events  where user_id = 'USER_UUID') as alert_events;
```

All counts should be `0`. Confirm the auth user is gone in Supabase Dashboard under Authentication, or:

```sql
select id from auth.users where id = 'USER_UUID';
```

Should return no rows.

To check email signups for an address:

```sql
select count(*) from public.email_signups where lower(email) = lower('user@example.com');
```
