-- SQL script to migrate from JSON roles to a proper primary role reference

-- Step 1: Add primary_role_id column to pilots table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'pilots' AND column_name = 'primary_role_id'
  ) THEN
    -- Add the column as nullable initially to allow migration
    ALTER TABLE pilots ADD COLUMN primary_role_id UUID REFERENCES roles(id);
    RAISE NOTICE 'Added primary_role_id column to pilots table';
  ELSE
    RAISE NOTICE 'primary_role_id column already exists';
  END IF;
END $$;

-- Step 2: Create temporary function to help migrate data from JSON to relation
CREATE OR REPLACE FUNCTION migrate_json_squadron_role_to_primary_role()
RETURNS void AS $$
DECLARE
  pilot_record RECORD;
  squadron_role TEXT;
  matching_role_id UUID;
  role_record RECORD;
BEGIN
  -- Loop through all pilots
  FOR pilot_record IN SELECT id, roles FROM pilots WHERE roles IS NOT NULL AND roles->>'squadron' IS NOT NULL LOOP
    -- Extract the squadron role from the JSON
    squadron_role := pilot_record.roles->>'squadron';
    
    -- If role is non-empty, try to find a matching role in the roles table
    IF squadron_role <> '' AND squadron_role IS NOT NULL THEN
      -- Look for an exact match first
      SELECT id INTO matching_role_id 
      FROM roles 
      WHERE name = squadron_role
      LIMIT 1;
      
      -- If no exact match, try a case-insensitive match
      IF matching_role_id IS NULL THEN
        SELECT id INTO matching_role_id 
        FROM roles 
        WHERE LOWER(name) = LOWER(squadron_role)
        LIMIT 1;
      END IF;
      
      -- If we found a matching role, update the pilot's primary_role_id
      IF matching_role_id IS NOT NULL THEN
        -- Update the pilot's primary_role_id
        UPDATE pilots
        SET primary_role_id = matching_role_id
        WHERE id = pilot_record.id;
        
        -- Safely ensure this role is also in the pilot_roles junction table
        BEGIN
          INSERT INTO pilot_roles (pilot_id, role_id)
          VALUES (pilot_record.id, matching_role_id)
          ON CONFLICT (pilot_id, role_id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Error inserting into pilot_roles for pilot % and role %: %', 
            pilot_record.id, matching_role_id, SQLERRM;
        END;
        
        RAISE NOTICE 'Migrated pilot % from JSON role "%" to role ID %', 
          pilot_record.id, squadron_role, matching_role_id;
      ELSE
        -- If no matching role found, we need to create one
        BEGIN
          INSERT INTO roles (name, "isExclusive", compatible_statuses, "order")
          VALUES (squadron_role, false, '{}'::UUID[], 100)  -- Default values, adjust as needed
          RETURNING id INTO matching_role_id;
          
          -- Update the pilot with the new role
          UPDATE pilots
          SET primary_role_id = matching_role_id
          WHERE id = pilot_record.id;
          
          -- Add to junction table, with error handling
          BEGIN
            INSERT INTO pilot_roles (pilot_id, role_id)
            VALUES (pilot_record.id, matching_role_id);
          EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error inserting into pilot_roles for pilot % and role %: %', 
              pilot_record.id, matching_role_id, SQLERRM;
          END;
          
          RAISE NOTICE 'Created and assigned new role "%" (ID %) for pilot %', 
            squadron_role, matching_role_id, pilot_record.id;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Error creating new role "%": %', squadron_role, SQLERRM;
        END;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Execute the migration function
SELECT migrate_json_squadron_role_to_primary_role();

-- Step 4: Drop the temporary function
DROP FUNCTION migrate_json_squadron_role_to_primary_role();

-- Step 5: Update constraints (optional - do this after validating the migration was successful)
-- ALTER TABLE pilots ALTER COLUMN primary_role_id SET NOT NULL;

-- Step 6: Add an optional comment explaining the roles JSON field is now deprecated
COMMENT ON COLUMN pilots.roles IS 'DEPRECATED: Use primary_role_id instead. This field is kept for backward compatibility.';

-- Step 7: Create a view to help with transition (optional)
-- First determine the actual column name case for boardNumber/boardnumber
DO $$
DECLARE
  actual_column_name text;
BEGIN
  SELECT information_schema.columns.column_name INTO actual_column_name
  FROM information_schema.columns
  WHERE table_name = 'pilots' 
    AND lower(information_schema.columns.column_name) = lower('boardnumber');
  
  IF actual_column_name IS NULL THEN
    RAISE EXCEPTION 'Could not find column boardnumber (or variant) in pilots table';
  END IF;
  
  EXECUTE format('
    CREATE OR REPLACE VIEW pilot_with_roles AS
    SELECT 
      p.id, 
      p.callsign, 
      p.%I,
      p.status_id,
      p.primary_role_id,
      r.name AS role_name
    FROM pilots p
    LEFT JOIN roles r ON p.primary_role_id = r.id', actual_column_name);
  
  RAISE NOTICE 'Created view using column name: %', actual_column_name;
END $$;

COMMENT ON VIEW pilot_with_roles IS 'View to help transition from JSON roles to relational roles';