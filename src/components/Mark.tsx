import Image from "next/image";
import mark from "../../public/assets/moviebox.png";

/**
 * Imported statically so Next hashes the file's content into the URL — the first swap of this
 * image was served stale from the optimizer's cache. It fills a box of the file's proportions
 * instead of carrying a width, so the wordmark beneath decides how wide the lockup is.
 */
export function Mark() {
  return (
    <div className="relative w-full" style={{ aspectRatio: `${mark.width} / ${mark.height}` }}>
      <Image src={mark} alt="" fill sizes="(max-width: 640px) 160px, 260px" priority className="object-contain" />
    </div>
  );
}
