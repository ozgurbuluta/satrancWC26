/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public PostHog project key of THIS site's own project. Unset = no analytics. */
  readonly VITE_POSTHOG_KEY?: string;
  /** Where events are sent. Defaults to /olay, which vercel.json forwards to PostHog EU. */
  readonly VITE_POSTHOG_HOST?: string;
  /** Production hostname. When set, other hosts (previews) do not count. */
  readonly VITE_ANALYTICS_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
