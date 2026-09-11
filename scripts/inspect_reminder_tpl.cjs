const WA_TOKEN = 'EAAZAoFJNWmo4BSXS3ZBJrD7sk039yowup2fxSWYZAQFTiTvEfOm5XsRNmyRZC4RnkYyjvFaXaxN3fhqNVvvyBqe0CXwoWClgcBx6X8UhqaNWTUjNFt0XMkufGVKkF9FSOP2V2SXSwxreUpX3UALTRW8TC8feqyWyYdyyamSrkF8qWvqkuSEEkatiTGvaGZC1AYwZDZD';
const WABA_ID = '2375569266307315';

async function check() {
  const res = await fetch(`https://graph.facebook.com/v20.0/${WABA_ID}/message_templates?name=payment_reminder_v1`, {
    headers: { 'Authorization': `Bearer ${WA_TOKEN}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
check();
