import { useState, useCallback } from 'react';
import api from '../api/axios';
import { normalizeReceiptResult, mapReceiptError } from '../utils/receiptImage';

/**
 * Upload helper using XMLHttpRequest to track browser-to-S3 progress
 */
const uploadToS3WithProgress = (uploadUrl, fileToUpload, onProgress) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', fileToUpload.type || 'image/jpeg');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 85);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve(true);
      } else {
        reject(new Error(`S3 upload failed with HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during S3 direct upload'));
    xhr.send(fileToUpload);
  });
};

/**
 * Polls GET /api/receipts/:id until completed or failed
 */
const pollReceiptStatus = async (receiptId, maxAttempts = 22) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((res) => setTimeout(res, 1500));
    try {
      const res = await api.get(`/receipts/${receiptId}`);
      const data = res.data?.data || res.data;
      if (!data) continue;

      if (data.status === 'completed') {
        return {
          ...data.result,
          receiptUrl: data.receiptUrl,
          receiptId: data.receiptId || receiptId,
        };
      }

      if (data.status === 'failed') {
        const err = new Error(
          data.error?.message || "Couldn't read this receipt, try a clearer photo or enter it manually"
        );
        err.code = data.error?.code;
        throw err;
      }
    } catch (err) {
      if (err.code) throw err;
      console.debug(`[Receipt Polling] Attempt ${attempt + 1} waiting for completion...`);
    }
  }
  return null;
};

/**
 * Reusable hook for uploading, scanning, and polling receipt OCR results.
 * Handles S3 direct upload with progress, async polling, analyze-s3 fallback,
 * and direct multipart fallback.
 *
 * Returns: { status, scanning, uploadProgress, result, error, receiptKey, scanReceipt, reset, setResult, setError }
 */
export const useReceiptScan = (initialOptions = {}) => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'uploading' | 'processing' | 'completed' | 'failed'
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [receiptKey, setReceiptKey] = useState('');

  const scanReceipt = useCallback(
    async (file, callOptions = {}) => {
      if (!file) {
        const err = 'Please select or drop a receipt image first.';
        setError(err);
        return null;
      }

      const mergedOptions = { ...initialOptions, ...callOptions };
      const { tripId, scanMode = 'auto', previewUrl = '', throwOnError = false } = mergedOptions;

      setStatus('uploading');
      setUploadProgress(5);
      setError('');
      setResult(null);

      let capturedKey = '';

      try {
        let scanResult = null;

        // 1. S3 Direct Upload Pipeline
        if (scanMode === 'auto') {
          try {
            const presignRes = await api.post('/receipts/upload-url', {
              contentType: file.type || 'image/jpeg',
              fileSize: file.size,
              tripId: tripId || undefined,
            });

            const payload = presignRes.data?.data || presignRes.data || {};
            const uploadUrl = payload.uploadUrl || presignRes.data?.uploadUrl;
            const receiptId = payload.receiptId || presignRes.data?.receiptId;
            const key = payload.key || presignRes.data?.key;
            const bucket = payload.bucket || presignRes.data?.bucket;

            if (uploadUrl && key) {
              capturedKey = key;
              setReceiptKey(key);
              await uploadToS3WithProgress(uploadUrl, file, setUploadProgress);
              setStatus('processing');

              if (receiptId) {
                scanResult = await pollReceiptStatus(receiptId, 15);
              }

              if (!scanResult) {
                const analyzeRes = await api.post('/receipts/analyze-s3', {
                  bucket,
                  key,
                  receiptId,
                  contentType: file.type || 'image/jpeg',
                });
                if (
                  analyzeRes.data?.success &&
                  (analyzeRes.data.data || analyzeRes.data.items || analyzeRes.data.vendor)
                ) {
                  scanResult = analyzeRes.data.data || analyzeRes.data;
                }
              }
            }
          } catch (pipelineErr) {
            console.warn('S3 receipt pipeline encountered error, trying synchronous fallback:', pipelineErr);
          }
        }

        // 2. Direct Multipart Fallback
        if (!scanResult) {
          setStatus('processing');
          const formData = new FormData();
          formData.append('receipt', file);

          const res = await api.post('/transactions/receipt/scan', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          if (res.data?.success && (res.data.data || res.data.items || res.data.vendor)) {
            scanResult = res.data.data || res.data;
          }
        }

        if (scanResult) {
          if (!capturedKey && (scanResult.s3Key || scanResult.receiptKey)) {
            capturedKey = scanResult.s3Key || scanResult.receiptKey;
            setReceiptKey(capturedKey);
          } else if (capturedKey && !scanResult.s3Key) {
            scanResult.s3Key = capturedKey;
          }

          const normalized = normalizeReceiptResult(scanResult, previewUrl);
          if (capturedKey && !normalized.receiptKey) {
            normalized.receiptKey = capturedKey;
            normalized.receiptS3Key = capturedKey;
          }

          setStatus('completed');
          setResult(normalized);
          return normalized;
        } else {
          setStatus('failed');
          const genericErr = "Couldn't read this receipt, try a clearer photo or enter it manually";
          setError(genericErr);
          if (throwOnError) {
            throw new Error(genericErr);
          }
          return null;
        }
      } catch (err) {
        setStatus('failed');
        const formatted = mapReceiptError(err);
        setError(formatted);
        if (throwOnError) {
          throw err;
        }
        return null;
      }
    },
    [initialOptions]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setUploadProgress(0);
    setResult(null);
    setError('');
    setReceiptKey('');
  }, []);

  return {
    status,
    scanning: status === 'uploading' || status === 'processing',
    uploadProgress,
    result,
    error,
    receiptKey,
    scanReceipt,
    reset,
    setResult,
    setError,
    setUploadProgress,
  };
};

export default useReceiptScan;
