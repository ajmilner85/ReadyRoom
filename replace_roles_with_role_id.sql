-- SQL script to simplify pilots table - using a single role_id reference instead of roles JSON array
-- This script assumes you have already migrated your pilots to have a primary_role_id or role_id

-- Step 1: Begin a transaction to ensure all changes are atomic
BEGIN;

-- Step 2: Drop the pilot_with_roles view if it exists to allow column changes
DROP VIEW IF EXISTS pilot_with_roles;
RAISE NOTICE 'Dropped pilot_with_roles view to allow schema changes';

-- Step 3: Check if primary_role_id exists and rename it to role_id if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'pilots' AND column_name = 'primary_role_id'
  ) THEN
    ALTER TABLE pilots RENAME COLUMN primary_role_id TO role_id;
    RAISE NOTICE 'Renamed primary_role_id column to role_id';
  ELSE
    RAISE NOTICE 'primary_role_id column does not exist, checking for role_id instead';
    
    -- Check if role_id already exists
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'pilots' AND column_name = 'role_id'
    ) THEN
      -- If neither primary_role_id nor role_id exist, create role_id column
      ALTER TABLE pilots ADD COLUMN role_id UUID REFERENCES roles(id);
      RAISE NOTICE 'Created new role_id column';
    ELSE
      RAISE NOTICE 'role_id column already exists';
    END IF;
  END IF;
END $$;

-- Step 4: Create new simplified view for pilots with role information
CREATE OR REPLACE VIEW pilot_with_role AS
SELECT 
  p.id, 
  p.callsign, 
  p.boardnumber,
  p.status_id,
  p.role_id,
  r.name AS role_name
FROM pilots p
LEFT JOIN roles r ON p.role_id = r.id;

RAISE NOTICE 'Created simplified pilot_with_role view with single role reference';

-- Step 5: Drop the roles JSON column if it exists (optional - uncomment when ready)
-- ALTER TABLE pilots DROP COLUMN IF EXISTS roles;
-- RAISE NOTICE 'Dropped the deprecated roles JSON column';

-- Step 6: Commit the transaction
COMMIT;

-- Final notice for completing the migration
DO $$
BEGIN
  RAISE NOTICE '--------------------------------';
  RAISE NOTICE 'Migration to simplified role system completed!';
  RAISE NOTICE 'To complete the migration:';
  RAISE NOTICE '1. Update your application code to use role_id field only';
  RAISE NOTICE '2. When ready, uncomment and run the column drop statement:';
  RAISE NOTICE 'ALTER TABLE pilots DROP COLUMN IF EXISTS roles;';
  RAISE NOTICE '--------------------------------';
END $$;