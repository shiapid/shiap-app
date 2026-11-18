"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type SiteIconKey } from "@/lib/site-icons";

type IconUrls = Partial<Record<SiteIconKey, string>>;
type SiteIconContextValue = {
  urls: IconUrls;
  setIconUrl: (key: SiteIconKey, url?: string) => void;
};

const SiteIconContext = createContext<SiteIconContextValue>({
  urls: {},
  setIconUrl: () => undefined,
});

export function SiteIconProvider({ children }: { children: React.ReactNode }) {
  const [urls, setUrls] = useState<IconUrls>({});

  useEffect(() => {
    let active = true;
    try {
      const supabase = createClient();
      void (async () => {
        try {
          const { data, error } = await supabase
            .from("site_icon_settings")
            .select("icon_key,image_path")
            .eq("is_active", true);
          if (!active || error || !data) return;
          const next: IconUrls = {};
          for (const row of data) {
            const key = row.icon_key as SiteIconKey;
            next[key] = supabase.storage.from("shiap-catalog-images").getPublicUrl(row.image_path).data.publicUrl;
          }
          setUrls(next);
        } catch {
          // Network errors also fall back to the built-in icons.
        }
      })();
    } catch {
      // Keep built-in Lucide icons when Supabase is not configured.
    }

    return () => {
      active = false;
    };
  }, []);

  const setIconUrl = useCallback((key: SiteIconKey, url?: string) => {
    setUrls((current) => {
      const next = { ...current };
      if (url) next[key] = url;
      else delete next[key];
      return next;
    });
  }, []);

  return <SiteIconContext.Provider value={{ urls, setIconUrl }}>{children}</SiteIconContext.Provider>;
}

export function useSiteIcons() {
  return useContext(SiteIconContext);
}

export function SiteIcon({
  iconKey,
  fallback: Fallback,
  size = 20,
  strokeWidth = 2,
  className,
}: {
  iconKey: SiteIconKey;
  fallback: LucideIcon;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const { urls } = useSiteIcons();
  const src = urls[iconKey];

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        unoptimized
        className={`shrink-0 object-contain ${className ?? ""}`}
      />
    );
  }

  return <Fallback size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
