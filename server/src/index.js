import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { calculateSplit } from './split.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) cb(new Error('Only image uploads are accepted.'));
    else cb(null, true);
  }
});

function now() {
  return new Date().toISOString();
}

function stripUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function cleanString(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function validId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

class MemoryStore {
  constructor() {
    this.tables = {
      users: new Map(),
      groups: new Map(),
      invitations: new Map(),
      expenses: new Map(),
      comments: new Map(),
      notifications: new Map()
    };
  }
  async list(name, predicate = () => true) {
    return [...this.tables[name].values()].filter(predicate).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  async get(name, id) {
    return this.tables[name].get(id) || null;
  }
  async create(name, doc) {
    const id = doc.id || uuid();
    const saved = { ...doc, id, createdAt: doc.createdAt || now(), updatedAt: doc.updatedAt || now() };
    this.tables[name].set(id, saved);
    return saved;
  }
  async update(name, id, patch) {
    const existing = await this.get(name, id);
    if (!existing) return null;
    const saved = { ...existing, ...patch, id, updatedAt: now() };
    this.tables[name].set(id, saved);
    return saved;
  }
  async delete(name, id) {
    return this.tables[name].delete(id);
  }
}

class FirestoreStore {
  constructor(FirestoreClass) {
    this.db = new FirestoreClass({ projectId: process.env.FIRESTORE_PROJECT_ID || process.env.GCP_PROJECT_ID });
  }
  col(name) {
    return this.db.collection(name);
  }
  async list(name, predicate = () => true) {
    const snap = await this.col(name).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(predicate);
  }
  async get(name, id) {
    const doc = await this.col(name).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }
  async create(name, doc) {
    const id = doc.id || uuid();
    const saved = { ...doc, id, createdAt: doc.createdAt || now(), updatedAt: doc.updatedAt || now() };
    await this.col(name).doc(id).set(saved);
    return saved;
  }
  async update(name, id, patch) {
    const existing = await this.get(name, id);
    if (!existing) return null;
    const saved = { ...existing, ...patch, id, updatedAt: now() };
    await this.col(name).doc(id).set(saved);
    return saved;
  }
  async delete(name, id) {
    await this.col(name).doc(id).delete();
    return true;
  }
}

const useInMemoryDb = process.env.USE_IN_MEMORY_DB === 'true' || String(process.env.FIRESTORE_PROJECT_ID || '').toLowerCase() === 'local';
if (useInMemoryDb) {
  console.log('[db] Using in-memory database');
}

let store = null;
if (useInMemoryDb) {
  store = new MemoryStore();
} else {
  const projectId = process.env.FIRESTORE_PROJECT_ID || process.env.GCP_PROJECT_ID || '(unspecified)';
  console.log(`[db] Using Firestore project: ${projectId}`);
  // Firestore will be lazy-initialized when the server starts (see app.listen callback).
}
const streams = new Map();

const TEST_USERS = [
  { email: 'yinan@example.com', displayName: 'Yinan Demo', password: 'Password123!' },
  { email: 'alice@example.com', displayName: 'Alice Demo', password: 'Password123!' },
  { email: 'bob@example.com', displayName: 'Bob Demo', password: 'Password123!' },
  { email: 'chloe@example.com', displayName: 'Chloe Demo', password: 'Password123!' }
];

function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 7 * 24 * 60 * 60 * 1000 };
}

function sign(user) {
  return jwt.sign({ sub: user.id, email: user.email, displayName: user.displayName }, JWT_SECRET, { expiresIn: '7d' });
}

async function seedTestUsers() {
  const seeded = [];
  for (const testUser of TEST_USERS) {
    const email = testUser.email.toLowerCase();
    const existing = (await store.list('users', (user) => user.email === email))[0];
    const passwordHash = await bcrypt.hash(testUser.password, 12);
    const saved = existing
      ? await store.update('users', existing.id, { email, displayName: testUser.displayName, passwordHash })
      : await store.create('users', { email, displayName: testUser.displayName, passwordHash });
    seeded.push({ ...stripUser(saved), password: testUser.password });
  }
  return seeded;
}

async function auth(req, res, next) {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await store.get('users', payload.sub);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Authentication required.' });
  }
}

async function groupForUser(groupId, userId) {
  if (!validId(groupId)) return null;
  const group = await store.get('groups', groupId);
  if (!group) return null;
  return group.ownerId === userId || (group.members || []).some((m) => m.userId === userId) ? group : null;
}

async function notify(userId, type, message, relatedExpenseId = null, relatedGroupId = null) {
  const note = await store.create('notifications', { userId, type, message, relatedExpenseId, relatedGroupId, read: false });
  const clients = streams.get(userId) || [];
  for (const res of clients) res.write(`data: ${JSON.stringify(note)}\n\n`);
  return note;
}

function normalizeAiReceipt(raw = {}) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const numeric = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return {
    merchant: cleanString(raw.merchant, 120),
    title: cleanString(raw.title || raw.merchant || 'Receipt expense', 160),
    category: cleanString(raw.category || 'Other', 80),
    date: cleanString(raw.date, 40),
    subtotal: numeric(raw.subtotal),
    tax: numeric(raw.tax),
    tip: numeric(raw.tip),
    total: numeric(raw.total),
    items: items.slice(0, 80).map((item) => ({
      id: item.id || uuid(),
      name: cleanString(item.name || 'Receipt item', 120),
      price: numeric(item.price),
      quantity: numeric(item.quantity || 1) || 1,
      assignedTo: Array.isArray(item.assignedTo) ? item.assignedTo.filter(validId) : [],
      assignedToNames: Array.isArray(item.assignedToNames) ? item.assignedToNames.map((name) => cleanString(name, 80)) : []
    })),
    source: raw.source === 'gemini' ? 'gemini' : raw.source === 'fallback' ? 'fallback' : undefined,
    confidenceNotes: Array.isArray(raw.confidenceNotes) ? raw.confidenceNotes.map((n) => cleanString(n, 240)) : []
  };
}

function regexFallbackReceipt(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items = [];
  let tax = 0;
  let tip = 0;
  let total = 0;
  let date = '';
  for (const line of lines) {
    const dateMatch = line.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/);
    if (!date && dateMatch) date = dateMatch[1];
    const match = line.match(/^(.+?)\s+\$?(-?\d+(?:\.\d{1,2})?)$/);
    if (!match) continue;
    const label = match[1].trim();
    const amount = Number(match[2]);
    if (/tax/i.test(label)) tax = amount;
    else if (/tip|gratuity/i.test(label)) tip = amount;
    else if (/total/i.test(label)) total = amount;
    else items.push({ id: uuid(), name: label, price: amount, quantity: 1, assignedTo: [], assignedToNames: [] });
  }
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  return normalizeAiReceipt({
    merchant: lines[0] || '',
    title: lines[0] ? `Expense at ${lines[0]}` : 'Receipt expense',
    category: 'Food',
    date,
    subtotal,
    tax,
    tip,
    total: total || subtotal + tax + tip,
    items,
    source: 'fallback',
    confidenceNotes: ['AI parsing failed or was unavailable. Please review and correct the receipt manually.']
  });
}

function parseGeminiJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const tryParse = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const stripped = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const direct = tryParse(stripped);
  if (direct) return direct;

  const fencedMatch = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    const parsed = tryParse(fencedMatch[1].trim());
    if (parsed) return parsed;
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const parsed = tryParse(objectMatch[0]);
    if (parsed) return parsed;
  }

  return null;
}

async function callGemini(parts) {
  if (!process.env.GEMINI_API_KEY) {
    console.error('[gemini] GEMINI_API_KEY is not configured. Falling back to local receipt parsing.');
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const fallbackModel = process.env.GEMINI_MODEL_FALLBACK || 'gemini-1.5-flash';
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 20000);

  async function requestModel(model) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
          }),
          signal: controller.signal
        }
      );
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No response body');
        console.error(`[gemini] request failed for ${model}: ${response.status} ${errorText}`);
        const err = new Error(`Gemini failed with HTTP ${response.status}`);
        err.status = response.status;
        throw err;
      }
      const body = await response.json();
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseGeminiJson(text);
      if (!parsed) {
        const preview = String(text).slice(0, 1200).replace(/\s+/g, ' ');
        console.error(`[gemini] unable to extract JSON from model output for ${model}: ${preview}`);
        const err = new Error('Gemini returned non-JSON output.');
        err.status = 502;
        throw err;
      }
      return parsed;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error(`[gemini] request timed out after ${timeoutMs}ms for ${model}`);
        const timeoutError = new Error('Gemini request timed out.');
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  try {
    return await requestModel(primaryModel);
  } catch (err) {
    if ([429, 503, 504, 502].includes(err.status) && fallbackModel && fallbackModel !== primaryModel) {
      console.warn(`[gemini] primary model ${primaryModel} unavailable; retrying with fallback model ${fallbackModel}`);
      return await requestModel(fallbackModel);
    }
    console.error(`[gemini] request error: ${err.message}`);
    throw err;
  }
}

function receiptPrompt(extra = '') {
  return `You are helping parse a group expense receipt for FairShare. Extract merchant, date, category, subtotal, tax, tip, total, and line items. Return strict JSON only with merchant, title, date, category, subtotal, tax, tip, total, items, confidenceNotes. Do not include markdown. Do not invent missing items. If a value is unclear, use null and explain in confidenceNotes. If total does not match item sum, include a confidence note. Use assignedToNames only if the receipt explicitly says who ordered what; otherwise leave assignments empty. The app lets the user correct the result before submission. ${extra}`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'fairshare', hostname: os.hostname(), timestamp: now() });
});

app.post('/api/dev/seed-test-users', async (_req, res) => {
  if (isProduction) return res.status(404).json({ error: 'Not found.' });
  res.json({ users: await seedTestUsers() });
});

app.post('/api/auth/register', async (req, res) => {
  const email = cleanString(req.body.email, 160).toLowerCase();
  const displayName = cleanString(req.body.displayName, 80);
  const password = String(req.body.password || '');
  if (!email.includes('@') || !displayName || password.length < 8) return res.status(400).json({ error: 'Email, display name, and 8 character password are required.' });
  const existing = (await store.list('users', (u) => u.email === email))[0];
  if (existing) return res.status(409).json({ error: 'Email is already registered.' });
  const user = await store.create('users', { email, displayName, passwordHash: await bcrypt.hash(password, 12) });
  res.cookie('token', sign(user), cookieOptions()).status(201).json({ user: stripUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const email = cleanString(req.body.email, 160).toLowerCase();
  const user = (await store.list('users', (u) => u.email === email))[0];
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password.' });
  res.cookie('token', sign(user), cookieOptions()).json({ user: stripUser(user) });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token', cookieOptions()).json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: stripUser(req.user) }));

app.get('/api/groups', auth, async (req, res) => {
  res.json(await store.list('groups', (g) => g.ownerId === req.user.id || (g.members || []).some((m) => m.userId === req.user.id)));
});

app.post('/api/groups', auth, async (req, res) => {
  const name = cleanString(req.body.name, 120);
  if (!name) return res.status(400).json({ error: 'Group name is required.' });
  const ownerMember = { userId: req.user.id, name: req.user.displayName, email: req.user.email };
  const group = await store.create('groups', { ownerId: req.user.id, name, members: [ownerMember] });
  res.status(201).json(group);
});

app.get('/api/groups/:groupId', auth, async (req, res) => {
  const group = await groupForUser(req.params.groupId, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found.' });
  const expenses = await store.list('expenses', (e) => e.groupId === group.id);
  res.json({ ...group, expenses });
});

app.put('/api/groups/:groupId', auth, async (req, res) => {
  const group = await groupForUser(req.params.groupId, req.user.id);
  if (!group || group.ownerId !== req.user.id) return res.status(404).json({ error: 'Group not found.' });
  res.json(await store.update('groups', group.id, { name: cleanString(req.body.name, 120) || group.name }));
});

app.delete('/api/groups/:groupId', auth, async (req, res) => {
  const group = await groupForUser(req.params.groupId, req.user.id);
  if (!group || group.ownerId !== req.user.id) return res.status(404).json({ error: 'Group not found.' });
  await store.delete('groups', group.id);
  res.json({ ok: true });
});

app.post('/api/groups/:groupId/members', auth, async (req, res) => {
  return res.status(410).json({ error: 'Use group invitations instead of direct member creation.' });
});

app.post('/api/groups/:groupId/invitations', auth, async (req, res) => {
  const group = await groupForUser(req.params.groupId, req.user.id);
  if (!group || group.ownerId !== req.user.id) return res.status(404).json({ error: 'Group not found.' });
  const email = cleanString(req.body.email, 160).toLowerCase();
  if (!email.includes('@')) return res.status(400).json({ error: 'A valid invite email is required.' });
  const invitedUser = (await store.list('users', (u) => u.email === email))[0];
  if (!invitedUser) return res.status(404).json({ error: 'User not found.' });
  if ((group.members || []).some((m) => m.userId === invitedUser.id)) return res.status(409).json({ error: 'User is already a group member.' });
  const existing = (await store.list('invitations', (i) => i.groupId === group.id && i.invitedUserId === invitedUser.id && i.status === 'pending'))[0];
  if (existing) return res.status(409).json({ error: 'An invitation is already pending for this user.' });
  const invitation = await store.create('invitations', {
    groupId: group.id,
    groupName: group.name,
    invitedUserId: invitedUser.id,
    invitedUserEmail: invitedUser.email,
    invitedByUserId: req.user.id,
    status: 'pending'
  });
  await notify(invitedUser.id, 'group_invitation', `${req.user.displayName} invited you to join ${group.name}.`, null, group.id);
  res.status(201).json(invitation);
});

app.get('/api/groups/:groupId/invitations', auth, async (req, res) => {
  const group = await groupForUser(req.params.groupId, req.user.id);
  if (!group || group.ownerId !== req.user.id) return res.status(404).json({ error: 'Group not found.' });
  res.json(await store.list('invitations', (i) => i.groupId === group.id));
});

app.get('/api/invitations', auth, async (req, res) => {
  res.json(await store.list('invitations', (i) => i.invitedUserId === req.user.id && i.status === 'pending'));
});

app.post('/api/invitations/:invitationId/accept', auth, async (req, res) => {
  const invitation = validId(req.params.invitationId) ? await store.get('invitations', req.params.invitationId) : null;
  if (!invitation || invitation.invitedUserId !== req.user.id || invitation.status !== 'pending') return res.status(404).json({ error: 'Invitation not found.' });
  const group = await store.get('groups', invitation.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found.' });
  const member = { userId: req.user.id, name: req.user.displayName, email: req.user.email };
  const members = (group.members || []).some((m) => m.userId === req.user.id) ? group.members : [...(group.members || []), member];
  await store.update('groups', group.id, { members });
  const updated = await store.update('invitations', invitation.id, { status: 'accepted' });
  await notify(group.ownerId, 'group_invitation_accepted', `${req.user.displayName} accepted your invitation to ${group.name}.`);
  res.json(updated);
});

app.post('/api/invitations/:invitationId/decline', auth, async (req, res) => {
  const invitation = validId(req.params.invitationId) ? await store.get('invitations', req.params.invitationId) : null;
  if (!invitation || invitation.invitedUserId !== req.user.id || invitation.status !== 'pending') return res.status(404).json({ error: 'Invitation not found.' });
  const updated = await store.update('invitations', invitation.id, { status: 'declined' });
  const group = await store.get('groups', invitation.groupId);
  if (group) await notify(group.ownerId, 'group_invitation_declined', `${req.user.displayName} declined your invitation to ${group.name}.`);
  res.json(updated);
});

app.get('/api/groups/:groupId/expenses', auth, async (req, res) => {
  const group = await groupForUser(req.params.groupId, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found.' });
  res.json(await store.list('expenses', (e) => e.groupId === group.id));
});

app.post('/api/groups/:groupId/expenses', auth, async (req, res) => {
  const group = await groupForUser(req.params.groupId, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found.' });
  const draft = normalizeAiReceipt(req.body);
  const involved = new Set((draft.items || []).flatMap((item) => item.assignedTo || []));
  const approvalStatus = Object.fromEntries([...involved].map((userId) => [userId, 'pending']));
  const expense = await store.create('expenses', {
    ...draft,
    groupId: group.id,
    createdBy: req.user.id,
    splitMode: 'itemized',
    status: 'pending',
    rawReceiptText: cleanString(req.body.rawReceiptText, 5000),
    imageUrlOrImageName: cleanString(req.body.imageUrlOrImageName, 240),
    imageDataUrl: cleanString(req.body.imageDataUrl, 900000),
    aiConfidenceNotes: draft.confidenceNotes,
    approvalStatus
  });
  for (const member of group.members || []) {
    if (involved.has(member.userId) && member.userId !== req.user.id) await notify(member.userId, 'expense_added', `${group.name}: ${req.user.displayName} added a new expense: ${expense.title}.`, expense.id, group.id);
  }
  res.status(201).json({ ...expense, split: calculateSplit(expense, group.members || []) });
});

async function expenseWithGroup(expenseId, userId) {
  if (!validId(expenseId)) return {};
  const expense = await store.get('expenses', expenseId);
  if (!expense) return {};
  const group = await groupForUser(expense.groupId, userId);
  return { expense: group ? expense : null, group };
}

app.get('/api/expenses/:expenseId', auth, async (req, res) => {
  const { expense, group } = await expenseWithGroup(req.params.expenseId, req.user.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });
  res.json({ ...expense, split: calculateSplit(expense, group.members || []), members: group.members || [] });
});

app.put('/api/expenses/:expenseId', auth, async (req, res) => {
  const { expense, group } = await expenseWithGroup(req.params.expenseId, req.user.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });
  const draft = normalizeAiReceipt({ ...expense, ...req.body });
  const involved = new Set((draft.items || []).flatMap((item) => item.assignedTo || []));
  const approvalStatus = Object.fromEntries([...involved].map((userId) => [userId, 'pending']));
  const updated = await store.update('expenses', expense.id, {
    ...draft,
    status: 'pending',
    approvalStatus,
    rawReceiptText: cleanString(req.body.rawReceiptText ?? expense.rawReceiptText, 5000),
    imageUrlOrImageName: cleanString(req.body.imageUrlOrImageName ?? expense.imageUrlOrImageName, 240),
    imageDataUrl: cleanString(req.body.imageDataUrl ?? expense.imageDataUrl, 900000)
  });
  for (const member of group.members || []) {
    if (involved.has(member.userId) && member.userId !== req.user.id) await notify(member.userId, 'expense_updated', `${group.name}: ${req.user.displayName} updated ${updated.title}. Please approve it again.`, updated.id, group.id);
  }
  res.json({ ...updated, split: calculateSplit(updated, group.members || []) });
});

app.delete('/api/expenses/:expenseId', auth, async (req, res) => {
  const { expense } = await expenseWithGroup(req.params.expenseId, req.user.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });
  await store.delete('expenses', expense.id);
  res.json({ ok: true });
});

app.post('/api/expenses/:expenseId/approve', auth, async (req, res) => {
  const { expense, group } = await expenseWithGroup(req.params.expenseId, req.user.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });
  const approvalStatus = { ...(expense.approvalStatus || {}), [req.user.id]: 'approved' };
  const status = Object.values(approvalStatus).every((value) => value === 'approved') ? 'approved' : expense.status;
  const updated = await store.update('expenses', expense.id, { approvalStatus, status });
  await notify(expense.createdBy, 'expense_approved', `${req.user.displayName} approved ${expense.title}.`, expense.id, group.id);
  res.json({ ...updated, split: calculateSplit(updated, group.members || []) });
});

app.post('/api/expenses/:expenseId/dispute', auth, async (req, res) => {
  const { expense, group } = await expenseWithGroup(req.params.expenseId, req.user.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });
  const comment = cleanString(req.body.comment, 1000);
  if (!comment) return res.status(400).json({ error: 'Dispute comment is required.' });
  const approvalStatus = { ...(expense.approvalStatus || {}), [req.user.id]: 'disputed' };
  const updated = await store.update('expenses', expense.id, { approvalStatus, status: 'disputed' });
  await store.create('comments', { expenseId: expense.id, userId: req.user.id, userName: req.user.displayName, body: comment, kind: 'dispute' });
  await notify(expense.createdBy, 'expense_disputed', `${req.user.displayName} disputed ${expense.title}.`, expense.id, group?.id || null);
  res.json(updated);
});

app.get('/api/groups/:groupId/balances', auth, async (req, res) => {
  const group = await groupForUser(req.params.groupId, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found.' });
  const includePending = req.query.includePending === 'true';
  const expenses = await store.list('expenses', (e) => e.groupId === group.id);
  const pendingExpenses = expenses
    .filter((expense) => !Object.values(expense.approvalStatus || {}).length || !Object.values(expense.approvalStatus || {}).every((value) => value === 'approved'))
    .map((expense) => ({
      id: expense.id,
      title: expense.title,
      approvalStatus: expense.approvalStatus || {}
    }));
  const includedExpenses = includePending ? expenses : expenses.filter((expense) => Object.values(expense.approvalStatus || {}).length && Object.values(expense.approvalStatus || {}).every((value) => value === 'approved'));
  const balances = {};
  for (const expense of includedExpenses) {
    const split = calculateSplit(expense, group.members || []);
    for (const [userId, row] of Object.entries(split)) balances[userId] = { ...row, total: (balances[userId]?.total || 0) + row.total };
  }
  res.json({
    mode: includePending ? 'all' : 'approved',
    balances: Object.values(balances).map((row) => ({ ...row, total: Math.round(row.total * 100) / 100 })),
    pendingExpenses,
    allApproved: pendingExpenses.length === 0
  });
});

app.get('/api/expenses/:expenseId/comments', auth, async (req, res) => {
  const { expense } = await expenseWithGroup(req.params.expenseId, req.user.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });
  res.json(await store.list('comments', (c) => c.expenseId === expense.id));
});

app.post('/api/expenses/:expenseId/comments', auth, async (req, res) => {
  const { expense, group } = await expenseWithGroup(req.params.expenseId, req.user.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });
  const body = cleanString(req.body.body, 1000);
  if (!body) return res.status(400).json({ error: 'Comment is required.' });
  const comment = await store.create('comments', { expenseId: expense.id, userId: req.user.id, userName: req.user.displayName, body, kind: 'normal' });
  await notify(expense.createdBy, 'expense_comment', `${req.user.displayName} commented on ${expense.title}.`, expense.id, group?.id || null);
  res.status(201).json(comment);
});

app.post('/api/ai/parse-receipt-text', auth, async (req, res) => {
  const receiptText = cleanString(req.body.receiptText, 10000);
  if (!receiptText) return res.status(400).json({ error: 'receiptText is required.' });
  try {
    const parsed = await callGemini([{ text: `${receiptPrompt(`Group members: ${(req.body.groupMembers || []).join(', ')}`)}\n\nReceipt text:\n${receiptText}` }]);
    const receipt = normalizeAiReceipt({ ...parsed, source: 'gemini' });
    await notify(req.user.id, 'ai_finished', 'AI finished parsing your receipt.');
    res.json(receipt);
  } catch (err) {
    console.error(`[gemini] Text receipt parsing failed: ${err.message}`);
    const fallback = regexFallbackReceipt(receiptText);
    await notify(req.user.id, 'ai_finished', 'AI parsing failed. Please enter or correct the receipt manually.');
    res.json(fallback);
  }
});

app.post('/api/ai/parse-receipt-image', auth, upload.single('receipt'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'receipt image is required.' });
  try {
    const parsed = await callGemini([
      { text: receiptPrompt() },
      { inline_data: { mime_type: req.file.mimetype, data: req.file.buffer.toString('base64') } }
    ]);
    const receipt = normalizeAiReceipt({ ...parsed, source: 'gemini' });
    await notify(req.user.id, 'ai_finished', 'AI finished parsing your receipt.');
    res.json({ ...receipt, imageUrlOrImageName: req.file.originalname, imageDataUrl: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` });
  } catch (err) {
    console.error(`[gemini] Image receipt parsing failed: ${err.message}`);
    const fallback = normalizeAiReceipt({
      title: 'Receipt expense',
      category: 'Other',
      items: [],
      source: 'fallback',
      confidenceNotes: ['AI parsing failed. Please enter or correct the receipt manually.']
    });
    await notify(req.user.id, 'ai_finished', 'AI parsing failed. Please enter or correct the receipt manually.');
    res.json({ ...fallback, imageUrlOrImageName: req.file.originalname, imageDataUrl: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` });
  }
});

app.get('/api/notifications', auth, async (req, res) => {
  res.json(await store.list('notifications', (n) => n.userId === req.user.id));
});

app.get('/api/notifications/stream', auth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'FairShare notifications connected.' })}\n\n`);
  const list = streams.get(req.user.id) || [];
  list.push(res);
  streams.set(req.user.id, list);
  req.on('close', () => streams.set(req.user.id, (streams.get(req.user.id) || []).filter((client) => client !== res)));
});

app.post('/api/notifications/:notificationId/read', auth, async (req, res) => {
  const note = await store.get('notifications', req.params.notificationId);
  if (!note || note.userId !== req.user.id) return res.status(404).json({ error: 'Notification not found.' });
  res.json(await store.update('notifications', note.id, { read: true }));
});

const staticDir = path.join(__dirname, '../../client/dist');
app.use(express.static(staticDir));
app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || 'Request failed.' });
});

app.listen(PORT, async () => {
  console.log(`FairShare API listening on ${PORT}`);

  // Initialize Firestore lazily if requested and not using the in-memory DB.
  if (!useInMemoryDb) {
    try {
      const mod = await import('@google-cloud/firestore');
      const { Firestore } = mod;
      store = new FirestoreStore(Firestore);
      console.log('[db] Firestore initialized successfully');
    } catch (err) {
      console.error(`[db] Firestore initialization failed: ${err.message}`);
      // Fail fast in non-local deployments. If this is a developer environment without
      // credentials, instruct the user — but do not crash when in-memory DB was chosen.
      process.exit(1);
    }
  }

  if (!isProduction && process.env.SEED_TEST_USERS === 'true') {
    const users = await seedTestUsers();
    console.log(`Seeded ${users.length} FairShare test users. Password: Password123!`);
  }
});
