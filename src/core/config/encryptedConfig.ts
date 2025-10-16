// Credenziali criptate - salvate nel database invece che in .env
export const ENCRYPTED_CONFIG = {
  // Firebase (criptato con chiave master)
  firebase: {
    apiKey: "encrypted_firebase_api_key_here",
    authDomain: "encrypted_auth_domain_here", 
    projectId: "encrypted_project_id_here",
    storageBucket: "encrypted_storage_bucket_here",
    messagingSenderId: "encrypted_sender_id_here",
    appId: "encrypted_app_id_here"
  },
  
  // Google Cloud (criptato)
  googleCloud: {
    projectId: "encrypted_gcp_project_id_here",
    serviceAccountKey: "encrypted_service_account_json_here"
  },
  
  // GitHub (criptato)
  github: {
    clientId: "encrypted_github_client_id_here",
    clientSecret: "encrypted_github_client_secret_here"
  }
};

// Funzione per decriptare al runtime
export function decryptConfig(encryptedValue: string): string {
  // Usa una chiave master (può essere in variabile ambiente o hardcoded)
  const masterKey = "your_master_decryption_key";
  
  // Logica di decriptazione (esempio semplificato)
  try {
    // In produzione usa crypto.js o simile
    return atob(encryptedValue); // Base64 decode per esempio
  } catch {
    return encryptedValue; // Fallback
  }
}

// Configurazione Firebase decriptata
export const getFirebaseConfig = () => ({
  apiKey: decryptConfig(ENCRYPTED_CONFIG.firebase.apiKey),
  authDomain: decryptConfig(ENCRYPTED_CONFIG.firebase.authDomain),
  projectId: decryptConfig(ENCRYPTED_CONFIG.firebase.projectId),
  storageBucket: decryptConfig(ENCRYPTED_CONFIG.firebase.storageBucket),
  messagingSenderId: decryptConfig(ENCRYPTED_CONFIG.firebase.messagingSenderId),
  appId: decryptConfig(ENCRYPTED_CONFIG.firebase.appId)
});
