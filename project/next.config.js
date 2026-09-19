const securityHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.razorpay.com https://*.razorpay.com; frame-src https://api.razorpay.com https://*.razorpay.com; font-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests" },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

module.exports = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: { '/api/artwork/*': ['./assets/artwork/*.png'] },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/brand/:asset', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }, { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }] },
      { source: '/pay', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' }, { key: 'Pragma', value: 'no-cache' }, { key: 'Expires', value: '0' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' }] },
      { source: '/api/(.*)', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' }, { key: 'Pragma', value: 'no-cache' }, { key: 'Expires', value: '0' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' }] },
    ];
  },
};
