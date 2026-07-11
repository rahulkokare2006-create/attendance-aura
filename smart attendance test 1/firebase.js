// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyB-8UbGKnoDEXG_BhEK_t6tYzE44A1Ud_M",
  authDomain: "attendance-aura.firebaseapp.com",
  projectId: "attendance-aura",
  storageBucket: "attendance-aura.firebasestorage.app",
  messagingSenderId: "227464229305",
  appId: "1:227464229305:web:47251474c6205c3585c668",
  measurementId: "G-9TF299C3D3",
  databaseURL: "https://attendance-aura-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);        // Firestore
export const rtdb = getDatabase(app);       // Realtime Database
export const storage = getStorage(app);     // Storage

export default app;