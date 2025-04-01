-- Enable RLS on statuses table
ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to select (read) statuses data
CREATE POLICY "Allow anonymous read access for statuses"
  ON statuses
  FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated users to read statuses data
CREATE POLICY "Allow authenticated read access for statuses"
  ON statuses
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert statuses data
CREATE POLICY "Allow authenticated insert access for statuses"
  ON statuses
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update statuses data
CREATE POLICY "Allow authenticated update access for statuses"
  ON statuses
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete statuses data
CREATE POLICY "Allow authenticated delete access for statuses"
  ON statuses
  FOR DELETE
  TO authenticated
  USING (true);

-- Grant permissions to anon and authenticated roles
GRANT SELECT ON statuses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON statuses TO authenticated;