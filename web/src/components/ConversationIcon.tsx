import { useEffect, useState } from "react";

const ICON_FILENAMES = ["icon.png", "icon.svg", "icon.webp", "icon.jpg", "icon.jpeg"];
const ICON_DIRECTORY = `${import.meta.env.BASE_URL}conversation-mode/`;

let resolvedIconUrl: string | null | undefined;
let iconResolutionPromise: Promise<string | null> | null = null;

function probeImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(url);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function findConversationIcon(): Promise<string | null> {
  for (const filename of ICON_FILENAMES) {
    const loadedUrl = await probeImage(`${ICON_DIRECTORY}${filename}`);
    if (loadedUrl) return loadedUrl;
  }
  return null;
}

function resolveConversationIcon(): Promise<string | null> {
  if (resolvedIconUrl !== undefined) return Promise.resolve(resolvedIconUrl);
  if (!iconResolutionPromise) {
    iconResolutionPromise = findConversationIcon().then((url) => {
      resolvedIconUrl = url;
      return url;
    });
  }
  return iconResolutionPromise;
}

type ConversationIconProps = {
  fallback?: string;
  className?: string;
  useImage?: boolean;
};

export default function ConversationIcon({
  fallback = "c",
  className = "",
  useImage = true,
}: ConversationIconProps) {
  const imageEnabled = useImage && fallback !== "自";
  const [iconUrl, setIconUrl] = useState<string | null>(() => resolvedIconUrl ?? null);

  useEffect(() => {
    let active = true;
    if (!imageEnabled) {
      setIconUrl(null);
      return () => {
        active = false;
      };
    }

    void resolveConversationIcon().then((url) => {
      if (active) setIconUrl(url);
    });

    return () => {
      active = false;
    };
  }, [imageEnabled]);

  if (!imageEnabled || !iconUrl) {
    return <span className={className} aria-hidden="true">{fallback}</span>;
  }

  return (
    <span className={`${className} conversation-icon-frame`} aria-hidden="true">
      <img
        className="conversation-icon-image"
        src={iconUrl}
        alt=""
        decoding="async"
      />
    </span>
  );
}
