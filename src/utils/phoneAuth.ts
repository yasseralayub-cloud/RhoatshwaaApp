import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  ConfirmationResult,
  PhoneAuthProvider,
  RecaptchaVerifier,
  User,
  signInWithCredential,
  signInWithPhoneNumber,
  signOut
} from 'firebase/auth';
import { auth } from '../firebase';

export type PhoneAuthSession =
  | {
      mode: 'native';
      phoneNumber: string;
      verificationId: string;
      sessionSeq: number;
    }
  | {
      mode: 'web';
      phoneNumber: string;
      confirmationResult: ConfirmationResult;
    };

export interface SendPhoneCodeOptions {
  phoneInput: string;
  recaptchaContainerId: string;
  isResend?: boolean;
  onAutoVerified?: (user: User, verifySeq: number) => void | Promise<void>;
  onAutoVerifyError?: (error: unknown) => void;
}

export interface VerifiedPhoneResult {
  user: User;
  idToken: string;
  verifySeq: number;
}

interface NativeAttemptState {
  seq: number;
  scope: string;
  phoneNumber: string;
  handles: PluginListenerHandle[];
  verificationId: string;
  inFlightVerify: Promise<VerifiedPhoneResult> | null;
  completed: boolean;
  verifiedResult: VerifiedPhoneResult | null;
  cancelled: boolean;
  listenersRemoved: boolean;
  evictTimer: ReturnType<typeof setTimeout> | null;
}

const COMPLETED_ATTEMPT_TTL_MS = 2 * 60 * 1000;
const MAX_STORED_ATTEMPTS = 10;

let nextSessionSeq = 0;
let activeNativeSeq: number | null = null;
let signInSeqCounter = 0;
let latestSignInStartedSeq = 0;
const nativeAttemptsBySeq = new Map<number, NativeAttemptState>();
const nativeAttemptsByVerificationId = new Map<string, NativeAttemptState>();
const webRecaptchaMap = new Map<string, RecaptchaVerifier>();
let lastNativePhoneWithResendToken: string | null = null;

function createSessionExpiredError(): Error {
  const err = new Error('Verification session expired or closed');
  (err as any).code = 'auth/code-expired';
  return err;
}

/**
 * Rolls back `auth.currentUser` ONLY when a cancelled/stale verification flow signed in that exact user
 * AND no newer sign-in attempt has started since `verifySeq`.
 */
export async function rollbackStaleFirebaseSignIn(fbUser: User, verifySeq?: number): Promise<void> {
  if (verifySeq !== undefined && latestSignInStartedSeq > verifySeq) {
    return;
  }
  if (auth.currentUser && auth.currentUser.uid === fbUser.uid) {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Failed to roll back stale Firebase Auth sign-in:', err);
    }
  }
}

/**
 * Formats Saudi phone numbers into E.164 format (+9665XXXXXXXX).
 */
export function formatSaudiPhoneE164(phone: string): string {
  const clean = phone.trim().replace(/\D/g, '');
  if (clean.startsWith('05') && clean.length === 10) {
    return '+966' + clean.substring(1);
  }
  if (clean.startsWith('5') && clean.length === 9) {
    return '+966' + clean;
  }
  if (clean.startsWith('9665') && clean.length === 12) {
    return '+' + clean;
  }
  if (clean.length === 9) {
    return '+966' + clean;
  }
  if (clean.startsWith('00966') && clean.length === 14) {
    return '+' + clean.substring(2);
  }
  if (!phone.trim().startsWith('+')) {
    return '+' + clean;
  }
  return phone.trim();
}

/**
 * Normalizes Saudi phone input into 05XXXXXXXX local storage / Firestore document key format.
 */
export function toLocalSaudiPhone(phone: string): string {
  const clean = phone.trim();
  if (clean.startsWith('5')) return '0' + clean;
  if (clean.startsWith('9665')) return '0' + clean.substring(3);
  if (clean.startsWith('+9665')) return '0' + clean.substring(4);
  const digits = clean.replace(/\D/g, '');
  if (digits.startsWith('9665') && digits.length === 12) {
    return '0' + digits.substring(3);
  }
  if (digits.startsWith('5') && digits.length === 9) {
    return '0' + digits;
  }
  return clean;
}

/**
 * Removes ONLY the native event listener handles of the specified attempt.
 * Separated from deleting the attempt record so a completed attempt's `verifiedResult`
 * remains readable to a concurrent manual verification request.
 */
async function removeAttemptListeners(attempt: NativeAttemptState): Promise<void> {
  attempt.listenersRemoved = true;
  if (activeNativeSeq === attempt.seq) {
    activeNativeSeq = null;
  }

  const handlesToRemove = attempt.handles.splice(0, attempt.handles.length);
  for (const handle of handlesToRemove) {
    try {
      await handle.remove();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Deletes an attempt record from both lookup maps if it is safe to evict.
 */
function evictAttemptRecord(attempt: NativeAttemptState): void {
  if (attempt.evictTimer) {
    clearTimeout(attempt.evictTimer);
    attempt.evictTimer = null;
  }
  if (nativeAttemptsBySeq.get(attempt.seq) === attempt) {
    nativeAttemptsBySeq.delete(attempt.seq);
  }
  if (attempt.verificationId && nativeAttemptsByVerificationId.get(attempt.verificationId) === attempt) {
    nativeAttemptsByVerificationId.delete(attempt.verificationId);
  }
}

/**
 * Keeps completed session results available briefly for late concurrent callers,
 * then evicts them automatically to avoid unbounded memory retention.
 */
function scheduleCompletedAttemptEviction(attempt: NativeAttemptState): void {
  if (attempt.evictTimer) {
    clearTimeout(attempt.evictTimer);
  }
  attempt.evictTimer = setTimeout(() => {
    evictAttemptRecord(attempt);
  }, COMPLETED_ATTEMPT_TTL_MS);

  while (nativeAttemptsBySeq.size > MAX_STORED_ATTEMPTS) {
    const oldestKey = nativeAttemptsBySeq.keys().next().value;
    if (oldestKey === undefined || oldestKey === attempt.seq) break;
    const oldest = nativeAttemptsBySeq.get(oldestKey);
    if (oldest && !oldest.inFlightVerify) {
      evictAttemptRecord(oldest);
    } else {
      break;
    }
  }
}

/**
 * Cancels an uncompleted attempt (marks cancelled, removes listeners, and evicts its record once idle),
 * OR strips listeners from a completed attempt while preserving its verifiedResult until TTL.
 */
async function cleanupAttemptListeners(attempt: NativeAttemptState): Promise<void> {
  if (!attempt.completed) {
    attempt.cancelled = true;
  }
  await removeAttemptListeners(attempt);

  if (!attempt.completed && !attempt.inFlightVerify) {
    evictAttemptRecord(attempt);
  }
}

/**
 * Removes active native phone auth listeners.
 * When `scope` is provided (e.g. a component's container ID), only attempts created by that scope are cleaned up.
 */
export async function cleanupPhoneAuthListeners(scope?: string): Promise<void> {
  const attempts = Array.from(nativeAttemptsBySeq.values()).filter(
    (attempt) => (!scope || attempt.scope === scope) && (!attempt.listenersRemoved || !attempt.completed)
  );
  for (const attempt of attempts) {
    await cleanupAttemptListeners(attempt);
  }
}

/**
 * Clears any cached Web RecaptchaVerifier instance for a given container ID.
 */
export function clearWebRecaptchaVerifier(containerId: string): void {
  const existing = webRecaptchaMap.get(containerId);
  if (existing) {
    try {
      existing.clear();
    } catch {
      // Ignore cleanup errors
    }
    webRecaptchaMap.delete(containerId);
  }
}

/**
 * Shared single-execution lock per verificationId session.
 * Prevents the SMS OTP from being consumed twice between `phoneVerificationCompleted` and manual `verifyPhoneOtpCode`.
 * Uses a re-checking loop after awaiting `inFlightVerify` so repeated `phoneVerificationCompleted` events
 * can never launch concurrent `signInWithCredential` calls.
 */
async function executeLockedVerification(
  attempt: NativeAttemptState,
  verificationId: string,
  smsCode: string,
  source: 'auto' | 'manual'
): Promise<{ result: VerifiedPhoneResult; verifiedByThisCaller: boolean }> {
  while (true) {
    if (attempt.completed && attempt.verifiedResult) {
      return { result: attempt.verifiedResult, verifiedByThisCaller: false };
    }

    if (attempt.cancelled && !attempt.completed) {
      throw createSessionExpiredError();
    }

    const activePromise = attempt.inFlightVerify;
    if (!activePromise) {
      break;
    }

    if (source === 'manual') {
      const result = await activePromise;
      return { result, verifiedByThisCaller: false };
    }

    // Auto-verification arrived while another verification attempt was already in flight:
    // wait for it, then re-check completed, cancelled, and inFlightVerify on the next iteration.
    try {
      const result = await activePromise;
      return { result, verifiedByThisCaller: false };
    } catch {
      // Loop back to re-check lock state before starting a new verifyPromise
    }
  }

  const verifySeq = ++signInSeqCounter;
  latestSignInStartedSeq = verifySeq;

  const verifyPromise = (async (): Promise<VerifiedPhoneResult> => {
    const credential = PhoneAuthProvider.credential(verificationId, smsCode.trim());
    const userCredential = await signInWithCredential(auth, credential);

    if (attempt.cancelled) {
      await rollbackStaleFirebaseSignIn(userCredential.user, verifySeq);
      throw createSessionExpiredError();
    }

    const idToken = await userCredential.user.getIdToken();
    if (attempt.cancelled) {
      await rollbackStaleFirebaseSignIn(userCredential.user, verifySeq);
      throw createSessionExpiredError();
    }

    const result: VerifiedPhoneResult = { user: userCredential.user, idToken, verifySeq };
    attempt.completed = true;
    attempt.verifiedResult = result;
    await removeAttemptListeners(attempt);
    scheduleCompletedAttemptEviction(attempt);
    return result;
  })();

  attempt.inFlightVerify = verifyPromise;
  try {
    const result = await verifyPromise;
    return { result, verifiedByThisCaller: true };
  } finally {
    if (attempt.inFlightVerify === verifyPromise) {
      attempt.inFlightVerify = null;
    }
    if (attempt.cancelled && !attempt.completed) {
      evictAttemptRecord(attempt);
    }
  }
}

/**
 * Sends a Firebase Phone Auth OTP code:
 * - On Capacitor native platforms (Android / iOS): uses @capacitor-firebase/authentication
 *   with `skipNativeAuth: true` so Play Integrity / APNs verification runs natively without WebView reCAPTCHA,
 *   while leaving final sign-in to Firebase JS SDK via `signInWithCredential`.
 * - On standard Web browsers: preserves RecaptchaVerifier + signInWithPhoneNumber from firebase/auth.
 */
export async function sendPhoneVerificationCode(
  options: SendPhoneCodeOptions
): Promise<PhoneAuthSession> {
  const e164Phone = formatSaudiPhoneE164(options.phoneInput);

  if (Capacitor.isNativePlatform()) {
    // Native plugin events (`phoneCodeSent`, `phoneVerificationCompleted`, `phoneVerificationFailed`)
    // are global on Android/iOS, so cancel any active uncompleted native attempt before starting a new one.
    if (activeNativeSeq !== null) {
      const previousActive = nativeAttemptsBySeq.get(activeNativeSeq);
      if (previousActive) {
        await cleanupAttemptListeners(previousActive);
      }
    }
    await cleanupPhoneAuthListeners();

    const attempt: NativeAttemptState = {
      seq: ++nextSessionSeq,
      scope: options.recaptchaContainerId,
      phoneNumber: e164Phone,
      handles: [],
      verificationId: '',
      inFlightVerify: null,
      completed: false,
      verifiedResult: null,
      cancelled: false,
      listenersRemoved: false,
      evictTimer: null
    };
    activeNativeSeq = attempt.seq;
    nativeAttemptsBySeq.set(attempt.seq, attempt);

    return new Promise<PhoneAuthSession>(async (resolve, reject) => {
      let settled = false;

      const settleResolve = (session: PhoneAuthSession) => {
        if (settled) return;
        settled = true;
        resolve(session);
      };

      const settleReject = (err: unknown) => {
        if (settled) return;
        settled = true;
        void cleanupAttemptListeners(attempt);
        reject(err);
      };

      try {
        const codeSentHandle = await FirebaseAuthentication.addListener(
          'phoneCodeSent',
          (event) => {
            if (attempt.cancelled || attempt.listenersRemoved || activeNativeSeq !== attempt.seq) return;
            attempt.verificationId = event.verificationId;
            nativeAttemptsByVerificationId.set(event.verificationId, attempt);
            lastNativePhoneWithResendToken = e164Phone;
            settleResolve({
              mode: 'native',
              phoneNumber: e164Phone,
              verificationId: event.verificationId,
              sessionSeq: attempt.seq
            });
          }
        );
        if (attempt.cancelled || attempt.listenersRemoved || activeNativeSeq !== attempt.seq) {
          await codeSentHandle.remove().catch(() => {});
          return;
        }
        attempt.handles.push(codeSentHandle);

        const failedHandle = await FirebaseAuthentication.addListener(
          'phoneVerificationFailed',
          (event) => {
            if (attempt.cancelled || attempt.listenersRemoved || activeNativeSeq !== attempt.seq) return;
            const err = new Error(event?.message || 'Native phone verification failed');
            (err as any).code = extractFirebaseErrorCode(event?.message);
            if (!settled) {
              settleReject(err);
            } else {
              void cleanupAttemptListeners(attempt);
              options.onAutoVerifyError?.(err);
            }
          }
        );
        if (attempt.cancelled || attempt.listenersRemoved || activeNativeSeq !== attempt.seq) {
          await failedHandle.remove().catch(() => {});
          return;
        }
        attempt.handles.push(failedHandle);

        const completedHandle = await FirebaseAuthentication.addListener(
          'phoneVerificationCompleted',
          async (event) => {
            if (attempt.cancelled || attempt.listenersRemoved || activeNativeSeq !== attempt.seq) return;

            // Android SMS auto-retrieval: both verificationId (from phoneCodeSent) and smsCode are present.
            if (attempt.verificationId && event?.verificationCode) {
              try {
                const { result, verifiedByThisCaller } = await executeLockedVerification(
                  attempt,
                  attempt.verificationId,
                  event.verificationCode,
                  'auto'
                );

                if (
                  verifiedByThisCaller &&
                  !attempt.cancelled &&
                  (activeNativeSeq === null || activeNativeSeq === attempt.seq)
                ) {
                  await options.onAutoVerified?.(result.user, result.verifySeq);
                }

                if (!settled) {
                  settleResolve({
                    mode: 'native',
                    phoneNumber: e164Phone,
                    verificationId: attempt.verificationId,
                    sessionSeq: attempt.seq
                  });
                }
              } catch (syncErr) {
                if (!settled) {
                  settleReject(syncErr);
                } else if (!attempt.cancelled) {
                  options.onAutoVerifyError?.(syncErr);
                }
              }
              return;
            }

            // Android Instant Verification (no SMS code / no verificationId while skipNativeAuth: true)
            // Cannot construct a PhoneAuthCredential in Firebase JS SDK without verificationId + smsCode.
            const instantErr = new Error(
              'Instant phone verification completed without an SMS code; cannot sync JS SDK credential.'
            );
            (instantErr as any).code = 'auth/instant-verification-unsupported';
            if (!settled) {
              settleReject(instantErr);
            } else {
              void cleanupAttemptListeners(attempt);
              options.onAutoVerifyError?.(instantErr);
            }
          }
        );
        if (attempt.cancelled || attempt.listenersRemoved || activeNativeSeq !== attempt.seq) {
          await completedHandle.remove().catch(() => {});
          return;
        }
        attempt.handles.push(completedHandle);

        const canUseResendToken =
          Boolean(options.isResend) &&
          lastNativePhoneWithResendToken === e164Phone;

        await FirebaseAuthentication.signInWithPhoneNumber({
          phoneNumber: e164Phone,
          skipNativeAuth: true,
          resendCode: canUseResendToken
        });
      } catch (err) {
        settleReject(err);
      }
    });
  }

  // Web Browser path: preserve standard Firebase Web RecaptchaVerifier + signInWithPhoneNumber
  clearWebRecaptchaVerifier(options.recaptchaContainerId);

  const containerEl = document.getElementById(options.recaptchaContainerId);
  if (!containerEl) {
    throw new Error('Recaptcha container not found in DOM');
  }

  const verifier = new RecaptchaVerifier(auth, options.recaptchaContainerId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved
    },
    'expired-callback': () => {
      clearWebRecaptchaVerifier(options.recaptchaContainerId);
    }
  });
  webRecaptchaMap.set(options.recaptchaContainerId, verifier);

  try {
    const confirmationResult = await signInWithPhoneNumber(auth, e164Phone, verifier);
    return {
      mode: 'web',
      phoneNumber: e164Phone,
      confirmationResult
    };
  } catch (err) {
    clearWebRecaptchaVerifier(options.recaptchaContainerId);
    throw err;
  }
}

/**
 * Confirms the 6-digit SMS code and guarantees the user is signed in on Firebase JS SDK (`auth.currentUser`).
 * - Native mode (`skipNativeAuth: true`): exchanges `(verificationId, verificationCode)` strictly inside
 *   the shared session lock (`executeLockedVerification`). Never calls `signInWithCredential` outside the lock.
 * - Web mode: calls `confirmationResult.confirm(verificationCode)`.
 */
export async function verifyPhoneOtpCode(
  session: PhoneAuthSession,
  verificationCode: string
): Promise<VerifiedPhoneResult> {
  const cleanCode = verificationCode.trim();

  if (session.mode === 'native') {
    const attempt =
      nativeAttemptsBySeq.get(session.sessionSeq) ??
      nativeAttemptsByVerificationId.get(session.verificationId);

    if (!attempt) {
      throw createSessionExpiredError();
    }

    const { result } = await executeLockedVerification(
      attempt,
      session.verificationId,
      cleanCode,
      'manual'
    );
    return result;
  }

  const verifySeq = ++signInSeqCounter;
  latestSignInStartedSeq = verifySeq;
  const userCredential = await session.confirmationResult.confirm(cleanCode);
  const idToken = await userCredential.user.getIdToken();
  return { user: userCredential.user, idToken, verifySeq };
}

function extractFirebaseErrorCode(message?: string): string | undefined {
  if (!message) return undefined;
  const match = message.match(/auth\/[a-z0-9-]+/i);
  if (match) return match[0].toLowerCase();
  const upper = message.toUpperCase();
  if (upper.includes('INVALID_APP_CREDENTIAL')) return 'auth/invalid-app-credential';
  if (upper.includes('INVALID_PHONE_NUMBER')) return 'auth/invalid-phone-number';
  if (upper.includes('INVALID_VERIFICATION_CODE') || upper.includes('INVALID_CODE')) return 'auth/invalid-verification-code';
  if (upper.includes('SESSION_EXPIRED') || upper.includes('CODE_EXPIRED')) return 'auth/code-expired';
  if (upper.includes('TOO_MANY_REQUESTS') || upper.includes('TOO_MANY_ATTEMPTS')) return 'auth/too-many-requests';
  if (upper.includes('QUOTA_EXCEEDED')) return 'auth/quota-exceeded';
  if (upper.includes('OPERATION_NOT_ALLOWED')) return 'auth/operation-not-allowed';
  if (upper.includes('NETWORK')) return 'auth/network-request-failed';
  return undefined;
}

/**
 * Maps Firebase Auth & Capacitor native phone auth errors to clear bilingual user messages.
 */
export function mapPhoneAuthError(
  err: any,
  language: 'ar' | 'en',
  phase: 'send' | 'verify' = 'send'
): { message: string; showHelp: boolean } {
  const rawCode = String(err?.code || extractFirebaseErrorCode(err?.message) || '').toLowerCase();
  const rawMsg = String(err?.message || '');
  const lowerMsg = rawMsg.toLowerCase();

  if (
    rawCode === 'auth/invalid-app-credential' ||
    lowerMsg.includes('invalid-app-credential') ||
    lowerMsg.includes('play integrity') ||
    lowerMsg.includes('app-not-authorized') ||
    lowerMsg.includes('not authorized to use firebase authentication')
  ) {
    return {
      showHelp: true,
      message:
        language === 'ar'
          ? '⚠️ تعذر التحقق من هوية التطبيق (auth/invalid-app-credential). تأكد من إضافة بصمات SHA-1 و SHA-256 وتفعيل Play Integrity API في Firebase Console.'
          : '⚠️ App verification failed (auth/invalid-app-credential). Ensure SHA-1/SHA-256 fingerprints and Play Integrity API are configured in Firebase Console.'
    };
  }

  if (rawCode === 'auth/invalid-phone-number' || lowerMsg.includes('invalid phone')) {
    return {
      showHelp: false,
      message:
        language === 'ar'
          ? 'رقم الجوال غير صالح! يرجى التأكد من إدخال رقم سعودي صحيح.'
          : 'Invalid phone number! Please enter a valid Saudi mobile number.'
    };
  }

  if (rawCode === 'auth/invalid-verification-code' || lowerMsg.includes('invalid-verification-code')) {
    return {
      showHelp: false,
      message:
        language === 'ar'
          ? 'رمز التحقق الذي أدخلته غير صحيح! يرجى التأكد من الأرقام الستة والمحاولة مجدداً.'
          : 'The verification code entered is incorrect! Please check and try again.'
    };
  }

  if (
    rawCode === 'auth/code-expired' ||
    rawCode === 'auth/session-expired' ||
    lowerMsg.includes('expired')
  ) {
    return {
      showHelp: false,
      message:
        language === 'ar'
          ? 'انتهت صلاحية رمز التحقق، يرجى الضغط على «إعادة إرسال الرمز» لطلب رمز جديد.'
          : 'The verification code has expired. Please tap Resend Code to request a new one.'
    };
  }

  if (rawCode === 'auth/too-many-requests' || lowerMsg.includes('too-many-requests')) {
    return {
      showHelp: false,
      message:
        language === 'ar'
          ? 'تم إرسال عدد كبير من الطلبات. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
          : 'Too many requests. Please wait a moment and try again.'
    };
  }

  if (rawCode === 'auth/quota-exceeded' || lowerMsg.includes('quota')) {
    return {
      showHelp: false,
      message:
        language === 'ar'
          ? 'تم الوصول للحد اليومي لرسائل التحقق، يرجى المحاولة لاحقاً.'
          : 'Daily SMS quota exceeded. Please try again later.'
    };
  }

  if (rawCode === 'auth/network-request-failed' || lowerMsg.includes('network')) {
    return {
      showHelp: false,
      message:
        language === 'ar'
          ? 'تعذر الاتصال بالشبكة، يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.'
          : 'Network error. Please check your internet connection and try again.'
    };
  }

  if (
    rawCode === 'auth/operation-not-allowed' ||
    lowerMsg.includes('operation-not-allowed') ||
    lowerMsg.includes('region') ||
    lowerMsg.includes('sms unable to be sent')
  ) {
    return {
      showHelp: true,
      message:
        language === 'ar'
          ? '⚠️ لم يتم إرسال الرمز: خيار Phone Sign-In غير مفعل أو تحتاج لتفعيل منطقة المملكة العربية السعودية (+966) من إعدادات الـ SMS في Firebase Console.'
          : '⚠️ SMS not sent: Phone Sign-In is disabled or you need to allow Saudi Arabia (+966) region in Firebase Console SMS Settings.'
    };
  }

  if (rawCode === 'auth/instant-verification-unsupported') {
    return {
      showHelp: false,
      message:
        language === 'ar'
          ? 'تم التحقق الفوري من الجهاز بدون رمز SMS ولم تتم مزامنة الجلسة. يرجى استخدام رقم جوال يستقبل رسالة SMS أو إعادة المحاولة.'
          : 'Instant device verification completed without an SMS code. Please use a mobile number that receives SMS or retry.'
    };
  }

  if (lowerMsg.includes('captcha') || rawCode.includes('captcha')) {
    return {
      showHelp: false,
      message:
        language === 'ar'
          ? 'تعذر التحقق الأمني (reCAPTCHA). يرجى المحاولة مرة أخرى.'
          : 'reCAPTCHA verification failed. Please try again.'
    };
  }

  if (phase === 'verify') {
    return {
      showHelp: false,
      message:
        language === 'ar'
          ? `فشل التحقق من الرمز، يرجى المحاولة مرة أخرى.${rawCode ? ` (${rawCode})` : ''}`
          : `Verification failed. Please try again.${rawCode ? ` (${rawCode})` : ''}`
    };
  }

  return {
    showHelp: false,
    message:
      language === 'ar'
        ? `فشل إرسال رمز التحقق. يرجى التحقق من رقم الجوال واتصال الإنترنت.${rawCode ? ` (${rawCode})` : rawMsg ? ` (${rawMsg})` : ''}`
        : `Failed to send verification code. Please check your number and internet connection.${rawCode ? ` (${rawCode})` : rawMsg ? ` (${rawMsg})` : ''}`
  };
}
