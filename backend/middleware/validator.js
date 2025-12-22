/**
 * Drape Backend - Input Validation Middleware
 * Simple validation utilities without external dependencies
 */

const { ValidationError } = require('./errorHandler');

/**
 * Validation schema builder
 */
class Schema {
    constructor() {
        this.rules = [];
        this.fieldName = 'value';
    }

    field(name) {
        this.fieldName = name;
        return this;
    }

    required(message) {
        this.rules.push({
            check: (val) => val !== undefined && val !== null && val !== '',
            message: message || `${this.fieldName} is required`
        });
        return this;
    }

    string(message) {
        this.rules.push({
            check: (val) => val === undefined || typeof val === 'string',
            message: message || `${this.fieldName} must be a string`
        });
        return this;
    }

    number(message) {
        this.rules.push({
            check: (val) => val === undefined || typeof val === 'number',
            message: message || `${this.fieldName} must be a number`
        });
        return this;
    }

    boolean(message) {
        this.rules.push({
            check: (val) => val === undefined || typeof val === 'boolean',
            message: message || `${this.fieldName} must be a boolean`
        });
        return this;
    }

    array(message) {
        this.rules.push({
            check: (val) => val === undefined || Array.isArray(val),
            message: message || `${this.fieldName} must be an array`
        });
        return this;
    }

    object(message) {
        this.rules.push({
            check: (val) => val === undefined || (typeof val === 'object' && !Array.isArray(val)),
            message: message || `${this.fieldName} must be an object`
        });
        return this;
    }

    minLength(min, message) {
        this.rules.push({
            check: (val) => val === undefined || (val.length !== undefined && val.length >= min),
            message: message || `${this.fieldName} must be at least ${min} characters`
        });
        return this;
    }

    maxLength(max, message) {
        this.rules.push({
            check: (val) => val === undefined || (val.length !== undefined && val.length <= max),
            message: message || `${this.fieldName} must be at most ${max} characters`
        });
        return this;
    }

    pattern(regex, message) {
        this.rules.push({
            check: (val) => val === undefined || regex.test(val),
            message: message || `${this.fieldName} format is invalid`
        });
        return this;
    }

    oneOf(values, message) {
        this.rules.push({
            check: (val) => val === undefined || values.includes(val),
            message: message || `${this.fieldName} must be one of: ${values.join(', ')}`
        });
        return this;
    }

    custom(fn, message) {
        this.rules.push({
            check: fn,
            message: message || `${this.fieldName} is invalid`
        });
        return this;
    }

    validate(value) {
        for (const rule of this.rules) {
            if (!rule.check(value)) {
                throw new ValidationError(rule.message, this.fieldName);
            }
        }
        return true;
    }
}

/**
 * Create a new schema
 */
function schema() {
    return new Schema();
}

/**
 * Validate request body against a schema object
 * @param {Object} schemaObj - Object with field names as keys and Schema instances as values
 */
function validateBody(schemaObj) {
    return (req, res, next) => {
        try {
            for (const [fieldName, fieldSchema] of Object.entries(schemaObj)) {
                fieldSchema.field(fieldName);
                fieldSchema.validate(req.body[fieldName]);
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Validate request params against a schema object
 */
function validateParams(schemaObj) {
    return (req, res, next) => {
        try {
            for (const [fieldName, fieldSchema] of Object.entries(schemaObj)) {
                fieldSchema.field(fieldName);
                fieldSchema.validate(req.params[fieldName]);
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Validate request query against a schema object
 */
function validateQuery(schemaObj) {
    return (req, res, next) => {
        try {
            for (const [fieldName, fieldSchema] of Object.entries(schemaObj)) {
                fieldSchema.field(fieldName);
                fieldSchema.validate(req.query[fieldName]);
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Common validation schemas
 */
const commonSchemas = {
    projectId: () => schema().required().string().minLength(1),
    filePath: () => schema().required().string().minLength(1),
    command: () => schema().required().string().minLength(1),
    repositoryUrl: () => schema().string().pattern(
        /^https?:\/\/.*$/,
        'Must be a valid URL'
    ),
    workstationId: () => schema().required().string().minLength(1),
    prompt: () => schema().required().string().minLength(1).maxLength(100000)
};

module.exports = {
    Schema,
    schema,
    validateBody,
    validateParams,
    validateQuery,
    commonSchemas
};
