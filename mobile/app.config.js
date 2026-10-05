/**
 * Dynamic Expo config.
 *
 * Everything static lives in app.json; this layers the values that must not be committed on
 * top of it. Expo reads this file in preference to app.json and passes the parsed app.json
 * in as `config`, so the two are not alternatives — this extends that.
 *
 * Two values come from the environment:
 *
 *   GOOGLE_MAPS_API_KEY  the Android Maps key. Committing a Maps key means anyone with the
 *                        repository can spend your quota, so it is set per machine and in
 *                        EAS. Without it, Android builds run fine and the map area is blank;
 *                        iOS uses Apple Maps and needs no key at all.
 *
 *   EAS_PROJECT_ID       filled in by `eas init`, which writes it to app.json. Reading it
 *                        from the environment too means a fresh clone can build without
 *                        editing a tracked file.
 *
 * Set them for a local run with:
 *   $env:GOOGLE_MAPS_API_KEY = "AIza..."      (PowerShell, this terminal only)
 *
 * and for builds with:
 *   eas env:create --name GOOGLE_MAPS_API_KEY --value AIza... --environment production
 */
export default ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const projectId = process.env.EAS_PROJECT_ID?.trim() ?? config.extra?.eas?.projectId;

  return {
    ...config,

    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          // Falls back to the placeholder in app.json, which builds but draws no map.
          apiKey: mapsKey || config.android?.config?.googleMaps?.apiKey,
        },
      },
    },

    extra: {
      ...config.extra,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),

      // Surfaced so a screen could show which backend a build is pointed at. Reading the
      // variable here rather than in app code keeps it in one place.
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? null,
    },
  };
};
