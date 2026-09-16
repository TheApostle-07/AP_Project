import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

// Run after `npm run build`: verifies the actual prerendered homepage.
const html = await readFile(new URL('../.next/server/pages/index.html', import.meta.url), 'utf8');
const cards = [...html.matchAll(/<article\b[^>]*class="legacy-product"[^>]*>(.*?)<\/article>/gs)];
assert.equal(cards.length, 3, 'The catalog should contain three artworks');

const expected = [
  ['Portrait of Timeless Beauty', '₹2,499', 'images/APlogo.png'],
  ['Rose Reverie', '₹3,999', 'images/artwork/rose-reverie.png'],
  ['Midnight Bloom', '₹5,499', 'images/artwork/midnight-bloom.png'],
];
for (const [index, [title, price, image]] of expected.entries()) {
  assert.ok(cards[index][1].includes(title), `${title} should render`);
  assert.ok(cards[index][1].includes(price), `${title} must use ${price}`);
  assert.ok(cards[index][1].includes(encodeURIComponent(`/${image}`)), `${title} must use its own image`);
  assert.ok((await stat(new URL(`../public/${image}`, import.meta.url))).size > 0, `${image} must exist`);
}

assert.doesNotMatch(html, /Explore creator sessions|href="[^\"]*\/@alina-popova/);
assert.doesNotMatch(html, /Original Price|Discounted Price/);
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'Keep a single page heading');
for (const href of [
  '/', '/aboutus', '/privacy', '/contact',
  'https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/terms',
  'https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/refund',
  'https://merchant.razorpay.com/policy/OrOebQ4vIZty7L/shipping',
]) assert.ok(html.includes(`href="${href}"`), `${href} must remain available`);
assert.ok(html.includes('© 2026 ALINA POPOVA. All rights reserved.'));
console.log('Artwork catalog: three images, matching prices, removed CTA, navigation and footer passed.');
