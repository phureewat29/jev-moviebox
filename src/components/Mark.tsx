import Image from "next/image";
import mark from "../../public/assets/moviebox.png";

/**
 * A box built from strips of film. It came in as a black-on-transparent PNG and lives in
 * `public/assets` recoloured to the theme's amber: each pixel's darkness becomes amber
 * coverage, so the perforations stay see-through and the antialiased edges stay soft, and it
 * sits on any background exactly as the original did.
 *
 * Imported statically rather than referenced by path. Next hashes the file's content into the
 * URL it serves, so replacing the PNG can never leave the image optimizer handing out the old
 * render — which is exactly what happened the first time it was swapped — and the file's own
 * dimensions come with it, so nothing here is copied by hand.
 *
 * The image fills a box of the file's proportions rather than carrying its own width. An
 * `<img>` with a width attribute reports that width to `fit-content`, so it sized the header
 * lockup itself and came out twice as wide as the wordmark; an empty box with `w-full` reports
 * nothing, and the text decides. `size` sets the box width; leave it out and CSS governs.
 */
export function Mark({ size, className }: { size?: number; className?: string }) {
  return (
    <div
      className={`relative ${size === undefined ? "w-full" : ""} ${className ?? ""}`}
      style={{ aspectRatio: `${mark.width} / ${mark.height}`, width: size }}
    >
      <Image src={mark} alt="Movie Box" fill sizes="(max-width: 640px) 160px, 260px" priority className="object-contain" />
    </div>
  );
}
