const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://mcgmppnvnwnilioapbli.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZ21wcG52bnduaWxpb2FwYmxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3MTk4MiwiZXhwIjoyMTAzMTQ3OTgyfQ.iMVtS3kZ5jkXd7wOsgviN_3Umz0Auw7vBa0NDlD9rKg';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const PRODUCTS_DATA = [
  {
    name: 'Sobha Block Fix',
    sku: 'SOBHA-BF-40KG',
    category: 'Mortar',
    description: 'Dry block joining mortar for AAC and concrete blocks with thin joints (3-4mm). High bond strength, eco-friendly, no curing required. 40 KG bag.',
    unit_of_measure: 'Bag (40 KG)',
    brochure_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
    is_active: true,
  },
  {
    name: 'Sobha Plast',
    sku: 'SOBHA-PLAST-40KG',
    category: 'Plaster',
    description: 'Mineral-based ready-to-use dry mix plaster mortar for internal & external application. Crack resistant, self-curing, coverage 16-18 sq.ft/bag (10-12mm coat). IS 16777 certified. 40 KG bag.',
    unit_of_measure: 'Bag (40 KG)',
    brochure_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
    is_active: true,
  },
  {
    name: 'Sobha Tile Adhesive Type 1 (CE)',
    sku: 'SOBHA-TA-T1-40KG',
    category: 'Tile Adhesive',
    description: 'Polymer-modified cement-based adhesive specifically designed for fixing ceramic tiles on internal floors and walls in dry conditions. 40 KG bag.',
    unit_of_measure: 'Bag (40 KG)',
    brochure_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
    is_active: true,
  },
  {
    name: 'Sobha Tile Adhesive Type 2 (VT)',
    sku: 'SOBHA-TA-T2-40KG',
    category: 'Tile Adhesive',
    description: 'High-performance adhesive for vitrified tiles and natural stones, internal and external applications. High polymer, shock resistant, suitable for up to 600x600mm tiles. 40 KG & 20 KG variants.',
    unit_of_measure: 'Bag (40 KG / 20 KG)',
    brochure_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
    is_active: true,
  },
  {
    name: 'Sobha Tile Adhesive Type 3 (SA)',
    sku: 'SOBHA-TA-T3-40KG',
    category: 'Tile Adhesive',
    description: 'Premium grade stone adhesive with zero vertical slip and extreme weather resistance, for external vertical surfaces and heavy-duty natural stone up to 1200x1200mm. 40 KG & 20 KG variants.',
    unit_of_measure: 'Bag (40 KG / 20 KG)',
    brochure_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
    is_active: true,
  },
  {
    name: 'Sobha Tile Adhesive Type 4 (HF/HA)',
    sku: 'SOBHA-TA-T4-40KG',
    category: 'Tile Adhesive',
    description: 'Highly deformable flexible adhesive for glass mosaics, swimming pools, large format tiles (>1200x1200mm), and demanding substrates like metal, wood, gypsum board. 40 KG & 20 KG variants.',
    unit_of_measure: 'Bag (40 KG / 20 KG)',
    brochure_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
    is_active: true,
  },
  {
    name: 'Sobha Super Fine Flyash',
    sku: 'SOBHA-FA-SF-50KG',
    category: 'Flyash',
    description: 'Quality processed ultrafine fly ash for RMC, dams, bridges, highways, and pre-cast concrete elements. Conforms to ASTM C-618 and IS 3812 (Part 1). 50 KG bag.',
    unit_of_measure: 'Bag (50 KG)',
    brochure_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
    is_active: true,
  },
  {
    name: 'Sobha Ultra Fine Flyash Grade 1',
    sku: 'SOBHA-FA-UF-50KG',
    category: 'Flyash',
    description: 'Micro-silica grade performance additive for marine structures, high-strength concrete (M60+), and specialized repair mortars. ISI marked, conforms to IS 8812 (Part 1). 50 KG bag.',
    unit_of_measure: 'Bag (50 KG)',
    brochure_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
    is_active: true,
  },
  {
    name: 'Sobha Shakti Micro Fine GGBS Cement',
    sku: 'SOBHA-GGBS-MF',
    category: 'Cementitious Additive',
    description: 'Ultra-fine high-reactivity supplementary cementitious material (SCM) from granulated blast furnace slag. Low heat of hydration, high durability, light off-white color.',
    unit_of_measure: 'Standard Bag',
    brochure_url: 'https://sobhainfra-erp.netlify.app/sobha-products.pdf',
    is_active: true,
  },
];

const AI_KNOWLEDGE_SECTIONS = [
  {
    category: 'Company Profile',
    title: 'About Sobhainfra Tech & Leadership',
    content: `Company Name: Sobhainfra Tech Private Limited
Tagline: "Har Nirman Ki Jaan"
Parent Group: Shobha Group (Manufacturing with Quality since 2003)
Leadership:
- Mr. Dhirendra S. Jha (Director)
- Mr. Nripendra S. Jha (Director)
Business: Manufacturing high-quality building materials — specializing in advanced dry mix construction materials, ready-mix plasters, tile adhesives, and supplementary cementitious materials.
Production Capacity: 20,000+ bags per day across modern Gujarat manufacturing facilities.
Head Office: 104, 1st Floor, Hari Om CHSL, Near Royal College, MIDC Road, Mahajanwadi, Mira Road (E), Thane – 401107 (Maharashtra).
Sister Companies: Shobha Buildtech, Shobha Ready Plast.
Trusted Clients: Lodha, Godrej, Runwal, Hiranandani, Kalpataru, CIDCO, Dosti, Adani, JSB Group, UltraTech Building Products, Rustomjee, ACC.`
  },
  {
    category: 'Manufacturing & Plants',
    title: 'Factory Locations & Quality Certifications',
    content: `Manufacturing Facilities:
1. Factory 1: Survey No. 123, Near Navsari Food Product, Village Amarpore, Sub-District & District Navsari – 396445, Gujarat.
2. Factory 2: NH 48, Near Kolei Khadi Sarodhi, Sarodhi, Valsad – 396001, Gujarat.
Total Daily Output: 20,000+ bags/day.

Quality Certifications:
- ISO 9001:2015 certified Quality Management System by QRO (Certificate No. 385Q060314300) for procurement, drying, dehydrogasing, mixing, and transportation of building materials.
- IS 16777 certified for Sobha Plast.
- IS 3812 (Part 1) and ASTM C-618 for Sobha Super Fine Flyash.
- IS 8812 (Part 1) with ISI Mark for Sobha Ultra Fine Flyash Grade 1.`
  },
  {
    category: 'Product Details',
    title: 'Sobha Block Fix (AAC & Concrete Block Mortar)',
    content: `Product: SOBHA BLOCK FIX
Primary Use: High-strength adhesive mortar for laying AAC blocks and concrete blocks with thin joints (3mm–4mm thickness).
Key Qualities: High Bond Strength, Speed of Construction, Eco-Friendly, No Water Curing Required, Thermal Insulation.
Technical Data:
- Appearance: Grey Powder
- Wet Density: 1700–1800 kg/m³
- Dry Density: 1300–1400 kg/m³
- Tensile Splitting Strength: >0.4 N/m²
- Compressive Strength @ 28 Days: >5.0 N/mm²
- Water Ratio: 10–12 Litres per 40 KG bag
- Pot Life: >30 min | Hard Dry: 24 hours
Packaging: 40 KG Bag.`
  },
  {
    category: 'Product Details',
    title: 'Sobha Plast (Ready Mix Plaster Mortar)',
    content: `Product: SOBHA PLAST
Primary Use: Mineral-based ready-to-use plaster for internal and external masonry/concrete walls.
Key Qualities: Crack Resistance, Self-Curing, Superior Smooth Finish, Enhanced Bonding, Negligible Wastage.
Application & Coverage:
- Layer Thickness: 10–12 mm per coat
- Coverage: 16–18 sq.ft per 40 KG bag
- Water Ratio: 16–19% by weight (approx 6.7 Litres per bag), mix mechanically for 2-3 mins
- Curing: Water curing 2-3 times for 6-7 days
- Pot Life: 1 hour @ 27°C | Compressive Strength @ 28 days: 12–22 MPa
Packaging: 40 KG Bag (IS 16777 certified).`
  },
  {
    category: 'Product Details',
    title: 'Sobha Tile Adhesives — Full Range (Type 1 to Type 4)',
    content: `Sobha Tile Adhesive Portfolio:
1. SOBHA TILE ADHESIVE TYPE 1 (CE): For ceramic tiles on internal floors & walls in dry conditions. Tensile adhesion ≥0.5 N/mm². 40 KG bag.
2. SOBHA TILE ADHESIVE TYPE 2 (VT): For vitrified tiles & natural stones (up to 600x600mm) on internal/external floors and walls. High polymer flexibility, shock resistant. Tensile adhesion ≥1.0 N/mm², shear adhesion ≥1.25 N/mm². 40 KG & 20 KG.
3. SOBHA TILE ADHESIVE TYPE 3 (SA): Heavy-duty stone adhesive for external vertical surfaces and large format tiles (up to 1200x1200mm). Zero vertical slip, extreme weather resistant. Tensile adhesion ≥1.5 N/mm². 40 KG & 20 KG.
4. SOBHA TILE ADHESIVE TYPE 4 (HF/HA): Highly deformable flexible adhesive for glass mosaics, swimming pools, large format tiles (>1200x1200mm), and demanding substrates (metal, wood, plywood, gypsum board, bison panels). Deformability ≥5.0 mm. 40 KG & 20 KG.`
  },
  {
    category: 'Product Matrix',
    title: 'Tile Adhesive Application & Substrate Matrix',
    content: `Substrate & Tile Matching Guide:
- Ceramic Tiles (≤300x300mm): Type 1 (CE), Type 2 (VT), Type 3 (SA), Type 4 (HF)
- Vitrified Tiles (≤600x600mm): Type 2 (VT), Type 3 (SA), Type 4 (HF)
- Natural Stone Tiles: Type 2 (VT), Type 3 (SA), Type 4 (HF)
- Large Format Tiles (≤1200x1200mm): Type 3 (SA), Type 4 (HF)
- Extra Large Format (>1200x1200mm) & Glass Mosaics: Type 4 (HF)
- Substrates (Cement Plaster/Concrete/Screed): Type 1, 2, 3, 4
- Substrates (Plywood, Gypsum Board, Wood, MDF, Cement Board): Type 3 (SA), Type 4 (HF)
- Swimming Pools / Wet Areas: Type 2, 3, 4 (Type 4 HF recommended for full immersion)
- External Vertical Facades: Type 3 (SA), Type 4 (HF) (Zero vertical slip).`
  },
  {
    category: 'Product Details',
    title: 'Sobha Super Fine & Ultra Fine Flyash (IS 3812 / IS 8812)',
    content: `Flyash Product Range:
1. SOBHA SUPER FINE FLYASH: Finely graded fly ash for RMC (Ready Mix Concrete), dams, bridges, highways, and pre-cast concrete. Enhances compressive strength, workability, and reduces permeability. ASTM C-618 & IS 3812 (Part 1). Packaging: 50 KG Bag.
2. SOBHA ULTRA FINE FLYASH (Grade 1): Micro-silica grade performance additive for high-performance concrete (M60+), marine and coastal structures, and specialized grouts. IS 8812 (Part 1) ISI marked. Packaging: 50 KG Bag.
3. SOBHA SHAKTI MICRO FINE GGBS CEMENT: Ultra-fine granulated blast furnace slag SCM. Provides superior micro-structure packing, low heat of hydration, architectural off-white finish.`
  },
  {
    category: 'Policy & Escalation',
    title: 'Rate List & Pricing Policy — Mandatory Human Handoff',
    content: `Rate List & Pricing Policy:
- The AI bot NEVER fabricates prices, rates, or discounts.
- Official rates and customized volume quotations vary based on project location, delivery logistics, quantity, and contract terms.
- Whenever a customer asks for "Rate List", "Price", "Cost", "Discount", "Quotation", or clicks the "Rate List" button:
  1. The bot politely explains that exact rates and volume quotations are provided directly by sales specialists.
  2. The bot immediately transfers the chat to human mode (HUMAN ACTIVE).
  3. A high-priority callback task is logged for the sales team.
  4. The salesperson will share the official rate list and discuss volume discounts directly.`
  },
  {
    category: 'Policy & Escalation',
    title: 'Brochure & Catalog Dispatch Policy',
    content: `Brochure & Catalog Dispatch Rules:
- When any customer asks for "Brochure", "Catalog", "PDF", "Product Details", "Pamphlet", or "Specs", the system MUST deliver the official Sobhainfra Tech Product Catalog strictly in native PDF format (file attachment: Sobha_Products_Catalog.pdf).
- Direct download links should not be sent as plain text; the PDF document must be dispatched natively via WhatsApp Document API.
- The document dispatch is followed by interactive action buttons: "💰 Rate List" and "👤 Talk to Human".`
  },
  {
    category: 'Trading Products',
    title: 'Supplementary & Traded Materials',
    content: `Supplementary Traded Materials (Non-Manufactured):
Sobha Group also trades in high-grade raw building materials:
- Nareshwar Sand
- Black Sand
- Brown Bardoli Sand
- Silica Sand & Dry Sand
- Pond Ash
- Aggregate Metal
- AAC Blocks.`
  }
];

async function seedDatabase() {
  console.log('Seeding Supabase Database with Sobha Catalog & Master Knowledge Base...');

  // 1. Seed Products
  try {
    for (const p of PRODUCTS_DATA) {
      const { data: existing } = await supabase.from('products').select('id').eq('sku', p.sku).maybeSingle();
      if (existing) {
        await supabase.from('products').update({
          ...p,
          organization_id: DEFAULT_ORG_ID,
          updated_at: new Date().toISOString()
        }).eq('id', existing.id);
        console.log(`Updated product: ${p.name} (${p.sku})`);
      } else {
        const { data: inserted, error } = await supabase.from('products').insert([{
          ...p,
          organization_id: DEFAULT_ORG_ID
        }]).select('id').single();
        if (error) console.error(`Error inserting ${p.name}:`, error.message);
        else console.log(`Inserted product: ${p.name} (ID: ${inserted?.id})`);
      }
    }
  } catch (err) {
    console.error('Products seeding error:', err.message);
  }

  // 2. Seed AI Knowledge Base
  try {
    // Clear old generic placeholders or update
    await supabase.from('ai_knowledge').delete().eq('organization_id', DEFAULT_ORG_ID);
    
    for (const item of AI_KNOWLEDGE_SECTIONS) {
      const { error } = await supabase.from('ai_knowledge').insert([{
        organization_id: DEFAULT_ORG_ID,
        category: item.category,
        title: item.title,
        content: item.content,
        status: 'active',
        version: 1,
      }]);
      if (error) console.error(`Error inserting KB ${item.title}:`, error.message);
      else console.log(`Inserted KB section: ${item.category} -> ${item.title}`);
    }
  } catch (err) {
    console.error('KB seeding error:', err.message);
  }

  console.log(' Seeding completed successfully!');
}

seedDatabase();
