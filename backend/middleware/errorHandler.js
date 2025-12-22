/**
 * Drape Backend - Error Handler Middleware
 * Centralized error handling with user-friendly messages
 */

/**
 * Custom application error class
 */
class AppError extends Error {
    constructor(message, statusCode = 500, type = 'server_error') {
        super(message);
        this.statusCode = statusCode;
        this.type = type;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Validation error
 */
class ValidationError extends AppError {
    constructor(message, field = null) {
        super(message, 400, 'validation_error');
        this.field = field;
    }
}

/**
 * Not found error
 */
class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'not_found');
        this.resource = resource;
    }
}

/**
 * Authentication error
 */
class AuthError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'auth_error');
    }
}

/**
 * Rate limit error
 */
class RateLimitError extends AppError {
    constructor(retryAfter = 60) {
        super('Rate limit exceeded. Please try again later.', 429, 'rate_limit');
        this.retryAfter = retryAfter;
    }
}

/**
 * Classify external API errors
 */
function classifyAPIError(error) {
    const status = error.status || error.response?.status;
    const message = error.message || '';
    const errorType = error.error?.type || error.response?.data?.error?.type || '';

    // Authentication errors
    if (status === 401 || errorType === 'authentication_error') {
        return {
            type: 'auth',
            userMessage: '🔐 Authentication error - check your API key',
            shouldRetry: false,
            technicalDetails: message
        };
    }

    // Rate limit errors
    if (status === 429 || errorType === 'rate_limit_error' || message.includes('rate_limit')) {
        return {
            type: 'rate_limit',
            userMessage: '⏳ Rate limit reached - waiting before retrying...',
            shouldRetry: true,
            technicalDetails: message
        };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('ETIMEDOUT') || status === 408) {
        return {
            type: 'timeout',
            userMessage: '⏱️ Request timed out',
            shouldRetry: true,
            technicalDetails: message
        };
    }

    // Network errors
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('network')) {
        return {
            type: 'network',
            userMessage: '🌐 Connection error - check your network',
            shouldRetry: true,
            technicalDetails: message
        };
    }

    // Invalid request errors
    if (status === 400 || errorType === 'invalid_request_error') {
        return {
            type: 'invalid_request',
            userMessage: '❌ Invalid request - check parameters',
            shouldRetry: false,
            technicalDetails: message
        };
    }

    // Server errors
    if (status >= 500 || errorType === 'api_error') {
        return {
            type: 'server_error',
            userMessage: '🔧 Server error - retrying shortly...',
            shouldRetry: true,
            technicalDetails: message
        };
    }

    // Context length errors
    if (message.includes('context_length') || message.includes('too long')) {
        return {
            type: 'context_length',
            userMessage: '📏 Message too long - reducing conversation size...',
            shouldRetry: true,
            technicalDetails: message
        };
    }

    // Generic error
    return {
        type: 'unknown',
        userMessage: `❌ Error: ${message.substring(0, 100)}`,
        shouldRetry: false,
        technicalDetails: message
    };
}

/**
 * Express error handler middleware
 */
function errorHandler(err, req, res, next) {
    // Log the error
    console.error('❌ Error:', {
        message: err.message,
        type: err.type,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Already sent response
    if (res.headersSent) {
        return next(err);
    }

    // Operational errors (expected errors)
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            success: false,
            error: {
                type: err.type,
                message: err.message,
                ...(err.field && { field: err.field }),
                ...(err.resource && { resource: err.resource }),
                ...(err.retryAfter && { retryAfter: err.retryAfter })
            }
        });
    }

    // Mongoose validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: {
                type: 'validation_error',
                message: err.message
            }
        });
    }

    // JSON parse errors
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            error: {
                type: 'parse_error',
                message: 'Invalid JSON in request body'
            }
        });
    }

    // Unknown errors - don't leak details in production
    const message = process.env.NODE_ENV === 'development'
        ? err.message
        : 'An unexpected error occurred';

    res.status(500).json({
        success: false,
        error: {
            type: 'server_error',
            message
        }
    });
}

/**
 * Async handler wrapper to catch errors in async routes
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Not found handler for undefined routes
 */
function notFoundHandler(req, res, next) {
    next(new NotFoundError(`Route ${req.method} ${req.path}`));
}

module.exports = {
    AppError,
    ValidationError,
    NotFoundError,
    AuthError,
    RateLimitError,
    classifyAPIError,
    errorHandler,
    asyncHandler,
    notFoundHandler
};
