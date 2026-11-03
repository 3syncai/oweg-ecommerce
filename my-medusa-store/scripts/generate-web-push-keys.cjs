const fs = require('node:fs');
const webpush = require('web-push');
process.umask(0o077);
const keys = webpush.generateVAPIDKeys();
fs.writeFileSync('.env.web-push', `WEB_PUSH_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_PRIVATE_KEY=${keys.privateKey}\nWEB_PUSH_SUBJECT=mailto:support@0weg.in\nWEB_PUSH_ENABLED=false\n`, { flag: 'wx', mode: 0o600 });
console.log('Keys written to .env.web-push (private; do not commit). Configure backend environment and keep the keys stable. Sending is disabled.');
