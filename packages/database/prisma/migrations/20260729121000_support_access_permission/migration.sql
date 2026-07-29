-- Grant the new support.access permission (support tickets, §6.15) to every
-- role in databases whose RBAC was seeded before the permission existed.
-- Fresh databases: the RBAC bootstrap seeds it from ALL_PERMISSIONS instead
-- (permission.createMany uses skipDuplicates, so this pre-insert is safe).

INSERT INTO "permissions" ("id", "key", "description", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'support.access', 'File support tickets and read your own', now(), now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT gen_random_uuid(), r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."key" = 'support.access'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
