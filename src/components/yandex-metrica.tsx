'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const YM_COUNTER_ID = process.env.NEXT_PUBLIC_YM_COUNTER_ID;

export default function YandexMetrica() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).ym && YM_COUNTER_ID) {
      (window as any).ym(YM_COUNTER_ID, 'hit', pathname);
    }
  }, [pathname]);

  if (!YM_COUNTER_ID) return null;

  return (
    <Script
      id='yandex-metrica'
      strategy='afterInteractive'
      dangerouslySetInnerHTML={{
        __html: `
          (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
          (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

          ym(${YM_COUNTER_ID}, "init", {
            clickmap:true,
            trackLinks:true,
            accurateTrackBounce:true,
            webvisor:true
          });
        `
      }}
    />
  );
}
