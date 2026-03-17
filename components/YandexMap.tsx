'use client';

import { useEffect, useMemo, useRef } from 'react';
import { env } from '@/lib/env';
import type { Controller } from '@/types/controller';

type YandexMapProps = {
  controllers: Controller[];
  onMapClick: (coords: { lat: number; lng: number }) => void;
};

const INITIAL_CENTER = [55.751244, 37.618423];

let scriptPromise: Promise<void> | null = null;

function loadYandexMapScript() {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.ymaps) {
    return Promise.resolve();
  }

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY}&lang=ru_RU`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Yandex Maps script'));
      document.head.appendChild(script);
    });
  }

  return scriptPromise;
}

function buildBalloon(controller: Controller) {
  return `
    <div style="min-width:220px;font-family:Inter,system-ui,sans-serif;">
      <h3 style="margin:0 0 8px;font-size:16px;font-weight:600;">${controller.title}</h3>
      <p style="margin:0 0 8px;color:#334155;">${controller.description}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;">
        <span style="padding:2px 8px;background:#dbeafe;border-radius:999px;">${controller.type}</span>
        <span style="padding:2px 8px;background:#dcfce7;border-radius:999px;">${controller.status}</span>
      </div>
    </div>
  `;
}

export function YandexMap({ controllers, onMapClick }: YandexMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<InstanceType<Window['ymaps']['Map']> | null>(null);

  const points = useMemo(
    () =>
      controllers.map((controller) => ({
        ...controller,
        coords: [controller.lat, controller.lng] as number[]
      })),
    [controllers]
  );

  useEffect(() => {
    let disposed = false;
    let clickHandler: ((event: { get: (path: string) => number[] }) => void) | null = null;

    const init = async () => {
      await loadYandexMapScript();
      if (disposed || !mapRef.current || !window.ymaps) {
        return;
      }

      window.ymaps.ready(() => {
        if (disposed || !mapRef.current) {
          return;
        }

        const map = new window.ymaps.Map(
          mapRef.current,
          {
            center: INITIAL_CENTER,
            zoom: 10,
            controls: ['zoomControl', 'fullscreenControl']
          },
          {
            suppressMapOpenBlock: true
          }
        );

        clickHandler = (event) => {
          const [lat, lng] = event.get('coords');
          onMapClick({ lat, lng });
        };

        map.events.add('click', clickHandler);
        mapInstanceRef.current = map;
      });
    };

    void init();

    return () => {
      disposed = true;
      const map = mapInstanceRef.current;
      if (map && clickHandler) {
        map.events.remove('click', clickHandler);
      }
      map?.destroy();
      mapInstanceRef.current = null;
    };
  }, [onMapClick]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.ymaps) {
      return;
    }

    map.geoObjects.removeAll();

    points.forEach((controller) => {
      const placemark = new window.ymaps.Placemark(
        controller.coords,
        {
          balloonContent: buildBalloon(controller),
          hintContent: controller.title
        },
        {
          preset: controller.status === 'online' ? 'islands#greenDotIcon' : 'islands#redDotIcon'
        }
      );
      map.geoObjects.add(placemark);
    });
  }, [points]);

  return <div ref={mapRef} className="h-[55vh] min-h-[420px] w-full rounded-2xl border border-border" />;
}
