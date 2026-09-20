// Shells in svg/ and logos in icon/ are imported as text, so a shell or an icon
// is a file plus a registry entry and nothing else (§3.4). The bundler's `.svg`
// loader is set in build/bundle.ts; this tells TypeScript the same thing.

declare module "*.svg" {
  const markup: string;
  export default markup;
}

declare module "*.css" {
  const text: string;
  export default text;
}
