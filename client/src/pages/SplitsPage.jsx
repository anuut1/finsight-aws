import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import BalanceChip from '../components/BalanceChip.jsx';
import Modal from '../components/Modal.jsx';
import TripModeWidget from '../components/TripModeWidget.jsx';
import UpiSettlementModal from '../components/UpiSettlementModal.jsx';
import PayAndSplitModal from '../components/PayAndSplitModal.jsx';
import Button from '../components/Button.jsx';
import ReceiptThumbnail from '../components/ReceiptThumbnail.jsx';
import ItemClaimModal from '../components/ItemClaimModal.jsx';
import api from '../api/axios.js';
import useAuth from '../hooks/useAuth.js';

const today = new Date().toISOString().slice(0, 10);

const resolveMemberName = (group, memberId) => {
  const member = (group?.members || []).find((m) => m._id?.toString() === memberId?.toString());
  return member?.name || 'Member';
};

const emptyGroupForm = {
  name: '',
  members: 'You\nFriend',
};

const emptyExpenseForm = {
  description: '',
  amount: '',
  paidBy: '',
  splitBetween: [],
  date: today,
  category: 'Shared',
  syncPersonal: true,
};

const emptySettlementForm = {
  from: '',
  to: '',
  amount: '',
  date: today,
  note: '',
};

const currency = (value) => `₹${Number(value || 0).toFixed(0)}`;

const SplitsPage = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [settlementForm, setSettlementForm] = useState(emptySettlementForm);
  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [upiDebt, setUpiDebt] = useState(null);
  const [friends, setFriends] = useState([]);

  const [pendingInvites, setPendingInvites] = useState([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCopied, setInviteCopied] = useState('');
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState('');

  const selectedGroup = useMemo(
    () => groups.find((group) => group._id === selectedGroupId) || groups[0],
    [groups, selectedGroupId]
  );

  useEffect(() => {
    if (!user || groupForm.members !== emptyGroupForm.members) return;

    const userLine = `${user.name || 'You'}${user.email ? `, ${user.email}` : ''}`;
    setGroupForm((prev) => ({ ...prev, members: `${userLine}\nFriend` }));
  }, [groupForm.members, user]);

  const fetchFriends = async () => {
    try {
      const res = await api.get('/friends');
      if (res.data?.success) setFriends(res.data.data || []);
    } catch (e) {
      console.warn('Could not load friends:', e.message);
    }
  };

  const fetchPendingInvites = async () => {
    try {
      const res = await api.get('/splits/invites/pending');
      if (res.data?.success) {
        setPendingInvites(res.data.data || []);
      }
    } catch (e) {
      console.warn('Could not load pending invites:', e.message);
    }
  };

  const fetchGroups = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/splits/groups');
      if (res.data?.success) {
        setGroups(res.data.data);
        setSelectedGroupId((current) => current || res.data.data[0]?._id || '');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load split groups');
    } finally {
      setLoading(false);
    }
  };

  const [drafts, setDrafts] = useState([]);
  const [payAndSplitOpen, setPayAndSplitOpen] = useState(false);
  const [draftAssignModalOpen, setDraftAssignModalOpen] = useState(false);
  const [activeDraft, setActiveDraft] = useState(null);
  const [draftAssignMode, setDraftAssignMode] = useState('assign'); // 'assign' | 'poll'
  const [draftAssignForm, setDraftAssignForm] = useState({
    paidBy: '',
    splitBetween: [],
    syncPersonal: true,
  });

  const [bills, setBills] = useState([]);
  const [selectedBillId, setSelectedBillId] = useState(null);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);

  const fetchDrafts = async (groupId) => {
    if (!groupId) return;
    try {
      const res = await api.get(`/splits/groups/${groupId}/upi-drafts`);
      if (res.data?.success) {
        setDrafts(res.data.data || []);
      }
    } catch (e) {
      console.warn('Could not load UPI drafts:', e.message);
    }
  };

  const fetchBills = async (groupId) => {
    if (!groupId) return;
    try {
      const res = await api.get(`/splits/groups/${groupId}/bills`);
      if (res.data?.success) {
        setBills(res.data.data || []);
      }
    } catch (e) {
      console.warn('Could not load bills:', e.message);
    }
  };

  useEffect(() => {
    if (selectedGroupId) {
      fetchDrafts(selectedGroupId);
      fetchBills(selectedGroupId);
    }
  }, [selectedGroupId]);

  // Handle PWA Web Share Target query parameters (?title=...&text=...&url=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedText = params.get('text') || params.get('title') || '';
    if (sharedText && selectedGroup?._id) {
      // Auto-open Pay & Split with the shared text
      setPayAndSplitOpen(true);
      // Clean query params so refreshing doesn't re-trigger
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [selectedGroup]);

  useEffect(() => {
    fetchGroups();
    fetchFriends();
    fetchPendingInvites();
  }, []);

  const handleAcceptInvite = async (inviteId) => {
    setError('');
    try {
      const res = await api.post(`/splits/invites/${inviteId}/accept`);
      if (res.data?.success) {
        setPendingInvites((prev) => prev.filter((i) => i.inviteId !== inviteId));
        await fetchGroups();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to accept invite');
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    setError('');
    try {
      const res = await api.post(`/splits/invites/${inviteId}/decline`);
      if (res.data?.success) {
        setPendingInvites((prev) => prev.filter((i) => i.inviteId !== inviteId));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to decline invite');
    }
  };

  const handleInviteMember = async (targetEmail, targetName) => {
    if (!selectedGroup) return;
    const emailToInvite = (targetEmail || inviteEmail).trim();
    if (!emailToInvite) {
      setError('Please provide an email to invite');
      return;
    }
    setSaving(true);
    setError('');
    setInviteSuccessMsg('');
    try {
      const res = await api.post(`/splits/groups/${selectedGroup._id}/invites`, {
        email: emailToInvite,
        name: targetName || undefined,
      });
      if (res.data?.success) {
        setInviteSuccessMsg(`Invite sent to ${emailToInvite}!`);
        if (res.data.data?.inviteLink) {
          setInviteCopied(res.data.data.inviteLink);
        }
        setInviteEmail('');
        replaceGroup(res.data.data.group);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send invite');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    if (!selectedGroup) return;
    if (!window.confirm(`Remove ${memberName} from this group?`)) return;
    setError('');
    try {
      const res = await api.delete(`/splits/groups/${selectedGroup._id}/members/${memberId}`);
      if (res.data?.success) {
        replaceGroup(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove member');
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedGroup) return;
    if (!window.confirm(`Leave group "${selectedGroup.name}"? You must be fully settled up.`)) return;
    setError('');
    try {
      const res = await api.post(`/splits/groups/${selectedGroup._id}/leave`);
      if (res.data?.success) {
        setGroups((prev) => prev.filter((g) => g._id !== selectedGroup._id));
        setSelectedGroupId('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to leave group');
    }
  };

  const handleOpenDraftAssign = (draft, initialMode = 'assign') => {
    if (!selectedGroup) return;
    setActiveDraft(draft);
    setDraftAssignMode(initialMode);
    const memberIds = selectedGroup.members.map((m) => m._id);
    setDraftAssignForm({
      paidBy: memberIds[0] || '',
      splitBetween: memberIds,
      syncPersonal: true,
    });
    setDraftAssignModalOpen(true);
  };

  const handleDismissDraft = async (draftId) => {
    if (!selectedGroup || !window.confirm('Dismiss this draft?')) return;
    try {
      const res = await api.post(`/splits/groups/${selectedGroup._id}/upi-drafts/${draftId}/dismiss`);
      if (res.data?.success) {
        setDrafts((prev) => prev.filter((d) => d._id !== draftId));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to dismiss draft');
    }
  };

  const handleConfirmDraftAssign = async (e) => {
    e.preventDefault();
    if (!selectedGroup || !activeDraft) return;
    setSaving(true);
    setError('');
    try {
      if (draftAssignMode === 'poll') {
        const res = await api.post(
          `/splits/groups/${selectedGroup._id}/upi-drafts/${activeDraft._id}/assign`,
          {
            mode: 'poll',
            paidBy: draftAssignForm.paidBy,
            question: `Did you share the expense of ₹${activeDraft.amount} at ${activeDraft.cleanMerchant}?`,
          }
        );
        if (res.data?.success) {
          setDrafts((prev) =>
            prev.map((d) => (d._id === activeDraft._id ? res.data.data : d))
          );
          setDraftAssignModalOpen(false);
        }
      } else {
        const res = await api.post(
          `/splits/groups/${selectedGroup._id}/upi-drafts/${activeDraft._id}/assign`,
          {
            mode: 'assign',
            paidBy: draftAssignForm.paidBy,
            splitBetween: draftAssignForm.splitBetween,
            syncPersonal: draftAssignForm.syncPersonal,
          }
        );
        if (res.data?.success) {
          setDrafts((prev) => prev.filter((d) => d._id !== activeDraft._id));
          if (res.data.data?.group) replaceGroup(res.data.data.group);
          setDraftAssignModalOpen(false);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign draft');
    } finally {
      setSaving(false);
    }
  };

  const handleVoteDraftPoll = async (draftId, response) => {
    if (!selectedGroup) return;
    setError('');
    try {
      const res = await api.post(`/splits/groups/${selectedGroup._id}/upi-drafts/${draftId}/poll/respond`, {
        response,
      });
      if (res.data?.success) {
        setDrafts((prev) => prev.map((d) => (d._id === draftId ? res.data.data : d)));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit poll response');
    }
  };

  const handleCloseDraftPoll = async (draft) => {
    if (!selectedGroup) return;
    const optedInCount = draft.poll?.options?.filter((o) => o.status === 'opted_in').length || 0;
    if (optedInCount <= 1) {
      if (!window.confirm("Nobody else joined — convert to a personal expense for the payer?")) {
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/splits/groups/${selectedGroup._id}/upi-drafts/${draft._id}/poll/close`, {
        syncPersonal: true,
      });
      if (res.data?.success) {
        setDrafts((prev) => prev.filter((d) => d._id !== draft._id));
        if (res.data.data?.group) replaceGroup(res.data.data.group);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to close poll');
    } finally {
      setSaving(false);
    }
  };

  const toggleFriendInGroup = (friend) => {
    const friendEntry = `${friend.name}, ${friend.email || ''}`.replace(/,\s*$/, '');
    const currentLines = groupForm.members.split('\n').map((l) => l.trim()).filter(Boolean);
    const existsIndex = currentLines.findIndex(
      (l) =>
        l.toLowerCase() === friendEntry.toLowerCase() ||
        (friend.email && l.toLowerCase().includes(friend.email.toLowerCase())) ||
        l.toLowerCase() === friend.name.toLowerCase()
    );

    if (existsIndex >= 0) {
      currentLines.splice(existsIndex, 1);
    } else {
      currentLines.push(friendEntry);
    }
    setGroupForm((prev) => ({ ...prev, members: currentLines.join('\n') }));
  };

  const replaceGroup = (updatedGroup) => {
    setGroups((prev) => prev.map((group) => (group._id === updatedGroup._id ? updatedGroup : group)));
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const members = groupForm.members
        .split('\n')
        .map((line) => {
          const [name, email = ''] = line.split(',');
          const cleanName = name.trim();
          const cleanEmail = email.trim();
          const matched = friends.find(
            (f) =>
              (cleanEmail && f.email?.toLowerCase() === cleanEmail.toLowerCase()) ||
              (f.name && f.name.toLowerCase() === cleanName.toLowerCase())
          );
          return {
            name: cleanName,
            email: cleanEmail,
            userId: matched?.userId || undefined,
          };
        })
        .filter((member) => member.name);

      const res = await api.post('/splits/groups', {
        name: groupForm.name,
        members,
      });

      if (res.data?.success) {
        setGroups((prev) => [res.data.data, ...prev]);
        setSelectedGroupId(res.data.data._id);
        setGroupForm(emptyGroupForm);
        setGroupModalOpen(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  const openExpenseModal = () => {
    if (!selectedGroup) return;
    const memberIds = selectedGroup.members.map((member) => member._id);
    setExpenseForm({
      ...emptyExpenseForm,
      paidBy: memberIds[0] || '',
      splitBetween: memberIds,
    });
    setExpenseModalOpen(true);
  };

  const handleExpenseChange = (e) => {
    const { name, value } = e.target;
    setExpenseForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleSplitMember = (memberId) => {
    setExpenseForm((prev) => {
      const selected = prev.splitBetween.includes(memberId);
      return {
        ...prev,
        splitBetween: selected
          ? prev.splitBetween.filter((id) => id !== memberId)
          : [...prev.splitBetween, memberId],
      };
    });
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!selectedGroup) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/splits/groups/${selectedGroup._id}/expenses`, {
        ...expenseForm,
        amount: Number(expenseForm.amount),
        syncPersonal: expenseForm.syncPersonal,
      });

      if (res.data?.success) {
        replaceGroup(res.data.data);
        setExpenseModalOpen(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add shared expense');
    } finally {
      setSaving(false);
    }
  };

  const openSettlementModal = (debt) => {
    setSettlementForm({
      from: debt?.from || selectedGroup?.members[0]?._id || '',
      to: debt?.to || selectedGroup?.members[1]?._id || '',
      amount: debt?.amount || '',
      date: today,
      note: '',
    });
    setSettlementModalOpen(true);
  };

  const handleAddSettlement = async (e) => {
    e.preventDefault();
    if (!selectedGroup) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/splits/groups/${selectedGroup._id}/settlements`, {
        ...settlementForm,
        amount: Number(settlementForm.amount),
      });

      if (res.data?.success) {
        replaceGroup(res.data.data);
        setSettlementModalOpen(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record settlement');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup || !window.confirm('Delete this split group?')) return;
    try {
      const res = await api.delete(`/splits/groups/${selectedGroup._id}`);
      if (res.data?.success) {
        setGroups((prev) => prev.filter((group) => group._id !== selectedGroup._id));
        setSelectedGroupId('');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete group');
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Split Expenses</h1>
          <p className="text-muted" style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
            Split shared bills and sync only your share into personal budgets.
          </p>
        </div>
        <Button type="button" variant="primary" onClick={() => setGroupModalOpen(true)}>
          + New group
        </Button>
      </div>

      {/* Trip Mode Banner & Settlement Tool */}
      <TripModeWidget
        onTripChanged={() => {
          fetchGroups();
          if (selectedGroupId) {
            fetchDrafts(selectedGroupId);
            fetchBills(selectedGroupId);
          }
        }}
      />

      {/* Pending Group Invites Banner */}
      {pendingInvites.length > 0 && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.9rem 1.1rem',
            borderRadius: 'var(--radius-md, 12px)',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            ✉️ Group Invitations ({pendingInvites.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pendingInvites.map((invite) => (
              <div
                key={invite.inviteId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm, 8px)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-color)',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{invite.groupName}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                    Invited by {invite.invitedBy?.name || 'Group Owner'} ({invite.invitedBy?.email || ''})
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleAcceptInvite(invite.inviteId)}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDeclineInvite(invite.inviteId)}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.6rem 0.9rem',
            borderRadius: 999,
            background: 'rgba(255, 107, 107, 0.1)',
            color: 'var(--accent-red)',
            fontSize: '0.8rem',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <Card style={{ padding: '1rem 1.2rem' }}>
          <p className="text-muted" style={{ margin: 0 }}>
            Loading split groups...
          </p>
        </Card>
      ) : groups.length === 0 ? (
        <Card style={{ padding: '1.2rem 1.4rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>No groups yet</h2>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            Create a group for a trip, room, dinner, or project to start splitting costs.
          </p>
          <Button type="button" variant="primary" onClick={() => setGroupModalOpen(true)}>
            Create your first group
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: '1rem' }}>
          <Card style={{ padding: '0.9rem' }}>
            <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              Groups
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {groups.map((group) => (
                <button
                  key={group._id}
                  type="button"
                  className="btn-group-select"
                  onClick={() => setSelectedGroupId(group._id)}
                  style={{
                    textAlign: 'left',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md, 12px)',
                    border:
                      selectedGroup?._id === group._id
                        ? '1px solid var(--color-accent)'
                        : '1px solid var(--border-color)',
                    background:
                      selectedGroup?._id === group._id
                        ? 'var(--color-accent-subtle)'
                        : 'var(--bg-surface-elevated)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{group.name}</span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        textTransform: 'uppercase',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: group.userRole === 'owner' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                        color: group.userRole === 'owner' ? 'var(--accent-primary, #6366F1)' : 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {group.userRole || 'member'}
                    </span>
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                    {group.members.length} members · {group.expenses.length} expenses
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {selectedGroup && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Trip / Group Header Card */}
              <Card style={{ padding: '1.25rem 1.4rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{selectedGroup.isTrip ? '✈️' : '👥'}</span>
                      <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {selectedGroup.name}
                      </h2>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          background: selectedGroup.canManage ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                          color: selectedGroup.canManage ? 'var(--accent-primary, #6366F1)' : 'var(--text-muted)',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        {selectedGroup.userRole === 'owner' ? 'Owner' : 'Member'}
                      </span>
                      {selectedGroup.isTrip && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-positive-bg)',
                            color: 'var(--color-positive)',
                            border: '1px solid var(--color-positive-border)',
                          }}
                        >
                          Trip Active
                        </span>
                      )}
                    </div>

                    {/* Member Avatars Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '0.65rem' }}>
                      <div style={{ display: 'flex', marginLeft: '6px' }}>
                        {selectedGroup.members.map((m, idx) => (
                          <div
                            key={m._id || m.name}
                            title={`${m.name} (${m.email || 'No email'}) - ${m.role || 'member'}`}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: 'var(--bg-surface-elevated)',
                              border: '2px solid var(--bg-surface)',
                              color: 'var(--accent-primary-light)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              marginLeft: idx === 0 ? 0 : '-8px',
                              boxShadow: 'var(--shadow-xs)',
                            }}
                          >
                            {(m.name || '?')[0].toUpperCase()}
                          </div>
                        ))}
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                        {selectedGroup.members.length} members &bull; Total spent:{' '}
                        <strong className="num-tabular" style={{ color: 'var(--text-primary)' }}>
                          ₹{selectedGroup.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0).toLocaleString('en-IN')}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button type="button" variant="primary" onClick={openExpenseModal}>
                      + Expense
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openSettlementModal()}
                    >
                      Record Settle
                    </Button>
                    {selectedGroup.canManage ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setInviteSuccessMsg('');
                            setInviteCopied('');
                            setInviteModalOpen(true);
                          }}
                        >
                          + Invite Member
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={handleDeleteGroup}
                        >
                          Delete Group
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleLeaveGroup}
                      >
                        Leave Group
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              {/* Active Itemized Bills ("Split by Items") */}
              {bills.filter((b) => b.status === 'claiming').length > 0 && (
                <Card style={{ padding: '1.1rem 1.3rem', border: '1px solid rgba(99, 102, 241, 0.4)', background: 'rgba(99, 102, 241, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>🧾</span>
                      <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Active Itemized Bills ({bills.filter((b) => b.status === 'claiming').length})
                      </h3>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Collaborative item claiming · integer-paise split
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {bills.filter((b) => b.status === 'claiming').map((bill) => {
                      const totalClaimedUnits = (bill.items || []).reduce(
                        (sum, it) => sum + (it.claims || []).reduce((s, c) => s + (Number(c.units) || 0), 0),
                        0
                      );
                      const totalUnits = (bill.items || []).reduce((sum, it) => sum + (Number(it.qty) || 1), 0);

                      return (
                        <div
                          key={bill._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                            padding: '0.85rem 1rem',
                            borderRadius: 'var(--radius-sm, 8px)',
                            background: 'var(--bg-surface, #FFFFFF)',
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {bill.receiptKey && (
                              <ReceiptThumbnail
                                groupId={selectedGroup._id}
                                receiptKey={bill.receiptKey}
                                size="md"
                                alt={`Receipt for ${bill.title}`}
                              />
                            )}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    background: 'var(--accent-primary, #6366F1)',
                                    color: '#fff',
                                  }}
                                >
                                  BY ITEMS
                                </span>
                                <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                  {bill.title}
                                </span>
                                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent-primary, #6366F1)' }}>
                                  ₹{Number(bill.total).toLocaleString('en-IN')}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                                {bill.items?.length || 0} line items · {totalClaimedUnits}/{totalUnits} units claimed · Paid by {resolveMemberName(selectedGroup, bill.paidBy)}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setSelectedBillId(bill._id);
                                setIsClaimModalOpen(true);
                              }}
                            >
                              Claim Items
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Captured UPI Drafts (Always Draft, never auto-saved) */}
              {drafts.length > 0 && (
                <Card style={{ padding: '1.1rem 1.3rem', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>⚡</span>
                      <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Captured Payment Drafts ({drafts.length})
                      </h3>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Requires review · not counted in balances until confirmed
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {drafts.map((draft) => {
                      const isPoll = draft.status === 'poll_created' && draft.poll && !draft.poll.closed;
                      if (isPoll) {
                        const optedIn = draft.poll.options?.filter((o) => o.status === 'opted_in') || [];
                        const countIn = optedIn.length || 1;
                        const perPersonEstimate = (Number(draft.amount) / countIn).toFixed(2);

                        return (
                          <div
                            key={draft._id}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.65rem',
                              padding: '0.85rem 1rem',
                              borderRadius: 'var(--radius-sm, 8px)',
                              background: 'rgba(99, 102, 241, 0.06)',
                              border: '1px solid rgba(99, 102, 241, 0.35)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {draft.receiptKey && (
                                  <ReceiptThumbnail
                                    groupId={selectedGroup._id}
                                    receiptKey={draft.receiptKey}
                                    size="md"
                                    alt={`Receipt for ${draft.cleanMerchant}`}
                                  />
                                )}
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--accent-primary, #6366F1)', color: '#fff' }}>
                                      POLL IN PROGRESS
                                    </span>
                                    <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                      {draft.cleanMerchant}
                                    </span>
                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent-primary, #6366F1)' }}>
                                      ₹{Number(draft.amount).toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                                    {draft.poll.question}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleCloseDraftPoll(draft)}
                                  title="Close poll and split among opted-in members with exact integer-paise math"
                                >
                                  Close & Split (₹{perPersonEstimate}/ea)
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDismissDraft(draft._id)}
                                >
                                  Dismiss
                                </Button>
                              </div>
                            </div>

                            {/* Member vote breakdown chips */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Responses:</span>
                              {draft.poll.options?.map((opt) => {
                                const isIn = opt.status === 'opted_in';
                                const isOut = opt.status === 'opted_out';
                                const bg = isIn
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : isOut
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : 'rgba(255, 255, 255, 0.05)';
                                const color = isIn
                                  ? 'var(--color-positive, #10B981)'
                                  : isOut
                                  ? 'var(--color-negative, #EF4444)'
                                  : 'var(--text-muted)';
                                const icon = isIn ? '✓ ' : isOut ? '✕ ' : '⏱ ';
                                return (
                                  <span
                                    key={opt.memberId}
                                    style={{
                                      fontSize: '0.73rem',
                                      padding: '2px 8px',
                                      borderRadius: '999px',
                                      background: bg,
                                      color: color,
                                      border: `1px solid ${color}40`,
                                      fontWeight: 500,
                                    }}
                                  >
                                    {icon}{opt.name}
                                  </span>
                                );
                              })}
                            </div>

                            {/* Voting buttons for current user */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.35rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                Your response:
                              </span>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => handleVoteDraftPoll(draft._id, 'opt_in')}
                              >
                                ✓ I was part of this
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleVoteDraftPoll(draft._id, 'opt_out')}
                              >
                                ✕ Not me
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={draft._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.65rem 0.9rem',
                            borderRadius: 'var(--radius-sm, 8px)',
                            background: 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-color)',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {draft.receiptKey && (
                              <ReceiptThumbnail
                                groupId={selectedGroup._id}
                                receiptKey={draft.receiptKey}
                                size="sm"
                                alt={`Receipt for ${draft.cleanMerchant}`}
                              />
                            )}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                  {draft.cleanMerchant}
                                </span>
                                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--accent-primary, #6366F1)' }}>
                                  ₹{Number(draft.amount).toLocaleString('en-IN')}
                                </span>
                              </div>
                              <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                                {draft.date ? new Date(draft.date).toLocaleDateString() : 'Today'} · {draft.category || 'Shared'}
                                {draft.payerVpa ? ` · ${draft.payerVpa}` : ''}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.45rem' }}>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenDraftAssign(draft, 'assign')}
                            >
                              Pick people
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenDraftAssign(draft, 'poll')}
                            >
                              Ask everyone
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDismissDraft(draft._id)}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Members Management Panel */}
              <Card style={{ padding: '1.1rem 1.3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Group Members</h3>
                  {selectedGroup.canManage && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setInviteSuccessMsg('');
                        setInviteCopied('');
                        setInviteModalOpen(true);
                      }}
                    >
                      + Invite
                    </Button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.65rem' }}>
                  {selectedGroup.members.map((m) => {
                    const balanceObj = selectedGroup.memberBalances?.find((b) => String(b.memberId) === String(m._id));
                    const isGroupCreator = selectedGroup.canManage;
                    const canRemove = isGroupCreator && m.role !== 'owner';
                    return (
                      <div
                        key={m._id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.6rem 0.8rem',
                          borderRadius: 'var(--radius-sm, 8px)',
                          background: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{m.name}</span>
                            <span
                              style={{
                                fontSize: '0.65rem',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: m.role === 'owner' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                                color: m.role === 'owner' ? 'var(--accent-primary, #6366F1)' : 'var(--text-muted)',
                              }}
                            >
                              {m.role || 'member'}
                            </span>
                            {m.status === 'pending' && (
                              <span style={{ fontSize: '0.65rem', color: '#F59E0B' }}>• pending</span>
                            )}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.email || 'No email provided'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {balanceObj && <BalanceChip amount={balanceObj.balance} />}
                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m._id, m.name)}
                              title="Remove member"
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '2px 6px',
                                fontSize: '0.78rem',
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Balances & Simplified Debts with Settle via UPI */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <Card style={{ padding: '1.2rem 1.3rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Member Balances</h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Net balance</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {selectedGroup.memberBalances.map((member) => (
                      <div
                        key={member.memberId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 0',
                          borderBottom: '1px solid var(--divider-color)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: 'var(--bg-surface-elevated)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {(member.name || '?')[0].toUpperCase()}
                          </div>
                          <span style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {member.name}
                          </span>
                        </div>
                        <BalanceChip amount={member.balance} />
                      </div>
                    ))}
                  </div>
                </Card>

                <Card style={{ padding: '1.2rem 1.3rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Who Owes Whom</h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Simplified settlement</span>
                  </div>
                  {selectedGroup.simplifiedDebts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--color-positive)', fontSize: '0.85rem' }}>
                      ✓ Everyone is completely settled!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {selectedGroup.simplifiedDebts.map((debt) => (
                        <div
                          key={`${debt.from}-${debt.to}-${debt.amount}`}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 10px',
                              borderRadius: 'var(--radius-sm, 8px)',
                              background: 'var(--bg-surface-elevated)',
                              border: '1px solid var(--border-color)',
                              flexWrap: 'wrap',
                              gap: '8px',
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {debt.fromName} owes {debt.toName}
                              </div>
                              <div className="num-tabular" style={{ fontSize: '0.8rem', color: 'var(--color-negative)', fontWeight: 700 }}>
                                ₹{Number(debt.amount).toLocaleString('en-IN')}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setUpiDebt(debt);
                                  setUpiModalOpen(true);
                                }}
                                title="Open UPI QR code / deep-link to settle via Google Pay, PhonePe, Paytm"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '5px 10px',
                                  background: 'linear-gradient(135deg, #10B981, #059669)',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  borderRadius: 'var(--radius-sm, 8px)',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  boxShadow: 'var(--shadow-xs)',
                                }}
                              >
                                ⚡ Settle via UPI
                              </button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => openSettlementModal(debt)}
                              >
                                Record
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </Card>
              </div>

              <Card style={{ padding: '1.25rem 1.4rem' }}>
                <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Shared expenses</h3>
                {selectedGroup.expenses.length === 0 ? (
                  <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                    No shared expenses yet.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr className="text-muted">
                          <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Date</th>
                          <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Description</th>
                          <th style={{ textAlign: 'center', paddingBottom: '0.5rem', width: '60px' }}>Receipt</th>
                          <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Paid by</th>
                          <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Split</th>
                          <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>My share</th>
                          <th style={{ textAlign: 'right', paddingBottom: '0.5rem' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...selectedGroup.expenses].reverse().map((expense) => (
                          <tr key={expense._id}>
                            <td style={{ padding: '0.55rem 0' }}>
                              {expense.date ? new Date(expense.date).toLocaleDateString() : 'Today'}
                            </td>
                            <td style={{ padding: '0.55rem 0' }}>{expense.description}</td>
                            <td style={{ padding: '0.55rem 0', textAlign: 'center' }}>
                              {expense.receiptKey ? (
                                <ReceiptThumbnail
                                  groupId={selectedGroup._id}
                                  receiptKey={expense.receiptKey}
                                  size="sm"
                                  alt={`Receipt for ${expense.description}`}
                                />
                              ) : (
                                <span className="text-muted" style={{ fontSize: '0.75rem' }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '0.55rem 0' }}>{expense.paidByName || 'Member'}</td>
                            <td className="text-muted" style={{ padding: '0.55rem 0' }}>
                              {(expense.splitBetweenNames || []).join(', ')}
                            </td>
                            <td style={{ padding: '0.55rem 0' }}>
                              {expense.syncPersonal && expense.personalShareAmount > 0 ? (
                                <span className="badge badge-positive">
                                  Synced {currency(expense.personalShareAmount)}
                                </span>
                              ) : (
                                <span className="text-muted">Not synced</span>
                              )}
                            </td>
                            <td style={{ padding: '0.55rem 0', textAlign: 'right' }}>
                              {currency(expense.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      <Modal title="Create split group" isOpen={groupModalOpen} onClose={() => setGroupModalOpen(false)}>
        <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>Group name</label>
            <input
              className="input-glass"
              value={groupForm.name}
              onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Goa trip"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
              Members, one per line
            </label>
            <textarea
              className="input-glass"
              value={groupForm.members}
              onChange={(e) => setGroupForm((prev) => ({ ...prev, members: e.target.value }))}
              placeholder="Name or Name, email@example.com"
              rows={5}
              style={{ borderRadius: 18, resize: 'vertical' }}
            />
            {friends.length > 0 && (
              <div style={{ marginTop: '0.4rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  One-tap add from friends:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.3rem' }}>
                  {friends.map((friend) => {
                    const isSelected = groupForm.members.toLowerCase().includes(friend.name.toLowerCase());
                    return (
                      <button
                        key={friend.userId}
                        type="button"
                        onClick={() => toggleFriendInGroup(friend)}
                        style={{
                          padding: '0.2rem 0.6rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          border: isSelected
                            ? '1px solid var(--accent-primary, #6366F1)'
                            : '1px solid var(--border-color)',
                          background: isSelected
                            ? 'rgba(99, 102, 241, 0.15)'
                            : 'rgba(255, 255, 255, 0.05)',
                          color: isSelected ? 'var(--accent-primary, #6366F1)' : 'var(--text-primary)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {friend.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <Button type="submit" variant="primary" loading={saving} fullWidth>
            Create group
          </Button>
        </form>
      </Modal>

      <Modal title="Add shared expense" isOpen={expenseModalOpen} onClose={() => setExpenseModalOpen(false)}>
        <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            className="input-glass"
            name="description"
            value={expenseForm.description}
            onChange={handleExpenseChange}
            placeholder="Description"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <input
              className="input-glass"
              type="number"
              name="amount"
              value={expenseForm.amount}
              onChange={handleExpenseChange}
              placeholder="Amount"
            />
            <input
              className="input-glass"
              type="date"
              name="date"
              value={expenseForm.date}
              onChange={handleExpenseChange}
            />
          </div>
          <input
            className="input-glass"
            name="category"
            value={expenseForm.category}
            onChange={handleExpenseChange}
            placeholder="Budget category, e.g. Food"
          />
          <select className="input-glass" name="paidBy" value={expenseForm.paidBy} onChange={handleExpenseChange}>
            {selectedGroup?.members.map((member) => (
              <option key={member._id} value={member._id}>
                Paid by {member.name}
              </option>
            ))}
          </select>
          <div>
            <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.4rem' }}>
              Split between
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {selectedGroup?.members.map((member) => (
                <label
                  key={member._id}
                  style={{
                    display: 'flex',
                    gap: '0.35rem',
                    alignItems: 'center',
                    padding: '0.45rem 0.7rem',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={expenseForm.splitBetween.includes(member._id)}
                    onChange={() => toggleSplitMember(member._id)}
                  />
                  {member.name}
                </label>
              ))}
            </div>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              padding: '0.65rem 0.8rem',
              borderRadius: 18,
              background: 'rgba(0,212,170,0.08)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={expenseForm.syncPersonal}
              onChange={(e) =>
                setExpenseForm((prev) => ({ ...prev, syncPersonal: e.target.checked }))
              }
            />
            Add only my share to personal expenses and budgets
          </label>
          <Button type="submit" variant="primary" loading={saving} fullWidth>
            Add expense
          </Button>
        </form>
      </Modal>

      <Modal title="Record settlement" isOpen={settlementModalOpen} onClose={() => setSettlementModalOpen(false)}>
        <form onSubmit={handleAddSettlement} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <select
            className="input-glass"
            value={settlementForm.from}
            onChange={(e) => setSettlementForm((prev) => ({ ...prev, from: e.target.value }))}
          >
            {selectedGroup?.members.map((member) => (
              <option key={member._id} value={member._id}>
                From {member.name}
              </option>
            ))}
          </select>
          <select
            className="input-glass"
            value={settlementForm.to}
            onChange={(e) => setSettlementForm((prev) => ({ ...prev, to: e.target.value }))}
          >
            {selectedGroup?.members.map((member) => (
              <option key={member._id} value={member._id}>
                To {member.name}
              </option>
            ))}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <input
              className="input-glass"
              type="number"
              value={settlementForm.amount}
              onChange={(e) => setSettlementForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount"
            />
            <input
              className="input-glass"
              type="date"
              value={settlementForm.date}
              onChange={(e) => setSettlementForm((prev) => ({ ...prev, date: e.target.value }))}
            />
          </div>
          <input
            className="input-glass"
            value={settlementForm.note}
            onChange={(e) => setSettlementForm((prev) => ({ ...prev, note: e.target.value }))}
            placeholder="Note"
          />
          <Button type="submit" variant="primary" loading={saving} fullWidth>
            Record settlement
          </Button>
        </form>
      </Modal>

      <Modal
        title={`Invite to ${selectedGroup?.name || 'group'}`}
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {inviteSuccessMsg && (
            <div
              style={{
                padding: '0.6rem 0.9rem',
                borderRadius: 'var(--radius-sm, 8px)',
                background: 'rgba(16, 185, 129, 0.1)',
                color: 'var(--color-positive, #10B981)',
                fontSize: '0.85rem',
              }}
            >
              ✓ {inviteSuccessMsg}
            </div>
          )}

          {inviteCopied && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Shareable invite link (expires in 7 days):
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  className="input-glass"
                  readOnly
                  value={inviteCopied}
                  style={{ fontSize: '0.78rem' }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(inviteCopied);
                    alert('Invite link copied to clipboard!');
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}

          {friends.length > 0 && (
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                Invite from your friends:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {friends.map((friend) => {
                  const alreadyMember = selectedGroup?.members.some(
                    (m) =>
                      (m.email && friend.email && m.email.toLowerCase() === friend.email.toLowerCase()) ||
                      (m.userId && friend.userId && String(m.userId) === String(friend.userId))
                  );
                  return (
                    <button
                      key={friend.userId}
                      type="button"
                      disabled={alreadyMember || saving}
                      onClick={() => handleInviteMember(friend.email, friend.name)}
                      style={{
                        padding: '0.3rem 0.75rem',
                        borderRadius: '999px',
                        fontSize: '0.78rem',
                        border: alreadyMember ? '1px dashed var(--border-color)' : '1px solid var(--accent-primary, #6366F1)',
                        background: alreadyMember ? 'transparent' : 'rgba(99, 102, 241, 0.1)',
                        color: alreadyMember ? 'var(--text-muted)' : 'var(--accent-primary, #6366F1)',
                        cursor: alreadyMember ? 'not-allowed' : 'pointer',
                        opacity: alreadyMember ? 0.6 : 1,
                      }}
                    >
                      {alreadyMember ? 'Already member: ' : '+ Invite '}
                      {friend.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleInviteMember();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Or invite by email
              </label>
              <input
                className="input-glass"
                type="email"
                placeholder="friend@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" loading={saving} fullWidth>
              Send Invitation
            </Button>
          </form>
        </div>
      </Modal>

      {/* Pay & Split Modal for Selected Group */}
      <PayAndSplitModal
        isOpen={payAndSplitOpen}
        onClose={() => setPayAndSplitOpen(false)}
        trip={selectedGroup}
        onDraftCreated={() => {
          if (selectedGroup?._id) fetchDrafts(selectedGroup._id);
        }}
      />

      {/* Draft Review & Assign Modal */}
      <Modal
        title={`Split ${activeDraft?.cleanMerchant || 'Draft Expense'}`}
        isOpen={draftAssignModalOpen}
        onClose={() => setDraftAssignModalOpen(false)}
      >
        {activeDraft && (
          <form onSubmit={handleConfirmDraftAssign} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Segmented Control: Pick people vs Ask everyone */}
            <div style={{ display: 'flex', borderRadius: 'var(--radius-md, 8px)', overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-surface-elevated)' }}>
              <button
                type="button"
                onClick={() => setDraftAssignMode('assign')}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  border: 'none',
                  background: draftAssignMode === 'assign' ? 'var(--accent-primary, #6366F1)' : 'transparent',
                  color: draftAssignMode === 'assign' ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                👥 Pick people
              </button>
              <button
                type="button"
                onClick={() => setDraftAssignMode('poll')}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  border: 'none',
                  background: draftAssignMode === 'poll' ? 'var(--accent-primary, #6366F1)' : 'transparent',
                  color: draftAssignMode === 'poll' ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                📊 Ask everyone (Poll)
              </button>
            </div>

            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm, 8px)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{activeDraft.cleanMerchant}</div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {activeDraft.category || 'Shared'} · {activeDraft.date ? new Date(activeDraft.date).toLocaleDateString() : 'Today'}
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-primary, #6366F1)' }}>
                ₹{Number(activeDraft.amount).toLocaleString('en-IN')}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Paid by
              </label>
              <select
                className="input-glass"
                value={draftAssignForm.paidBy}
                onChange={(e) => setDraftAssignForm((prev) => ({ ...prev, paidBy: e.target.value }))}
              >
                {selectedGroup?.members.map((member) => (
                  <option key={member._id} value={member._id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>

            {draftAssignMode === 'assign' ? (
              <>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Split between</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = selectedGroup.members.map((m) => m._id);
                        setDraftAssignForm((prev) => ({
                          ...prev,
                          splitBetween: prev.splitBetween.length === allIds.length ? [] : allIds,
                        }));
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: '0.72rem',
                        color: 'var(--accent-primary, #6366F1)',
                        cursor: 'pointer',
                      }}
                    >
                      {draftAssignForm.splitBetween.length === selectedGroup?.members.length ? 'Clear' : 'Select all'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {selectedGroup?.members.map((member) => {
                      const on = draftAssignForm.splitBetween.includes(member._id);
                      return (
                        <button
                          key={member._id}
                          type="button"
                          onClick={() =>
                            setDraftAssignForm((prev) => ({
                              ...prev,
                              splitBetween: on
                                ? prev.splitBetween.filter((id) => id !== member._id)
                                : [...prev.splitBetween, member._id],
                            }))
                          }
                          style={{
                            padding: '0.3rem 0.7rem',
                            borderRadius: '999px',
                            fontSize: '0.78rem',
                            border: on ? '1px solid var(--accent-primary, #6366F1)' : '1px solid var(--border-color)',
                            background: on ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            color: on ? 'var(--accent-primary, #6366F1)' : 'var(--text-primary)',
                            cursor: 'pointer',
                          }}
                        >
                          {on ? '✓ ' : '+ '}
                          {member.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    padding: '0.65rem 0.8rem',
                    borderRadius: 18,
                    background: 'rgba(0, 212, 170, 0.08)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={draftAssignForm.syncPersonal}
                    onChange={(e) =>
                      setDraftAssignForm((prev) => ({ ...prev, syncPersonal: e.target.checked }))
                    }
                  />
                  Add my share to personal budgets
                </label>

                <Button type="submit" variant="primary" loading={saving} fullWidth>
                  Confirm & Convert to Expense
                </Button>
              </>
            ) : (
              <>
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md, 8px)',
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary, #6366F1)' }}>
                    📊 Opt-in Poll Mode
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    Everyone in the group will be polled to answer <strong>"I was part of this"</strong> or <strong>"Not me"</strong>.
                    When closed, the expense will be divided down to the exact integer paise among confirmed participants.
                  </div>
                </div>

                <Button type="submit" variant="primary" loading={saving} fullWidth>
                  Start Poll for Everyone
                </Button>
              </>
            )}
          </form>
        )}
      </Modal>

      <UpiSettlementModal
        isOpen={upiModalOpen}
        onClose={() => setUpiModalOpen(false)}
        debt={upiDebt}
        groupId={selectedGroup?._id}
        groupName={selectedGroup?.name}
        onSettled={(updatedGroup) => {
          if (updatedGroup) replaceGroup(updatedGroup);
          else fetchGroups();
        }}
      />

      {isClaimModalOpen && selectedBillId && (
        <ItemClaimModal
          isOpen={isClaimModalOpen}
          onClose={() => {
            setIsClaimModalOpen(false);
            setSelectedBillId(null);
          }}
          trip={selectedGroup}
          billId={selectedBillId}
          onBillFinalized={() => {
            fetchGroups();
            if (selectedGroupId) {
              fetchBills(selectedGroupId);
              fetchDrafts(selectedGroupId);
            }
          }}
        />
      )}
    </>
  );
};

export default SplitsPage;
