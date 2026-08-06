-- Development staff manage donors natively now that the Bloomerang/Neon
-- read-only mirror is gone (§6.8): grant donors.create + donors.update to
-- development_staff in databases whose RBAC was seeded under the old grants.
-- Fresh databases seed the same grants from ROLE_PERMISSIONS instead.
-- (The permission keys themselves already exist — donors is not a new module.)

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT gen_random_uuid(), r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" IN ('donors.create', 'donors.update')
WHERE r."key" = 'development_staff'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
