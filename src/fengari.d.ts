declare module 'fengari-web' {
  export const luastring_of: (str: string) => Uint8Array
  export function load(code: string): () => string
}