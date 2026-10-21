const { TextractClient, AnalyzeExpenseCommand } = require('@aws-sdk/client-textract');
const { VALID_CATEGORIES } = require('./quickAddParser');
const { logAwsCall, logger } = require('../utils/logger');
const { getReceiptObjectBuffer } = require('./s3Service');

function inferCategoryFromMerchant(merchant = '') {
  const m = merchant.toLowerCase();
  if (/starbucks|cafe|coffee|restaurant|mcdonald|burger|subway|pizza|swiggy|zomato|dining|bar|grill|bakery|dunkin|costa/i.test(m)) {
    return 'Food & Dining';
  }
  if (/walmart|target|costco|blinkit|zepto|instamart|grocery|supermarket|market|safeway|trader joe|kroger|dmart|bigbasket/i.test(m)) {
    return 'Groceries';
  }
  if (/uber|lyft|ola|rapido|shell|bp|chevron|petrol|fuel|gas|flight|airline|delta|united|irctc|parking|transit|makemytrip/i.test(m)) {
    return 'Travel';
  }
  if (/amazon|flipkart|apple|zara|h&m|clothing|store|retail|electronics|best buy|nike|myntra/i.test(m)) {
    return 'Shopping';
  }
  if (/cvs|walgreens|pharmacy|hospital|health|medical|clinic|doctor|apollo|1mg|medplus/i.test(m)) {
    return 'Healthcare';
  }
  if (/cinema|theater|amc|pvr|inox|netflix|entertainment|bookmyshow/i.test(m)) {
    return 'Entertainment';
  }
  if (/utility|electric|water|gas bill|internet|telecom|verizon|at&t|airtel|jio|bescom/i.test(m)) {
    return 'Bills & Utilities';
  }
  return 'Other';
}

/**
 * Normalizes price strings to a rounded number.
 * Handles:
 * - Negative amounts: "-45.00", "(45.00)" for discounts
 * - Currency prefixes/suffixes: "Rs", "₹", "/-", "$", "INR"
 * - Indian number grouping: "1,23,456.00"
 * - Decimal commas: "1234,50" when no dot is present
 */
function normalizeAmount(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.round((val + Number.EPSILON) * 100) / 100;
  }

  let str = String(val).trim();

  // Check for negative signs or parenthesized negative numbers e.g. (150.00) or -150.00
  let isNegative = false;
  if (/^\(.*\)$/.test(str) || str.startsWith('-')) {
    isNegative = true;
  }

  // Strip currency prefixes, suffixes, and boilerplate words
  str = str.replace(/(?:rs\.?|inr|₹|\$|€|£|\/-)/gi, '').trim();

  // Handle decimal comma vs thousands separator:
  // e.g. "1.234,50" -> "1234.50", "1234,50" -> "1234.50", "1,23,456.00" -> "123456.00"
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // European format: 1.250,50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Standard or Indian format: 1,23,456.00
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',') && !str.includes('.')) {
    const commaParts = str.split(',');
    if (commaParts.length === 2 && commaParts[1].length <= 2) {
      // Likely decimal comma e.g. "420,50"
      str = `${commaParts[0]}.${commaParts[1]}`;
    } else {
      // Grouping separator e.g. "1,234"
      str = str.replace(/,/g, '');
    }
  }

  // Strip any remaining unwanted characters except digits, dot, and minus
  const clean = str.replace(/[^0-9.-]/g, '');
  let num = parseFloat(clean);
  if (isNaN(num)) return 0;

  if (isNegative && num > 0) {
    num = -num;
  }

  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Normalizes date strings to ISO YYYY-MM-DD format.
 * - Defaults to day-first (DD/MM/YYYY) for Indian receipts, configurable via DATE_FORMAT_DAY_FIRST=false
 * - Supports 2-digit years
 * - Rejects unparseable or future dates, falling back to today
 */
function normalizeDate(valStr = '') {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  if (!valStr) return todayIso;

  const dayFirst = process.env.DATE_FORMAT_DAY_FIRST !== 'false'; // default true for Indian context

  // 1. Check numeric pattern: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const match = String(valStr).trim().match(/\b([0-9]{1,2})[-/.]([0-9]{1,2})[-/.]([0-9]{2,4})\b/);
  if (match) {
    const [, p1, p2, rawYr] = match;
    const year = rawYr.length === 2 ? Number(`20${rawYr}`) : Number(rawYr);

    let day = Number(p1);
    let month = Number(p2);

    if (dayFirst) {
      day = Number(p1);
      month = Number(p2);
      // If day was > 12 and month <= 12, DD/MM is guaranteed
      // If month was > 12 and day <= 12, swap back
      if (month > 12 && day <= 12) {
        day = Number(p2);
        month = Number(p1);
      }
    } else {
      // Month first (US format MM/DD/YYYY)
      month = Number(p1);
      day = Number(p2);
      if (month > 12 && day <= 12) {
        month = Number(p2);
        day = Number(p1);
      }
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const d = new Date(candidate);
      if (!isNaN(d.getTime())) {
        // Reject future dates (more than 1 day in the future to account for timezone drift)
        const futureLimit = new Date();
        futureLimit.setDate(futureLimit.getDate() + 1);
        if (d <= futureLimit) {
          return candidate;
        }
      }
    }
  }

  // 2. Try Date.parse for text dates (e.g. "03-Oct-2026", "October 3, 2026")
  // Only use Date.parse if it's NOT a pure slash/hyphen numeric string (to prevent US default parsing of DD/MM)
  if (!/^\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s*$/.test(String(valStr))) {
    const parsed = Date.parse(valStr);
    if (!isNaN(parsed)) {
      const d = new Date(parsed);
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      const candidate = `${yr}-${mo}-${da}`;

      const futureLimit = new Date();
      futureLimit.setDate(futureLimit.getDate() + 1);
      if (d <= futureLimit) {
        return candidate;
      }
    }
  }

  // Fallback to today if unparseable or in the future
  return todayIso;
}

/**
 * Extracts comprehensive structured receipt expense data from AWS Textract AnalyzeExpense response.
 *
 * Extracts:
 * - Line items: description, quantity, unitPrice, price (line total)
 * - Summary: vendor, date, subtotal, tax, serviceCharge, discount, total
 * - Mismatch validation: computes (subtotal + tax + serviceCharge - discount) vs total
 */
function extractFromTextractResponse(response) {
  const doc = response?.ExpenseDocuments?.[0];
  if (!doc) {
    const err = new Error('No expense document detected in the receipt.');
    err.code = 'NO_DOCUMENT_FOUND';
    err.statusCode = 422;
    throw err;
  }

  let vendor = '';
  let date = '';
  let total = null;
  let subtotal = null;
  let tax = null;
  let serviceCharge = null;
  let discount = null;

  // 1. Process Summary Fields
  if (Array.isArray(doc.SummaryFields)) {
    for (const field of doc.SummaryFields) {
      const type = field.Type?.Text?.toUpperCase() || '';
      const val = field.ValueDetection?.Text || '';

      if (!vendor && (type === 'VENDOR_NAME' || type === 'RECEIPT_HOUSE' || type === 'NAME')) {
        vendor = val.trim();
      } else if (total === null && (type === 'TOTAL' || type === 'AMOUNT_PAID' || type === 'AMOUNT_DUE' || type === 'GRAND_TOTAL')) {
        total = normalizeAmount(val);
      } else if (subtotal === null && (type === 'SUBTOTAL' || type === 'SUB_TOTAL' || type === 'NET_AMOUNT')) {
        subtotal = normalizeAmount(val);
      } else if (tax === null && (type === 'TAX' || type === 'TOTAL_TAX' || type === 'SALES_TAX' || type === 'GST' || type === 'CGST' || type === 'SGST' || type === 'VAT')) {
        tax = normalizeAmount(val);
      } else if (serviceCharge === null && (type === 'GRATUITY' || type === 'SERVICE_CHARGE' || type === 'TIP')) {
        serviceCharge = normalizeAmount(val);
      } else if (discount === null && (type === 'DISCOUNT' || type === 'PROMO' || type === 'SAVINGS')) {
        discount = Math.abs(normalizeAmount(val));
      } else if (!date && (type === 'INVOICE_RECEIPT_DATE' || type === 'DATE' || type === 'TRANSACTION_DATE')) {
        date = normalizeDate(val);
      }
    }
  }

  // 2. Process Line Items (LineItemGroups -> LineItems -> LineItemExpenseFields)
  const items = [];
  const lowConfidenceItems = [];

  if (Array.isArray(doc.LineItemGroups)) {
    for (const group of doc.LineItemGroups) {
      for (const lineItem of group.LineItems || []) {
        let description = '';
        let price = null;
        let quantity = null;
        let unitPrice = null;
        const confidences = [];

        for (const expenseField of lineItem.LineItemExpenseFields || []) {
          const fType = expenseField.Type?.Text?.toUpperCase() || '';
          const fVal = expenseField.ValueDetection?.Text || '';
          const conf = expenseField.ValueDetection?.Confidence;

          if (typeof conf === 'number') {
            confidences.push(conf);
          }

          if (fType === 'ITEM' || fType === 'DESCRIPTION' || fType === 'PRODUCT_CODE') {
            if (!description) description = fVal.trim();
          } else if (fType === 'PRICE' || fType === 'TOTAL_PRICE' || fType === 'EXTENDED_PRICE') {
            price = normalizeAmount(fVal);
          } else if (fType === 'UNIT_PRICE') {
            unitPrice = normalizeAmount(fVal);
          } else if (fType === 'QUANTITY' || fType === 'QTY') {
            const parsedQty = parseFloat(fVal.replace(/[^0-9.]/g, ''));
            if (!isNaN(parsedQty) && parsedQty > 0) {
              quantity = parsedQty;
            }
          }
        }

        // Register if item has a description or a price
        if (description || price !== null || unitPrice !== null) {
          const qty = quantity !== null ? quantity : 1;
          const lineTotal = price !== null ? price : (unitPrice !== null ? Math.round((unitPrice * qty + Number.EPSILON) * 100) / 100 : 0);
          const uPrice = unitPrice !== null ? unitPrice : (qty > 0 && lineTotal > 0 ? Math.round((lineTotal / qty + Number.EPSILON) * 100) / 100 : lineTotal);

          const itemObj = {
            name: description || 'Unlabeled Item',
            description: description || 'Unlabeled Item',
            quantity: qty,
            unitPrice: uPrice,
            price: lineTotal,
          };

          const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 100;
          if (minConfidence < 80) {
            lowConfidenceItems.push({
              ...itemObj,
              confidence: Math.round(minConfidence * 10) / 10,
            });
          }

          items.push(itemObj);
        }
      }
    }
  }

  // Error handling: ensure at least one item was detected
  if (items.length === 0) {
    const noItemsErr = new Error(
      'No line items detected on receipt. Please ensure the receipt is clear, well-lit, and contains itemized items and prices.'
    );
    noItemsErr.code = 'NO_ITEMS_DETECTED';
    noItemsErr.statusCode = 422;
    throw noItemsErr;
  }

  // Compute calculated values for missing fields
  const calculatedSubtotal = Math.round((items.reduce((sum, item) => sum + item.price, 0) + Number.EPSILON) * 100) / 100;
  if (subtotal === null) {
    subtotal = calculatedSubtotal;
  }
  if (tax === null) {
    tax = 0;
  }
  if (serviceCharge === null) {
    serviceCharge = 0;
  }
  if (discount === null) {
    discount = 0;
  }

  const expectedTotal = Math.round((subtotal + tax + serviceCharge - discount + Number.EPSILON) * 100) / 100;
  if (total === null) {
    total = expectedTotal;
  }

  // Detect total mismatch (> ₹1 difference between item components and total)
  const difference = Math.abs(expectedTotal - total);
  const mismatch = difference > 1.0;

  if (!date) {
    date = new Date().toISOString().slice(0, 10);
  }
  if (!vendor) {
    vendor = 'Receipt Vendor';
  }

  const category = inferCategoryFromMerchant(vendor);

  return {
    vendor,
    date,
    items,
    subtotal,
    tax,
    serviceCharge,
    discount,
    total,
    mismatch,
    mismatchDifference: mismatch ? Math.round(difference * 100) / 100 : 0,
    lowConfidenceItems,
    // Backward compatibility aliases
    merchant: vendor,
    amount: total,
    category,
    description: vendor,
    lineItems: items.map((it) => ({
      description: it.quantity > 1 ? `${it.quantity}x ${it.name}` : it.name,
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      price: it.price,
    })),
    source: 'aws-textract',
  };
}

/**
 * Fallback to Gemini Multimodal vision when Textract fails or is unavailable.
 */
async function parseReceiptWithGemini(buffer, mimeType) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  try {
    const base64Data = buffer.toString('base64');
    const prompt = `Analyze this receipt image and extract:
1. Vendor/Merchant name
2. Date of receipt (YYYY-MM-DD, parse day-first for Indian context)
3. Subtotal, Tax, Service Charge / Gratuity, Discount, and Final Total Amount (numbers)
4. Line items with description, quantity, unit price, and total price
5. Best matching category from: ${VALID_CATEGORIES.join(', ')}
Respond strictly in JSON with format:
{
  "vendor": "Merchant Name",
  "date": "YYYY-MM-DD",
  "subtotal": 0.0,
  "tax": 0.0,
  "serviceCharge": 0.0,
  "discount": 0.0,
  "total": 0.0,
  "category": "Food & Dining",
  "items": [
    { "name": "Item Description", "description": "Item Description", "quantity": 1, "unitPrice": 100, "price": 100 }
  ]
}`;

    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      }
    );

    if (response.ok) {
      const result = await response.json();
      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText);
        const items = Array.isArray(parsed.items) && parsed.items.length > 0
          ? parsed.items.map((it) => ({
              name: it.name || it.description || 'Receipt Item',
              description: it.description || it.name || 'Receipt Item',
              quantity: Number(it.quantity) || 1,
              unitPrice: Number(it.unitPrice) || Number(it.price) || 0,
              price: Number(it.price) || 0,
            }))
          : [
              {
                name: parsed.vendor || 'Receipt Item',
                description: parsed.vendor || 'Receipt Item',
                quantity: 1,
                unitPrice: Number(parsed.total) || 0,
                price: Number(parsed.total) || 0,
              },
            ];

        const subtotal = Number(parsed.subtotal) || items.reduce((sum, it) => sum + it.price, 0);
        const tax = Number(parsed.tax) || 0;
        const serviceCharge = Number(parsed.serviceCharge) || 0;
        const discount = Number(parsed.discount) || 0;
        const total = Number(parsed.total) || (subtotal + tax + serviceCharge - discount);
        const vendor = parsed.vendor || 'Receipt Vendor';

        const difference = Math.abs((subtotal + tax + serviceCharge - discount) - total);
        const mismatch = difference > 1.0;

        return {
          vendor,
          date: normalizeDate(parsed.date),
          items,
          subtotal: Math.round((subtotal + Number.EPSILON) * 100) / 100,
          tax: Math.round((tax + Number.EPSILON) * 100) / 100,
          serviceCharge: Math.round((serviceCharge + Number.EPSILON) * 100) / 100,
          discount: Math.round((discount + Number.EPSILON) * 100) / 100,
          total: Math.round((total + Number.EPSILON) * 100) / 100,
          mismatch,
          mismatchDifference: mismatch ? Math.round(difference * 100) / 100 : 0,
          lowConfidenceItems: [],
          merchant: vendor,
          amount: total,
          category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : inferCategoryFromMerchant(vendor),
          description: vendor,
          lineItems: items,
          source: 'gemini-vision',
        };
      }
    }
  } catch (geminiErr) {
    logger.warn({ err: geminiErr }, 'Gemini vision receipt fallback failed');
  }
  return null;
}

/**
 * Validate input mime type and size before sending to AWS Textract.
 */
function validateReceiptInput(input, mimeType) {
  const isBuffer = Buffer.isBuffer(input);

  if (isBuffer) {
    const normalizedMime = (mimeType || 'image/jpeg').toLowerCase();
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf', 'image/tiff'];

    if (normalizedMime === 'image/heic' || normalizedMime === 'image/heif') {
      const err = new Error(
        'HEIC format from iPhones is not supported directly by AWS Textract. Please convert to JPEG or PNG before uploading.'
      );
      err.code = 'UNSUPPORTED_FILE_TYPE';
      err.statusCode = 400;
      throw err;
    }

    if (normalizedMime === 'image/webp') {
      const err = new Error(
        'WebP format is not supported by AWS Textract. Please upload a JPEG, PNG, or PDF file.'
      );
      err.code = 'UNSUPPORTED_FILE_TYPE';
      err.statusCode = 400;
      throw err;
    }

    if (!allowedMimes.includes(normalizedMime)) {
      const err = new Error(
        `Unsupported file type (${mimeType}). AWS Textract supports JPEG, PNG, and PDF files.`
      );
      err.code = 'UNSUPPORTED_FILE_TYPE';
      err.statusCode = 400;
      throw err;
    }

    // AWS Textract synchronous limit is 10 MB (10,485,760 bytes)
    const MAX_SYNC_BYTES = 10 * 1024 * 1024;
    if (input.length > MAX_SYNC_BYTES) {
      const err = new Error('File size exceeds the 10MB limit for AWS Textract.');
      err.code = 'FILE_TOO_LARGE';
      err.statusCode = 400;
      throw err;
    }
  }
}

/**
 * Main AnalyzeExpense entry point.
 * Sends image bytes or S3 object to AWS Textract AnalyzeExpense.
 */
async function analyzeReceiptExpense(input, mimeType = 'image/jpeg') {
  validateReceiptInput(input, mimeType);

  // Explicit mock mode allowed ONLY when RECEIPT_SCAN_MOCK=true or TEXTRACT_MOCK=true in non-production
  const mockAllowed = (process.env.RECEIPT_SCAN_MOCK === 'true' || process.env.TEXTRACT_MOCK === 'true') && process.env.NODE_ENV !== 'production';
  if (mockAllowed) {
    return {
      vendor: 'Starbucks Indiranagar',
      date: '2026-10-03',
      items: [
        { name: 'Caffè Mocha (Grande)', description: 'Caffè Mocha (Grande)', quantity: 1, unitPrice: 345.00, price: 345.00 },
        { name: 'Blueberry Muffin', description: 'Blueberry Muffin', quantity: 1, unitPrice: 220.00, price: 220.00 },
        { name: 'Carry Bag', description: 'Carry Bag', quantity: 1, unitPrice: 15.00, price: 15.00 },
      ],
      subtotal: 580.00,
      tax: 28.25,
      serviceCharge: 0,
      discount: 0,
      total: 608.25,
      mismatch: false,
      mismatchDifference: 0,
      lowConfidenceItems: [
        { name: 'Carry Bag', quantity: 1, price: 15.00, confidence: 68.5 },
      ],
      merchant: 'Starbucks Indiranagar',
      amount: 608.25,
      category: 'Food & Dining',
      description: 'Starbucks Indiranagar',
      lineItems: [
        { description: 'Caffè Mocha (Grande)', name: 'Caffè Mocha (Grande)', quantity: 1, unitPrice: 345.00, price: 345.00 },
        { description: 'Blueberry Muffin', name: 'Blueberry Muffin', quantity: 1, unitPrice: 220.00, price: 220.00 },
        { description: 'Carry Bag', name: 'Carry Bag', quantity: 1, unitPrice: 15.00, price: 15.00 },
      ],
      source: 'mock-test',
    };
  }

  const isBuffer = Buffer.isBuffer(input);
  const isS3Object = input && typeof input === 'object' && input.bucket && input.key;

  const awsStartTime = Date.now();
  try {
    const clientConfig = {
      region: process.env.AWS_REGION || 'ap-south-1',
    };

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }

    const client = new TextractClient(clientConfig);

    const documentParam = isS3Object
      ? { S3Object: { Bucket: input.bucket, Name: input.key } }
      : { Bytes: isBuffer ? input : Buffer.from(input) };

    const command = new AnalyzeExpenseCommand({
      Document: documentParam,
    });

    const response = await client.send(command);

    logAwsCall({
      service: 'Textract',
      operation: 'AnalyzeExpense',
      durationMs: Date.now() - awsStartTime,
      success: true,
      metadata: { isS3Object: Boolean(isS3Object) },
    });

    return extractFromTextractResponse(response);
  } catch (err) {
    const awsRequestId = err.$metadata?.requestId || err.requestId;
    logger.error(
      {
        errName: err.name,
        errMessage: err.message,
        awsRequestId,
        isS3Object: Boolean(isS3Object),
      },
      '[AWS Textract AnalyzeExpense Failed]'
    );

    logAwsCall({
      service: 'Textract',
      operation: 'AnalyzeExpense',
      durationMs: Date.now() - awsStartTime,
      success: false,
      error: err,
      metadata: { isS3Object: Boolean(isS3Object), awsRequestId },
    });

    // Rethrow domain/validation errors directly
    if (err.code === 'NO_ITEMS_DETECTED' || err.code === 'NO_DOCUMENT_FOUND') {
      throw err;
    }

    // Try Gemini Multimodal vision fallback (works for both direct Buffer and S3 path)
    if (process.env.GEMINI_API_KEY) {
      try {
        let imageBuffer = null;
        if (isBuffer) {
          imageBuffer = input;
        } else if (isS3Object) {
          imageBuffer = await getReceiptObjectBuffer(input.key, input.bucket);
        }

        if (imageBuffer) {
          const geminiResult = await parseReceiptWithGemini(imageBuffer, mimeType);
          if (geminiResult) {
            logger.info({ vendor: geminiResult.vendor, total: geminiResult.total }, 'Receipt successfully extracted via Gemini vision fallback');
            return geminiResult;
          }
        }
      } catch (geminiFallbackErr) {
        logger.warn({ err: geminiFallbackErr }, 'Gemini vision fallback also failed');
      }
    }

    const mapped = mapTextractError(err);
    const userMessage = mapped.message;
    const statusCode = mapped.statusCode;

    const customErr = new Error(userMessage);
    customErr.name = err.name || 'TextractError';
    customErr.code = err.name;
    customErr.statusCode = statusCode;
    customErr.awsRequestId = awsRequestId;
    customErr.hint = mapped.hint;
    throw customErr;
  }
}


/**
 * Turn an AWS SDK / network error into a safe, specific message for the user plus a
 * hint for whoever runs the deployment. Unknown errors keep the generic message.
 */
function mapTextractError(err) {
  const region = process.env.AWS_REGION || 'ap-south-1';
  const name = (err && (err.name || err.code)) || '';
  const msg = String((err && err.message) || '');
  const generic = "Couldn't read this receipt, try a clearer photo or enter it manually";

  if (name === 'SubscriptionRequiredException') {
    return { statusCode: 400, message: `AWS Textract subscription required in region '${region}'.`,
      hint: 'Finish AWS account activation (billing + phone verification) or use a region where Textract AnalyzeExpense is available.' };
  }
  if (name === 'AccessDeniedException' || name === 'AccessDenied') {
    return { statusCode: 403, message: "AWS Textract access denied. The role lacks 'textract:AnalyzeExpense' (or s3:GetObject for the receipt).",
      hint: 'Add textract:AnalyzeExpense and s3:GetObject on the receipts bucket to the App Runner instance role.' };
  }
  if (['UnrecognizedClientException', 'InvalidSignatureException', 'ExpiredTokenException', 'InvalidClientTokenId'].includes(name) ||
      name === 'CredentialsProviderError' || /Could not load credentials|security token/i.test(msg)) {
    return { statusCode: 502, message: 'AWS credentials are missing, invalid or expired on the server.',
      hint: 'Use the App Runner instance role and remove stale AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY env vars.' };
  }
  if (name === 'UnknownEndpoint' || /ENOTFOUND|getaddrinfo|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(msg)) {
    return { statusCode: 502, message: `Could not reach AWS Textract in region '${region}'.`,
      hint: 'Check AWS_REGION is a Textract region and that the service has outbound internet access.' };
  }
  if (name === 'UnsupportedDocumentException') {
    return { statusCode: 400, message: 'Unsupported document format. AWS Textract supports JPEG, PNG, and PDF files.', hint: 'Re-encode the image as JPEG or PNG.' };
  }
  if (name === 'DocumentTooLargeException') {
    return { statusCode: 400, message: 'File size is too large for AWS Textract (maximum 10MB).', hint: 'Compress the image before upload.' };
  }
  if (name === 'InvalidS3ObjectException') {
    return { statusCode: 502, message: 'The uploaded receipt could not be read from S3.',
      hint: 'Textract and the receipts bucket must be in the same region; the caller needs s3:GetObject.' };
  }
  if (name === 'ThrottlingException' || name === 'ProvisionedThroughputExceededException') {
    return { statusCode: 429, message: 'The receipt scanner is busy. Please try again in a moment.', hint: 'Textract throttled the request.' };
  }
  if (name === 'BadDocumentException') {
    return { statusCode: 400, message: generic, hint: 'Textract rejected the image itself (blurry, corrupt or not a document).' };
  }
  return { statusCode: 502, message: generic, hint: `Unmapped error '${name || 'unknown'}'. Check server logs.` };
}

module.exports = {
  analyzeReceiptExpense,
  mapTextractError,
  inferCategoryFromMerchant,
  extractFromTextractResponse,
  normalizeAmount,
  normalizeDate,
  validateReceiptInput,
};
