const admin = require('firebase-admin');
const NEW_SA = require('./new-sa.json');
const app = admin.initializeApp({ credential: admin.credential.cert(NEW_SA) }, 'check');
const auth = admin.auth(app);

(async () => {
  let allUsers = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    allUsers = allUsers.concat(result.users);
    pageToken = result.pageToken;
  } while (pageToken);

  const withPassword = allUsers.filter(u => u.providerData.some(p => p.providerId === 'password'));
  const withApple = allUsers.filter(u => u.providerData.some(p => p.providerId === 'apple.com'));
  const withGoogle = allUsers.filter(u => u.providerData.some(p => p.providerId === 'google.com'));

  console.log(`Totale utenti su drapev2: ${allUsers.length}`);
  console.log(`  Email/Password: ${withPassword.length}`);
  console.log(`  Apple: ${withApple.length}`);
  console.log(`  Google: ${withGoogle.length}`);

  // Check if password users have passwordHash set
  const noHash = withPassword.filter(u => !u.passwordHash);
  console.log(`\nEmail/password SENZA hash (password non migrata): ${noHash.length}`);
  if (noHash.length > 0) {
    noHash.forEach(u => console.log(`  - ${u.email}`));
  } else {
    console.log('✅ Tutti gli utenti email/password hanno il password hash');
  }

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
