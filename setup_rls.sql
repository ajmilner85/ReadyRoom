-- Enable RLS on pilots table (if not already enabled)
ALTER TABLE pilots ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to select (read) pilots data
CREATE POLICY "Allow anonymous read access"
  ON pilots
  FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated users to read pilots data
CREATE POLICY "Allow authenticated read access"
  ON pilots
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert pilots data
CREATE POLICY "Allow authenticated insert access"
  ON pilots
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update pilots data
CREATE POLICY "Allow authenticated update access"
  ON pilots
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete pilots data
CREATE POLICY "Allow authenticated delete access"
  ON pilots
  FOR DELETE
  TO authenticated
  USING (true);

-- Grant permissions to anon role for pilot operations
GRANT SELECT ON pilots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON pilots TO authenticated;