/**
 * Drape Subscription Plans Configuration
 *
 * All AI models available for all plans
 * Differentiation is based on monthly AI budget in EUR
 */

// AI Model Pricing (USD per 1M tokens)
// Keys MUST match the model names used in AI_MODELS (constants.js)
const AI_PRICING = {
    // Gemini models
    'gemini-3-flash': {
        input: 0.10,      // $0.10 per 1M input tokens
        output: 0.40,     // $0.40 per 1M output tokens
        cachedInput: 0.025 // 75% discount on cached
    },
    'gemini-3-pro': {
        input: 1.25,
        output: 5.00,
        cachedInput: 0.3125
    },
    'gemini-2.5-flash': {
        input: 0.15,
        output: 0.60,
        cachedInput: 0.04
    },
    'gemini-2.5-flash-image': {
        input: 0.15,
        output: 0.60,
        cachedInput: 0.04
    },
    'gemini-exp-1206': {
        input: 0.15,
        output: 0.60,
        cachedInput: 0.04
    },
    'gemini-2.0-flash-thinking': {
        input: 0.15,
        output: 0.60,
        cachedInput: 0.04
    },
    // Claude models
    'claude-sonnet-4': {
        input: 3.00,
        output: 15.00,
        cachedInput: 0.30  // 90% discount on cached
    },
    'claude-4-5-sonnet': {
        input: 3.00,
        output: 15.00,
        cachedInput: 0.30
    },
    'claude-3.5-sonnet': {
        input: 3.00,
        output: 15.00,
        cachedInput: 0.30
    },
    'claude-4-5-opus': {
        input: 15.00,
        output: 75.00,
        cachedInput: 1.50  // 90% discount on cached
    },
    'claude-3.5-haiku': {
        input: 0.80,
        output: 4.00,
        cachedInput: 0.08
    },
    // Groq models (free tier, minimal cost tracking)
    'llama-3.3-70b': {
        input: 0.59,
        output: 0.79,
        cachedInput: 0.15
    },
    'llama-3.1-8b': {
        input: 0.05,
        output: 0.08,
        cachedInput: 0.01
    }
};

// USD to EUR conversion (approximate)
const USD_TO_EUR = 0.92;

// Subscription Plans
const PLANS = {
    free: {
        id: 'free',
        name: 'Free',
        price: 0,
        models: ['gemini-3-flash', 'gemini-3-pro', 'claude-sonnet-4', 'claude-opus-4'],
        monthlyBudgetEur: 2.50,
        maxProjects: 3,           // Totale massimo progetti
        maxCreatedProjects: 2,    // Massimo progetti creati
        maxImportedProjects: 1,   // Massimo progetti importati da GitHub
        storageMB: 500,
        features: ['All AI models', 'Basic support']
    },
    go: {
        id: 'go',
        name: 'Go',
        price: 9.99,
        models: ['gemini-3-flash', 'gemini-3-pro', 'claude-sonnet-4', 'claude-opus-4'],
        monthlyBudgetEur: 5,
        maxProjects: 10,
        maxCreatedProjects: 10,
        maxImportedProjects: 10,
        storageMB: 2000,
        features: ['All AI models', 'Email support', 'Project export']
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        price: 29.99,
        models: ['gemini-3-flash', 'gemini-3-pro', 'claude-sonnet-4', 'claude-opus-4'],
        monthlyBudgetEur: 15,
        maxProjects: Infinity,
        maxCreatedProjects: Infinity,
        maxImportedProjects: Infinity,
        storageMB: 10000,
        features: ['All AI models', 'Priority support', 'Unlimited projects', 'Advanced export']
    },
    enterprise: {
        id: 'enterprise',
        name: 'Enterprise',
        price: 49.99,
        models: ['gemini-3-flash', 'gemini-3-pro', 'claude-sonnet-4', 'claude-opus-4'],
        monthlyBudgetEur: 30,
        allowExtraBudget: true,
        extraBudgetMultiplier: 1.2, // €1 extra costs €1.20
        maxProjects: Infinity,
        maxCreatedProjects: Infinity,
        maxImportedProjects: Infinity,
        storageMB: 50000,
        prioritySupport: true,
        features: ['All AI models', '24h priority support', 'Unlimited everything', 'API access', 'Team sharing']
    }
};

/**
 * Calculate cost in EUR for an AI call
 * @param {string} model - Model ID (e.g., 'gemini-3-flash')
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {number} cachedTokens - Number of cached input tokens (optional)
 * @returns {number} Cost in EUR
 */
function calculateCostEur(model, inputTokens, outputTokens, cachedTokens = 0) {
    const pricing = AI_PRICING[model];
    if (!pricing) {
        console.warn(`Unknown model for pricing: ${model}, using gemini-3-flash pricing`);
        return calculateCostEur('gemini-3-flash', inputTokens, outputTokens, cachedTokens);
    }

    // Calculate non-cached input tokens
    const nonCachedInputTokens = Math.max(0, inputTokens - cachedTokens);

    // Cost in USD
    const inputCostUsd = (nonCachedInputTokens * pricing.input) / 1_000_000;
    const cachedCostUsd = (cachedTokens * pricing.cachedInput) / 1_000_000;
    const outputCostUsd = (outputTokens * pricing.output) / 1_000_000;

    const totalUsd = inputCostUsd + cachedCostUsd + outputCostUsd;
    const totalEur = totalUsd * USD_TO_EUR;

    return totalEur;
}

/**
 * Get plan by ID
 * @param {string} planId - Plan ID (free, go, pro, enterprise)
 * @returns {object} Plan configuration
 */
function getPlan(planId) {
    return PLANS[planId] || PLANS.free;
}

/**
 * Check if user can make an AI call based on their budget
 * @param {number} currentSpentEur - Amount already spent this month
 * @param {number} estimatedCostEur - Estimated cost of this call
 * @param {string} planId - User's plan ID
 * @returns {object} { allowed: boolean, reason?: string, remaining?: number }
 */
function checkBudget(currentSpentEur, estimatedCostEur, planId) {
    const plan = getPlan(planId);
    const remaining = plan.monthlyBudgetEur - currentSpentEur;

    if (remaining <= 0) {
        return {
            allowed: false,
            reason: `Hai esaurito il budget AI di €${plan.monthlyBudgetEur} per questo mese`,
            remaining: 0,
            budgetEur: plan.monthlyBudgetEur,
            spentEur: currentSpentEur
        };
    }

    if (estimatedCostEur > remaining && !plan.allowExtraBudget) {
        return {
            allowed: false,
            reason: `Budget insufficiente. Rimangono €${remaining.toFixed(4)}, richiesti €${estimatedCostEur.toFixed(4)}`,
            remaining,
            budgetEur: plan.monthlyBudgetEur,
            spentEur: currentSpentEur
        };
    }

    return {
        allowed: true,
        remaining,
        budgetEur: plan.monthlyBudgetEur,
        spentEur: currentSpentEur
    };
}

/**
 * Estimate cost before making an AI call
 * Based on typical message sizes
 * @param {string} model - Model ID
 * @param {number} inputLength - Approximate input length in characters
 * @returns {number} Estimated cost in EUR
 */
function estimateCostEur(model, inputLength = 3000) {
    // Rough estimate: 1 token ≈ 4 characters
    const estimatedInputTokens = Math.ceil(inputLength / 4) + 2500; // +2500 for system prompt
    const estimatedOutputTokens = 500; // Average response

    return calculateCostEur(model, estimatedInputTokens, estimatedOutputTokens, 0);
}

/**
 * Get estimated messages per month for each model given a budget
 * @param {number} budgetEur - Monthly budget in EUR
 * @returns {object} Estimated messages per model
 */
function getEstimatedMessages(budgetEur) {
    const estimates = {};

    for (const [modelId, pricing] of Object.entries(AI_PRICING)) {
        // Typical message: 3000 input tokens, 500 output tokens
        const costPerMessage = calculateCostEur(modelId, 3000, 500, 0);
        estimates[modelId] = Math.floor(budgetEur / costPerMessage);
    }

    return estimates;
}

/**
 * Check if user can create/import a project based on their plan limits
 * @param {object} currentCounts - { created: number, imported: number, total: number }
 * @param {string} projectType - 'created' or 'imported'
 * @param {string} planId - User's plan ID
 * @returns {object} { allowed: boolean, reason?: string }
 */
function checkProjectLimit(currentCounts, projectType, planId) {
    const plan = getPlan(planId);
    const { created = 0, imported = 0 } = currentCounts;
    const total = created + imported;

    // Check total limit
    if (total >= plan.maxProjects) {
        return {
            allowed: false,
            reason: `Hai raggiunto il limite massimo di ${plan.maxProjects} progetti per il piano ${plan.name}`,
            limits: {
                maxProjects: plan.maxProjects,
                maxCreated: plan.maxCreatedProjects,
                maxImported: plan.maxImportedProjects,
                currentCreated: created,
                currentImported: imported
            }
        };
    }

    // Check specific limit
    if (projectType === 'created' && created >= plan.maxCreatedProjects) {
        return {
            allowed: false,
            reason: `Hai raggiunto il limite di ${plan.maxCreatedProjects} progetti creati per il piano ${plan.name}. Passa a un piano superiore per creare più progetti.`,
            limits: {
                maxProjects: plan.maxProjects,
                maxCreated: plan.maxCreatedProjects,
                maxImported: plan.maxImportedProjects,
                currentCreated: created,
                currentImported: imported
            }
        };
    }

    if (projectType === 'imported' && imported >= plan.maxImportedProjects) {
        return {
            allowed: false,
            reason: `Hai raggiunto il limite di ${plan.maxImportedProjects} progetti importati per il piano ${plan.name}. Passa a un piano superiore per importare più progetti.`,
            limits: {
                maxProjects: plan.maxProjects,
                maxCreated: plan.maxCreatedProjects,
                maxImported: plan.maxImportedProjects,
                currentCreated: created,
                currentImported: imported
            }
        };
    }

    return {
        allowed: true,
        limits: {
            maxProjects: plan.maxProjects,
            maxCreated: plan.maxCreatedProjects,
            maxImported: plan.maxImportedProjects,
            currentCreated: created,
            currentImported: imported
        }
    };
}

module.exports = {
    PLANS,
    AI_PRICING,
    USD_TO_EUR,
    calculateCostEur,
    getPlan,
    checkBudget,
    estimateCostEur,
    getEstimatedMessages,
    checkProjectLimit
};
