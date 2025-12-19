import { initializeApp } from 'firebase/app';
// Kita kembali pakai getFirestore biasa karena initializeFirestore tidak dikenali
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'; 
import { getStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyCxcob7EXIYx8rtGw02TkVk5PyGsH0lx3E",
  authDomain: "secur-mij.firebaseapp.com",
  projectId: "secur-mij",
  storageBucket: "secur-mij.firebasestorage.app",
  messagingSenderId: "1088201329042",
  appId: "1:1088201329042:web:139d6ae52467fa0e66194b"
};

const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

// KEMBALI KE CARA LAMA (Tanpa setting Long Polling)
// Jika masih loading terus, coba ganti koneksi internet (WiFi <-> Data)
const db = getFirestore(app);

const storage = getStorage(app);

export { auth, db, storage };