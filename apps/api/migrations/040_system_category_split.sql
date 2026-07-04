-- Split system functional category from custom-built origin flag.
-- Preserves unknown category values in category_legacy for manual review.

-- 1) Legacy "Custom*" category values → is_custom_built + flag for review
UPDATE objects
SET properties =
  COALESCE(properties, '{}'::jsonb)
  || jsonb_build_object('is_custom_built', true)
  || CASE
       WHEN properties->>'category' IS NOT NULL
         AND trim(properties->>'category') <> ''
         AND (properties->>'category_legacy' IS NULL OR properties->>'category_legacy' = '')
       THEN jsonb_build_object(
         'category_legacy', properties->>'category',
         'category_review_required', true
       )
       ELSE '{}'::jsonb
     END
  - 'category'
WHERE type IN ('application', 'solution', 'technical_capability')
  AND properties->>'category' IS NOT NULL
  AND lower(trim(properties->>'category')) IN (
    'custom', 'custom-built', 'custom built', 'in-house', 'in house', 'internal', 'bespoke'
  );

-- 2) Invalid functional categories → preserve in category_legacy, flag for review (keep category value)
UPDATE objects
SET properties =
  COALESCE(properties, '{}'::jsonb)
  || jsonb_build_object(
    'category_legacy', properties->>'category',
    'category_review_required', true
  )
WHERE type IN ('application', 'solution', 'technical_capability')
  AND properties->>'category' IS NOT NULL
  AND trim(properties->>'category') <> ''
  AND properties->>'category' NOT IN (
    'Analytics', 'Collaboration', 'Commerce', 'CRM', 'CX', 'ERP',
    'Finance', 'HR', 'Infrastructure', 'Integration', 'Supply Chain', 'Other'
  )
  AND lower(trim(properties->>'category')) NOT IN (
    'custom', 'custom-built', 'custom built', 'in-house', 'in house', 'internal', 'bespoke'
  )
  AND (properties->>'category_legacy' IS NULL OR properties->>'category_legacy' = '');

-- 3) Default is_custom_built = false where absent
UPDATE objects
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object('is_custom_built', false)
WHERE type IN ('application', 'solution', 'technical_capability')
  AND (properties->>'is_custom_built' IS NULL);
