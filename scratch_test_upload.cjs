/**
 * Test uploading a dummy file to Supabase whatsapp-media bucket using anon key
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jbgkeeubevwopphekwfj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_thqXkofcI9pNt3rrXQ23Zw_PJpnhxIB';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testUpload() {
  console.log('Testing upload to whatsapp-media bucket with anon key...');
  const testBuffer = Buffer.from('test image/pdf content for crm', 'utf8');
  const path = `test/test_${Date.now()}.txt`;

  const { data, error } = await supabase.storage
    .from('whatsapp-media')
    .upload(path, testBuffer, {
      contentType: 'text/plain',
      upsert: true,
    });

  if (error) {
    console.error('❌ Upload failed with error:', error.message);
  } else {
    console.log('✅ Upload successful! Path:', data.path);
    const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(data.path);
    console.log('Public URL:', urlData.publicUrl);
  }
}

testUpload();
