-- Populate the `services.types` app setting (Admin → Settings) with the
-- standard service menu for an ex-offender transitional housing program.
-- Data-only migration; idempotent — an existing admin-edited value wins.
INSERT INTO "app_settings" ("key", "value", "updatedAt")
VALUES (
  'services.types',
  '[
    "Case management session",
    "Housing placement",
    "Rental assistance",
    "Utility assistance",
    "Food assistance",
    "Clothing assistance",
    "Hygiene supplies",
    "Furniture / household goods",
    "Transportation assistance",
    "Bus pass",
    "Driver''s license restoration",
    "Phone / phone minutes",
    "ID / documents assistance",
    "Benefits enrollment (SNAP, Medicaid…)",
    "Health insurance enrollment",
    "Medical / dental referral",
    "Mental health counseling referral",
    "Substance abuse treatment referral",
    "Recovery support meeting (AA/NA)",
    "Relapse prevention planning",
    "Parole / probation compliance support",
    "Court date accompaniment",
    "Expungement / record sealing assistance",
    "Registry compliance support",
    "Legal aid referral",
    "Employment readiness",
    "Job placement",
    "Vocational training",
    "Education / GED support",
    "Life skills training",
    "Financial literacy / budgeting",
    "Emergency financial assistance",
    "Child support assistance",
    "Family reunification support",
    "Mentoring",
    "Spiritual support",
    "Church / congregation connection",
    "Peer support group",
    "Other"
  ]'::jsonb,
  NOW()
)
ON CONFLICT ("key") DO NOTHING;
