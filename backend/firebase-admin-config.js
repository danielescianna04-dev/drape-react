/**
 * Firebase Admin Config - Shared Instance
 * Riutilizza l'istanza Firebase già inizializzata in server.js
 * con lazy initialization del bucket
 */

const admin = require('firebase-admin');

// Lazy initialization del bucket per evitare problemi di timing
let _bucket = null;

function getBucket() {
    if (_bucket) return _bucket;

    try {
        if (admin.apps.length > 0) {
            _bucket = admin.storage().bucket();
            console.log('✅ [Firebase] Using existing Admin instance');
            return _bucket;
        }
    } catch (error) {
        console.warn('⚠️ [Firebase] Error accessing storage:', error.message);
    }

    return null;
}

function isInitialized() {
    return admin.apps.length > 0 && getBucket() !== null;
}

module.exports = {
    admin,
    get bucket() {
        return getBucket();
    },
    isInitialized
};
