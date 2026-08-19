const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://jbgkeeubevwopphekwfj.supabase.co', 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB');

async function setupStorage() {
  // Check existing buckets
  const { data: buckets, error: be } = await sb.storage.listBuckets();
  console.log('Existing buckets:', JSON.stringify(buckets?.map(b => ({ name: b.name, public: b.public }))));
  console.log('Bucket list error:', JSON.stringify(be));

  // Create whatsapp-media bucket if it doesn't exist
  const exists = buckets?.some(b => b.name === 'whatsapp-media');
  if (!exists) {
    const { data: newBucket, error: ce } = await sb.storage.createBucket('whatsapp-media', { public: true });
    console.log('Created bucket:', JSON.stringify(newBucket), 'Error:', JSON.stringify(ce));
  } else {
    console.log('Bucket whatsapp-media already exists');
  }
}

setupStorage().catch(console.error);
