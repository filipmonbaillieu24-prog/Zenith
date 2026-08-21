/**
 * Origin allowlist for postMessage traffic between the Zenith Hub and the
 * extensions it hosts in iframes (Aero, Vigor, Kratos, Fuel, Stride).
 *
 * In production all extensions are served same-origin with the Hub
 * (${origin}/aero/index.html, etc.), so a plain same-origin check covers it.
 * In dev, each extension runs on its own fixed Vite port (see each app's
 * vite.config.ts), so those are allowlisted explicitly.
 */
const DEV_EXTENSION_ORIGINS = [
  'http://localhost:1420', // hub
  'http://localhost:1430', // aero
  'http://localhost:1440', // vigor
  'http://localhost:1450', // kratos
  'http://localhost:1460', // fuel
  'http://localhost:1470', // stride
];

export function isTrustedZenithOrigin(origin: string): boolean {
  if (typeof window !== 'undefined' && origin === window.location.origin) {
    return true;
  }
  return DEV_EXTENSION_ORIGINS.includes(origin);
}
