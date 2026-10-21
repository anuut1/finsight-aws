import { useState, useEffect, useRef } from 'react';
import api from '../api/axios';
import Button from './Button.jsx';

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

const SAMPLE_PROMPTS = [
  'dinner 1200 with Riya and Aman, split equally',
  'uber 350 to office',
  'groceries 2450 yesterday',
  'salary 75000 credited',
];

const NaturalLanguageQuickAdd = ({ onTransactionCreated, compact = false, initialText = '' }) => {
  const [input, setInput] = useState(initialText);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [draft, setDraft] = useState(null); // The editable confirmation card state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Web Speech API state
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef(null);

  // Optional split groups from existing API
  const [splitGroups, setSplitGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [activeTrip, setActiveTrip] = useState(null);

  useEffect(() => {
    // Check Web Speech API support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // Default to Indian English, versatile for INR context

      recognition.onstart = () => {
        setIsListening(true);
        setParseError('');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInput(transcript);
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setParseError('Microphone access was denied. Please allow microphone permissions.');
        } else if (event.error !== 'no-speech') {
          setParseError(`Voice error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    // Preload user's split groups and check for an active trip
    api.get('/splits/groups')
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setSplitGroups(res.data.data);
        }
      })
      .catch(() => {});

    api.get('/splits/trips/active')
      .then((res) => {
        if (res.data?.success && res.data.data) {
          setActiveTrip(res.data.data);
          setSelectedGroupId(res.data.data._id);
        }
      })
      .catch(() => {});

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

  useEffect(() => {
    if (initialText && initialText.trim()) {
      setInput(initialText);
      handleParse(initialText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  const toggleListening = () => {
    if (!speechSupported) {
      setParseError('Voice input is not supported in this browser. Please type your expense.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setParseError('');
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.warn('Could not start recognition:', err);
      }
    }
  };

  const handleParse = async (overrideText) => {
    const textToParse = (overrideText !== undefined ? overrideText : input).trim();
    if (!textToParse) {
      setParseError('Please enter or speak an expense description.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
    }

    setParsing(true);
    setParseError('');
    setSaveSuccess(false);

    try {
      const res = await api.post('/transactions/quick-add/parse', {
        text: textToParse,
        currentDate: new Date().toISOString().slice(0, 10),
      });

      if (res.data?.success && res.data.data) {
        const data = res.data.data;
        const isTripActive = Boolean(activeTrip && data.type !== 'income');
        const tripMemberNames = isTripActive
          ? activeTrip.members
              ?.map((m) => m.name)
              .filter((n) => !['you', 'me', 'myself', 'i', 'self'].includes(n.toLowerCase()))
              .join(', ')
          : '';

        // Populate the editable confirmation card draft
        setDraft({
          type: data.type || 'expense',
          amount: data.amount ?? 0,
          category: data.category || 'Food & Dining',
          date: data.date || new Date().toISOString().slice(0, 10),
          description: data.note || textToParse,
          mood: data.mood || 'neutral',
          isSplit: isTripActive || Boolean(data.isSplit),
          splitMembers: isTripActive
            ? tripMemberNames || (Array.isArray(data.splitMembers) ? data.splitMembers.join(', ') : '')
            : Array.isArray(data.splitMembers) ? data.splitMembers.join(', ') : '',
          splitType: data.splitType || 'equal',
          syncToGroup: isTripActive,
        });

        if (isTripActive && activeTrip._id) {
          setSelectedGroupId(activeTrip._id);
        }
      } else {
        setParseError('Failed to parse details. Please try rephrasing.');
      }
    } catch (err) {
      setParseError(err.response?.data?.message || 'Error communicating with parser service.');
    } finally {
      setParsing(false);
    }
  };

  const handleDraftChange = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleDiscard = () => {
    setDraft(null);
    setParseError('');
    setSaveSuccess(false);
  };

  // Strictly save ONLY upon explicit confirmation click
  const handleConfirmAndSave = async (asDraft = false) => {
    if (!draft) return;
    if (!draft.amount || Number(draft.amount) <= 0) {
      setParseError('Please enter a valid amount greater than 0.');
      return;
    }

    setSaving(true);
    setParseError('');

    try {
      // 1. Prepare base transaction payload
      const payload = {
        type: draft.type,
        category: draft.category,
        amount: Number(draft.amount),
        description: draft.description,
        date: draft.date,
        mood: draft.mood,
        tags: ['quick-add'],
        isDraft: asDraft,
        status: asDraft ? 'draft' : 'confirmed',
      };

      if (draft.isSplit && draft.splitMembers) {
        payload.tags.push('split');
        payload.description = `${draft.description} (Split with ${draft.splitMembers})`;
      }

      // 2. Save personal transaction
      const res = await api.post('/transactions', payload);

      // 3. If user opted to also record this in a Split Group and a group is selected
      if (draft.isSplit && draft.syncToGroup && selectedGroupId) {
        try {
          const group = splitGroups.find((g) => g._id === selectedGroupId);
          if (group && group.members?.length) {
            const memberIds = group.members.map((m) => m._id);
            const ownerId = group.ownerMemberId || memberIds[0];
            await api.post(`/splits/groups/${selectedGroupId}/expenses`, {
              description: draft.description,
              amount: Number(draft.amount),
              paidBy: ownerId,
              splitBetween: memberIds,
              date: draft.date,
              category: draft.category,
              syncPersonal: false, // already created personal transaction above
            });
          }
        } catch (splitErr) {
          console.warn('Could not automatically link to split group:', splitErr);
        }
      }

      if (res.data?.success) {
        setSaveSuccess(true);
        setDraft(null);
        setInput('');
        if (onTransactionCreated) {
          onTransactionCreated(res.data.data);
        }
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err) {
      setParseError(err.response?.data?.message || 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  // Helper calculation for split preview
  const parsedMembersList = draft?.splitMembers
    ? draft.splitMembers
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    : [];
  const totalParticipants = parsedMembersList.length + 1; // + 1 for current user
  const perPersonShare = draft?.amount && totalParticipants > 0 ? (Number(draft.amount) / totalParticipants).toFixed(2) : 0;

  return (
    <div
      className="glass-card"
      style={{
        padding: compact ? '1rem' : '1.25rem',
        borderRadius: 'var(--radius-xl)',
        marginBottom: '1.25rem',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
      }}
    >
      {/* Top Header / Instructions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.1rem' }}>✨</span>
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            Natural-Language Quick Add
          </span>
          <span
            style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(82, 85, 119, 0.15)',
              color: 'var(--accent-primary-light)',
              fontWeight: 600,
            }}
          >
            AI Assisted
          </span>
          {activeTrip && (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(16, 185, 129, 0.2)',
                color: 'var(--accent-success)',
                fontWeight: 700,
              }}
            >
              ✈️ Trip: {activeTrip.name} ({activeTrip.currency})
            </span>
          )}
        </div>
        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
          Never saved without your confirmation
        </span>
      </div>

      {/* Main Single Input Bar with Integrated Mic Button */}
      <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            className="input-glass"
            placeholder={
              isListening
                ? '🎙️ Listening... speak now (e.g. "dinner 1200 with Riya and Aman, split equally")'
                : 'Type e.g. "dinner 1200 with Riya and Aman, split equally" or tap mic...'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !parsing) {
                e.preventDefault();
                handleParse();
              }
            }}
            disabled={parsing}
            style={{
              paddingRight: '3rem',
              borderColor: isListening ? 'var(--accent-danger)' : undefined,
              boxShadow: isListening ? '0 0 0 3px rgba(239, 68, 68, 0.25)' : undefined,
            }}
          />

          {/* Microphone button inside the input */}
          <button
            type="button"
            className="btn-icon-round"
            onClick={toggleListening}
            aria-label={isListening ? 'Stop listening' : 'Speak via microphone'}
            title={isListening ? 'Click to stop listening' : 'Speak via microphone'}
            style={{
              position: 'absolute',
              right: '8px',
              width: '34px',
              height: '34px',
              border: isListening ? '2px solid var(--accent-danger)' : undefined,
              background: isListening
                ? 'var(--accent-danger, #ef4444)'
                : 'var(--bg-tertiary, rgba(82, 85, 119, 0.2))',
              color: isListening ? '#ffffff' : 'var(--text-primary)',
              boxShadow: isListening ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none',
            }}
          >
            {isListening ? '🛑' : '🎙️'}
          </button>
        </div>

        <Button
          type="button"
          variant="primary"
          onClick={() => handleParse()}
          disabled={parsing || !input.trim()}
          loading={parsing}
          style={{ minWidth: '95px' }}
        >
          Analyze
        </Button>
      </div>

      {/* Suggested examples pills */}
      {!draft && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.65rem', alignItems: 'center' }}>
          <span className="text-muted" style={{ fontSize: '0.72rem' }}>
            Try:
          </span>
          {SAMPLE_PROMPTS.map((prompt, idx) => (
            <Button
              key={idx}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setInput(prompt);
                handleParse(prompt);
              }}
              style={{
                fontSize: '0.72rem',
                padding: '0 10px',
                height: '28px',
                minHeight: '28px',
              }}
            >
              &ldquo;{prompt}&rdquo;
            </Button>
          ))}
        </div>
      )}

      {/* Error message */}
      {parseError && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--accent-danger)',
            fontSize: '0.8rem',
          }}
        >
          ⚠️ {parseError}
        </div>
      )}

      {/* Success alert */}
      {saveSuccess && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--color-income, #10b981)',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          ✅ Transaction successfully confirmed and saved!
        </div>
      )}

      {/* ======================================================== */}
      {/* EDITABLE CONFIRMATION CARD (Never save without confirm)  */}
      {/* ======================================================== */}
      {draft && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1.25rem',
            borderRadius: 'var(--radius-lg)',
            border: '2px solid var(--accent-primary-light)',
            background: 'var(--bg-primary)',
            boxShadow: 'var(--shadow-md)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {/* Card Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--divider-color)',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                Review & Confirm Transaction
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                Please inspect and adjust any field below before saving to your records.
              </div>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                background: draft.type === 'expense' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                color: draft.type === 'expense' ? 'var(--color-expense)' : 'var(--color-income)',
                textTransform: 'uppercase',
              }}
            >
              {draft.type}
            </span>
          </div>

          {/* Form Fields Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
            {/* Type toggle */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                TYPE
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Button
                  type="button"
                  variant={draft.type === 'expense' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleDraftChange('type', 'expense')}
                  style={{ flex: 1 }}
                >
                  Expense
                </Button>
                <Button
                  type="button"
                  variant={draft.type === 'income' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleDraftChange('type', 'income')}
                  style={{ flex: 1 }}
                >
                  Income
                </Button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                AMOUNT (₹)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                className="input-glass"
                value={draft.amount}
                onChange={(e) => handleDraftChange('amount', e.target.value)}
                style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Category */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                CATEGORY
              </label>
              <select
                className="input-glass"
                value={draft.category}
                onChange={(e) => handleDraftChange('category', e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                DATE
              </label>
              <input
                type="date"
                className="input-glass"
                value={draft.date}
                onChange={(e) => handleDraftChange('date', e.target.value)}
              />
            </div>
          </div>

          {/* Description & Mood */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '0.85rem', marginTop: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                NOTE / DESCRIPTION
              </label>
              <input
                type="text"
                className="input-glass"
                value={draft.description}
                onChange={(e) => handleDraftChange('description', e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                MOOD
              </label>
              <select
                className="input-glass"
                value={draft.mood}
                onChange={(e) => handleDraftChange('mood', e.target.value)}
              >
                <option value="happy">😄 Good</option>
                <option value="neutral">😐 Neutral</option>
                <option value="stressed">😓 Stressed</option>
              </select>
            </div>
          </div>

          {/* Split Section */}
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={draft.isSplit}
                  onChange={(e) => handleDraftChange('isSplit', e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <span>👥 Split this expense with others</span>
              </label>

              {draft.isSplit && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--accent-primary-light)',
                    fontWeight: 600,
                  }}
                >
                  Type: {draft.splitType}
                </span>
              )}
            </div>

            {draft.isSplit && (
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                    MEMBERS (comma-separated names, e.g. &ldquo;Riya, Aman&rdquo;)
                  </label>
                  <input
                    type="text"
                    className="input-glass"
                    placeholder="Enter member names..."
                    value={draft.splitMembers}
                    onChange={(e) => handleDraftChange('splitMembers', e.target.value)}
                  />
                </div>

                {/* Calculation preview pill */}
                {parsedMembersList.length > 0 && Number(draft.amount) > 0 && (
                  <div
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(82, 85, 119, 0.12)',
                      fontSize: '0.78rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      📊 Split among <strong>{totalParticipants}</strong> people (You + {parsedMembersList.join(', ')}):
                    </span>
                    <strong style={{ color: 'var(--accent-primary-light)' }}>
                      ₹{Number(perPersonShare).toLocaleString('en-IN')} / person
                    </strong>
                  </div>
                )}

                {/* Option to also sync with an existing Split Group */}
                {splitGroups.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={draft.syncToGroup}
                        onChange={(e) => handleDraftChange('syncToGroup', e.target.checked)}
                      />
                      <span>Sync to Split Group:</span>
                    </label>
                    {draft.syncToGroup && (
                      <select
                        className="input-glass"
                        style={{ padding: '4px 10px', fontSize: '0.8rem', width: 'auto' }}
                        value={selectedGroupId}
                        onChange={(e) => setSelectedGroupId(e.target.value)}
                      >
                        <option value="">Select a group...</option>
                        {splitGroups.map((g) => (
                          <option key={g._id} value={g._id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons: Confirm vs Discard */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              marginTop: '1.25rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid var(--divider-color)',
            }}
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDiscard}
              disabled={saving}
              style={{ padding: '8px 14px', fontSize: '0.82rem' }}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleConfirmAndSave(true)}
              disabled={saving || !draft.amount || Number(draft.amount) <= 0}
              style={{
                padding: '8px 14px',
                fontSize: '0.82rem',
                borderColor: '#6366F1',
                color: '#A5B4FC',
              }}
            >
              💾 Save as Draft
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleConfirmAndSave(false)}
              disabled={saving || !draft.amount || Number(draft.amount) <= 0}
              loading={saving}
              style={{
                padding: '9px 20px',
                fontSize: '0.85rem',
                fontWeight: 700,
                boxShadow: 'var(--shadow-md)',
              }}
            >
              ✓ Confirm & Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NaturalLanguageQuickAdd;
