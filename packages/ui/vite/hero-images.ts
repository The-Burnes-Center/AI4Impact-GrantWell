import path from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";

const SOURCE = "src/images/hero-bridge.jpg";
/** Fixed names so marketing-landing.css and the static fallback in index.html can point at them. */
const URL_DIR = "/images/marketing/hero";
const WIDTHS = [1280, 1920, 2560];
const FORMATS = {
  avif: { type: "image/avif", encode: (img: sharp.Sharp) => img.avif({ quality: 50, effort: 4 }) },
  webp: { type: "image/webp", encode: (img: sharp.Sharp) => img.webp({ quality: 72 }) },
  jpg: { type: "image/jpeg", encode: (img: sharp.Sharp) => img.jpeg({ quality: 72, progressive: true, mozjpeg: true }) },
};
type Format = keyof typeof FORMATS;

const VARIANT = new RegExp(`^${URL_DIR}/hero-bridge-(\\d+)\\.(avif|webp|jpg)$`);

/** Resized AVIF/WebP/JPEG copies of the 6.3 MB hero original, which itself is never shipped. */
export function heroImages(): Plugin {
  let source = "";
  const cache = new Map<string, Promise<Buffer>>();
  const variant = (width: number, format: Format) => {
    const key = `${width}.${format}`;
    if (!cache.has(key)) cache.set(key, FORMATS[format].encode(sharp(source).resize({ width })).toBuffer());
    return cache.get(key)!;
  };

  return {
    name: "hero-images",
    // Emitted in generateBundle, so Vite can't find them while it resolves CSS url()s; external stops its warning.
    config: () => ({ build: { rollupOptions: { external: [VARIANT] } } }),
    configResolved(config) {
      source = path.resolve(config.root, SOURCE);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = VARIANT.exec(req.url?.split("?")[0] ?? "");
        if (!match || !WIDTHS.includes(Number(match[1]))) return next();
        const format = match[2] as Format;
        variant(Number(match[1]), format).then(
          (buf) => {
            res.setHeader("Content-Type", FORMATS[format].type);
            res.end(buf);
          },
          next
        );
      });
    },
    async generateBundle() {
      const jobs = WIDTHS.flatMap((width) =>
        (Object.keys(FORMATS) as Format[]).map(async (format) => {
          this.emitFile({
            type: "asset",
            fileName: `${URL_DIR.slice(1)}/hero-bridge-${width}.${format}`,
            source: await variant(width, format),
          });
        })
      );
      await Promise.all(jobs);
    },
  };
}
