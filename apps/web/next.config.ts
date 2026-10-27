import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
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
