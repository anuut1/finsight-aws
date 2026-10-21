/**
 * FinSight - Receipt Scan Test Script
 *
 * Tests the receipt upload and Textract parsing pipeline.
 * Sends a sample receipt image to POST /api/transactions/receipt/scan
 * and validates the clean response shape:
 * { vendor, date, items: [{ name, quantity, price }], subtotal, tax, total, lowConfidenceItems: [] }
 *
 * Usage:
 *   node scripts/testReceiptScan.js [path-to-receipt.png|jpg]
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_12345';
const SERVER_URL = `http://localhost:${PORT}`;

// Minimal valid 100x100 PNG image bytes
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8' +
  'YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEtSURBVHhe7dGxDQAwCAOw7L+0d0iXkEAqY/e9g77t' +
  'XwQQERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERER' +
  'ERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERER' +
  'ERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERER' +
  'ERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERER' +
  'ERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERER' +
  'EREREREREREREREREREREREREREREREREREREREREeEI+u0A+xW2P/QAAAAASUVORK5CYII=';

async function runTest() {
  console.log('====================================================');
  console.log('🧾 FinSight - AWS Textract Receipt Scan Test');
  console.log('====================================================');

  // 1. Get or create sample receipt file
  let receiptFilePath = process.argv[2];
  if (!receiptFilePath) {
    receiptFilePath = path.join(__dirname, 'sample-receipt.png');
    if (!fs.existsSync(receiptFilePath)) {
      fs.writeFileSync(receiptFilePath, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));
      console.log(`[1] Created sample receipt image at: ${receiptFilePath}`);
    } else {
      console.log(`[1] Using sample receipt image: ${receiptFilePath}`);
    }
  } else {
    console.log(`[1] Using provided receipt image: ${receiptFilePath}`);
  }

  // 2. Generate a valid JWT auth token for testing
  const testUserId = '64f0a0000000000000000001';
  const token = jwt.sign({ id: testUserId, email: 'test@finsight.local' }, JWT_SECRET, {
    expiresIn: '1h',
  });
  console.log('[2] Generated test JWT authorization token');

  // 3. Build multipart form-data payload using standard FormData (Node 18+)
  const fileBytes = fs.readFileSync(receiptFilePath);
  const ext = path.extname(receiptFilePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg';

  const formData = new FormData();
  const fileBlob = new Blob([fileBytes], { type: mimeType });
  formData.append('receipt', fileBlob, path.basename(receiptFilePath));

  console.log(`[3] Sending request to POST ${SERVER_URL}/api/transactions/receipt/scan ...`);

  try {
    const response = await fetch(`${SERVER_URL}/api/transactions/receipt/scan`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const status = response.status;
    const json = await response.json().catch(() => null);

    console.log(`\nHTTP Status: ${status} ${response.statusText}`);
    console.log('Response Payload:');
    console.log(JSON.stringify(json, null, 2));

    if (response.ok && json?.success) {
      const data = json.data || json;
      console.log('\n====================================================');
      console.log('✅ Parsed Receipt Successfully:');
      console.log(`• Vendor:             ${data.vendor}`);
      console.log(`• Date:               ${data.date}`);
      console.log(`• Subtotal:           ₹${data.subtotal}`);
      console.log(`• Tax:                ₹${data.tax}`);
      console.log(`• Total:              ₹${data.total}`);
      console.log(`• Items Extracted:    ${data.items?.length || 0}`);
      (data.items || []).forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.quantity}x ${item.name} - ₹${item.price}`);
      });
      console.log(`• Low Confidence:     ${data.lowConfidenceItems?.length || 0} item(s)`);
      console.log('====================================================');
    } else {
      console.log('\n❌ Receipt scan failed or returned an error response.');
      if (json?.message) {
        console.log(`Error Message: ${json.message}`);
      }
      if (json?.code) {
        console.log(`Error Code: ${json.code}`);
      }
    }
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
      console.log(`\n⚠️ FinSight backend is not currently running on port ${PORT}.`);
      console.log('Please start the server with: cd server && npm run dev');
      console.log('Or test the parsing service directly with unit tests: npm test');
    } else {
      console.error('\nError executing request:', err.message);
    }
  }

  console.log('\nEquivalent curl command:');
  console.log(`curl -X POST "${SERVER_URL}/api/transactions/receipt/scan" \\`);
  console.log(`  -H "Authorization: Bearer ${token}" \\`);
  console.log(`  -F "receipt=@${receiptFilePath}"`);
}

runTest();
