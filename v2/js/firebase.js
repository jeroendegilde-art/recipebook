// Dunne laag om Firebase. De rest van de app kent alleen `backend`.
// Zelfde project, zelfde SDK-versie en zelfde paden als v1, zodat beide
// versies op dezelfde recepten werken.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
    getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {
    getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: 'AIzaSyA2MxTgLgzze1G-ukr9HG5WzmsOa76OK_g',
    authDomain: 'recipebook-323a6.firebaseapp.com',
    projectId: 'recipebook-323a6',
    storageBucket: 'recipebook-323a6.firebasestorage.app',
    messagingSenderId: '682711644168',
    appId: '1:682711644168:web:928464fbaa052ddb02b9bd',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export const backend = {
    /** cb krijgt { uid, displayName, email, photoURL } of null. */
    onAuth(cb) {
        return onAuthStateChanged(auth, user => cb(user ? {
            uid: user.uid,
            displayName: user.displayName || '',
            email: user.email || '',
            photoURL: user.photoURL || '',
        } : null));
    },

    signIn() {
        return signInWithPopup(auth, new GoogleAuthProvider());
    },

    signOut() {
        return signOut(auth);
    },

    /** Volg een collectie. cb krijgt een array met documenten (plain objects). */
    watchCollection(path, cb, onError) {
        return onSnapshot(collection(db, ...path), snapshot => {
            const docs = [];
            snapshot.forEach(d => docs.push({ ...d.data(), id: d.data().id || d.id }));
            cb(docs);
        }, onError);
    },

    /** Volg één document. cb krijgt het object of null. */
    watchDoc(path, cb, onError) {
        return onSnapshot(doc(db, ...path), snapshot => {
            cb(snapshot.exists() ? snapshot.data() : null);
        }, onError);
    },

    /** Schrijf een document. Met merge worden alleen de meegegeven velden aangepast. */
    set(path, data, { merge = false } = {}) {
        return setDoc(doc(db, ...path), data, merge ? { merge: true } : undefined);
    },

    remove(path) {
        return deleteDoc(doc(db, ...path));
    },
};
