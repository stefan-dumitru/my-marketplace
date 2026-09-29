"use client";

import { useState } from "react";

type Props = {
  images: string[];
  alt: string;
};

export function ProductGallery({ images, alt }: Props) {
  const [selected, setSelected] = useState(0);
  const activeImage = images[selected];

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square w-full bg-muted">
        {activeImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={activeImage} alt={alt} className="h-full w-full object-cover" />
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
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                index === selected ? "border-primary" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
