const requiredEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_YANDEX_MAPS_API_KEY: process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
};

Object.entries(requiredEnv).forEach(([key, value]) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

export const env = requiredEnv as Record<keyof typeof requiredEnv, string>;
