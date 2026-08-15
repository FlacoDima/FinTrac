// Importar las funciones necesarias de los SDKs de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Configuración de Firebase del proyecto
const firebaseConfig = {
  apiKey: "AIzaSyCdBQXux0uZb8QrSKE5G-AWKk5pzAWqFuM",
  authDomain: "fintrac-5ad9b.firebaseapp.com",
  projectId: "fintrac-5ad9b",
  storageBucket: "fintrac-5ad9b.firebasestorage.app",
  messagingSenderId: "404746985046",
  appId: "1:404746985046:web:ea69e8c4a6a91b33b0e5f7"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Inicializar Firestore

export { auth, db, doc, updateDoc };
