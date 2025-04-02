-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  isExclusive BOOLEAN NOT NULL DEFAULT false,
  compatible_statuses UUID[] NOT NULL DEFAULT '{}'::UUID[],
  "order" INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on roles table
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Check if policy exists first, then create if it doesn't
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'roles' AND policyname = 'Allow anonymous read access'
    ) THEN
        -- Allow anonymous users to select (read) roles data
        EXECUTE 'CREATE POLICY "Allow anonymous read access" ON roles FOR SELECT TO anon USING (true)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'roles' AND policyname = 'Allow authenticated read access'
    ) THEN
        -- Allow authenticated users to read roles data
        EXECUTE 'CREATE POLICY "Allow authenticated read access" ON roles FOR SELECT TO authenticated USING (true)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'roles' AND policyname = 'Allow authenticated insert access'
    ) THEN
        -- Allow authenticated users to insert roles data
        EXECUTE 'CREATE POLICY "Allow authenticated insert access" ON roles FOR INSERT TO authenticated WITH CHECK (true)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'roles' AND policyname = 'Allow authenticated update access'
    ) THEN
        -- Allow authenticated users to update roles data
        EXECUTE 'CREATE POLICY "Allow authenticated update access" ON roles FOR UPDATE TO authenticated USING (true)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'roles' AND policyname = 'Allow authenticated delete access'
    ) THEN
        -- Allow authenticated users to delete roles data
        EXECUTE 'CREATE POLICY "Allow authenticated delete access" ON roles FOR DELETE TO authenticated USING (true)';
    END IF;
END $$;

-- Create pilot_roles junction table
CREATE TABLE IF NOT EXISTS pilot_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pilot_id UUID NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(pilot_id, role_id)
);

-- Enable RLS on pilot_roles table
ALTER TABLE pilot_roles ENABLE ROW LEVEL SECURITY;

-- Check if policy exists first, then create if it doesn't for pilot_roles table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'pilot_roles' AND policyname = 'Allow anonymous read access'
    ) THEN
        -- Allow anonymous users to read pilot_roles data
        EXECUTE 'CREATE POLICY "Allow anonymous read access" ON pilot_roles FOR SELECT TO anon USING (true)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'pilot_roles' AND policyname = 'Allow authenticated read access'
    ) THEN
        -- Allow authenticated users to read pilot_roles data
        EXECUTE 'CREATE POLICY "Allow authenticated read access" ON pilot_roles FOR SELECT TO authenticated USING (true)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'pilot_roles' AND policyname = 'Allow authenticated insert access'
    ) THEN
        -- Allow authenticated users to insert pilot_roles data
        EXECUTE 'CREATE POLICY "Allow authenticated insert access" ON pilot_roles FOR INSERT TO authenticated WITH CHECK (true)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'pilot_roles' AND policyname = 'Allow authenticated update access'
    ) THEN
        -- Allow authenticated users to update pilot_roles data
        EXECUTE 'CREATE POLICY "Allow authenticated update access" ON pilot_roles FOR UPDATE TO authenticated USING (true)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'pilot_roles' AND policyname = 'Allow authenticated delete access'
    ) THEN
        -- Allow authenticated users to delete pilot_roles data
        EXECUTE 'CREATE POLICY "Allow authenticated delete access" ON pilot_roles FOR DELETE TO authenticated USING (true)';
    END IF;
END $$;

-- Grant permissions
GRANT SELECT ON roles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO authenticated;
GRANT SELECT ON pilot_roles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON pilot_roles TO authenticated;

-- Create or replace function to enforce role exclusivity
CREATE OR REPLACE FUNCTION enforce_role_exclusivity()
RETURNS TRIGGER AS $$
DECLARE
  is_exclusive BOOLEAN;
BEGIN
  -- Check if the role being assigned is exclusive
  SELECT isExclusive INTO is_exclusive FROM roles WHERE id = NEW.role_id;
  
  -- If exclusive, remove any existing assignments of this role
  IF is_exclusive THEN
    DELETE FROM pilot_roles WHERE role_id = NEW.role_id AND pilot_id != NEW.pilot_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS enforce_role_exclusivity_trigger ON pilot_roles;
CREATE TRIGGER enforce_role_exclusivity_trigger
BEFORE INSERT OR UPDATE ON pilot_roles
FOR EACH ROW
EXECUTE FUNCTION enforce_role_exclusivity();

-- Create or replace function to check if a role is compatible with a pilot's status
CREATE OR REPLACE FUNCTION check_role_compatibility()
RETURNS TRIGGER AS $$
DECLARE
  pilot_status_id UUID;
  compatible_statuses UUID[];
BEGIN
  -- Get pilot's status_id
  SELECT status_id INTO pilot_status_id FROM pilots WHERE id = NEW.pilot_id;
  
  -- Get role's compatible statuses
  SELECT compatible_statuses INTO compatible_statuses FROM roles WHERE id = NEW.role_id;
  
  -- If compatible_statuses is empty, allow the assignment regardless of status
  IF array_length(compatible_statuses, 1) IS NULL OR array_length(compatible_statuses, 1) = 0 THEN
    RETURN NEW;
  END IF;
  
  -- Check if pilot's status is compatible with the role
  IF pilot_status_id IS NULL OR NOT (pilot_status_id = ANY(compatible_statuses)) THEN
    RAISE EXCEPTION 'Role is not compatible with pilot status';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS check_role_compatibility_trigger ON pilot_roles;
CREATE TRIGGER check_role_compatibility_trigger
BEFORE INSERT OR UPDATE ON pilot_roles
FOR EACH ROW
EXECUTE FUNCTION check_role_compatibility();