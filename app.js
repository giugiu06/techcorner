// app.js

// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth, onAuthStateChanged, GoogleAuthProvider, GithubAuthProvider,
    signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    RecaptchaVerifier, signInWithPhoneNumber, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, onSnapshot, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Firebase Configuration (YOUR CREDENTIALS)
const firebaseConfig = {
    apiKey: "AIzaSyDAS5ei3AY-DmQe1Uu_NtVwTSb0ymaYi-w", // Sostituisci con la tua apiKey
    authDomain: "thcorner-8da87.firebaseapp.com",
    projectId: "thcorner-8da87",
    storageBucket: "thcorner-8da87.appspot.com", // Ho corretto qui .firebaseapp.com a .appspot.com
    messagingSenderId: "448092133807",
    appId: "1:448092133807:web:6513476d05f308a3d54d24"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Global Variables for App State
let currentUser = null; // Stores the current authenticated user
let currentProfileData = null; // Stores the profile data of the current user
let currentView = 'promotionWall'; // Controls which section of the app is displayed
let recaptchaVerifier; // Variable for reCAPTCHA

// DOM Elements
const mainContentArea = document.getElementById('mainContentArea');
const promotionWallNav = document.getElementById('promotionWallNav');
const promoteYourselfNav = document.getElementById('promoteYourselfNav');
const communityNav = document.getElementById('communityNav');
const profileNav = document.getElementById('profileNav');
const authNav = document.getElementById('authNav'); // New auth navigation button

// --- Utility Functions ---

/**
 * Displays a custom message box instead of alert().
 * @param {string} title The title of the message box.
 * @param {string} message The message content.
 * @param {string} type 'success' or 'error' for styling.
 */
function showMessageBox(title, message, type = 'info') {
    // Remove any existing message box to prevent duplicates
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) {
        existingModal.remove();
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay'; // Defined in style.css for overlay effect

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content custom-card'; // Reusing custom-card for styling

    const modalTitle = document.createElement('h3');
    modalTitle.className = 'modal-title';
    modalTitle.textContent = title;

    const modalMessage = document.createElement('p');
    modalMessage.className = 'modal-message';
    modalMessage.textContent = message;

    const closeButton = document.createElement('button');
    closeButton.className = 'modal-button bg-blue-500 hover:bg-blue-600 text-white';
    closeButton.textContent = 'OK';
    closeButton.onclick = () => {
        modalOverlay.remove();
    };

    modalContent.appendChild(modalTitle);
    modalContent.appendChild(modalMessage);
    modalContent.appendChild(closeButton);
    modalOverlay.appendChild(modalContent);

    document.body.appendChild(modalOverlay);
}


/**
 * Retrieves user profile data from Firestore.
 * @param {string} userId The UID of the user.
 * @returns {Promise<Object|null>} User profile data or null if not found.
 */
async function getUserProfile(userId) {
    if (!userId) return null;
    try {
        const userDocRef = doc(db, 'users', userId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            return userDocSnap.data();
        } else {
            console.log("No such user profile!");
            return null;
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
        showMessageBox('Errore', 'Impossibile caricare il profilo utente.', 'error');
        return null;
    }
}

/**
 * Creates a new user profile in Firestore.
 * @param {string} userId The UID of the new user.
 * @param {string} username The desired username.
 * @param {string} email The user's email.
 */
async function createUserProfile(userId, username, email) {
    try {
        const userDocRef = doc(db, 'users', userId);
        await setDoc(userDocRef, {
            username: username,
            email: email,
            createdAt: new Date(),
            avatarUrl: '' // Default empty avatar
        });
        console.log("User profile created successfully!");
    } catch (error) {
        console.error("Error creating user profile:", error);
        showMessageBox('Errore', 'Impossibile creare il profilo utente.', 'error');
    }
}

// --- Navigation and UI Updates ---

/**
 * Updates the text content of navigation buttons based on screen width.
 * On mobile, hides text and shows only icons. On desktop, shows full text.
 */
function updateNavText() {
    const isMobile = window.innerWidth < 640; // Tailwind's 'sm' breakpoint

    document.querySelectorAll('.nav-button').forEach(button => {
        const navTextSpan = button.querySelector('.nav-text');
        const desktopText = button.getAttribute('data-desktop-text');

        if (navTextSpan) {
            if (isMobile) {
                navTextSpan.style.display = 'none';
            } else {
                navTextSpan.style.display = 'inline';
                if (desktopText) {
                    navTextSpan.textContent = desktopText; // Restore desktop text if available
                }
            }
        }
    });

    // Handle authNav specifically as its text changes
    updateAuthButton();
}

/**
 * Updates the 'Log In' / 'Log Out' button text and functionality.
 */
function updateAuthButton() {
    if (authNav) {
        const authIcon = authNav.querySelector('.button-icon');
        const authText = authNav.querySelector('.nav-text');

        if (currentUser) {
            // User is logged in
            authText.textContent = 'Log Out';
            authIcon.innerHTML = `<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/> <polyline points="10 17 15 12 10 7"/> <line x1="15" x2="3" y1="12" y2="12"/>`; // Log out icon
            authNav.onclick = async () => {
                try {
                    await signOut(auth);
                    showMessageBox('Logout', 'Sei stato disconnesso con successo.');
                    currentView = 'promotionWall'; // Redirect to promotion wall after logout
                    renderPage();
                } catch (error) {
                    console.error("Error signing out:", error);
                    showMessageBox('Errore', 'Impossibile effettuare il logout.', 'error');
                }
            };
        } else {
            // User is not logged in
            authText.textContent = 'Log In';
            authIcon.innerHTML = `<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/> <polyline points="10 17 15 12 10 7"/> <line x1="15" x2="3" y1="12" y2="12"/>`; // Log in icon
            authNav.onclick = () => {
                currentView = 'authPage';
                renderPage();
            };
        }

        // Ensure auth text is hidden on mobile
        const isMobile = window.innerWidth < 640;
        if (authText) {
            if (isMobile) {
                authText.style.display = 'none';
            } else {
                authText.style.display = 'inline';
            }
        }
    }
}

/**
 * Main rendering function based on currentView.
 */
function renderPage() {
    mainContentArea.innerHTML = ''; // Clear existing content
    updateNavText(); // Update navigation text for responsiveness
    updateAuthButton(); // Update auth button based on login status

    switch (currentView) {
        case 'promotionWall':
            renderPromotionWall();
            break;
        case 'promoteYourself':
            renderPromoteYourself();
            break;
        case 'community':
            renderCommunityPage();
            break;
        case 'profile':
            renderProfilePage();
            break;
        case 'authPage':
            renderAuthPage();
            break;
        case 'firstTimeSetup':
            renderFirstTimeSetup();
            break;
        default:
            renderPromotionWall();
    }
}

// --- Page Rendering Functions ---

/**
 * Renders the Authentication page with login/signup options.
 */
function renderAuthPage() {
    mainContentArea.innerHTML = `
        <div class="auth-form custom-card">
            <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">Accedi o Registrati</h2>

            <!-- Google Login -->
            <button id="googleSignInBtn" class="form-button bg-red-600 hover:bg-red-700 text-white mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24px" height="24px" class="fill-current">
                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,8.065,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,8.065,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,2.668,0.563,5.27,1.606,7.495L6.306,14.691z"/>
                    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,4.78C7.594,39.577,15.394,44,24,44z"/>
                    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.002,0.003-0.003l5.657,5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                </svg>
                Accedi con Google
            </button>

            <!-- Separator -->
            <div class="flex items-center my-4">
                <div class="flex-grow border-t border-gray-300"></div>
                <span class="mx-4 text-gray-500">O</span>
                <div class="flex-grow border-t border-gray-300"></div>
            </div>

            <!-- Email/Password Login -->
            <div class="form-group">
                <label for="emailInput" class="form-label">Email</label>
                <input type="email" id="emailInput" class="form-input" placeholder="La tua email">
            </div>
            <div class="form-group">
                <label for="passwordInput" class="form-label">Password</label>
                <input type="password" id="passwordInput" class="form-input" placeholder="La tua password">
            </div>
            <button id="emailSignInBtn" class="form-button bg-blue-500 hover:bg-blue-600 text-white mb-2">
                Accedi con Email
            </button>
            <button id="emailSignUpBtn" class="form-button bg-green-500 hover:bg-green-600 text-white">
                Registrati con Email
            </button>

            <!-- Separator -->
            <div class="flex items-center my-4">
                <div class="flex-grow border-t border-gray-300"></div>
                <span class="mx-4 text-gray-500">O</span>
                <div class="flex-grow border-t border-gray-300"></div>
            </div>

            <!-- Phone Number Login -->
            <div class="form-group">
                <label for="phoneInput" class="form-label">Numero di Telefono (con prefisso internazionale)</label>
                <input type="tel" id="phoneInput" class="form-input" placeholder="+39XXXXXXXXXX">
            </div>
            <div id="recaptcha-container"></div>
            <button id="phoneSignInBtn" class="form-button bg-purple-500 hover:bg-purple-600 text-white">
                Accedi con Telefono
            </button>
        </div>
    `;

    // Initialize reCAPTCHA verifier after the container is in the DOM
    if (!recaptchaVerifier) { // Only initialize once
        recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            'size': 'normal',
            'callback': (response) => {
                // reCAPTCHA solved, allow signInWithPhoneNumber.
                console.log("reCAPTCHA verificato!");
            },
            'expired-callback': () => {
                // reCAPTCHA expired, reset reCAPTCHA.
                console.log("reCAPTCHA scaduto.");
                showMessageBox('Attenzione', 'reCAPTCHA scaduto, riprova.', 'warning');
            }
        });
        recaptchaVerifier.render().then((widgetId) => {
            console.log("reCAPTCHA rendered:", widgetId);
        });
    } else {
        // If recaptchaVerifier already exists, just render it if it needs to be shown again
        recaptchaVerifier.render().then((widgetId) => {
            console.log("reCAPTCHA re-rendered:", widgetId);
        });
    }

    // Add Event Listeners for Authentication
    document.getElementById('googleSignInBtn').addEventListener('click', signInWithGoogle);
    document.getElementById('emailSignInBtn').addEventListener('click', signInWithEmail);
    document.getElementById('emailSignUpBtn').addEventListener('click', signUpWithEmail);
    document.getElementById('phoneSignInBtn').addEventListener('click', signInWithPhone);
}

/**
 * Handles Google Sign-In.
 */
async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        console.log("Google Sign-In Successful:", result.user);
        currentUser = result.user; // Update global currentUser
        const profile = await getUserProfile(currentUser.uid);

        if (!profile || !profile.username) {
            // If no profile or username, redirect to first-time setup
            currentView = 'firstTimeSetup';
            showMessageBox('Benvenuto!', 'Sembra che tu sia nuovo/a. Completa il tuo profilo.');
        } else {
            // User has a profile, go to promotion wall
            currentView = 'promotionWall';
            showMessageBox('Accesso Riuscito', 'Benvenuto/a, ' + profile.username + '!');
        }
        renderPage();
    } catch (error) {
        console.error("Error with Google Sign-In:", error);
        if (error.code === 'auth/popup-closed-by-user') {
            showMessageBox('Attenzione', 'Accesso con Google annullato.', 'warning');
        } else if (error.code === 'auth/cancelled-popup-request') {
            showMessageBox('Attenzione', 'Richiesta di accesso con Google già in corso.', 'warning');
        } else {
            showMessageBox('Errore', 'Impossibile accedere con Google: ' + error.message, 'error');
        }
    }
}

/**
 * Handles Email/Password Sign-In.
 */
async function signInWithEmail() {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;

    if (!email || !password) {
        showMessageBox('Attenzione', 'Inserisci email e password.', 'warning');
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("Email Sign-In Successful:", userCredential.user);
        currentUser = userCredential.user; // Update global currentUser
        const profile = await getUserProfile(currentUser.uid);

        if (!profile || !profile.username) {
            currentView = 'firstTimeSetup';
            showMessageBox('Benvenuto!', 'Sembra che tu sia nuovo/a. Completa il tuo profilo.');
        } else {
            currentView = 'promotionWall';
            showMessageBox('Accesso Riuscito', 'Bentornato/a, ' + profile.username + '!');
        }
        renderPage();
    } catch (error) {
        console.error("Error with Email Sign-In:", error);
        if (error.code === 'auth/invalid-email' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            showMessageBox('Errore', 'Email o password non validi.', 'error');
        } else {
            showMessageBox('Errore', 'Impossibile accedere con email: ' + error.message, 'error');
        }
    }
}

/**
 * Handles Email/Password Sign-Up.
 */
async function signUpWithEmail() {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;

    if (!email || !password) {
        showMessageBox('Attenzione', 'Inserisci email e password per la registrazione.', 'warning');
        return;
    }
    if (password.length < 6) {
        showMessageBox('Attenzione', 'La password deve contenere almeno 6 caratteri.', 'warning');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log("Email Sign-Up Successful:", userCredential.user);
        currentUser = userCredential.user; // Update global currentUser

        // Immediately redirect to first-time setup for username creation
        currentView = 'firstTimeSetup';
        renderPage();
        showMessageBox('Registrazione Riuscita', 'Account creato. Ora crea il tuo username!');

    } catch (error) {
        console.error("Error with Email Sign-Up:", error);
        if (error.code === 'auth/email-already-in-use') {
            showMessageBox('Errore', 'Questa email è già in uso. Prova ad accedere.', 'error');
        } else if (error.code === 'auth/invalid-email') {
            showMessageBox('Errore', 'Formato email non valido.', 'error');
        } else if (error.code === 'auth/weak-password') {
            showMessageBox('Errore', 'La password è troppo debole.', 'error');
        } else {
            showMessageBox('Errore', 'Impossibile registrarsi con email: ' + error.message, 'error');
        }
    }
}

/**
 * Handles Phone Number Sign-In.
 * Sends OTP to the provided phone number.
 */
async function signInWithPhone() {
    const phoneNumber = document.getElementById('phoneInput').value;

    if (!phoneNumber) {
        showMessageBox('Attenzione', 'Inserisci un numero di telefono.', 'warning');
        return;
    }

    try {
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
        window.confirmationResult = confirmationResult; // Store for later OTP verification
        console.log("OTP sent to:", phoneNumber);
        showMessageBox('Codice Inviato', `Un codice di verifica è stato inviato a ${phoneNumber}. Inseriscilo nella prossima schermata.`);

        // Prompt for OTP
        const otp = prompt('Inserisci il codice di verifica a 6 cifre ricevuto:');
        if (otp) {
            await verifyOtpAndSignIn(otp);
        } else {
            showMessageBox('Attenzione', 'Verifica annullata.', 'warning');
        }

    } catch (error) {
        console.error("Error with Phone Sign-In:", error);
        if (error.code === 'auth/invalid-phone-number') {
            showMessageBox('Errore', 'Numero di telefono non valido.', 'error');
        } else if (error.code === 'auth/missing-phone-number') {
            showMessageBox('Errore', 'Numero di telefono mancante.', 'error');
        } else if (error.code === 'auth/captcha-check-failed') {
            showMessageBox('Errore', 'Verifica reCAPTCHA fallita. Riprova.', 'error');
        } else if (error.code === 'auth/too-many-requests') {
            showMessageBox('Errore', 'Troppe richieste. Riprova più tardi.', 'error');
        }
        else {
            showMessageBox('Errore', 'Impossibile accedere con telefono: ' + error.message, 'error');
        }
    }
}

/**
 * Verifies the OTP and signs in the user.
 * @param {string} otp The One-Time Password.
 */
async function verifyOtpAndSignIn(otp) {
    try {
        if (!window.confirmationResult) {
            showMessageBox('Errore', 'Nessuna richiesta di verifica in sospeso. Riprova ad accedere con il telefono.', 'error');
            return;
        }

        const userCredential = await window.confirmationResult.confirm(otp);
        console.log("Phone Sign-In Successful:", userCredential.user);
        currentUser = userCredential.user; // Update global currentUser
        const profile = await getUserProfile(currentUser.uid);

        if (!profile || !profile.username) {
            currentView = 'firstTimeSetup';
            showMessageBox('Benvenuto!', 'Sembra che tu sia nuovo/a. Completa il tuo profilo.');
        } else {
            currentView = 'promotionWall';
            showMessageBox('Accesso Riuscito', 'Benvenuto/a, ' + profile.username + '!');
        }
        renderPage();
        window.confirmationResult = null; // Clear confirmation result after successful verification
    } catch (error) {
        console.error("Error verifying OTP:", error);
        if (error.code === 'auth/invalid-verification-code') {
            showMessageBox('Errore', 'Codice di verifica non valido. Riprova.', 'error');
        } else if (error.code === 'auth/code-expired') {
            showMessageBox('Errore', 'Codice scaduto. Richiedine uno nuovo.', 'error');
        } else {
            showMessageBox('Errore', 'Impossibile verificare il codice: ' + error.message, 'error');
        }
    }
}


/**
 * Renders the Promotion Wall.
 * Loads and displays promotions from Firestore.
 */
async function renderPromotionWall() {
    mainContentArea.innerHTML = `
        <div class="w-full">
            <h2 class="text-3xl font-bold text-gray-900 mb-6 text-center">Bacheca delle Promozioni</h2>
            <div id="promotionsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <!-- Promotions will be loaded here -->
                <p id="loadingPromotions" class="col-span-full text-center text-gray-500">Caricamento promozioni...</p>
            </div>
        </div>
    `;
    loadPromotionsFromFirestore();
}

/**
 * Loads promotions from Firestore and displays them.
 */
function loadPromotionsFromFirestore() {
    const promotionsList = document.getElementById('promotionsList');
    if (!promotionsList) return; // Exit if the element is not found

    promotionsList.innerHTML = '<p id="loadingPromotions" class="col-span-full text-center text-gray-500">Caricamento promozioni...</p>'; // Show loading

    const q = query(
        collection(db, 'promotions'),
        where('isActive', '==', true), // Only show active promotions
        orderBy('createdAt', 'desc'), // Order by creation date
        limit(20) // Limit to 20 promotions
    );

    // Real-time listener for promotions
    onSnapshot(q, (snapshot) => {
        promotionsList.innerHTML = ''; // Clear previous promotions
        if (snapshot.empty) {
            promotionsList.innerHTML = '<p class="col-span-full text-center text-gray-500">Nessuna promozione trovata.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const promotion = doc.data();
            const promotionId = doc.id;
            const promotionHtml = `
                <div class="promotion-item custom-card">
                    <div class="promotion-header">
                        <img src="${promotion.userAvatarUrl || 'https://placehold.co/40x40/cccccc/000000?text=U'}" alt="Avatar" class="promotion-avatar">
                        <div>
                            <p class="promotion-username">${promotion.username || 'Utente Sconosciuto'}</p>
                            <p class="text-xs text-gray-500">${promotion.userEmail || ''}</p>
                        </div>
                        <span class="promotion-date ml-auto">${promotion.createdAt ? new Date(promotion.createdAt.toDate()).toLocaleDateString() : 'N/D'}</span>
                    </div>
                    <h3 class="promotion-title">${promotion.title}</h3>
                    <p class="promotion-description">${promotion.description}</p>
                    ${promotion.imageUrl ? `<img src="${promotion.imageUrl}" alt="Immagine Promozione" class="promotion-image">` : ''}
                    ${promotion.link ? `<a href="${promotion.link}" target="_blank" class="promotion-link mt-2">Visita il Sito</a>` : ''}
                    <div class="promotion-footer">
                        <span>Likes: ${promotion.likes || 0}</span>
                        <span>Views: ${promotion.views || 0}</span>
                    </div>
                </div>
            `;
            promotionsList.innerHTML += promotionHtml;
        });
    }, (error) => {
        console.error("Error loading promotions:", error);
        promotionsList.innerHTML = '<p class="col-span-full text-center text-red-500">Errore nel caricamento delle promozioni.</p>';
        showMessageBox('Errore', 'Impossibile caricare le promozioni.', 'error');
    });
}

/**
 * Renders the "Promote Yourself" page.
 * Allows authenticated users to create and manage promotions.
 */
async function renderPromoteYourself() {
    if (!currentUser) {
        mainContentArea.innerHTML = `<p class="text-center text-red-500">Devi essere loggato per promuovere te stesso.</p>`;
        return;
    }

    if (!currentProfileData || !currentProfileData.username) {
        mainContentArea.innerHTML = `<p class="text-center text-red-500">Per promuoverti, devi prima completare il tuo profilo impostando un username nella sezione Profilo.</p>`;
        return;
    }

    mainContentArea.innerHTML = `
        <div class="custom-card auth-form">
            <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">Crea la Tua Promozione</h2>
            <form id="promoteYourselfForm" class="flex flex-col gap-4">
                <div class="form-group">
                    <label for="promotionTitle" class="form-label">Titolo della Promozione</label>
                    <input type="text" id="promotionTitle" class="form-input" placeholder="Es. Nuova App Android: Gestione Spese">
                </div>
                <div class="form-group">
                    <label for="promotionDescription" class="form-label">Descrizione Dettagliata</label>
                    <textarea id="promotionDescription" class="form-input h-32 resize-y" placeholder="Descrivi la tua app/progetto/servizio..."></textarea>
                </div>
                <div class="form-group">
                    <label for="promotionLink" class="form-label">Link (Opzionale)</label>
                    <input type="url" id="promotionLink" class="form-input" placeholder="https://tuo-sito.com o link Play Store">
                </div>
                <div class="form-group">
                    <label for="promotionImage" class="form-label">Immagine (Opzionale)</label>
                    <input type="file" id="promotionImage" accept="image/*" class="form-input">
                    <img id="imagePreview" src="#" alt="Anteprima Immagine" class="hidden mt-2 rounded-lg max-h-48 object-contain">
                </div>
                <div class="toggle-switch-container">
                    <label for="isActiveToggle" class="toggle-switch-label">Promozione Attiva</label>
                    <label class="switch">
                        <input type="checkbox" id="isActiveToggle" checked>
                        <span class="slider round"></span>
                    </label>
                </div>
                <button type="submit" class="form-button bg-blue-600 hover:bg-blue-700 text-white mt-4">Pubblica Promozione</button>
            </form>
        </div>

        <div class="w-full mt-8">
            <h3 class="text-2xl font-bold text-gray-900 mb-4 text-center">Le Tue Promozioni</h3>
            <div id="userPromotionsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <p class="col-span-full text-center text-gray-500">Caricamento delle tue promozioni...</p>
            </div>
        </div>
    `;

    // Event listener for image preview
    const promotionImageInput = document.getElementById('promotionImage');
    const imagePreview = document.getElementById('imagePreview');
    if (promotionImageInput) {
        promotionImageInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result;
                    imagePreview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            } else {
                imagePreview.classList.add('hidden');
                imagePreview.src = '#';
            }
        });
    }

    document.getElementById('promoteYourselfForm').addEventListener('submit', handlePromotionSubmit);
    loadUserPromotions(); // Load promotions specific to the current user
}

/**
 * Handles the submission of the promotion form.
 * Uploads image if present, then saves promotion data to Firestore.
 */
async function handlePromotionSubmit(event) {
    event.preventDefault();

    if (!currentUser || !currentProfileData || !currentProfileData.username) {
        showMessageBox('Errore', 'Devi essere loggato e avere un username per pubblicare una promozione.', 'error');
        return;
    }

    const title = document.getElementById('promotionTitle').value.trim();
    const description = document.getElementById('promotionDescription').value.trim();
    const link = document.getElementById('promotionLink').value.trim();
    const imageFile = document.getElementById('promotionImage').files[0];
    const isActive = document.getElementById('isActiveToggle').checked;

    if (!title || !description) {
        showMessageBox('Attenzione', 'Titolo e descrizione sono obbligatori.', 'warning');
        return;
    }

    try {
        let imageUrl = '';
        if (imageFile) {
            const storageRef = ref(storage, `promotion_images/${currentUser.uid}/${Date.now()}_${imageFile.name}`);
            const uploadTask = await uploadBytes(storageRef, imageFile);
            imageUrl = await getDownloadURL(uploadTask.ref);
            console.log("Image uploaded:", imageUrl);
        }

        const newPromotion = {
            userId: currentUser.uid,
            username: currentProfileData.username,
            userEmail: currentUser.email,
            userAvatarUrl: currentProfileData.avatarUrl || '',
            title: title,
            description: description,
            link: link,
            imageUrl: imageUrl,
            isActive: isActive,
            createdAt: new Date(),
            likes: 0,
            views: 0
        };

        await addDoc(collection(db, 'promotions'), newPromotion);
        showMessageBox('Successo', 'Promozione pubblicata con successo!');
        document.getElementById('promoteYourselfForm').reset(); // Clear form
        document.getElementById('imagePreview').classList.add('hidden'); // Hide preview
        document.getElementById('imagePreview').src = '#';
        loadUserPromotions(); // Reload user's promotions list
    } catch (error) {
        console.error("Error publishing promotion:", error);
        showMessageBox('Errore', 'Errore durante la pubblicazione della promozione: ' + error.message, 'error');
    }
}

/**
 * Loads promotions created by the current user from Firestore.
 */
function loadUserPromotions() {
    const userPromotionsList = document.getElementById('userPromotionsList');
    if (!userPromotionsList || !currentUser) return;

    userPromotionsList.innerHTML = '<p class="col-span-full text-center text-gray-500">Caricamento delle tue promozioni...</p>';

    const q = query(
        collection(db, 'promotions'),
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );

    onSnapshot(q, (snapshot) => {
        userPromotionsList.innerHTML = '';
        if (snapshot.empty) {
            userPromotionsList.innerHTML = '<p class="col-span-full text-center text-gray-500">Non hai ancora creato promozioni.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            const promotion = docSnap.data();
            const promotionId = docSnap.id;
            const promotionHtml = `
                <div class="promotion-item custom-card relative">
                    <div class="absolute top-2 right-2 flex space-x-2">
                        <button class="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-full text-xs edit-promotion-btn" data-id="${promotionId}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-edit"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full text-xs delete-promotion-btn" data-id="${promotionId}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>
                        </button>
                    </div>
                    <div class="promotion-header">
                        <img src="${promotion.userAvatarUrl || 'https://placehold.co/40x40/cccccc/000000?text=U'}" alt="Avatar" class="promotion-avatar">
                        <div>
                            <p class="promotion-username">${promotion.username || 'Utente Sconosciuto'}</p>
                            <p class="text-xs text-gray-500">${promotion.userEmail || ''}</p>
                        </div>
                        <span class="promotion-date ml-auto">${promotion.createdAt ? new Date(promotion.createdAt.toDate()).toLocaleDateString() : 'N/D'}</span>
                    </div>
                    <h3 class="promotion-title">${promotion.title}</h3>
                    <p class="promotion-description">${promotion.description}</p>
                    ${promotion.imageUrl ? `<img src="${promotion.imageUrl}" alt="Immagine Promozione" class="promotion-image">` : ''}
                    ${promotion.link ? `<a href="${promotion.link}" target="_blank" class="promotion-link mt-2">Visita il Sito</a>` : ''}
                    <div class="promotion-footer">
                        <span>Attiva: ${promotion.isActive ? 'Sì' : 'No'}</span>
                        <span>Likes: ${promotion.likes || 0}</span>
                        <span>Views: ${promotion.views || 0}</span>
                    </div>
                </div>
            `;
            userPromotionsList.innerHTML += promotionHtml;
        });

        // Add event listeners for edit and delete buttons after rendering
        document.querySelectorAll('.edit-promotion-btn').forEach(button => {
            button.addEventListener('click', (e) => editPromotion(e.currentTarget.dataset.id));
        });
        document.querySelectorAll('.delete-promotion-btn').forEach(button => {
            button.addEventListener('click', (e) => deletePromotion(e.currentTarget.dataset.id));
        });

    }, (error) => {
        console.error("Error loading user promotions:", error);
        userPromotionsList.innerHTML = '<p class="col-span-full text-center text-red-500">Errore nel caricamento delle tue promozioni.</p>';
        showMessageBox('Errore', 'Impossibile caricare le tue promozioni.', 'error');
    });
}

/**
 * Handles editing a promotion.
 * @param {string} promotionId The ID of the promotion to edit.
 */
async function editPromotion(promotionId) {
    // Implement edit functionality here (e.g., populate form with data, then update)
    showMessageBox('Funzionalità', `Vorresti modificare la promozione con ID: ${promotionId}? La funzionalità di modifica è in fase di implementazione.`);
    console.log(`Edit promotion with ID: ${promotionId}`);
}

/**
 * Handles deleting a promotion.
 * @param {string} promotionId The ID of the promotion to delete.
 */
async function deletePromotion(promotionId) {
    // Implement delete functionality here
    showMessageBox('Funzionalità', `Vorresti eliminare la promozione con ID: ${promotionId}? La funzionalità di eliminazione è in fase di implementazione.`);
    console.log(`Delete promotion with ID: ${promotionId}`);
}


/**
 * Renders the Community page. (Placeholder)
 */
function renderCommunityPage() {
    mainContentArea.innerHTML = `
        <div class="custom-card w-full text-center py-8">
            <h2 class="text-3xl font-bold text-gray-900 mb-4">Pagina Community</h2>
            <p class="text-gray-600">Questa è la sezione dedicata alla community. Prossimamente qui troverai forum, chat e altre interazioni!</p>
            <p class="text-gray-500 mt-4">Restate sintonizzati per gli aggiornamenti!</p>
        </div>
    `;
}

/**
 * Renders the User Profile page.
 * Allows users to view and update their profile information.
 */
async function renderProfilePage() {
    if (!currentUser) {
        mainContentArea.innerHTML = `<p class="text-center text-red-500">Devi essere loggato per visualizzare il tuo profilo.</p>`;
        return;
    }

    mainContentArea.innerHTML = `
        <div class="custom-card auth-form">
            <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">Il Tuo Profilo</h2>

            <div class="profile-avatar-container">
                <img id="profileAvatarDisplay" src="${currentProfileData?.avatarUrl || 'https://placehold.co/120x120/cccccc/000000?text=U'}" alt="Avatar Utente" class="profile-avatar-large">
                <input type="file" id="avatarUpload" accept="image/*" class="hidden">
                <button id="changeAvatarBtn" class="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg mt-2">Cambia Avatar</button>
            </div>

            <div class="profile-info">
                <p class="profile-username" id="displayUsername">${currentProfileData?.username || 'Nessun Username'}</p>
                <p class="profile-email">${currentUser.email || currentUser.phoneNumber || 'N/D'}</p>
            </div>

            <form id="profileUpdateForm" class="flex flex-col gap-4">
                <div class="form-group">
                    <label for="usernameInput" class="form-label">Username</label>
                    <input type="text" id="usernameInput" class="form-input" value="${currentProfileData?.username || ''}" placeholder="Scegli il tuo username">
                </div>
                <div class="form-group">
                    <label for="bioInput" class="form-label">Bio (Opzionale)</label>
                    <textarea id="bioInput" class="form-input h-24 resize-y" placeholder="Parlaci un po' di te...">${currentProfileData?.bio || ''}</textarea>
                </div>
                <button type="submit" class="form-button bg-green-500 hover:bg-green-600 text-white">Aggiorna Profilo</button>
            </form>
        </div>
    `;

    const usernameInput = document.getElementById('usernameInput');
    const bioInput = document.getElementById('bioInput');
    const profileUpdateForm = document.getElementById('profileUpdateForm');
    const avatarUploadInput = document.getElementById('avatarUpload');
    const changeAvatarBtn = document.getElementById('changeAvatarBtn');
    const profileAvatarDisplay = document.getElementById('profileAvatarDisplay');

    if (profileUpdateForm) {
        profileUpdateForm.addEventListener('submit', handleProfileUpdate);
    }

    if (changeAvatarBtn && avatarUploadInput) {
        changeAvatarBtn.addEventListener('click', () => avatarUploadInput.click());
        avatarUploadInput.addEventListener('change', handleAvatarUpload);
    }
    // Update avatar display if a new image is selected
    if (avatarUploadInput) {
        avatarUploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    profileAvatarDisplay.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

/**
 * Handles the update of the user profile.
 */
async function handleProfileUpdate(event) {
    event.preventDefault();

    if (!currentUser) {
        showMessageBox('Errore', 'Devi essere loggato per aggiornare il tuo profilo.', 'error');
        return;
    }

    const username = document.getElementById('usernameInput').value.trim();
    const bio = document.getElementById('bioInput').value.trim();

    if (!username) {
        showMessageBox('Attenzione', 'L\'username è obbligatorio.', 'warning');
        return;
    }

    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await setDoc(userDocRef, {
            username: username,
            bio: bio,
            email: currentUser.email, // Ensure email is saved consistently
            avatarUrl: currentProfileData?.avatarUrl || '', // Preserve existing avatar URL
            updatedAt: new Date()
        }, { merge: true }); // Use merge to update fields without overwriting the whole document

        currentProfileData = await getUserProfile(currentUser.uid); // Refresh local data
        showMessageBox('Successo', 'Profilo aggiornato con successo!');
        renderPage(); // Re-render to show updated info
    } catch (error) {
        console.error("Error updating profile:", error);
        showMessageBox('Errore', 'Errore durante l\'aggiornamento del profilo: ' + error.message, 'error');
    }
}

/**
 * Handles avatar image upload.
 */
async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!currentUser) {
        showMessageBox('Errore', 'Devi essere loggato per caricare un avatar.', 'error');
        return;
    }

    try {
        const storageRef = ref(storage, `avatars/${currentUser.uid}/${file.name}`);
        const uploadTask = await uploadBytes(storageRef, file);
        const avatarUrl = await getDownloadURL(uploadTask.ref);

        const userDocRef = doc(db, 'users', currentUser.uid);
        await setDoc(userDocRef, { avatarUrl: avatarUrl }, { merge: true });

        currentProfileData.avatarUrl = avatarUrl; // Update local data
        document.getElementById('profileAvatarDisplay').src = avatarUrl; // Update immediate display
        showMessageBox('Successo', 'Avatar aggiornato con successo!');
    } catch (error) {
        console.error("Error uploading avatar:", error);
        showMessageBox('Errore', 'Errore durante il caricamento dell\'avatar: ' + error.message, 'error');
    }
}

/**
 * Renders the first-time setup page for new users to set a username.
 */
async function renderFirstTimeSetup() {
    if (!currentUser) {
        currentView = 'authPage'; // Redirect to auth if no current user
        renderPage();
        return;
    }
    // Check if profile already exists and has username
    const profile = await getUserProfile(currentUser.uid);
    if (profile && profile.username) {
        currentView = 'promotionWall'; // If username exists, go to wall
        renderPage();
        return;
    }

    mainContentArea.innerHTML = `
        <div class="custom-card auth-form">
            <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">Completa il Tuo Profilo</h2>
            <p class="text-gray-600 mb-4 text-center">Sembra che tu sia nuovo/a! Imposta un username per iniziare.</p>
            <form id="firstTimeSetupForm" class="flex flex-col gap-4">
                <div class="form-group">
                    <label for="setupUsernameInput" class="form-label">Scegli il tuo Username</label>
                    <input type="text" id="setupUsernameInput" class="form-input" placeholder="Il tuo username unico">
                </div>
                <button type="submit" class="form-button bg-green-500 hover:bg-green-600 text-white">Salva Username</button>
            </form>
        </div>
    `;

    document.getElementById('firstTimeSetupForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('setupUsernameInput').value.trim();

        if (!username) {
            showMessageBox('Attenzione', 'L\'username non può essere vuoto.', 'warning');
            return;
        }

        if (currentUser) {
            try {
                await createUserProfile(currentUser.uid, username, currentUser.email || ''); // Create full profile
                currentProfileData = await getUserProfile(currentUser.uid); // Refresh local data
                showMessageBox('Successo', 'Username impostato con successo! Benvenuto/a!');
                currentView = 'promotionWall'; // Redirect to promotion wall
                renderPage();
            } catch (error) {
                console.error("Error setting up username:", error);
                showMessageBox('Errore', 'Errore durante l\'impostazione dell\'username: ' + error.message, 'error');
            }
        }
    });
}


// --- Event Listeners for Navigation ---
promotionWallNav.addEventListener('click', () => { currentView = 'promotionWall'; renderPage(); });
promoteYourselfNav.addEventListener('click', () => { currentView = 'promoteYourself'; renderPage(); });
communityNav.addEventListener('click', () => { currentView = 'community'; renderPage(); });
profileNav.addEventListener('click', () => { currentView = 'profile'; renderPage(); });
// authNav click listener is set dynamically in updateAuthButton()

// --- Initial Setup and Auth State Management ---
document.addEventListener('DOMContentLoaded', () => {
    // Firebase Auth State Observer: This is crucial for managing user sessions and redirects
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        console.log("Stato di autenticazione cambiato. Utente:", currentUser ? currentUser.uid : 'Nessun utente');

        if (currentUser) {
            currentProfileData = await getUserProfile(currentUser.uid);
            // If user is authenticated and has a complete profile, and was on auth/setup page, redirect to promotion wall.
            if (currentProfileData && currentProfileData.username && (currentView === 'authPage' || currentView === 'firstTimeSetup')) {
                currentView = 'promotionWall';
            } else if (currentUser && (!currentProfileData || !currentProfileData.username)) {
                // If user is logged in but no profile or username, force to first time setup
                currentView = 'firstTimeSetup';
            }
            // If already on promoteYourself or profile, stay there.
        } else {
            currentProfileData = null; // Clear local profile data on logout
            // Se l'utente non è loggato e si trova sulla pagina predefinita (promotionWall), reindirizza alla pagina di autenticazione.
            // Questo assicura che la pagina di login sia la prima cosa che vedono gli utenti non autenticati.
            if (currentView === 'promotionWall') {
                currentView = 'authPage';
            }
            // Se non loggato e si trova su una pagina protetta (promoteYourself, profile), reindirizza all'autenticazione.
            else if (currentView === 'promoteYourself' || currentView === 'profile') {
                currentView = 'authPage';
            }
        }
        renderPage(); // Rieffettua il rendering della pagina dopo i cambiamenti dello stato di autenticazione
    });

    // Initial page render when the script loads
    renderPage();

    // Listen for window resize to update navigation text
    window.addEventListener('resize', updateNavText);
});
