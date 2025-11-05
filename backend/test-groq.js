// Test script per verificare la connessione a Groq API
require('dotenv').config();
const axios = require('axios');

async function testGroqAPI() {
    console.log('🔍 Testing Groq API connection...');
    console.log('📝 API Key presente:', process.env.GROQ_API_KEY ? '✅ SI' : '❌ NO');

    if (!process.env.GROQ_API_KEY) {
        console.error('❌ GROQ_API_KEY non trovata nel file .env!');
        return;
    }

    // Mostra solo i primi e ultimi 4 caratteri della chiave
    const key = process.env.GROQ_API_KEY;
    const maskedKey = key.substring(0, 8) + '...' + key.substring(key.length - 4);
    console.log('🔑 API Key:', maskedKey);

    try {
        console.log('\n🚀 Invio richiesta a Groq...');

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: 'Rispondi sempre in italiano.' },
                    { role: 'user', content: 'Ciao! Dimmi solo "funziona" se ricevi questo messaggio.' }
                ],
                temperature: 0.7,
                max_tokens: 50,
                stream: false
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Connessione riuscita!');
        console.log('📨 Risposta:', response.data.choices[0].message.content);
        console.log('\n✨ La configurazione di Groq è corretta!');

    } catch (error) {
        console.error('\n❌ Errore nella connessione a Groq:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Errore:', error.response.data);
        } else {
            console.error('Errore:', error.message);
        }
    }
}

testGroqAPI();
