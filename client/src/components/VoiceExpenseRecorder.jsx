import { useState, useEffect, useRef } from 'react';
import api from '../api/axios';
import Button from './Button.jsx';
import Input from './Input.jsx';

const CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Shopping',
  'Travel',
  'Entertainment',
  'Bills & Utilities',
  'Healthcare',
  'Education',
  'Personal Care',
  'Investment',
  'Salary',
  'Shared',
  'Other',
];

/**
 * Voice Expense Recorder
 *
 * Dedicated component allowing users to record voice notes to automatically
 * parse and add expenses into FinSight.
 */
const VoiceExpenseRecorder = ({ onTransactionCreated, onCancel, initialText = '' }) => {
  const [transcript, setTranscript] = useState(initialText || '');
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);

  const recognitionRef = useRef(null);
  // Text typed in the Quick Add bar: skip the mic UI and go straight to the review card.
  const typedMode = Boolean(initialText);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // Works well for Indian English, currency numbers & accents

      recognition.onstart = () => {
        setIsRecording(true);
        setError('');
      };

      recognition.onresult = (event) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event) => {
        setIsRecording(false);
        if (event.error === 'not-allowed') {
          setError('Microphone permission was denied. Please allow microphone access or type below.');
        } else if (event.error !== 'no-speech') {
          setError(`Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    } else {
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const startRecording = () => {
    setError('');
    setDraft(null);
    setTranscript('');
    if (!speechSupported) {
      setError('Voice recognition is not supported in this browser. Please type your expense below.');
      return;
    }
    try {
      recognitionRef.current?.start();
    } catch {
      // If already running, restart
      try {
        recognitionRef.current?.stop();
        setTimeout(() => recognitionRef.current?.start(), 100);
      } catch (e) {
        console.warn('Speech error:', e);
      }
    }
  };

  const stopRecording = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setIsRecording(false);
  };

  const handleParseText = async (textToParse) => {
    const query = (textToParse || transcript).trim();
    if (!query) {
      setError('Please record or type what you spent first.');
      return;
    }

    stopRecording();
    setParsing(true);
    setError('');

    try {
      const res = await api.post('/transactions/quick-add/parse', {
        text: query,
        currentDate: new Date().toISOString().slice(0, 10),
      });

      if (res.data?.success && res.data.data) {
        const parsed = res.data.data;
        setDraft({
          type: parsed.type || 'expense',
          amount: parsed.amount ? String(parsed.amount) : '',
          category: parsed.category || 'Food & Dining',
          date: parsed.date || new Date().toISOString().slice(0, 10),
          description: parsed.note || query,
          mood: parsed.mood || 'neutral',
        });
      } else {
        setError('Could not extract amount or details. Please try saying it clearly (e.g. "Dinner 450 rupees yesterday").');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to process voice note.');
    } finally {
      setParsing(false);
    }
  };

  useEffect(() => {
    if (typedMode) handleParseText(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!draft) return;

    const parsedAmount = Number(draft.amount);
    if (!draft.amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        type: draft.type,
        category: draft.category,
        amount: parsedAmount,
        description: draft.description?.trim() || undefined,
        date: draft.date,
        mood: draft.mood,
        tags: ['voice-record'],
      };

      const res = await api.post('/transactions', payload);
      if (res.data?.success) {
        if (onTransactionCreated) {
          onTransactionCreated(res.data.data);
        }
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Intro info */}
      {!typedMode && (
      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        Tap the microphone and speak naturally, e.g. <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>&ldquo;Coffee 180 rupees at Starbucks&rdquo;</span> or <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>&ldquo;Groceries 1200 yesterday&rdquo;</span>.
      </p>
      )}

      {/* Voice Recorder Hub */}
      <div
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-card, 20px)',
          background: 'var(--bg-surface-elevated, #F8F8F6)',
          padding: '1.75rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          textAlign: 'center',
        }}
      >
        {!typedMode && (<>
        {/* Pulsing Mic Circle Button */}
        <button
          type="button"
          className="btn-icon-round"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={parsing}
          aria-label={isRecording ? 'Stop recording voice' : 'Start recording voice'}
          title={isRecording ? 'Stop recording voice' : 'Start recording voice'}
          style={{
            width: '76px',
            height: '76px',
            border: isRecording ? '2px solid var(--color-warning, #B45309)' : '2px solid var(--color-ink, #14151A)',
            background: isRecording ? '#FEF3C7' : 'var(--color-ink, #14151A)',
            color: isRecording ? 'var(--color-warning, #B45309)' : '#FFFFFF',
            fontSize: '1.75rem',
            transform: isRecording ? 'scale(1.05)' : undefined,
            boxShadow: isRecording ? '0 0 0 8px rgba(180, 83, 9, 0.15)' : 'none',
          }}
        >
          {isRecording ? '⏹' : '🎙️'}
        </button>

        {/* Status text */}
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
            {isRecording ? 'Listening... Speak your expense now' : 'Tap to Record Voice'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {isRecording ? 'Tap stop when finished speaking' : speechSupported ? 'Microphone is ready' : 'Or type your note below'}
          </div>
        </div>

        </>)}

        {/* Live / Typed Transcript Box */}
        <div style={{ width: '100%' }}>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={
              isRecording
                ? 'Listening to your voice...'
                : 'Your spoken transcript will appear here. Or type your note...'
            }
            rows={2}
            className="form-input"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 'var(--radius-input, 14px)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              fontSize: '0.92rem',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Parse Button (if not parsed yet) */}
        {!draft && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {isRecording ? (
              <Button
                variant="primary"
                onClick={() => {
                  stopRecording();
                  setTimeout(() => handleParseText(), 200);
                }}
              >
                Stop & Analyze
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => handleParseText()}
                disabled={parsing || !transcript.trim()}
                loading={parsing}
              >
                {typedMode ? 'Analyze \u2192' : 'Analyze Voice Note \u2192'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Inline Error */}
      {error && (
        <div
          role="alert"
          style={{
            fontSize: '0.85rem',
            color: 'var(--color-warning)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            borderRadius: 'var(--radius-input, 14px)',
            background: 'rgba(180, 83, 9, 0.08)',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Structured Draft Review Card */}
      {draft && (
        <form
          onSubmit={handleSaveExpense}
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-card, 20px)',
            padding: '1.25rem 1.4rem',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
              }}
            >
              Extracted Details
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(null);
                setTranscript('');
              }}
              style={{
                fontSize: '0.8rem',
                textDecoration: 'underline',
              }}
            >
              Record again
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Input
              label="Amount (₹)"
              type="number"
              step="any"
              min="0.01"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              required
            />
            <div className="input-field">
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '0.88rem',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                Category
              </label>
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="form-input"
                style={{
                  width: '100%',
                  height: '52px',
                  padding: '0 16px',
                  borderRadius: 'var(--radius-input, 14px)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.95rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Description"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description of the expense"
          />

          <Input
            label="Date"
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            required
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.25rem' }}>
            {onCancel && (
              <Button variant="secondary" onClick={onCancel} type="button">
                Cancel
              </Button>
            )}
            <Button variant="primary" type="submit" loading={saving} disabled={saving}>
              Confirm & Add Expense
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

export default VoiceExpenseRecorder;
