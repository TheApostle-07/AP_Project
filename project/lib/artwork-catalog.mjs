// Public product data; the server uses this same catalog to set order totals.
export const artworks = [
  {
    id: 'timeless-beauty', title: 'Portrait of Timeless Beauty', image: '/images/APlogo.png',
    description: 'This digital masterpiece embodies the delicate balance between strength and softness, capturing the timeless beauty of a woman whose presence radiates warmth and allure.',
    amountMinor: 249900, currency: 'INR', width: 1024, height: 1024,
  },
  {
    id: 'rose-reverie', title: 'Rose Reverie', image: '/images/artwork/rose-reverie.png',
    description: 'A quiet portrait framed by flowing roses, warm terracotta and delicate gold details. Soft petals and expressive lines come together in a moment of graceful stillness.',
    amountMinor: 399900, currency: 'INR', width: 1254, height: 1254,
  },
  {
    id: 'midnight-bloom', title: 'Midnight Bloom', image: '/images/artwork/midnight-bloom.png',
    description: 'Lotus blossoms unfold against midnight indigo in this ornamental portrait. Rose tones, flowing botanical motifs and antique-gold accents bring a gentle warmth to the night.',
    amountMinor: 549900, currency: 'INR', width: 1254, height: 1254,
  },
];

export function findArtwork(id) {
  return typeof id === 'string' ? artworks.find((artwork) => artwork.id === id) || null : null;
}

export function artworkPrice(amountMinor) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amountMinor / 100);
}
