import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import Modal from './Modal';
import Button from './Button';
import api from '../api/axios';
import { parseUpiPayUri, parseBankAlertText } from '../utils/upiHelpers';

const PayAndSplitModal = ({ isOpen, onClose, trip, onDraftCreated }) => {
  const [activeTab, setActiveTab] = useState('qr'); // 'qr' | 'link' | 'paste'
  const [scanError, setScanError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form inputs for confirmed draft capture
  const [parsedData, setParsedData] = useState({
    merchant: '',
    amount: '',
    vpa: '',
    note: '',
    rawText: '',
  });

  // Deep Link tab state
  const [linkVpa, setLinkVpa] = useState('');
  const [linkAmount, setLinkAmount] = useState('');
  const [linkNote, setLinkNote] = useState('');

  // Paste alert tab state
  const [pastedText, setPastedText] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleDetectedCode = useCallback((rawCode) => {
    const parsed = parseUpiPayUri(rawCode);
    if (parsed) {
      setParsedData({
        merchant: parsed.merchantName,
        amount: parsed.amount ? String(parsed.amount) : '',
        vpa: parsed.vpa,
        note: parsed.note,
        rawText: rawCode,
      });
      stopCamera();
    } else {
      setScanError(`Detected QR code is not a valid UPI pay URI: ${rawCode.slice(0, 40)}...`);
    }
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setScanError('');

    try {
      // Check if BarcodeDetector is supported natively in modern Chromium
      const hasNativeDetector = 'BarcodeDetector' in window;
      let barcodeDetector = null;
      if (hasNativeDetector) {
        try {
          barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } catch (e) {
          console.warn('BarcodeDetector format qr_code not supported, falling back to jsQR:', e);
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const scanTick = async () => {
        if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
          animationFrameRef.current = requestAnimationFrame(scanTick);
          return;
        }

        const video = videoRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 1. Try native BarcodeDetector if available
        if (barcodeDetector) {
          try {
            const barcodes = await barcodeDetector.detect(canvas);
            if (barcodes.length > 0) {
              const rawValue = barcodes[0].rawValue;
              handleDetectedCode(rawValue);
              return;
            }
          } catch {
            // fallback to jsQR
          }
        }

        // 2. jsQR software fallback
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          handleDetectedCode(code.data);
          return;
        }

        animationFrameRef.current = requestAnimationFrame(scanTick);
      };

      animationFrameRef.current = requestAnimationFrame(scanTick);
    } catch (err) {
      console.error('Camera error:', err);
      setScanError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access to scan QR codes.'
          : 'Could not access camera. Try uploading or entering details manually.'
      );
    }
  }, [handleDetectedCode]);

  useEffect(() => {
    if (isOpen && activeTab === 'qr') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, activeTab, startCamera, stopCamera]);

  // Handle Pasting Bank Alert / SMS
  const handleParsePasted = () => {
    if (!pastedText.trim()) return;
    const { amount, merchant } = parseBankAlertText(pastedText);
    setParsedData({
      merchant: merchant || 'Merchant',
      amount: amount ? String(amount) : '',
      vpa: '',
      note: '',
      rawText: pastedText,
    });
  };

  // Generate UPI Deep Link and Trigger Payment App
  const handleLaunchDeepLink = () => {
    if (!linkVpa.trim()) {
      alert('Please enter a Payee UPI ID (e.g. merchant@icici)');
      return;
    }
    const cleanAmt = Number(linkAmount) || 0;
    const upiUri = `upi://pay?pa=${encodeURIComponent(linkVpa.trim())}&pn=${encodeURIComponent(
      linkVpa.split('@')[0]
    )}${cleanAmt > 0 ? `&am=${cleanAmt}` : ''}&cu=INR&tn=${encodeURIComponent(linkNote || 'FinSight Split')}`;

    setParsedData({
      merchant: linkVpa.split('@')[0] || 'Merchant',
      amount: cleanAmt > 0 ? String(cleanAmt) : '',
      vpa: linkVpa.trim(),
      note: linkNote,
      rawText: upiUri,
    });

    // Launch UPI intent
    window.location.href = upiUri;
  };

  // Submit Draft Expense into Active Trip (Always Draft, never auto-saved)
  const handleConfirmDraft = async (e) => {
    e.preventDefault();
    if (!trip?._id) return;
    if (!(Number(parsedData.amount) > 0)) {
      alert('Please enter a valid positive amount.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/splits/groups/${trip._id}/upi-drafts`, {
        amount: Number(parsedData.amount),
        merchant: parsedData.merchant || 'Shared expense',
        rawText: parsedData.rawText || `UPI payment to ${parsedData.merchant || 'merchant'}`,
        payerVpa: parsedData.vpa,
        category: 'Shared',
      });

      if (res.data?.success) {
        if (onDraftCreated) onDraftCreated(res.data.data);
        onClose();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to capture expense draft');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="⚡ Pay & Split (Trip Mode)" isOpen={isOpen} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderRadius: 'var(--radius-md, 10px)',
            background: 'var(--bg-surface-elevated)',
            padding: '4px',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: 'none',
              background: activeTab === 'qr' ? 'var(--accent-primary, #6366F1)' : 'transparent',
              color: activeTab === 'qr' ? '#ffffff' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📷 Scan UPI QR
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: 'none',
              background: activeTab === 'link' ? 'var(--accent-primary, #6366F1)' : 'transparent',
              color: activeTab === 'link' ? '#ffffff' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🔗 Deep Link
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: 'none',
              background: activeTab === 'paste' ? 'var(--accent-primary, #6366F1)' : 'transparent',
              color: activeTab === 'paste' ? '#ffffff' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📋 Paste SMS
          </button>
        </div>

        {/* Tab 1: QR Camera Scanner */}
        {activeTab === 'qr' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '100%',
                maxHeight: '260px',
                borderRadius: 'var(--radius-md, 12px)',
                overflow: 'hidden',
                background: '#000',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <video
                ref={videoRef}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  width: '180px',
                  height: '180px',
                  border: '2px solid rgba(99, 102, 241, 0.8)',
                  borderRadius: '12px',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                  pointerEvents: 'none',
                }}
              />
            </div>
            {scanError && (
              <div style={{ fontSize: '0.78rem', color: 'var(--accent-red, #EF4444)', textAlign: 'center' }}>
                ⚠️ {scanError}
              </div>
            )}
            <p className="text-muted" style={{ fontSize: '0.75rem', margin: 0, textAlign: 'center' }}>
              Point your camera at a merchant or BharatPe / GooglePay / PhonePe QR code.
            </p>
          </div>
        )}

        {/* Tab 2: Deep Link Form */}
        {activeTab === 'link' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                Payee UPI ID (VPA)
              </label>
              <input
                className="input-glass"
                placeholder="e.g. coffeehouse@okhdfcbank"
                value={linkVpa}
                onChange={(e) => setLinkVpa(e.target.value)}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  Amount (₹)
                </label>
                <input
                  type="number"
                  className="input-glass"
                  placeholder="e.g. 450"
                  value={linkAmount}
                  onChange={(e) => setLinkAmount(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  Note / Item
                </label>
                <input
                  className="input-glass"
                  placeholder="e.g. Filter Coffee"
                  value={linkNote}
                  onChange={(e) => setLinkNote(e.target.value)}
                />
              </div>
            </div>
            <Button type="button" variant="primary" size="sm" onClick={handleLaunchDeepLink}>
              🚀 Open in UPI App & Prepare Draft
            </Button>
          </div>
        )}

        {/* Tab 3: Paste Bank SMS / Notification Alert */}
        {activeTab === 'paste' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                Paste transaction SMS or notification
              </label>
              <textarea
                className="input-glass"
                rows={4}
                placeholder="e.g. Sent Rs.420.00 to CAFE NIRVANA via UPI on 17-Oct-26. Ref no 428192837..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={handleParsePasted}>
              ⚡ Extract Details
            </Button>
          </div>
        )}

        {/* Captured Draft Details Confirmation (Always Draft, never auto-saved) */}
        <div
          style={{
            padding: '0.9rem',
            borderRadius: 'var(--radius-md, 10px)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            📝 Review Draft Expense (Trip: {trip?.name || 'Active Trip'})
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Merchant</label>
              <input
                className="input-glass"
                value={parsedData.merchant}
                onChange={(e) => setParsedData((prev) => ({ ...prev, merchant: e.target.value }))}
                placeholder="Merchant name"
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Amount (₹)</label>
              <input
                type="number"
                className="input-glass"
                value={parsedData.amount}
                onChange={(e) => setParsedData((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="Amount"
              />
            </div>
          </div>

          {parsedData.vpa && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              VPA: <strong>{parsedData.vpa}</strong>
            </div>
          )}

          <Button
            type="button"
            variant="primary"
            loading={submitting}
            onClick={handleConfirmDraft}
            disabled={!parsedData.amount || Number(parsedData.amount) <= 0}
            fullWidth
          >
            Save as Trip Draft
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PayAndSplitModal;
