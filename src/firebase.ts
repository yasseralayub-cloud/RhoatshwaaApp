import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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

export interface DiagnosticsReport {
  timestamp: string;
  connected: boolean;
  online: boolean;
  auth: {
    uid: string | null;
    email: string | null;
    emailVerified: boolean | null;
    isAnonymous: boolean | null;
    isAuthorizedEmail: boolean;
  };
  firestoreDatabaseId: string | null;
  tests: {
    readSettingsTest: { success: boolean; error?: string; data?: any };
    listOrdersTest: { success: boolean; error?: string; count?: number };
  };
}

export async function diagnoseFirestoreConnection(): Promise<DiagnosticsReport> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const currentUser = auth.currentUser;
  const authorizedEmail = 'yasseralayub@gmail.com';
  const hasAuthorizedEmail = currentUser?.email?.toLowerCase() === authorizedEmail;

  const report: DiagnosticsReport = {
    timestamp: new Date().toISOString(),
    connected: false,
    online: isOnline,
    auth: {
      uid: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      isAuthorizedEmail: hasAuthorizedEmail,
    },
    firestoreDatabaseId: (firebaseConfig as any).firestoreDatabaseId || 'default',
    tests: {
      readSettingsTest: { success: false },
      listOrdersTest: { success: false }
    }
  };

  // Test 1: Read 'settings/business' doc
  try {
    const docRef = doc(db, 'settings', 'business');
    const docSnap = await getDoc(docRef);
    report.tests.readSettingsTest = {
      success: true,
      data: docSnap.exists() ? 'Found' : 'Not Found'
    };
    report.connected = true; // Contacted firestore successfully
  } catch (err: any) {
    report.tests.readSettingsTest = {
      success: false,
      error: err.message || String(err)
    };
  }

  // Test 2: Try listing orders (limited to 1 for test)
  try {
    const q = query(collection(db, 'orders'), limit(1));
    const querySnapshot = await getDocs(q);
    report.tests.listOrdersTest = {
      success: true,
      count: querySnapshot.size
    };
    report.connected = true;
  } catch (err: any) {
    report.tests.listOrdersTest = {
      success: false,
      error: err.message || String(err)
    };
  }

  return report;
}

