import { useLayoutEffect, useRef, useState } from "react";
import { Image, Sparkles } from "lucide-react";

type Props = {
  src?: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  onError: () => void;
  onReady?: () => void;
};

export function LoadingImage(props: Props) {
  return <ImageState key={props.src} {...props} />;
}

function ImageState({
  src,
  alt,
  className = "",
  loading,
  onError,
  onReady,
}: Props) {
  const image = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    if (image.current?.complete && image.current.naturalWidth > 0) {
      setReady(true);
      onReady?.();
    }
  }, []);
  return (
    <>
      <div
        className={`image-loading ${ready ? "is-ready" : ""}`}
        role={ready ? undefined : "status"}
        aria-hidden={ready || undefined}
        aria-label={`Loading ${alt}`}
      >
        <div className="image-loading-art" aria-hidden="true">
          <span className="loading-card card-cyan" />
          <span className="loading-card card-pink" />
          <span className="loading-card card-front">
            <Image size={28} strokeWidth={1.7} />
          </span>
          <Sparkles className="loading-spark" size={23} />
          <span className="loading-confetti" />
        </div>
        <span className="image-loading-caption" aria-hidden="true">
          Loading art
          <span className="loading-dots">
            <i />
            <i />
            <i />
          </span>
        </span>
      </div>
      {src && (
        <img
          ref={image}
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={false}
          className={`loading-image ${ready ? "is-ready" : ""} ${className}`}
          onLoad={async (e) => {
            const img = e.currentTarget;
            try {
              await img.decode();
            } catch {
              /* A loaded image can still be displayed. */
            }
            if (image.current === img) {
              setReady(true);
              onReady?.();
            }
          }}
          onError={onError}
        />
      )}
    </>
  );
}
