const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 8080}`;

const response = await fetch(`${baseUrl}/api/dev/seed-test-users`, { method: 'POST' });
const body = await response.json().catch(() => ({}));

if (!response.ok) {
  throw new Error(body.error || `Seed request failed with HTTP ${response.status}`);
}

console.log('Seeded FairShare test users:');
for (const user of body.users || []) {
  console.log(`- ${user.email} / ${user.password}`);
}
