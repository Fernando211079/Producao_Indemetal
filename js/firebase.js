// =========================================
// Firebase
// Sistema Integrado de Gestão da Produção
// =========================================

const firebaseConfig = {

    apiKey: "AIzaSyDe4wYlROJJ3Xh5kfemFbItjkHF6RKZscc",

    authDomain: "indemetal-6af63.firebaseapp.com",

    projectId: "indemetal-6af63",

    storageBucket: "indemetal-6af63.firebasestorage.app",

    messagingSenderId: "204244216570",

    appId: "1:204244216570:web:5ea6e0ad1224c6c32cb743"

};

// Inicializa somente uma vez
if (!firebase.apps.length) {

    firebase.initializeApp(firebaseConfig);

}

// Firestore
const db = firebase.firestore();

console.log("✅ Firebase conectado.");