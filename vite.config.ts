import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// Claude Code worktrees live under .claude/worktrees/ inside this checkout: keep their copies of
// the code out of the tests and the dev server's file watcher.
const worktrees = '**/.claude/**'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: [worktrees] } },
  test: { exclude: [...configDefaults.exclude, worktrees] },
})
