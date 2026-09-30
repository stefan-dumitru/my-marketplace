"use client";

import { useState } from "react";
import Image from "next/image";

type Props = {
  images: string[];
  alt: string;
};

export function ProductGallery({ images, alt }: Props) {
  const [selected, setSelected] = useState(0);
  const activeImage = images[selected];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full bg-muted">
        {activeImage && (
          <Image
            src={activeImage}
            alt={alt}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            // The main product image is almost always the LCP element on this page — preload it
            // with fetchpriority=high instead of the default lazy-load.
            priority
            className="object-cover"
          />
        )}
      </div>

      {images.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={`Show image ${index + 1} of ${images.length}`}
              aria-current={index === selected}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                index === selected ? "border-primary" : "border-transparent"
              }`}
            >
              <Image src={image} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
