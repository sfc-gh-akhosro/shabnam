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

// The shipped theme is `theme/basic-theme.json`. Bun's json loader gives it a
// default export; the shape is asserted at the one import, not here.
declare module "*.json" {
  const data: unknown;
  export default data;
}
