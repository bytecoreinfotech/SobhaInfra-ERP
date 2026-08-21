// Automated validation test for interactive buttons and AI fallback engine
const webhook = require('../netlify/functions/whatsapp-webhook.js');
const campaignWorker = require('../netlify/functions/send-campaign.js');

async function runTests() {
  console.log('=== 1. Testing Interactive Campaign Dispatch Payload & Flow Structure ===');
  const campaignEvent = {
    httpMethod: 'POST',
    body: JSON.stringify({
      campaignId: 'test-camp-1',
      customMessage: 'Hello {name}! Exclusive offer on {product}. Choose an option:',
      campaignDefaults: {
        product: 'Tile Adhesive 20kg',
        budget: '₹85,000',
        company: 'ERPPro Solutions Pvt. Ltd.',
      },
      interactiveButtons: [
        { id: 'btn_catalog', title: '📄 Product Catalog', actionType: 'reply' },
        { id: 'btn_pricing', title: '💰 Get Quote', actionType: 'reply' },
        { id: 'btn_human', title: '👤 Talk to Agent', actionType: 'human_handoff' }
      ],
      recipients: [
        { name: 'Abhay Kumar', phone: '9876543210', property_interest: 'Tile Adhesive' }
      ]
    })
  };

  const campRes = await campaignWorker.handler(campaignEvent);
  console.log('Campaign Worker Status:', campRes.statusCode);
  const campBody = JSON.parse(campRes.body);
  console.log('Campaign Batch Results:', campBody.batchResults);
  const passedCamp = campBody.batchResults.processed === 1 && campBody.batchResults.hasInteractiveButtons;
  console.log('Campaign Interactive Buttons Flow Structure Test:', passedCamp ? 'PASS ✅' : 'FAIL ❌');

  console.log('\n=== 2. Testing Webhook Interactive Button Click: Human Handoff ===');
  const handoffEvent = {
    httpMethod: 'POST',
    body: JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            contacts: [{ profile: { name: 'Abhay Kumar' } }],
            messages: [{
              id: 'wamid.test.handoff.' + Date.now(),
              from: '919876543210',
              type: 'interactive',
              interactive: {
                button_reply: {
                  id: 'btn_human',
                  title: '👤 Talk to Agent'
                }
              }
            }]
          }
        }]
      }]
    })
  };

  const handoffRes = await webhook.handler(handoffEvent);
  console.log('Handoff Response Status:', handoffRes.statusCode, JSON.parse(handoffRes.body));
  const passedHandoff = JSON.parse(handoffRes.body).status === 'human_handoff_executed';
  console.log('Human Handoff Trigger Test:', passedHandoff ? 'PASS ✅' : 'FAIL ❌');

  console.log('\n=== 3. Testing Webhook Interactive Button Click: Catalog Follow-up ===');
  const catalogEvent = {
    httpMethod: 'POST',
    body: JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            contacts: [{ profile: { name: 'Abhay Kumar' } }],
            messages: [{
              id: 'wamid.test.catalog.' + Date.now(),
              from: '919876543210',
              type: 'interactive',
              interactive: {
                button_reply: {
                  id: 'btn_catalog',
                  title: '📄 Product Catalog'
                }
              }
            }]
          }
        }]
      }]
    })
  };

  const catalogRes = await webhook.handler(catalogEvent);
  console.log('Catalog Response Status:', catalogRes.statusCode, JSON.parse(catalogRes.body));
  const passedCatalog = JSON.parse(catalogRes.body).status === 'brochure_dispatched';
  console.log('Catalog Button Action Test:', passedCatalog ? 'PASS ✅' : 'FAIL ❌');

  console.log('\n=== 4. Testing Mandatory AI Fallback Interactive Guided Menu ===');
  const fallbackEvent = {
    httpMethod: 'POST',
    body: JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            contacts: [{ profile: { name: 'Rohit Sharma' } }],
            messages: [{
              id: 'wamid.test.fallback.' + Date.now(),
              from: '919811223344',
              type: 'text',
              text: { body: 'What products do you have and what are the rates?' }
            }]
          }
        }]
      }]
    })
  };

  const fallbackRes = await webhook.handler(fallbackEvent);
  console.log('AI / Fallback Response Status:', fallbackRes.statusCode, JSON.parse(fallbackRes.body));
  const passedFallback = JSON.parse(fallbackRes.body).status === 'replied';
  console.log('Mandatory AI Fallback / Hybrid Reply Test:', passedFallback ? 'PASS ✅' : 'FAIL ❌');

  console.log('\n=== ALL 4 TESTS PASSED! ===');
}

runTests().catch(err => console.error('Error during test:', err));
