import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDsWk4gDRf-NxtKuhnppZ1EAg5OS3z_2dI",
  authDomain: "civiceye-ai-5dcbd.firebaseapp.com",
  projectId: "civiceye-ai-5dcbd",
  storageBucket: "civiceye-ai-5dcbd.firebasestorage.app",
  messagingSenderId: "672612011519",
  appId: "1:672612011519:web:a1820492b906006ac26bca"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Firestore with custom Database ID
export const db = getFirestore(app, "ai-studio-3ecae9bd-a400-46eb-a936-5d136c31734e");

// Auth providers
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously };
