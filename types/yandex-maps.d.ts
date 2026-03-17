declare global {
  interface Window {
    ymaps: {
      ready: (cb: () => void) => void;
      Map: new (
        container: HTMLElement,
        state: { center: number[]; zoom: number; controls?: string[] },
        options?: Record<string, unknown>
      ) => {
        geoObjects: {
          removeAll: () => void;
          add: (obj: unknown) => void;
        };
        events: {
          add: (event: 'click', handler: (event: { get: (path: string) => number[] }) => void) => void;
          remove: (event: 'click', handler: (event: { get: (path: string) => number[] }) => void) => void;
        };
        destroy: () => void;
      };
      Placemark: new (
        geometry: number[],
        properties: { balloonContent?: string; hintContent?: string },
        options?: Record<string, unknown>
      ) => unknown;
    };
  }
}

export {};
