# Integer company user IDs

`node scripts/migrate-integer-user-ids.cjs` validates and rehearses the migration
on every registered company database, then rolls each transaction back.
`node scripts/migrate-integer-user-ids.cjs --apply` commits it.

The migration preserves existing numeric identities, rejects invalid IDs,
collisions and orphan references, and adds validated foreign keys. It never
deletes records or replaces unknown users. Existing foreign keys pointing to
the separate integer `user_settings.id` retain that relationship; other company
user references point to `user_settings.user_id`. Physical user deletion is
restricted when historical transactions reference that user.

Each database is migrated atomically with a five-second lock timeout. A failing
database rolls back and is reported; successful databases remain committed.
Re-running is supported. Dependencies PostgreSQL cannot safely alter cause a
rollback rather than dropping dependent views or data.

New users receive `user_id` from a database sequence. New company provisioning
runs this migration after seeding. Active runtime table definitions and the
company bootstrap use integer company user references. Old, standalone scripts
that generate `U0001` IDs or convert IDs to VARCHAR are historical and must not
be used to initialize or repair migrated databases.

External device identifiers (for example attendance `device_user_id`) are not
company user IDs and remain unchanged. Management accounts and customer portal
identities are separate entities and are not rekeyed to company users.
