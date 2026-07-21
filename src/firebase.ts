import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Detect if we are running in the AI Studio environment.
// If yes, connect to the custom AI Studio database. Otherwise (e.g. Vercel, localhost), connect to the project's default database.
const isAiStudio = typeof window !== 'undefined' && (
  window.location.hostname.includes('europe-west2.run.app') ||
  window.location.hostname.includes('aistudio.google')
);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined); /* CRITICAL: The app will break without this line */
export const auth = getAuth();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const isQuota = errMsg.toLowerCase().includes('quota') || 
                  errMsg.toLowerCase().includes('resource-exhausted') ||
                  errMsg.toLowerCase().includes('exhausted') ||
                  (error && typeof error === 'object' && ((error as any).code === 'resource-exhausted' || (error as any).code === 'resource_exhausted'));
  
  if (isQuota) {
    (window as any).firestoreQuotaExceeded = true;
    try {
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    } catch (e) {}
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
