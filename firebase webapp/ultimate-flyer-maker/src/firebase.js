// For Firebase JS SDK v7.20.0 and later, measurementId is optional\
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyB-819iPabsb7Py65akOI9ENto-TIUtIbI",
    authDomain: "ultimate-flyer-project.firebaseapp.com",
    projectId: "ultimate-flyer-project",
    storageBucket: "ultimate-flyer-project.firebasestorage.app",
    messagingSenderId: "632696550015",
    appId: "1:632696550015:web:817d32fd77f53e235a854a",
    measurementId: "G-L5BKBLHGCG"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider, signInWithPopup, signOut };

