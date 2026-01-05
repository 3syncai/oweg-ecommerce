// Quick script to print S3-related env vars as the Node process sees them.
// Run from the `my-medusa-store` folder with: `node scripts/print-s3-env.js`
const mask = (s, keep = 4) => {
  if (!s) return '';
  if (s.length <= keep) return '*'.repeat(s.length);
  return s.slice(0, keep) + '*'.repeat(Math.max(0, s.length - keep));
};

console.log('S3 env (raw):', {
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_REGION: process.env.S3_REGION,
  S3_BUCKET: process.env.S3_BUCKET,
  S3_FILE_URL: process.env.S3_FILE_URL,
});

console.log('S3 env (masked):', {
  S3_ACCESS_KEY_ID: mask(process.env.S3_ACCESS_KEY_ID, 4),
  S3_SECRET_ACCESS_KEY: mask(process.env.S3_SECRET_ACCESS_KEY, 0).slice(0, 8) + '...'.slice(0,0),
  S3_REGION: process.env.S3_REGION,
  S3_BUCKET: process.env.S3_BUCKET,
  S3_FILE_URL: process.env.S3_FILE_URL,
});

// Also print a simple validation result similar to the upload route
const accessKey = (process.env.S3_ACCESS_KEY_ID || '').trim();
console.log('Access key length:', accessKey.length, 'prefix:', accessKey.slice(0, 6));

if (!accessKey) {
  console.warn('No S3_ACCESS_KEY_ID set in the environment.');
} else {
  const startsWithAKIA = accessKey.startsWith('AKIA');
  const containsPlaceholder = /REPLACE|<|\{\{/.test(accessKey);
  console.log('startsWithAKIA:', startsWithAKIA, 'containsPlaceholder:', containsPlaceholder);
}

process.exit(0);
