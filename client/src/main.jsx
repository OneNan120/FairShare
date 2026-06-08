import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, Navigate, Route, BrowserRouter as Router, Routes, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, Check, Edit, LogOut, Menu, Plus, Receipt, Upload, WifiOff, X } from 'lucide-react';
import './styles.css';

const AuthContext = createContext(null);

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = new Error((await res.json().catch(() => ({}))).error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api('/api/auth/me')
      .then((data) => { if (active) setUser(data.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const value = useMemo(() => ({ user, setUser, loading }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  return useContext(AuthContext);
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="center">Loading FairShare...</main>;
  return user ? children : <Navigate to="/login" replace />;
}

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online ? null : <div className="offline"><WifiOff size={18} /> You are offline. Reconnect to load your latest expenses.</div>;
}

function Layout({ children }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const seenToastIds = useRef(new Set());
  useEffect(() => {
    if (!user) return undefined;
    const stream = new EventSource('/api/notifications/stream', { withCredentials: true });
    stream.onmessage = (event) => {
      const note = JSON.parse(event.data);
      if (!note.id || seenToastIds.current.has(note.id)) return;
      seenToastIds.current.add(note.id);
      setToasts((items) => [note, ...items].slice(0, 3));
      window.dispatchEvent(new CustomEvent('fairshare:notifications-updated'));
      window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== note.id)), 5000);
    };
    return () => stream.close();
  }, [user?.id]);
  function dismissToast(id) {
    setToasts((items) => items.filter((item) => item.id !== id));
  }
  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    seenToastIds.current.clear();
    setToasts([]);
    setUser(null);
    navigate('/login');
  }
  return (
    <>
      <header className="topbar">
        <div className="navLeft">
          <Link className="brand" to="/dashboard" onClick={() => setMenuOpen(false)}><Receipt /> FairShare</Link>
          <button className="menuButton ghost" type="button" aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((open) => !open)}><Menu size={18} /> Menu</button>
          <nav id="primary-navigation" className={`navLinks ${menuOpen ? 'open' : ''}`}>
            <Link to="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</Link>
            <Link to="/groups" onClick={() => setMenuOpen(false)}>Groups</Link>
            <Link to="/notifications" onClick={() => setMenuOpen(false)}><Bell size={18} /> Notifications</Link>
          </nav>
        </div>
        <button className="iconText logoutButton" onClick={logout}><LogOut size={18} /> Logout</button>
      </header>
      <OfflineBanner />
      <main className="shell">{children}</main>
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}><span>{t.message}</span><Link className="toastLink" to="/notifications" onClick={() => window.dispatchEvent(new CustomEvent('fairshare:notifications-updated'))}>View</Link><button aria-label="Dismiss notification" className="toastClose" onClick={() => dismissToast(t.id)}><X size={16} /></button></div>)}</div>
    </>
  );
}

function StatusPanel({ loading, error, empty, onRetry, children }) {
  if (loading) return <section className="panel"><p>Loading...</p></section>;
  if (error) return <section className="panel"><p className="error">{error}</p>{onRetry && <button onClick={onRetry}>Retry</button>}</section>;
  if (empty) return <Empty text={empty} />;
  return children;
}

function AuthForm({ mode }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      const data = await api(`/api/auth/${mode}`, { method: 'POST', body: form });
      setUser(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <main className="auth">
      <form className="panel" onSubmit={submit}>
        <h1>FairShare</h1>
        <p>AI-assisted receipt splitting for shared expenses.</p>
        {mode === 'register' && <label>Display name<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>}
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <p className="error">{error}</p>}
        <button>{mode === 'register' ? 'Create account' : 'Login'}</button>
        <Link to={mode === 'register' ? '/login' : '/register'}>{mode === 'register' ? 'Already have an account?' : 'Need an account?'}</Link>
      </form>
    </main>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [notes, setNotes] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [groupData, noteData, invitationData] = await Promise.all([api('/api/groups'), api('/api/notifications'), api('/api/invitations')]);
      setGroups(groupData);
      setNotes(noteData);
      setInvitations(invitationData);
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([api('/api/groups'), api('/api/notifications'), api('/api/invitations')])
      .then(([groupData, noteData, invitationData]) => {
        if (!active) return;
        setGroups(groupData);
        setNotes(noteData);
        setInvitations(invitationData);
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) navigate('/login');
        else setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function respond(invitation, action) {
    await api(`/api/invitations/${invitation.id}/${action}`, { method: 'POST' });
    load();
  }
  return (
    <Layout>
      <section className="sectionHead">
        <div><h1>Hello, {user.displayName}</h1><p>Assign receipt items, calculate fair splits, and keep approvals moving.</p></div>
        <Link className="button" to="/groups"><Plus size={18} /> New group</Link>
      </section>
      <StatusPanel loading={loading} error={error} onRetry={load}>
        <div className="grid">
          <section><h2>Your groups</h2>{groups.map((g) => <GroupCard key={g.id} group={g} />)}{!groups.length && <Empty text="Create a group to begin." />}</section>
          <section><h2>Invitations</h2>{invitations.map((i) => <article className="row" key={i.id}><span>{i.groupName}</span><span><button onClick={() => respond(i, 'accept')}>Accept</button><button className="ghost" onClick={() => respond(i, 'decline')}>Decline</button></span></article>)}{!invitations.length && <Empty text="No pending invitations." />}</section>
          <section><h2>Notification preview</h2>{notes.slice(0, 5).map((n) => <article className="row" key={n.id}>{n.message}</article>)}{!notes.length && <Empty text="No notifications yet." />}</section>
        </div>
      </StatusPanel>
    </Layout>
  );
}

function Empty({ text }) {
  return <p className="empty">{text}</p>;
}

function BackLink({ to, label = 'Back' }) {
  return <Link className="button ghost" to={to}><ArrowLeft size={18} /> {label}</Link>;
}

function approvalSummary(approvalStatus = {}) {
  const entries = Object.entries(approvalStatus);
  const pending = entries.filter(([, status]) => status !== 'approved');
  return { entries, pending, allApproved: entries.length > 0 && pending.length === 0 };
}

function GroupCard({ group }) {
  return <article className="card"><h3>{group.name}</h3><p>{group.members?.length || 0} members</p><Link to={`/groups/${group.id}`}>Open group</Link></article>;
}

function Groups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      setGroups(await api('/api/groups'));
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    api('/api/groups')
      .then((data) => { if (active) setGroups(data); })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) navigate('/login');
        else setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function create(e) {
    e.preventDefault();
    try {
      await api('/api/groups', { method: 'POST', body: { name } });
      setName('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <Layout>
      <section className="sectionHead"><h1>Groups</h1></section>
      <form className="inlineForm" onSubmit={create}><label>Group name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vegas Trip" /></label><button><Plus size={18} /> Create</button></form>
      <StatusPanel loading={loading} error={error} empty={!groups.length && 'No groups yet.'} onRetry={load}>
        <div className="cards">{groups.map((g) => <GroupCard key={g.id} group={g} />)}</div>
      </StatusPanel>
    </Layout>
  );
}

function BalanceChart({ rows }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px system-ui';
    const max = Math.max(1, ...rows.map((r) => r.total || 0));
    rows.forEach((row, index) => {
      const y = 28 + index * 42;
      const width = Math.max(8, ((row.total || 0) / max) * 280);
      ctx.fillStyle = '#0f766e';
      ctx.fillRect(120, y - 16, width, 24);
      ctx.fillStyle = '#1f2937';
      ctx.fillText(row.name || row.userId, 8, y);
      ctx.fillText(money(row.total), 130 + width, y);
    });
  }, [rows]);
  return <canvas className="chart" ref={ref} width="460" height={Math.max(150, rows.length * 48)} aria-label="Amount owed by each member chart" />;
}

function GroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [balanceInfo, setBalanceInfo] = useState({ balances: [], pendingExpenses: [], allApproved: false, mode: 'approved' });
  const [showAllTotals, setShowAllTotals] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  async function loadInvitations(groupData) {
    if (groupData.ownerId !== user.id) {
      setInvitations([]);
      return;
    }
    try {
      setInvitations(await api(`/api/groups/${groupId}/invitations`));
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setInviteMessage(err.message);
    }
  }
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [groupData, balanceData] = await Promise.all([api(`/api/groups/${groupId}`), api(`/api/groups/${groupId}/balances?includePending=${showAllTotals}`)]);
      setGroup(groupData);
      setBalanceInfo(balanceData);
      await loadInvitations(groupData);
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  async function loadBalances(includePending = showAllTotals) {
    setBalanceLoading(true);
    try {
      setBalanceInfo(await api(`/api/groups/${groupId}/balances?includePending=${includePending}`));
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setInviteMessage(err.message);
    } finally {
      setBalanceLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([api(`/api/groups/${groupId}`), api(`/api/groups/${groupId}/balances?includePending=${showAllTotals}`)])
      .then(async ([groupData, balanceData]) => {
        if (!active) return;
        setGroup(groupData);
        setBalanceInfo(balanceData);
        if (groupData.ownerId === user.id) {
          try {
            const invitationData = await api(`/api/groups/${groupId}/invitations`);
            if (active) setInvitations(invitationData);
          } catch (err) {
            if (err.status === 401) navigate('/login');
            else if (active) setInviteMessage(err.message);
          }
        } else {
          setInvitations([]);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) navigate('/login');
        else setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId, user.id]);
  async function inviteMember(e) {
    e.preventDefault();
    setInviteMessage('');
    try {
      await api(`/api/groups/${groupId}/invitations`, { method: 'POST', body: { email: inviteEmail } });
      setInviteEmail('');
      setInviteMessage('Invitation sent.');
      load();
    } catch (err) {
      setInviteMessage(err.message);
    }
  }
  if (loading || error || !group) return <Layout><StatusPanel loading={loading} error={error || (!group && 'Group not found.')} onRetry={load} /></Layout>;
  const acceptedEmails = new Set((group.members || []).map((member) => member.email));
  const visibleInvitations = invitations.filter((invitation) => !acceptedEmails.has(invitation.invitedUserEmail));
  return (
    <Layout>
      <section className="sectionHead"><div><h1>{group.name}</h1><p>{group.members.length} members</p></div><Link className="button" to={`/groups/${group.id}/new-expense`}><Receipt size={18} /> New expense</Link></section>
      <div className="grid">
        <section><h2>Members</h2>{group.members.map((m) => <article className="row" key={m.userId}>{m.name}<span className="actionGroup"><small>{m.email}</small>{m.userId === group.ownerId && <span className="tag tagNormal">Creator</span>}<span className="tag tagAccepted">Accepted</span></span></article>)}
          {visibleInvitations.map((invitation) => <article className="row" key={invitation.id}><span>{invitation.invitedUserEmail}</span><span className={`tag ${invitation.status === 'declined' ? 'tagDispute' : 'tagPending'}`}>{invitation.status}</span></article>)}
          {group.ownerId === user.id && <form className="inlineForm" onSubmit={inviteMember}><label>Invite by email<input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="alice@example.com" /></label><button>Invite</button></form>}
          {inviteMessage && <p className="notice">{inviteMessage}</p>}
        </section>
        <section className={`balanceBox ${balanceLoading ? 'loading' : ''}`}><h2>{showAllTotals ? 'All expense totals' : 'Approved totals'}</h2>
          <label className="toggle"><input type="checkbox" checked={showAllTotals} onChange={(e) => { const checked = e.target.checked; setShowAllTotals(checked); loadBalances(checked); }} /> Show all pending and approved totals</label>
          {!showAllTotals && !balanceInfo.allApproved && <p className="notice">No final total is shown until every involved member approves each expense.</p>}
          {!!balanceInfo.pendingExpenses?.length && <section><h3>Waiting for approval</h3>{balanceInfo.pendingExpenses.map((expense) => <article className="row" key={expense.id}><Link to={`/expenses/${expense.id}`}>{expense.title}</Link><small>{Object.values(expense.approvalStatus || {}).filter((status) => status !== 'approved').length} pending</small></article>)}</section>}
          <BalanceChart rows={balanceInfo.balances || []} />
          {!(balanceInfo.balances || []).length && <Empty text={showAllTotals ? 'No expense totals yet.' : 'No approved totals yet.'} />}
        </section>
      </div>
      <section><h2>Expenses</h2><div className="cards">{(group.expenses || []).map((e) => <ExpenseCard key={e.id} expense={e} />)}{!group.expenses?.length && <Empty text="No expenses yet." />}</div></section>
    </Layout>
  );
}

function ExpenseCard({ expense }) {
  const approvals = approvalSummary(expense.approvalStatus);
  return <article className="card"><h3>{expense.title}</h3><p>{expense.merchant}</p>{approvals.allApproved ? <p>{money(expense.total)}</p> : <p className="notice">Pending approval</p>}<Link to={`/expenses/${expense.id}`}>Review</Link></article>;
}

function blankReceipt() {
  return { title: '', merchant: '', date: '', category: 'Food', subtotal: 0, tax: 0, tip: 0, total: 0, items: [], confidenceNotes: [] };
}

function ReceiptEditor({ receipt, setReceipt, members, defaultAssignmentMode = 'manual' }) {
  const [assignmentMode, setAssignmentMode] = useState(defaultAssignmentMode);
  const autoEvenApplied = useRef(false);
  const allMemberIds = members.map((member) => member.userId);
  function itemSubtotal(items = receipt.items) {
    return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  }
  function withComputedTotals(nextReceipt, items = nextReceipt.items) {
    const subtotal = Math.round(itemSubtotal(items) * 100) / 100;
    const total = Math.round((subtotal + Number(nextReceipt.tax || 0) + Number(nextReceipt.tip || 0)) * 100) / 100;
    return { ...nextReceipt, subtotal, total };
  }
  function setField(key, value) {
    const nextReceipt = { ...receipt, [key]: value };
    if (['tax', 'tip'].includes(key)) setReceipt(withComputedTotals(nextReceipt));
    else if (key === 'subtotal') setReceipt({ ...nextReceipt, total: Math.round((Number(value || 0) + Number(receipt.tax || 0) + Number(receipt.tip || 0)) * 100) / 100 });
    else setReceipt(nextReceipt);
  }
  function updateItem(index, patch) {
    const items = receipt.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    setReceipt(withComputedTotals({ ...receipt, items }, items));
  }
  function addItem() { setReceipt({ ...receipt, items: [...receipt.items, { id: crypto.randomUUID(), name: '', price: 0, quantity: 1, assignedTo: [] }] }); }
  function removeItem(index) {
    const items = receipt.items.filter((_, i) => i !== index);
    setReceipt(withComputedTotals({ ...receipt, items }, items));
  }
  function assign(itemId, memberId) {
    const items = receipt.items.map((item) => item.id === itemId && !item.assignedTo.includes(memberId) ? { ...item, assignedTo: [...item.assignedTo, memberId] } : item);
    setReceipt({ ...receipt, items });
  }
  function unassign(itemId, memberId) {
    setReceipt({ ...receipt, items: receipt.items.map((item) => item.id === itemId ? { ...item, assignedTo: item.assignedTo.filter((id) => id !== memberId) } : item) });
  }
  function assignEvenly() {
    setReceipt({ ...receipt, items: receipt.items.map((item) => ({ ...item, assignedTo: allMemberIds })) });
  }
  function clearAssignmentsForManual() {
    setReceipt({ ...receipt, items: receipt.items.map((item) => ({ ...item, assignedTo: [] })) });
  }
  useEffect(() => {
    if (defaultAssignmentMode !== 'even' || autoEvenApplied.current || !receipt.items.length || !allMemberIds.length) return;
    autoEvenApplied.current = true;
    setReceipt({ ...receipt, items: receipt.items.map((item) => ({ ...item, assignedTo: allMemberIds })) });
  }, [defaultAssignmentMode, receipt.items.length, allMemberIds.join('|')]);
  const splitRows = localSplit(receipt, members);
  return (
    <div className="editorGrid">
      <section className="panel"><h2>Review receipt</h2>
        {['title', 'merchant', 'date', 'category'].map((key) => <label key={key}>{key}<input value={receipt[key] || ''} onChange={(e) => setField(key, e.target.value)} /></label>)}
        <div className="moneyGrid">{['subtotal', 'tax', 'tip', 'total'].map((key) => <label key={key}>{key}<input type="number" step="0.01" value={receipt[key] || 0} onChange={(e) => setField(key, Number(e.target.value))} /></label>)}</div>
        <h3>Items</h3>{receipt.items.map((item, index) => <article className="itemEdit" key={item.id}>
          <input aria-label="Item name" value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} />
          <input aria-label="Item price" type="number" step="0.01" value={item.price} onChange={(e) => updateItem(index, { price: Number(e.target.value) })} />
          <input aria-label="Item quantity" type="number" step="1" value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} />
          <button type="button" className="ghost" onClick={() => removeItem(index)}><X size={16} /></button>
        </article>)}
        <button type="button" onClick={addItem}><Plus size={18} /> Add item</button>
      </section>
      <section className="panel"><h2>Assign items</h2>
        <div className="segmented" role="group" aria-label="Assignment mode">
          <button type="button" className="subtle" onClick={() => { setAssignmentMode('manual'); assignEvenly(); }}>Assign evenly</button>
          <button type="button" className={assignmentMode === 'manual' ? '' : 'ghost'} onClick={() => { setAssignmentMode('manual'); clearAssignmentsForManual(); }}>Assign manually</button>
        </div>
        <div className="assignment">
          <div>{receipt.items.map((item) => <article className={`dragItem ${(item.assignedTo || []).length ? 'assigned' : 'unassigned'}`} key={item.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}>{item.name || 'Unnamed item'} <strong>{money(item.price)}</strong></article>)}</div>
          <div className="dropZones">{members.map((m) => <article className="dropZone" key={m.userId} onDragOver={(e) => e.preventDefault()} onDrop={(e) => assign(e.dataTransfer.getData('text/plain'), m.userId)}><h3>{m.name}</h3>{receipt.items.filter((item) => item.assignedTo.includes(m.userId)).map((item) => <button type="button" className="chip" key={item.id} onClick={() => unassign(item.id, m.userId)}>{item.name} <X size={14} /></button>)}</article>)}</div>
        </div>
        <section className="assignmentStatus"><h3>Assignment status</h3>{receipt.items.map((item) => {
          const assignedNames = members.filter((member) => item.assignedTo.includes(member.userId)).map((member) => member.name);
          return <article className={assignedNames.length ? 'statusLine assigned' : 'statusLine unassigned'} key={item.id}><span>{item.name || 'Unnamed item'}</span><strong>{assignedNames.length ? assignedNames.join(', ') : 'Unassigned'}</strong></article>;
        })}</section>
        <SplitPreview rows={splitRows} />
      </section>
    </div>
  );
}

function localSplit(expense, members) {
  const subtotals = {};
  for (const item of expense.items || []) {
    const assigned = item.assignedTo || [];
    if (!assigned.length) continue;
    const share = Number(item.price || 0) * Number(item.quantity || 1) / assigned.length;
    assigned.forEach((id) => { subtotals[id] = (subtotals[id] || 0) + share; });
  }
  const base = Object.values(subtotals).reduce((a, b) => a + b, 0);
  return members.map((m) => {
    const itemSubtotal = subtotals[m.userId] || 0;
    const proportion = base ? itemSubtotal / base : 0;
    const total = itemSubtotal + Number(expense.tax || 0) * proportion + Number(expense.tip || 0) * proportion;
    return { userId: m.userId, name: m.name, total };
  });
}

function SplitPreview({ rows }) {
  return <section><h3>Split preview</h3>{rows.map((row) => <article className="row" key={row.userId}>{row.name}<strong>{money(row.total)}</strong></article>)}</section>;
}

function NewExpense() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [receipt, setReceipt] = useState(blankReceipt());
  const [receiptText, setReceiptText] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function loadGroup() {
    setLoading(true);
    setError('');
    try {
      setGroup(await api(`/api/groups/${groupId}`));
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/api/groups/${groupId}`)
      .then((data) => { if (active) setGroup(data); })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) navigate('/login');
        else setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId]);
  async function parseText(e) {
    e.preventDefault();
    try {
      setMessage('Parsing receipt text...');
      const data = await api('/api/ai/parse-receipt-text', { method: 'POST', body: { receiptText, groupMembers: group.members.map((m) => m.name) } });
      setReceipt({ ...blankReceipt(), ...data, rawReceiptText: receiptText });
      setMessage(`${data.source === 'fallback' ? 'Fallback parser used. ' : ''}${data.confidenceNotes?.[0] || 'Receipt fields are ready. Please check them before submitting.'}`);
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setMessage(err.message);
    }
  }
  async function parseImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('receipt', file);
    try {
      setMessage('Parsing receipt image...');
      const data = await api('/api/ai/parse-receipt-image', { method: 'POST', body: form });
      setReceipt({ ...blankReceipt(), ...data });
      setMessage(`${data.source === 'fallback' ? 'Fallback parser used. ' : ''}${data.confidenceNotes?.[0] || 'Receipt fields are ready. Please check them before submitting.'}`);
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setMessage(err.message);
    }
  }
  async function submit() {
    try {
      const saved = await api(`/api/groups/${groupId}/expenses`, { method: 'POST', body: receipt });
      navigate(`/expenses/${saved.id}`);
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setMessage(err.message);
    }
  }
  if (loading || error || !group) return <Layout><StatusPanel loading={loading} error={error || (!group && 'Group not found.')} onRetry={loadGroup} /></Layout>;
  return (
    <Layout>
      <section className="sectionHead withBack"><BackLink to={`/groups/${groupId}`} /><div><h1>New expense</h1><p>Upload or paste a receipt, assign items, and submit the final split.</p></div></section>
      <div className="grid">
        <form className="panel" onSubmit={parseText}><h2>Paste receipt text</h2><label>Receipt text<textarea rows="8" value={receiptText} onChange={(e) => setReceiptText(e.target.value)} /></label><button><Receipt size={18} /> Parse text</button></form>
        <section className="panel"><h2>Upload receipt image</h2>{receipt.imageDataUrl && <img className="receiptImage" src={receipt.imageDataUrl} alt="Uploaded receipt preview" />}<label className="upload"><Upload size={22} /> <span>{receipt.imageDataUrl ? 'Reupload and reparse receipt image' : 'Select receipt image'}</span><input type="file" accept="image/*" onChange={parseImage} /></label></section>
      </div>
      {message && <p className="notice">{message}</p>}
      <p className="notice">We strongly encourage you to review the receipt details before you submit the expense.</p>
      <ReceiptEditor receipt={receipt} setReceipt={setReceipt} members={group.members} defaultAssignmentMode="even" />
      <button type="button" className="submitBar" onClick={submit}><Check size={18} /> Submit expense for approval</button>
    </Layout>
  );
}

function ExpenseDetail() {
  const { expenseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [expense, setExpense] = useState(null);
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [dispute, setDispute] = useState('');
  const [disputeError, setDisputeError] = useState('');
  const [commentError, setCommentError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editReceipt, setEditReceipt] = useState(blankReceipt());
  const [message, setMessage] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [expenseData, commentData] = await Promise.all([api(`/api/expenses/${expenseId}`), api(`/api/expenses/${expenseId}/comments`)]);
      setExpense(expenseData);
      setEditReceipt(expenseData);
      setComments(commentData);
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api(`/api/expenses/${expenseId}`), api(`/api/expenses/${expenseId}/comments`)])
      .then(([expenseData, commentData]) => {
        if (!active) return;
        setExpense(expenseData);
        setEditReceipt(expenseData);
        setComments(commentData);
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) navigate('/login');
        else setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expenseId]);
  async function approve() {
    if (expense.approvalStatus?.[user.id] === 'approved') return;
    try {
      await api(`/api/expenses/${expenseId}/approve`, { method: 'POST' });
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }
  async function disputeExpense(e) {
    e.preventDefault();
    setDisputeError('');
    if (!dispute.trim()) {
      setDisputeError('Please explain why you are disputing this expense.');
      return;
    }
    try {
      await api(`/api/expenses/${expenseId}/dispute`, { method: 'POST', body: { comment: dispute } });
      setDispute('');
      load();
    } catch (err) {
      setDisputeError(err.message);
    }
  }
  async function comment(e) {
    e.preventDefault();
    setCommentError('');
    if (!body.trim()) {
      setCommentError('Please enter a comment.');
      return;
    }
    try {
      await api(`/api/expenses/${expenseId}/comments`, { method: 'POST', body: { body } });
      setBody('');
      load();
    } catch (err) {
      setCommentError(err.message);
    }
  }
  async function saveEdits() {
    try {
      const updated = await api(`/api/expenses/${expenseId}`, { method: 'PUT', body: editReceipt });
      setExpense(updated);
      setEditReceipt(updated);
      setEditMode(false);
      setMessage('Expense updated. Approvals were reset.');
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setMessage(err.message);
    }
  }
  async function deleteExpense() {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    try {
      await api(`/api/expenses/${expenseId}`, { method: 'DELETE' });
      navigate(`/groups/${expense.groupId}`);
    } catch (err) {
      setMessage(err.message);
    }
  }
  if (loading || error || !expense) return <Layout><StatusPanel loading={loading} error={error || (!expense && 'Expense not found.')} onRetry={load} /></Layout>;
  const approvals = approvalSummary(expense.approvalStatus);
  const myApproval = expense.approvalStatus?.[user.id];
  const pendingApprovers = approvals.pending.map(([id]) => expense.members.find((m) => m.userId === id)?.name || id);
  return (
    <Layout>
      <section className="sectionHead">
        <BackLink to={`/groups/${expense.groupId}`} />
        <div><h1>{expense.title}</h1><p>{[expense.merchant, expense.date, expense.status].filter(Boolean).join(' · ')}</p>{approvals.allApproved ? <p><strong>Final total:</strong> {money(expense.total)}</p> : <p className="notice">Final total is hidden until every involved member approves. Waiting on: {pendingApprovers.join(', ') || 'assigned members'}.</p>}</div>
        <span className="actionGroup"><button type="button" onClick={() => setEditMode(!editMode)}><Edit size={18} /> {editMode ? 'Cancel edit' : 'Edit expense'}</button>{myApproval === 'approved' ? <span className="approvedBadge"><Check size={18} /> You approved</span> : <button type="button" onClick={approve}><Check size={18} /> {myApproval === 'disputed' ? 'Approve after dispute' : 'Approve'}</button>}<button type="button" className="ghost" onClick={deleteExpense}><X size={18} /> Delete</button></span>
      </section>
      {message && <p className="notice">{message}</p>}
      {editMode && <section><ReceiptEditor receipt={editReceipt} setReceipt={setEditReceipt} members={expense.members || []} defaultAssignmentMode="manual" /><button type="button" className="submitBar" onClick={saveEdits}><Check size={18} /> Save updates and request approval again</button></section>}
      <div className="grid">
        <section><h2>Items</h2>{expense.imageDataUrl && <img className="receiptImage" src={expense.imageDataUrl} alt={`Receipt for ${expense.title}`} />}{expense.items.map((item) => <article className="row" key={item.id}>{item.name}<strong>{money(item.price)}</strong></article>)}</section>
        <section><h2>Amount owed</h2><BalanceChart rows={Object.values(expense.split || {})} /><SplitPreview rows={Object.values(expense.split || {})} /></section>
      </div>
      <section><h2>Approval status</h2>{Object.entries(expense.approvalStatus || {}).map(([id, status]) => <article className="row" key={id}>{expense.members.find((m) => m.userId === id)?.name || id}<strong>{status}</strong></article>)}</section>
      <section className="panel"><h2>Dispute</h2><form className="inlineForm" onSubmit={disputeExpense}><label>Dispute comment<input value={dispute} onChange={(e) => setDispute(e.target.value)} /></label><button>Dispute</button></form>{disputeError && <p className="error">{disputeError}</p>}</section>
      <section><h2>Comments</h2>{comments.map((c) => <article className="comment" key={c.id}><strong>{c.userName}</strong><span className={`tag ${c.kind === 'dispute' ? 'tagDispute' : 'tagNormal'}`}>{c.kind === 'dispute' ? 'Dispute comment' : 'Normal comment'}</span><p>{c.body}</p></article>)}
        <form className="inlineForm" onSubmit={comment}><label>Comment<input value={body} onChange={(e) => setBody(e.target.value)} /></label><button>Add comment</button></form>
        {commentError && <p className="error">{commentError}</p>}
      </section>
    </Layout>
  );
}

function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [expenseStates, setExpenseStates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      const noteData = await api('/api/notifications');
      setNotes(noteData);
      loadExpenseStates(noteData);
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    api('/api/notifications')
      .then((data) => {
        if (!active) return;
        setNotes(data);
        loadExpenseStates(data);
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) navigate('/login');
        else setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('fairshare:notifications-updated', refresh);
    return () => window.removeEventListener('fairshare:notifications-updated', refresh);
  }, []);
  async function mark(note) {
    try {
      await api(`/api/notifications/${note.id}/read`, { method: 'POST' });
      setNotes(notes.map((n) => n.id === note.id ? { ...n, read: true } : n));
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setError(err.message);
    }
  }
  async function loadExpenseStates(noteData) {
    const ids = [...new Set(noteData.map((note) => note.relatedExpenseId).filter(Boolean))];
    const entries = await Promise.all(ids.map(async (id) => {
      try {
        const expense = await api(`/api/expenses/${id}`);
        return [id, { status: expense.status, approvalStatus: expense.approvalStatus || {} }];
      } catch {
        return [id, null];
      }
    }));
    setExpenseStates(Object.fromEntries(entries));
  }
  async function approveFromNotification(note) {
    try {
      await api(`/api/expenses/${note.relatedExpenseId}/approve`, { method: 'POST' });
      await mark(note);
      load();
    } catch (err) {
      if (err.status === 401) navigate('/login');
      else setError(err.message);
    }
  }
  function notificationLink(note) {
    if (note.type === 'group_invitation') return { to: '/dashboard', label: 'View invitation' };
    if (note.relatedExpenseId) return { to: `/expenses/${note.relatedExpenseId}`, label: 'Open expense' };
    if (note.relatedGroupId) return { to: `/groups/${note.relatedGroupId}`, label: 'Open group' };
    return null;
  }
  return <Layout><section className="sectionHead"><h1>Notifications</h1></section><StatusPanel loading={loading} error={error} empty={!notes.length && 'No notifications yet.'} onRetry={load}>{notes.map((n) => {
    const target = notificationLink(n);
    const state = expenseStates[n.relatedExpenseId];
    const alreadyApproved = state?.approvalStatus?.[user.id] === 'approved';
    const fullyApproved = state?.status === 'approved';
    const canApprove = ['expense_added', 'expense_updated'].includes(n.type) && n.relatedExpenseId && state && !alreadyApproved && !fullyApproved;
    return <article className={`row ${n.read ? '' : 'unread'}`} key={n.id}><span>{n.message}</span><span className="actionGroup">{target && <Link className="button ghost" to={target.to}>{target.label}</Link>}{canApprove && !n.read && <button onClick={() => approveFromNotification(n)}>Approve</button>}<button onClick={() => mark(n)}>Mark read</button></span></article>;
  })}</StatusPanel></Layout>;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<AuthForm mode="login" />} />
          <Route path="/register" element={<AuthForm mode="register" />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/groups" element={<Protected><Groups /></Protected>} />
          <Route path="/groups/:groupId" element={<Protected><GroupDetail /></Protected>} />
          <Route path="/groups/:groupId/new-expense" element={<Protected><NewExpense /></Protected>} />
          <Route path="/expenses/:expenseId" element={<Protected><ExpenseDetail /></Protected>} />
          <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

createRoot(document.getElementById('root')).render(<App />);
