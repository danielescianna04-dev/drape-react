const { GoogleGenerativeAI } = require('@google/generative-ai');

// Mock data
const partWithSignature = {
    functionCall: {
        name: 'test_tool',
        args: { foo: 'bar' }
    },
    thoughtSignature: 'some_encrypted_blob'
};

console.log('Part structure:', JSON.stringify(partWithSignature, null, 2));

// How does history look?
const history = [
    {
        role: 'model',
        parts: [partWithSignature]
    }
];

console.log('History structure:', JSON.stringify(history, null, 2));

// If we were to send this, the SDK would serialize it.
// We can't easily see the wire format without intercepting, 
// but we can check if the types allow it.
