// The type of a font file import: the bundler gives the file a URL beside the page (fonts.gen.ts imports them).
declare module "*.woff2" {
  const url: string;
  export default url;
}
