import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';

const CODE_TTL_MS = 5 * 60 * 1000;
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const MAX_VERIFICATION_ATTEMPTS = 5;
const PROOF_TTL_MS = 30 * 60 * 1000;

interface CodeRecord {
  code: string;
  expiresAt: number;
  failedAttempts: number;
}

interface ProofRecord {
  email: string;
  expiresAt: number;
  inUse: boolean;
}

interface VerificationState {
  codes: Map<string, CodeRecord>;
  sendHistory: Map<string, number[]>;
  proofs: Map<string, ProofRecord>;
  activeSends: Set<string>;
}

const globalVerification = globalThis as typeof globalThis & {
  emailVerificationState?: VerificationState;
};

const state: VerificationState = globalVerification.emailVerificationState ??= {
  codes: new Map<string, CodeRecord>(),
  sendHistory: new Map<string, number[]>(),
  proofs: new Map<string, ProofRecord>(),
  activeSends: new Set<string>(),
};

export type CodeVerificationResult =
  | { status: 'verified'; verificationToken: string }
  | { status: 'invalid' }
  | { status: 'attempts_exceeded' };

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function reserveSend(email: string) {
  if (state.activeSends.has(email)) {
    return false;
  }

  const now = Date.now();
  const recent = (state.sendHistory.get(email) ?? []).filter(
    (sentAt) => sentAt > now - SEND_WINDOW_MS
  );

  if (recent.length >= MAX_SENDS_PER_WINDOW) {
    state.sendHistory.set(email, recent);
    return false;
  }

  recent.push(now);
  state.sendHistory.set(email, recent);
  state.activeSends.add(email);
  setTimeout(() => {
    const current = (state.sendHistory.get(email) ?? []).filter(
      (sentAt) => sentAt > Date.now() - SEND_WINDOW_MS
    );
    if (current.length === 0) {
      state.sendHistory.delete(email);
    } else {
      state.sendHistory.set(email, current);
    }
  }, SEND_WINDOW_MS).unref();
  return true;
}

export function finishSend(email: string) {
  state.activeSends.delete(email);
}

export function generateVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function storeVerificationCode(email: string, code: string) {
  const expiresAt = Date.now() + CODE_TTL_MS;

  state.codes.set(email, { code, expiresAt, failedAttempts: 0 });
  setTimeout(() => {
    const current = state.codes.get(email);
    if (current?.code === code && current.expiresAt <= Date.now()) {
      state.codes.delete(email);
    }
  }, CODE_TTL_MS).unref();
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function codesMatch(actual: string, supplied: string) {
  const actualBuffer = Buffer.from(actual);
  const suppliedBuffer = Buffer.from(supplied);
  return actualBuffer.length === suppliedBuffer.length
    && timingSafeEqual(actualBuffer, suppliedBuffer);
}

function issueRegistrationProof(email: string) {
  for (const [tokenHash, proof] of state.proofs) {
    if (proof.email === email) {
      state.proofs.delete(tokenHash);
    }
  }

  const verificationToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(verificationToken);
  const expiresAt = Date.now() + PROOF_TTL_MS;

  state.proofs.set(tokenHash, { email, expiresAt, inUse: false });
  setTimeout(() => {
    const current = state.proofs.get(tokenHash);
    if (current && current.expiresAt <= Date.now()) {
      state.proofs.delete(tokenHash);
    }
  }, PROOF_TTL_MS).unref();

  return verificationToken;
}

export function verifyCode(email: string, suppliedCode: string): CodeVerificationResult {
  const record = state.codes.get(email);
  if (!record || record.expiresAt <= Date.now()) {
    state.codes.delete(email);
    return { status: 'invalid' };
  }

  if (!codesMatch(record.code, suppliedCode)) {
    record.failedAttempts += 1;
    if (record.failedAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      state.codes.delete(email);
      return { status: 'attempts_exceeded' };
    }

    return { status: 'invalid' };
  }

  state.codes.delete(email);
  return {
    status: 'verified',
    verificationToken: issueRegistrationProof(email),
  };
}

export function claimRegistrationProof(email: string, token: unknown) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }

  const tokenHash = hashToken(token);
  const proof = state.proofs.get(tokenHash);
  if (!proof || proof.email !== email || proof.expiresAt <= Date.now() || proof.inUse) {
    if (proof?.expiresAt && proof.expiresAt <= Date.now()) {
      state.proofs.delete(tokenHash);
    }
    return null;
  }

  proof.inUse = true;
  return tokenHash;
}

export function releaseRegistrationProof(tokenHash: string) {
  const proof = state.proofs.get(tokenHash);
  if (proof && proof.expiresAt > Date.now()) {
    proof.inUse = false;
  } else {
    state.proofs.delete(tokenHash);
  }
}

export function consumeRegistrationProof(tokenHash: string) {
  state.proofs.delete(tokenHash);
}
