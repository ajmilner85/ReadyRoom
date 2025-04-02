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

-- Allow anonymous users to select (read) roles data
CREATE POLICY "Allow anonymous read access"
  ON roles
  FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated users to read roles data
CREATE POLICY "Allow authenticated read access"
  ON roles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert roles data
CREATE POLICY "Allow authenticated insert access"
  ON roles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update roles data
CREATE POLICY "Allow authenticated update access"
  ON roles
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete roles data
CREATE POLICY "Allow authenticated delete access"
  ON roles
  FOR DELETE
  TO authenticated
  USING (true);

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

-- Allow anonymous users to read pilot_roles data
CREATE POLICY "Allow anonymous read access"
  ON pilot_roles
  FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated users to read pilot_roles data
CREATE POLICY "Allow authenticated read access"
  ON pilot_roles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert pilot_roles data
CREATE POLICY "Allow authenticated insert access"
  ON pilot_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update pilot_roles data
CREATE POLICY "Allow authenticated update access"
  ON pilot_roles
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete pilot_roles data
CREATE POLICY "Allow authenticated delete access"
  ON pilot_roles
  FOR DELETE
  TO authenticated
  USING (true);

-- Grant permissions
GRANT SELECT ON roles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO authenticated;
GRANT SELECT ON pilot_roles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON pilot_roles TO authenticated;

-- Create a function to enforce role exclusivity
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

-- Create trigger to enforce role exclusivity
CREATE TRIGGER enforce_role_exclusivity_trigger
BEFORE INSERT OR UPDATE ON pilot_roles
FOR EACH ROW
EXECUTE FUNCTION enforce_role_exclusivity();

-- Function to check if a role is compatible with a pilot's status
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
  
  -- Check if pilot's status is compatible with the role
  IF NOT (pilot_status_id = ANY(compatible_statuses)) THEN
    RAISE EXCEPTION 'Role is not compatible with pilot status';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to check role compatibility
CREATE TRIGGER check_role_compatibility_trigger
BEFORE INSERT OR UPDATE ON pilot_roles
FOR EACH ROW
EXECUTE FUNCTION check_role_compatibility();