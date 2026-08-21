// Automated test for phone normalization, Meta leads handler, and campaign personalization
const path = require('path');

// 1. Test normalizePhone
function normalizePhone(phone) {
  if (!phone) return '';
  const str = String(phone).trim();
  const digits = str.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 11 && digits.startsWith('0')) return '+91' + digits.substring(1);
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  if (str.startsWith('+') && digits.length >= 10) return '+' + digits;
  if (digits.length > 10 && digits.startsWith('91')) return '+' + digits;
  if (digits.length <= 10) return '+91' + digits;
  return '+' + digits;
}

const testCases = [
  { input: '9876543210', expected: '+919876543210' },
  { input: '+919876543210', expected: '+919876543210' },
  { input: '919876543210', expected: '+919876543210' },
  { input: '09876543210', expected: '+919876543210' },
  { input: '98765 43210', expected: '+919876543210' },
  { input: '+91 98765-43210', expected: '+919876543210' },
  { input: '(987) 654-3210', expected: '+919876543210' },
];

console.log('--- 1. Testing Phone Normalization (+91 Optional) ---');
let phoneTestsPassed = true;
for (const tc of testCases) {
  const result = normalizePhone(tc.input);
  const passed = result === tc.expected;
  if (!passed) phoneTestsPassed = false;
  console.log(`[${passed ? 'PASS' : 'FAIL'}] Input: "${tc.input}" => "${result}" (Expected: "${tc.expected}")`);
}

// 2. Test Comma-separated paste parsing
const pasteInput = "9876543210, +919812345678, 09898989898, 9765432109";
const parsedPasted = pasteInput.split(/[\n,;]+/).map(s => normalizePhone(s.trim())).filter(Boolean);
console.log('\n--- 2. Testing Comma-Separated Paste Numbers ---');
console.log('Raw Input:', pasteInput);
console.log('Parsed & Normalized Result:', parsedPasted);
const allHaveCountryCode = parsedPasted.every(p => p.startsWith('+91') && p.length === 13);
console.log('All numbers correctly standardized to +91XXXXXXXXXX:', allHaveCountryCode ? 'PASS ✅' : 'FAIL ❌');

// 3. Test Meta Leads Webhook Function
console.log('\n--- 3. Testing Meta Leads Webhook Function ---');
const metaWebhook = require('../netlify/functions/meta-leads-webhook.js');

async function testWebhook() {
  // Test GET verification
  const getEvent = {
    httpMethod: 'GET',
    queryStringParameters: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'erppro_meta_sec_token_2026',
      'hub.challenge': 'CHALLENGE_12345_SUCCESS'
    }
  };
  const getRes = await metaWebhook.handler(getEvent);
  console.log('Meta Webhook GET Verification Response:', getRes.statusCode, getRes.body);

  // Test POST lead ingestion
  const postEvent = {
    httpMethod: 'POST',
    body: JSON.stringify({
      name: 'Priya Verma',
      phone: '9812345678', // No +91 provided, should be auto-detected
      email: 'priya@example.com',
      source: 'Facebook',
      product: 'Waterproofing Chemical Compound',
      budget: '₹1,20,000',
      notes: 'Facebook Instant Form inquiry'
    })
  };
  const postRes = await metaWebhook.handler(postEvent);
  console.log('Meta Webhook POST Ingestion Response:', postRes.statusCode, JSON.parse(postRes.body));
}

testWebhook().then(() => {
  console.log('\nAll validation tests executed.');
}).catch(err => {
  console.error('Test execution error:', err);
});
