/**
 * Utility functions for client-side receipt image processing,
 * normalization of Textract/OCR results, and error message formatting.
 */

/**
 * Re-encode any selected image file to JPEG via canvas.
 * - Caps max dimension on the long side to ~2000px
 * - Preserves EXIF orientation where modern browser decodes it
 * - JPEG quality ~0.85
 * - Converts HEIC/HEIF or other formats if browser decodes it, or fails clearly
 */
export const reencodeImageToJpeg = (file) => {
  return new Promise((resolve, reject) => {
    // If it's a PDF, Textract natively supports PDF documents up to 10MB
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      return resolve(file);
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          return reject(new Error("Couldn't read this receipt, try a clearer photo or enter it manually"));
        }

        const maxDimension = 2000;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Draw white background in case of transparent PNG/WebP
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error("Couldn't read this receipt, try a clearer photo or enter it manually"));
            }
            const cleanFileName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            const convertedFile = new File([blob], cleanFileName, { type: 'image/jpeg' });
            resolve(convertedFile);
          },
          'image/jpeg',
          0.85
        );
      } catch {
        reject(new Error("Couldn't read this receipt, try a clearer photo or enter it manually"));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          file.name.match(/\.(heic|heif)$/i)
            ? "Your browser could not decode this iPhone HEIC photo. Please take a photo as JPEG/PNG or convert it before uploading."
            : "Couldn't read this receipt, try a clearer photo or enter it manually"
        )
      );
    };

    img.src = objectUrl;
  });
};

/**
 * Normalizes raw receipt scan result from S3 polling, /analyze-s3,
 * or direct /transactions/receipt/scan into a unified data structure.
 */
export const normalizeReceiptResult = (scanResult, fallbackUrl = '') => {
  if (!scanResult) return null;

  const rawItems = Array.isArray(scanResult.items)
    ? scanResult.items.map((it) => ({
        description: it.description || (it.quantity > 1 ? `${it.quantity}x ${it.name}` : it.name),
        name: it.name || it.description || 'Receipt Item',
        quantity: it.quantity || 1,
        unitPrice:
          it.unitPrice !== undefined
            ? Number(it.unitPrice)
            : (it.quantity > 0 ? Number(it.price || 0) / it.quantity : Number(it.price || 0)),
        price: Number(it.price || 0),
        lowConfidence: Boolean(it.lowConfidence),
      }))
    : Array.isArray(scanResult.lineItems)
    ? scanResult.lineItems.map((it) => ({
        description: it.description || (it.quantity > 1 ? `${it.quantity}x ${it.name}` : it.name),
        name: it.name || it.description || 'Receipt Item',
        quantity: it.quantity || 1,
        unitPrice:
          it.unitPrice !== undefined
            ? Number(it.unitPrice)
            : (it.quantity > 0 ? Number(it.price || 0) / it.quantity : Number(it.price || 0)),
        price: Number(it.price || 0),
        lowConfidence: Boolean(it.lowConfidence),
      }))
    : [];

  const subtotal =
    Number(scanResult.subtotal) || rawItems.reduce((acc, curr) => acc + (curr.price || 0), 0);
  const tax = Number(scanResult.tax) || 0;
  const serviceCharge = Number(scanResult.serviceCharge) || 0;
  const discount = Number(scanResult.discount) || 0;
  const total =
    scanResult.total !== undefined
      ? Number(scanResult.total)
      : (Number(scanResult.amount) || (subtotal + tax + serviceCharge - discount));

  const expectedTotal = Math.round((subtotal + tax + serviceCharge - discount + Number.EPSILON) * 100) / 100;
  const isMismatch =
    scanResult.mismatch !== undefined
      ? Boolean(scanResult.mismatch)
      : Math.abs(expectedTotal - total) > 1.0;

  const receiptKey = scanResult.receiptKey || scanResult.s3Key || scanResult.receiptS3Key || '';
  const merchantName =
    scanResult.vendor || scanResult.merchant || scanResult.merchantName || 'Receipt Expense';

  return {
    type: 'expense',
    amount: Math.round((total + Number.EPSILON) * 100) / 100,
    total: Math.round((total + Number.EPSILON) * 100) / 100,
    category: scanResult.category || 'Food & Dining',
    date: scanResult.date || new Date().toISOString().slice(0, 10),
    description: merchantName,
    merchant: merchantName,
    vendor: merchantName,
    lineItems: rawItems,
    items: rawItems,
    subtotal: Math.round((subtotal + Number.EPSILON) * 100) / 100,
    tax: Math.round((tax + Number.EPSILON) * 100) / 100,
    serviceCharge: Math.round((serviceCharge + Number.EPSILON) * 100) / 100,
    discount: Math.round((discount + Number.EPSILON) * 100) / 100,
    mismatch: isMismatch,
    lowConfidenceItems: Array.isArray(scanResult.lowConfidenceItems) ? scanResult.lowConfidenceItems : [],
    source: scanResult.source || 'aws-textract',
    note: scanResult.note || '',
    receiptKey,
    receiptS3Key: receiptKey,
    receiptUrl: scanResult.receiptUrl || fallbackUrl,
    raw: scanResult,
  };
};

/**
 * Maps any error encountered during receipt processing into a user-friendly message.
 */
export const mapReceiptError = (err) => {
  if (!err) return "Couldn't read this receipt, try a clearer photo or enter it manually";

  const backendMsg = err.response?.data?.message || err.message;
  const code = err.response?.data?.code || err.code;
  const requestId = err.response?.data?.requestId;
  const ACTIONABLE = [
    'SubscriptionRequiredException',
    'AccessDeniedException',
    'AccessDenied',
    'UnsupportedDocumentException',
    'DocumentTooLargeException',
    'NO_ITEMS_DETECTED',
    'NO_DOCUMENT_FOUND',
    'UnrecognizedClientException',
    'InvalidSignatureException',
    'ExpiredTokenException',
    'CredentialsProviderError',
    'UnknownEndpoint',
    'ThrottlingException',
    'InvalidS3ObjectException',
    'UNSUPPORTED_FILE_TYPE',
  ];
  const generic = "Couldn't read this receipt, try a clearer photo or enter it manually";
  const specific = backendMsg && (ACTIONABLE.includes(code) || /subscription required/i.test(backendMsg));
  const suffix = code ? ` (${code}${requestId ? `, ref ${requestId}` : ''})` : '';
  return `${specific ? backendMsg : generic}${suffix}`;
};
