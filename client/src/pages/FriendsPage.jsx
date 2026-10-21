import { useEffect, useState, useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import Modal from '../components/Modal.jsx';
import api from '../api/axios.js';

const FriendsPage = () => {
  const [searchParams] = useSearchParams();
  const urlFriendCode = searchParams.get('code') || '';

  const [activeTab, setActiveTab] = useState(urlFriendCode ? 'add' : 'friends'); // 'friends' | 'requests' | 'add'
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Personal code & link
  const [myCode, setMyCode] = useState('');
  const [myInviteLink, setMyInviteLink] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // QR Modal
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Add friend form
  const [addMethod, setAddMethod] = useState(urlFriendCode ? 'code' : 'email'); // 'email' | 'code'
  const [friendEmail, setFriendEmail] = useState('');
  const [friendCodeInput, setFriendCodeInput] = useState(urlFriendCode);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // IDs for accessibility
  const addByEmailRadioId = useId();
  const addByCodeRadioId = useId();
  const emailInputId = useId();
  const codeInputId = useId();

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchFriendsData = async () => {
    setLoading(true);
    setError('');
    try {
      const [friendsRes, requestsRes, codeRes] = await Promise.all([
        api.get('/friends'),
        api.get('/friends/requests'),
        api.get('/friends/my-code'),
      ]);

      if (friendsRes.data?.success) {
        setFriends(friendsRes.data.data || []);
      }
      if (requestsRes.data?.success) {
        setIncomingRequests(requestsRes.data.data?.incoming || []);
        setOutgoingRequests(requestsRes.data.data?.outgoing || []);
      }
      if (codeRes.data?.success) {
        setMyCode(codeRes.data.data?.friendCode || '');
        setMyInviteLink(codeRes.data.data?.inviteLink || '');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFriendsData();
  }, []);

  // Generate QR code whenever invite link changes or modal opens
  useEffect(() => {
    if (myInviteLink && qrModalOpen) {
      QRCode.toDataURL(myInviteLink, { width: 280, margin: 2 })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code generation error:', err));
    }
  }, [myInviteLink, qrModalOpen]);

  const handleCopyCode = () => {
    if (!myCode) return;
    navigator.clipboard.writeText(myCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleCopyLink = () => {
    if (!myInviteLink) return;
    navigator.clipboard.writeText(myInviteLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleSendFriendRequest = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmittingRequest(true);

    try {
      const payload = addMethod === 'email' ? { email: friendEmail.trim() } : { code: friendCodeInput.trim() };
      const res = await api.post('/friends/request', payload);

      if (res.data?.success) {
        setSuccessMsg(res.data.message || 'Friend request sent!');
        setFriendEmail('');
        setFriendCodeInput('');
        fetchFriendsData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send friend request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleAcceptRequest = async (friendshipId) => {
    setActionLoadingId(friendshipId);
    setError('');
    try {
      const res = await api.post(`/friends/${friendshipId}/accept`);
      if (res.data?.success) {
        setSuccessMsg('Friend request accepted');
        fetchFriendsData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to accept friend request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeclineRequest = async (friendshipId) => {
    setActionLoadingId(friendshipId);
    setError('');
    try {
      const res = await api.post(`/friends/${friendshipId}/decline`);
      if (res.data?.success) {
        fetchFriendsData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to decline request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemoveFriend = async (friendshipId, friendName) => {
    if (!window.confirm(`Are you sure you want to remove ${friendName || 'this friend'}?`)) {
      return;
    }
    setActionLoadingId(friendshipId);
    setError('');
    try {
      const res = await api.delete(`/friends/${friendshipId}`);
      if (res.data?.success) {
        fetchFriendsData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove friend');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredFriends = friends.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (f.name && f.name.toLowerCase().includes(q)) || (f.email && f.email.toLowerCase().includes(q));
  });

  const getInitials = (name) => {
    if (!name) return 'F';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '2.25rem',
              fontWeight: 400,
              color: 'var(--text-primary)',
              margin: '0 0 0.5rem 0',
              letterSpacing: '-0.02em',
            }}
          >
            Friends & Collaborators
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Connect with friends to split bills, collaborate on trips, and settle balances effortlessly.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="secondary" size="sm" onClick={() => setQrModalOpen(true)}>
            QR & Link
          </Button>
          <Button
            variant={activeTab === 'add' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(activeTab === 'add' ? 'friends' : 'add')}
          >
            + Add Friend
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '0.85rem 1.25rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--accent-danger, #EF4444)',
            borderRadius: '12px',
            color: 'var(--accent-danger, #EF4444)',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          style={{
            padding: '0.85rem 1.25rem',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid var(--accent-success, #10B981)',
            borderRadius: '12px',
            color: 'var(--accent-success, #10B981)',
            fontSize: '0.9rem',
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Quick Invite Code Strip */}
      <Card style={{ padding: '1.25rem 1.5rem', background: 'var(--bg-surface-secondary, rgba(255,255,255,0.03))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Your Invite Code
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                background: 'rgba(255,255,255,0.06)',
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                letterSpacing: '0.05em',
              }}
            >
              {myCode || 'Generating...'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Button variant="ghost" size="sm" onClick={handleCopyCode}>
              {codeCopied ? 'Code Copied!' : 'Copy Code'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCopyLink}>
              {linkCopied ? 'Link Copied!' : 'Copy Invite Link'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQrModalOpen(true)}>
              Show QR
            </Button>
          </div>
        </div>
      </Card>

      {/* Add Friend Form (Expandable or Tab) */}
      {activeTab === 'add' && (
        <Card style={{ padding: '1.75rem 2rem' }}>
          <h2
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.5rem',
              fontWeight: 400,
              color: 'var(--text-primary)',
              margin: '0 0 0.5rem 0',
            }}
          >
            Add a Friend
          </h2>
          <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Send a connection request by exact email address or friend invite code. If they do not have a FinSight account yet, we will safely send them an invitation email.
          </p>

          <form onSubmit={handleSendFriendRequest} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.92rem' }} htmlFor={addByEmailRadioId}>
                <input
                  id={addByEmailRadioId}
                  type="radio"
                  name="addMethod"
                  value="email"
                  checked={addMethod === 'email'}
                  onChange={() => setAddMethod('email')}
                />
                By Email Address
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.92rem' }} htmlFor={addByCodeRadioId}>
                <input
                  id={addByCodeRadioId}
                  type="radio"
                  name="addMethod"
                  value="code"
                  checked={addMethod === 'code'}
                  onChange={() => setAddMethod('code')}
                />
                By Friend Code
              </label>
            </div>

            {addMethod === 'email' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }} htmlFor={emailInputId}>
                  Friend's Exact Email Address
                </label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input
                    id={emailInputId}
                    type="email"
                    required
                    placeholder="friend@example.com"
                    value={friendEmail}
                    onChange={(e) => setFriendEmail(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.65rem 1rem',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-input, rgba(255,255,255,0.05))',
                      color: 'var(--text-primary)',
                      fontSize: '0.92rem',
                    }}
                  />
                  <Button type="submit" variant="primary" loading={submittingRequest} disabled={!friendEmail.trim()}>
                    Send Request
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }} htmlFor={codeInputId}>
                  Friend's Invite Code
                </label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input
                    id={codeInputId}
                    type="text"
                    required
                    placeholder="FS-ABC12345"
                    value={friendCodeInput}
                    onChange={(e) => setFriendCodeInput(e.target.value.toUpperCase())}
                    style={{
                      flex: 1,
                      padding: '0.65rem 1rem',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-input, rgba(255,255,255,0.05))',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.95rem',
                      textTransform: 'uppercase',
                    }}
                  />
                  <Button type="submit" variant="primary" loading={submittingRequest} disabled={!friendCodeInput.trim()}>
                    Connect Code
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Card>
      )}

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('friends')}
          style={{
            padding: '0.75rem 0.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'friends' ? '2px solid var(--text-primary)' : '2px solid transparent',
            color: activeTab === 'friends' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'friends' ? 600 : 400,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>Friends</span>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.1rem 0.5rem',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.08)',
            }}
          >
            {friends.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          style={{
            padding: '0.75rem 0.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'requests' ? '2px solid var(--text-primary)' : '2px solid transparent',
            color: activeTab === 'requests' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'requests' ? 600 : 400,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>Requests</span>
          {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '0.1rem 0.5rem',
                borderRadius: '999px',
                background: incomingRequests.length > 0 ? 'var(--accent-primary, #6366F1)' : 'rgba(255,255,255,0.08)',
                color: incomingRequests.length > 0 ? '#FFFFFF' : 'inherit',
              }}
            >
              {incomingRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* Friends Tab Content */}
      {activeTab === 'friends' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {friends.length > 0 && (
            <div style={{ maxWidth: '360px' }}>
              <input
                type="text"
                placeholder="Search friends by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-input, rgba(255,255,255,0.04))',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                }}
              />
            </div>
          )}

          {loading ? (
            <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading friends...
            </div>
          ) : filteredFriends.length === 0 ? (
            <Card style={{ padding: '3rem 2rem', textAlign: 'center' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                {friends.length === 0 ? 'No friends connected yet' : 'No matching friends found'}
              </p>
              <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {friends.length === 0
                  ? 'Connect with friends using their email address or share your personal invite link.'
                  : 'Try searching with a different name or email.'}
              </p>
              {friends.length === 0 && (
                <Button variant="primary" size="sm" onClick={() => setActiveTab('add')}>
                  + Add Your First Friend
                </Button>
              )}
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {filteredFriends.map((friend) => (
                <Card key={friend.friendshipId} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(friend.name)}
                    </div>

                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {friend.name}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {friend.email}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {friend.sharedGroupsCount > 0
                        ? `${friend.sharedGroupsCount} shared trip${friend.sharedGroupsCount > 1 ? 's' : ''}`
                        : 'No shared trips'}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleRemoveFriend(friend.friendshipId, friend.name)}
                      disabled={actionLoadingId === friend.friendshipId}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-danger, #EF4444)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        padding: '0.2rem 0.4rem',
                      }}
                    >
                      {actionLoadingId === friend.friendshipId ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Requests Tab Content */}
      {activeTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Incoming */}
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
              Incoming Requests ({incomingRequests.length})
            </h3>

            {incomingRequests.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                No pending incoming requests.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {incomingRequests.map((req) => (
                  <Card key={req.friendshipId} style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                        }}
                      >
                        {getInitials(req.requester?.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                          {req.requester?.name || 'A user'}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                          {req.requester?.email}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={actionLoadingId === req.friendshipId}
                        onClick={() => handleAcceptRequest(req.friendshipId)}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actionLoadingId === req.friendshipId}
                        onClick={() => handleDeclineRequest(req.friendshipId)}
                      >
                        Decline
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing */}
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
              Outgoing Requests ({outgoingRequests.length})
            </h3>

            {outgoingRequests.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                No pending outgoing requests.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {outgoingRequests.map((req) => (
                  <Card key={req.friendshipId} style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                        }}
                      >
                        {getInitials(req.recipient?.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                          {req.recipient?.name || 'Invited User'}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                          {req.recipient?.email}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Pending response
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actionLoadingId === req.friendshipId}
                        onClick={() => handleRemoveFriend(req.friendshipId, req.recipient?.name)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      <Modal isOpen={qrModalOpen} onClose={() => setQrModalOpen(false)} title="Scan to Connect">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '0.5rem 0' }}>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            Have your friend scan this QR code with their mobile camera to connect on FinSight instantly.
          </p>

          <div
            style={{
              padding: '1rem',
              background: '#FFFFFF',
              borderRadius: '16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Friend Invite QR Code" style={{ width: '240px', height: '240px', display: 'block' }} />
            ) : (
              <div style={{ width: '240px', height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                Generating QR...
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Invite Code:</span>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.05em' }}>
              {myCode}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', width: '100%', justifyContent: 'center' }}>
            <Button variant="secondary" size="sm" onClick={handleCopyLink}>
              {linkCopied ? 'Link Copied!' : 'Copy Direct Link'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setQrModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FriendsPage;
