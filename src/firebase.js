// Firebase Configuration
// TODO: Replace with your actual Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA5ubsIzgdbhRvYZe7eJWx4AvB3HT1dZW4",
    authDomain: "pourio-ef0f4.firebaseapp.com",
    projectId: "pourio-ef0f4",
    storageBucket: "pourio-ef0f4.firebasestorage.app",
    messagingSenderId: "888737478950",
    appId: "1:888737478950:web:ab2ddaa4a04d7ef961a9e7",
    measurementId: "G-6T0QH1ZJ1W"
};

// Placeholder for Firebase imports
// In a real build step we might use npm imports, but for vanilla HTML/JS 
// we'll likely rely on CDN or ES modules if supported.
// For now, we'll assume standard modular imports or valid CDN URLs.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, push, child, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let app;
let db;

try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
} catch (e) {
    console.warn("Firebase not properly configured. Multiplayer features will fail until config is updated.", e);
}

export { db, ref, set, onValue, update, push, child, get };
