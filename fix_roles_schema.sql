-- SQL script to fix the column casing issue in the roles table

-- Step 1: Check if the column exists with the lowercase name
DO $$ 
DECLARE
   column_exists BOOLEAN;
BEGIN
   SELECT EXISTS (
     SELECT FROM information_schema.columns 
     WHERE table_name = 'roles' AND column_name = 'isexclusive'
   ) INTO column_exists;

   IF column_exists THEN
     -- If the column exists as lowercase 'isexclusive', rename it to camelCase 'isExclusive'
     ALTER TABLE roles RENAME COLUMN isexclusive TO "isExclusive";
     RAISE NOTICE 'Column renamed from isexclusive to isExclusive';
   ELSE
     -- Check if we need to add the column
     SELECT EXISTS (
       SELECT FROM information_schema.columns 
       WHERE table_name = 'roles' AND column_name = 'isExclusive'
     ) INTO column_exists;
     
     IF NOT column_exists THEN
       -- If column doesn't exist at all, add it
       ALTER TABLE roles ADD COLUMN "isExclusive" BOOLEAN NOT NULL DEFAULT false;
       RAISE NOTICE 'Column isExclusive added to roles table';
     ELSE
       RAISE NOTICE 'Column isExclusive already exists with correct casing';
     END IF;
   END IF;
END $$;