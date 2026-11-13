import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  // The Next.js developer button (the "N" in the corner of `npm run dev`) covered buttons on the pages (13 Nov 2026).
  // Build and run-time errors are still shown while developing.
  devIndicators: false,
  // Opening `npm run dev` from a phone on the same Wi-Fi, at the computer's address (for example http://192.168.1.20:3001).
  // Only these private home and office network addresses; it has no effect on the real site (13 Nov 2026).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
  reactStrictMode: true,
  // PDF files (pdfkit reads its font files at run time) and picture conversion (sharp) run as plain Node packages.
  serverExternalPackages: ['pdfkit', 'sharp'],
  // Businesses upload verification documents (up to 8 MB) through a server action.
  experimental: { serverActions: { bodySizeLimit: '9mb' } },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};

export default config;
