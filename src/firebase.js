// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// あなたのプロジェクト専用の接続カギ
const firebaseConfig = {
    apiKey: "AIzaSyB959o0_TSxxu118N_QEzzl6fd-5lgKZLQ",
    authDomain: "cardgame-8b727.firebaseapp.com",
    projectId: "cardgame-8b727",
    storageBucket: "cardgame-8b727.firebasestorage.app",
    messagingSenderId: "485380575649",
    appId: "1:485380575649:web:8fcb9a426d1fa08e0a7be0",
    measurementId: "G-ZCKH636292"
};

// Firebaseを初期化
const app = initializeApp(firebaseConfig);

// データベース（Firestore）の窓口を作って、他のファイルで使えるようにエクスポートする
export const db = getFirestore(app);