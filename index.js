#!/usr/bin/env node

/**
 * xyOps File Export Action Plugin (c) 2026 Tim Alderweireldt
 * 
 * Exports job input data to CSV, HTML, or JSON file format.
 * Supports optional timestamp and unique identifier in filename.
 * Cross-platform compatible (Linux, Windows, macOS).
 */

const fs = require('fs');
const path = require('path');

// Dependencies (installed via npm)
const exceljs = require('exceljs');
const PDFDocument = require('pdfkit');
const jsYaml = require('js-yaml');

// Read JSON from STDIN
async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return JSON.parse(chunks.join(''));
}

// Generate 8-character unique ID
function generateUID() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let uid = '';
    for (let i = 0; i < 8; i++) {
        uid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uid;
}

// Generate timestamp in YYYYMMDD_HHmmss format
function generateTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// Flatten nested object into dot-notation keys
function flattenObject(obj, prefix = '', result = {}) {
    if (obj === null || obj === undefined) {
        result[prefix] = '';
        return result;
    }
    
    if (typeof obj !== 'object') {
        result[prefix] = obj;
        return result;
    }
    
    if (Array.isArray(obj)) {
        if (obj.length === 0) {
            result[prefix] = '';
        } else {
            // Check if array contains objects or primitives
            const hasObjects = obj.some(item => typeof item === 'object' && item !== null);
            if (hasObjects) {
                obj.forEach((item, index) => {
                    flattenObject(item, prefix ? `${prefix}[${index}]` : `[${index}]`, result);
                });
            } else {
                result[prefix] = obj.join(', ');
            }
        }
        return result;
    }
    
    for (const key of Object.keys(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        flattenObject(obj[key], newKey, result);
    }
    
    return result;
}

// ============================================
// DATA TRANSFORM ENGINE
// ============================================

/**
 * Parse YAML transforms configuration
 * @param {string} yamlString - YAML configuration string
 * @returns {Array} Array of transform steps
 */
function parseTransformsYaml(yamlString) {
    if (!yamlString || typeof yamlString !== 'string' || yamlString.trim() === '') {
        return [];
    }
    
    const config = jsYaml.load(yamlString);
    
    if (!config || !config.transforms) {
        return [];
    }
    
    if (!Array.isArray(config.transforms)) {
        throw new Error('transforms must be an array of transform steps');
    }
    
    return config.transforms;
}

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Source object
 * @param {string} path - Dot-notation path (e.g., 'user.address.city')
 * @returns {*} Value at path or undefined
 */
function getNestedValue(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    return current;
}

/**
 * Evaluate a simple filter condition
 * Supports: ==, !=, >, <, >=, <=, contains, startswith, endswith
 * @param {Object} row - Data row to evaluate
 * @param {string} condition - Filter condition string
 * @returns {boolean} Whether row matches condition
 */
function evaluateCondition(row, condition) {
    // Parse condition: "field operator value" or "field operator 'value'"
    const operators = ['==', '!=', '>=', '<=', '>', '<', ' contains ', ' startswith ', ' endswith '];
    
    let field, operator, value;
    
    for (const op of operators) {
        const idx = condition.indexOf(op);
        if (idx !== -1) {
            field = condition.substring(0, idx).trim();
            operator = op.trim();
            value = condition.substring(idx + op.length).trim();
            break;
        }
    }
    
    if (!field || !operator) {
        throw new Error(`Invalid filter condition: ${condition}. Expected format: "field operator value"`);
    }
    
    // Remove quotes from value if present
    if ((value.startsWith("'") && value.endsWith("'")) || 
        (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
    }
    
    // Get field value from row (support nested paths)
    const fieldValue = getNestedValue(row, field);
    
    // Convert value to appropriate type for comparison
    let compareValue = value;
    if (value === 'null') compareValue = null;
    else if (value === 'true') compareValue = true;
    else if (value === 'false') compareValue = false;
    else if (!isNaN(Number(value)) && value !== '') compareValue = Number(value);
    
    // Perform comparison
    switch (operator) {
        case '==':
            return fieldValue == compareValue;
        case '!=':
            return fieldValue != compareValue;
        case '>':
            return fieldValue > compareValue;
        case '<':
            return fieldValue < compareValue;
        case '>=':
            return fieldValue >= compareValue;
        case '<=':
            return fieldValue <= compareValue;
        case 'contains':
            return String(fieldValue || '').toLowerCase().includes(String(compareValue).toLowerCase());
        case 'startswith':
            return String(fieldValue || '').toLowerCase().startsWith(String(compareValue).toLowerCase());
        case 'endswith':
            return String(fieldValue || '').toLowerCase().endsWith(String(compareValue).toLowerCase());
        default:
            throw new Error(`Unknown operator: ${operator}`);
    }
}

/**
 * Apply filter transform - keep rows matching condition
 * @param {Array} data - Input data array
 * @param {string} condition - Filter condition
 * @returns {Array} Filtered data
 */
function transformFilter(data, condition) {
    if (!Array.isArray(data)) {
        console.error('File Export: filter requires array data, skipping');
        return data;
    }
    
    const before = data.length;
    const result = data.filter(row => {
        try {
            return evaluateCondition(row, condition);
        } catch (e) {
            throw new Error(`Filter error: ${e.message}`);
        }
    });
    console.error(`File Export: filter '${condition}' - ${before} rows → ${result.length} rows`);
    return result;
}

/**
 * Apply select transform - keep only specified fields
 * @param {Array|Object} data - Input data
 * @param {Array} fields - Fields to keep
 * @returns {Array|Object} Data with only selected fields
 */
function transformSelect(data, fields) {
    if (!Array.isArray(fields) || fields.length === 0) {
        throw new Error('select requires a non-empty array of field names');
    }
    
    const selectFields = (obj) => {
        const result = {};
        for (const field of fields) {
            const value = getNestedValue(obj, field);
            if (value !== undefined) {
                result[field] = value;
            }
        }
        return result;
    };
    
    if (Array.isArray(data)) {
        console.error(`File Export: select fields [${fields.join(', ')}]`);
        return data.map(selectFields);
    } else if (typeof data === 'object' && data !== null) {
        console.error(`File Export: select fields [${fields.join(', ')}]`);
        return selectFields(data);
    }
    return data;
}

/**
 * Apply exclude transform - remove specified fields
 * @param {Array|Object} data - Input data
 * @param {Array} fields - Fields to remove
 * @returns {Array|Object} Data without excluded fields
 */
function transformExclude(data, fields) {
    if (!Array.isArray(fields) || fields.length === 0) {
        throw new Error('exclude requires a non-empty array of field names');
    }
    
    const excludeFields = (obj) => {
        const result = { ...obj };
        for (const field of fields) {
            delete result[field];
        }
        return result;
    };
    
    if (Array.isArray(data)) {
        console.error(`File Export: exclude fields [${fields.join(', ')}]`);
        return data.map(excludeFields);
    } else if (typeof data === 'object' && data !== null) {
        console.error(`File Export: exclude fields [${fields.join(', ')}]`);
        return excludeFields(data);
    }
    return data;
}

/**
 * Apply rename transform - rename field names
 * @param {Array|Object} data - Input data
 * @param {Object} mapping - Object with oldName: newName pairs
 * @returns {Array|Object} Data with renamed fields
 */
function transformRename(data, mapping) {
    if (!mapping || typeof mapping !== 'object') {
        throw new Error('rename requires an object with field mappings');
    }
    
    const renameFields = (obj) => {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            const newKey = mapping[key] || key;
            result[newKey] = value;
        }
        return result;
    };
    
    const renames = Object.entries(mapping).map(([k, v]) => `${k}→${v}`).join(', ');
    console.error(`File Export: rename fields [${renames}]`);
    
    if (Array.isArray(data)) {
        return data.map(renameFields);
    } else if (typeof data === 'object' && data !== null) {
        return renameFields(data);
    }
    return data;
}

/**
 * Apply sort transform - sort data by field
 * @param {Array} data - Input data array
 * @param {Object|string} sortConfig - Sort configuration {field, order} or "field desc"
 * @returns {Array} Sorted data
 */
function transformSort(data, sortConfig) {
    if (!Array.isArray(data)) {
        console.error('File Export: sort requires array data, skipping');
        return data;
    }
    
    let field, order = 'asc';
    
    if (typeof sortConfig === 'string') {
        // Parse "field desc" or "field asc" or just "field"
        const parts = sortConfig.trim().split(/\s+/);
        field = parts[0];
        if (parts[1] && ['desc', 'asc'].includes(parts[1].toLowerCase())) {
            order = parts[1].toLowerCase();
        }
    } else if (typeof sortConfig === 'object') {
        field = sortConfig.field;
        order = sortConfig.order || 'asc';
    }
    
    if (!field) {
        throw new Error('sort requires a field name');
    }
    
    console.error(`File Export: sort by '${field}' ${order}`);
    
    return [...data].sort((a, b) => {
        const aVal = getNestedValue(a, field);
        const bVal = getNestedValue(b, field);
        
        // Handle nulls/undefined
        if (aVal === null || aVal === undefined) return order === 'asc' ? 1 : -1;
        if (bVal === null || bVal === undefined) return order === 'asc' ? -1 : 1;
        
        // Compare
        let result;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            result = aVal - bVal;
        } else {
            result = String(aVal).localeCompare(String(bVal));
        }
        
        return order === 'desc' ? -result : result;
    });
}

/**
 * Apply format transform - format field values
 * @param {Array|Object} data - Input data
 * @param {Object} formatConfig - Format configuration {fieldName: {type, pattern}}
 * @returns {Array|Object} Data with formatted fields
 */
function transformFormat(data, formatConfig) {
    if (!formatConfig || typeof formatConfig !== 'object') {
        throw new Error('format requires a configuration object');
    }
    
    const formatValue = (value, config) => {
        if (value === null || value === undefined) return value;
        
        const type = config.type || 'string';
        
        switch (type) {
            case 'date': {
                // Format date according to pattern
                const pattern = config.pattern || 'YYYY-MM-DD';
                let date;
                
                if (value instanceof Date) {
                    date = value;
                } else if (typeof value === 'string' || typeof value === 'number') {
                    date = new Date(value);
                } else {
                    return value;
                }
                
                if (isNaN(date.getTime())) return value;
                
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                
                return pattern
                    .replace('YYYY', year)
                    .replace('MM', month)
                    .replace('DD', day)
                    .replace('HH', hours)
                    .replace('mm', minutes)
                    .replace('ss', seconds);
            }
            case 'number': {
                const num = Number(value);
                if (isNaN(num)) return value;
                
                const decimals = config.decimals !== undefined ? config.decimals : 2;
                const thousands = config.thousands !== false;
                
                let formatted = num.toFixed(decimals);
                
                if (thousands) {
                    const parts = formatted.split('.');
                    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                    formatted = parts.join('.');
                }
                
                if (config.prefix) formatted = config.prefix + formatted;
                if (config.suffix) formatted = formatted + config.suffix;
                
                return formatted;
            }
            case 'uppercase':
                return String(value).toUpperCase();
            case 'lowercase':
                return String(value).toLowerCase();
            case 'trim':
                return String(value).trim();
            case 'boolean': {
                const trueVal = config.true || 'Yes';
                const falseVal = config.false || 'No';
                return value ? trueVal : falseVal;
            }
            case 'replace': {
                if (!config.search) return value;
                const search = new RegExp(config.search, config.flags || 'g');
                return String(value).replace(search, config.replacement || '');
            }
            case 'default': {
                // Replace null/empty with default value
                if (value === null || value === undefined || value === '') {
                    return config.value || 'N/A';
                }
                return value;
            }
            default:
                return value;
        }
    };
    
    const formatFields = (obj) => {
        const result = { ...obj };
        for (const [field, config] of Object.entries(formatConfig)) {
            if (field in result) {
                result[field] = formatValue(result[field], config);
            }
        }
        return result;
    };
    
    const fields = Object.keys(formatConfig).join(', ');
    console.error(`File Export: format fields [${fields}]`);
    
    if (Array.isArray(data)) {
        return data.map(formatFields);
    } else if (typeof data === 'object' && data !== null) {
        return formatFields(data);
    }
    return data;
}

/**
 * Apply limit transform - keep only first N rows
 * @param {Array} data - Input data array
 * @param {number} count - Number of rows to keep
 * @returns {Array} Limited data
 */
function transformLimit(data, count) {
    if (!Array.isArray(data)) {
        console.error('File Export: limit requires array data, skipping');
        return data;
    }
    
    const n = parseInt(count, 10);
    if (isNaN(n) || n < 0) {
        throw new Error('limit requires a positive number');
    }
    
    console.error(`File Export: limit to ${n} rows (was ${data.length})`);
    return data.slice(0, n);
}

/**
 * Apply skip transform - skip first N rows
 * @param {Array} data - Input data array
 * @param {number} count - Number of rows to skip
 * @returns {Array} Data with skipped rows
 */
function transformSkip(data, count) {
    if (!Array.isArray(data)) {
        console.error('File Export: skip requires array data, skipping');
        return data;
    }
    
    const n = parseInt(count, 10);
    if (isNaN(n) || n < 0) {
        throw new Error('skip requires a positive number');
    }
    
    console.error(`File Export: skip ${n} rows (was ${data.length}, now ${Math.max(0, data.length - n)})`);
    return data.slice(n);
}

/**
 * Apply reverse transform - reverse row order
 * @param {Array} data - Input data array
 * @returns {Array} Reversed data
 */
function transformReverse(data) {
    if (!Array.isArray(data)) {
        console.error('File Export: reverse requires array data, skipping');
        return data;
    }
    
    console.error(`File Export: reverse ${data.length} rows`);
    return [...data].reverse();
}

/**
 * Apply distinct transform - remove duplicate rows
 * @param {Array} data - Input data array
 * @param {string|Array} fields - Field(s) to check for uniqueness, or null for entire row
 * @returns {Array} Deduplicated data
 */
function transformDistinct(data, fields) {
    if (!Array.isArray(data)) {
        console.error('File Export: distinct requires array data, skipping');
        return data;
    }
    
    const before = data.length;
    const seen = new Set();
    
    const result = data.filter(row => {
        let key;
        if (fields) {
            // Distinct by specific field(s)
            const fieldList = Array.isArray(fields) ? fields : [fields];
            key = fieldList.map(f => JSON.stringify(getNestedValue(row, f))).join('|');
        } else {
            // Distinct by entire row
            key = JSON.stringify(row);
        }
        
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    
    const fieldDesc = fields ? (Array.isArray(fields) ? fields.join(', ') : fields) : 'all fields';
    console.error(`File Export: distinct by [${fieldDesc}] - ${before} rows → ${result.length} rows`);
    return result;
}

/**
 * Apply flatten transform - flatten nested objects to dot-notation
 * @param {Array|Object} data - Input data
 * @param {string} separator - Separator for nested keys (default: '.')
 * @returns {Array|Object} Flattened data
 */
function transformFlatten(data, config) {
    const separator = (typeof config === 'object' ? config.separator : config) || '.';
    
    const flattenObj = (obj, prefix = '', result = {}) => {
        if (obj === null || obj === undefined) {
            if (prefix) result[prefix] = obj;
            return result;
        }
        
        if (typeof obj !== 'object' || obj instanceof Date) {
            if (prefix) result[prefix] = obj;
            return result;
        }
        
        if (Array.isArray(obj)) {
            if (prefix) result[prefix] = obj;
            return result;
        }
        
        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}${separator}${key}` : key;
            if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
                flattenObj(value, newKey, result);
            } else {
                result[newKey] = value;
            }
        }
        
        return result;
    };
    
    console.error(`File Export: flatten with separator '${separator}'`);
    
    if (Array.isArray(data)) {
        return data.map(row => flattenObj(row));
    } else if (typeof data === 'object' && data !== null) {
        return flattenObj(data);
    }
    return data;
}

/**
 * Apply compute transform - add calculated fields
 * @param {Array|Object} data - Input data
 * @param {Object} computations - Field definitions {newField: expression}
 * @returns {Array|Object} Data with computed fields
 */
function transformCompute(data, computations) {
    if (!computations || typeof computations !== 'object') {
        throw new Error('compute requires an object with field definitions');
    }
    
    const computeValue = (row, expression) => {
        // Replace field references with actual values
        // Support: field names, basic math (+, -, *, /), string concat
        let expr = expression;
        
        // Find all field references (words that aren't numbers or operators)
        const fieldRefs = expr.match(/[a-zA-Z_][a-zA-Z0-9_.]*(?![\(])/g) || [];
        const uniqueFields = [...new Set(fieldRefs)];
        
        // Create a safe evaluation context
        const context = {};
        for (const field of uniqueFields) {
            const value = getNestedValue(row, field);
            // Sanitize field name for use as variable
            const safeField = field.replace(/\./g, '_');
            context[safeField] = value;
            // Replace in expression
            expr = expr.replace(new RegExp(`\\b${field.replace('.', '\\.')}\\b`, 'g'), safeField);
        }
        
        try {
            // Build function with context variables
            const vars = Object.keys(context);
            const vals = Object.values(context);
            // eslint-disable-next-line no-new-func
            const fn = new Function(...vars, `return ${expr}`);
            return fn(...vals);
        } catch (e) {
            console.error(`File Export: compute error for '${expression}': ${e.message}`);
            return null;
        }
    };
    
    const addComputed = (row) => {
        const result = { ...row };
        for (const [newField, expression] of Object.entries(computations)) {
            result[newField] = computeValue(row, expression);
        }
        return result;
    };
    
    const fields = Object.keys(computations).join(', ');
    console.error(`File Export: compute fields [${fields}]`);
    
    if (Array.isArray(data)) {
        return data.map(addComputed);
    } else if (typeof data === 'object' && data !== null) {
        return addComputed(data);
    }
    return data;
}

/**
 * Apply concat transform - combine fields into new field
 * @param {Array|Object} data - Input data
 * @param {Object} config - {field: "newFieldName", fields: [...], separator: " "}
 * @returns {Array|Object} Data with concatenated field
 */
function transformConcat(data, config) {
    if (!config || !config.field || !config.fields) {
        throw new Error('concat requires {field: "name", fields: [...]}');
    }
    
    const { field, fields, separator = ' ' } = config;
    
    const concatFields = (row) => {
        const result = { ...row };
        const values = fields.map(f => {
            const val = getNestedValue(row, f);
            return val !== null && val !== undefined ? String(val) : '';
        });
        result[field] = values.filter(v => v !== '').join(separator);
        return result;
    };
    
    console.error(`File Export: concat [${fields.join(', ')}] → '${field}'`);
    
    if (Array.isArray(data)) {
        return data.map(concatFields);
    } else if (typeof data === 'object' && data !== null) {
        return concatFields(data);
    }
    return data;
}

/**
 * Apply split transform - split field into multiple fields
 * @param {Array|Object} data - Input data
 * @param {Object} config - {field: "source", separator: ",", into: ["field1", "field2"]}
 * @returns {Array|Object} Data with split fields
 */
function transformSplit(data, config) {
    if (!config || !config.field || !config.into) {
        throw new Error('split requires {field: "source", into: [...]}');
    }
    
    const { field, separator = ',', into } = config;
    
    const splitField = (row) => {
        const result = { ...row };
        const value = getNestedValue(row, field);
        const parts = value ? String(value).split(separator) : [];
        
        into.forEach((newField, index) => {
            result[newField] = parts[index] !== undefined ? parts[index].trim() : '';
        });
        
        return result;
    };
    
    console.error(`File Export: split '${field}' by '${separator}' → [${into.join(', ')}]`);
    
    if (Array.isArray(data)) {
        return data.map(splitField);
    } else if (typeof data === 'object' && data !== null) {
        return splitField(data);
    }
    return data;
}

/**
 * Apply lookup transform - map values using a lookup table
 * @param {Array|Object} data - Input data
 * @param {Object} config - {field: "fieldName", map: {value: label}, default: "Unknown"}
 * @returns {Array|Object} Data with mapped values
 */
function transformLookup(data, config) {
    if (!config || !config.field || !config.map) {
        throw new Error('lookup requires {field: "name", map: {...}}');
    }
    
    const { field, map, default: defaultValue = null, target } = config;
    const targetField = target || field; // Can map to a different field
    
    const lookupValue = (row) => {
        const result = { ...row };
        const value = getNestedValue(row, field);
        const key = String(value);
        
        if (key in map) {
            result[targetField] = map[key];
        } else if (defaultValue !== null) {
            result[targetField] = defaultValue;
        }
        
        return result;
    };
    
    const mapCount = Object.keys(map).length;
    console.error(`File Export: lookup '${field}' with ${mapCount} mappings`);
    
    if (Array.isArray(data)) {
        return data.map(lookupValue);
    } else if (typeof data === 'object' && data !== null) {
        return lookupValue(data);
    }
    return data;
}

/**
 * Apply group transform - group by field with aggregations
 * @param {Array} data - Input data array
 * @param {Object} config - {by: "field", aggregations: {newField: {op: "sum", field: "amount"}}}
 * @returns {Array} Grouped and aggregated data
 */
function transformGroup(data, config) {
    if (!Array.isArray(data)) {
        console.error('File Export: group requires array data, skipping');
        return data;
    }
    
    if (!config || !config.by) {
        throw new Error('group requires {by: "field", aggregations: {...}}');
    }
    
    const { by, aggregations = {} } = config;
    const groupFields = Array.isArray(by) ? by : [by];
    
    // Group data
    const groups = new Map();
    data.forEach(row => {
        const key = groupFields.map(f => JSON.stringify(getNestedValue(row, f))).join('|');
        if (!groups.has(key)) {
            groups.set(key, { key: {}, rows: [] });
            groupFields.forEach(f => {
                groups.get(key).key[f] = getNestedValue(row, f);
            });
        }
        groups.get(key).rows.push(row);
    });
    
    // Apply aggregations
    const result = [];
    groups.forEach(group => {
        const row = { ...group.key };
        
        // Add count by default
        row._count = group.rows.length;
        
        // Apply custom aggregations
        for (const [newField, aggConfig] of Object.entries(aggregations)) {
            const { op, field } = aggConfig;
            const values = group.rows.map(r => getNestedValue(r, field)).filter(v => v !== null && v !== undefined);
            const numValues = values.map(Number).filter(n => !isNaN(n));
            
            switch (op) {
                case 'sum':
                    row[newField] = numValues.reduce((a, b) => a + b, 0);
                    break;
                case 'avg':
                case 'average':
                    row[newField] = numValues.length > 0 ? numValues.reduce((a, b) => a + b, 0) / numValues.length : 0;
                    break;
                case 'min':
                    row[newField] = numValues.length > 0 ? Math.min(...numValues) : null;
                    break;
                case 'max':
                    row[newField] = numValues.length > 0 ? Math.max(...numValues) : null;
                    break;
                case 'count':
                    row[newField] = values.length;
                    break;
                case 'first':
                    row[newField] = values[0];
                    break;
                case 'last':
                    row[newField] = values[values.length - 1];
                    break;
                case 'list':
                    row[newField] = values.join(', ');
                    break;
                default:
                    console.error(`File Export: unknown aggregation '${op}'`);
            }
        }
        
        result.push(row);
    });
    
    const aggCount = Object.keys(aggregations).length;
    console.error(`File Export: group by [${groupFields.join(', ')}] with ${aggCount} aggregations - ${data.length} rows → ${result.length} groups`);
    return result;
}

/**
 * Apply summarize transform - add summary row with totals
 * @param {Array} data - Input data array
 * @param {Object} config - {fields: {fieldName: "sum|avg|count|min|max"}, label: {field: "value"}}
 * @returns {Array} Data with summary row appended
 */
function transformSummarize(data, config) {
    if (!Array.isArray(data)) {
        console.error('File Export: summarize requires array data, skipping');
        return data;
    }
    
    if (!config || !config.fields) {
        throw new Error('summarize requires {fields: {fieldName: "operation"}}');
    }
    
    const { fields, label = {} } = config;
    const summary = {};
    
    // Set label field(s)
    for (const [field, value] of Object.entries(label)) {
        summary[field] = value;
    }
    
    // Calculate summaries
    for (const [field, op] of Object.entries(fields)) {
        const values = data.map(r => getNestedValue(r, field)).filter(v => v !== null && v !== undefined);
        const numValues = values.map(Number).filter(n => !isNaN(n));
        
        switch (op) {
            case 'sum':
                summary[field] = numValues.reduce((a, b) => a + b, 0);
                break;
            case 'avg':
            case 'average':
                summary[field] = numValues.length > 0 ? numValues.reduce((a, b) => a + b, 0) / numValues.length : 0;
                break;
            case 'min':
                summary[field] = numValues.length > 0 ? Math.min(...numValues) : null;
                break;
            case 'max':
                summary[field] = numValues.length > 0 ? Math.max(...numValues) : null;
                break;
            case 'count':
                summary[field] = values.length;
                break;
            default:
                console.error(`File Export: unknown summary operation '${op}'`);
        }
    }
    
    console.error(`File Export: summarize ${Object.keys(fields).length} fields`);
    return [...data, summary];
}

/**
 * Apply truncate transform - limit string length
 * @param {Array|Object} data - Input data
 * @param {Object} config - {field: length} or {field: {length: N, suffix: "..."}}
 * @returns {Array|Object} Data with truncated strings
 */
function transformTruncate(data, config) {
    if (!config || typeof config !== 'object') {
        throw new Error('truncate requires {field: length} or {field: {length: N}}');
    }
    
    const truncateFields = (row) => {
        const result = { ...row };
        for (const [field, settings] of Object.entries(config)) {
            if (!(field in result)) continue;
            
            let length, suffix;
            if (typeof settings === 'number') {
                length = settings;
                suffix = '...';
            } else {
                length = settings.length || 50;
                suffix = settings.suffix !== undefined ? settings.suffix : '...';
            }
            
            const value = result[field];
            if (typeof value === 'string' && value.length > length) {
                result[field] = value.substring(0, length - suffix.length) + suffix;
            }
        }
        return result;
    };
    
    const fields = Object.keys(config).join(', ');
    console.error(`File Export: truncate fields [${fields}]`);
    
    if (Array.isArray(data)) {
        return data.map(truncateFields);
    } else if (typeof data === 'object' && data !== null) {
        return truncateFields(data);
    }
    return data;
}

/**
 * Apply pad transform - pad strings to fixed width
 * @param {Array|Object} data - Input data
 * @param {Object} config - {field: {length: N, char: " ", side: "left|right"}}
 * @returns {Array|Object} Data with padded strings
 */
function transformPad(data, config) {
    if (!config || typeof config !== 'object') {
        throw new Error('pad requires {field: {length: N}}');
    }
    
    const padFields = (row) => {
        const result = { ...row };
        for (const [field, settings] of Object.entries(config)) {
            if (!(field in result)) continue;
            
            const length = settings.length || 10;
            const char = settings.char || ' ';
            const side = settings.side || 'left';
            
            let value = String(result[field] ?? '');
            if (side === 'left') {
                value = value.padStart(length, char);
            } else {
                value = value.padEnd(length, char);
            }
            result[field] = value;
        }
        return result;
    };
    
    const fields = Object.keys(config).join(', ');
    console.error(`File Export: pad fields [${fields}]`);
    
    if (Array.isArray(data)) {
        return data.map(padFields);
    } else if (typeof data === 'object' && data !== null) {
        return padFields(data);
    }
    return data;
}

/**
 * Apply mask transform - mask sensitive data
 * @param {Array|Object} data - Input data
 * @param {Object} config - {field: {type: "email|phone|card|custom", show: N, char: "*"}}
 * @returns {Array|Object} Data with masked values
 */
function transformMask(data, config) {
    if (!config || typeof config !== 'object') {
        throw new Error('mask requires {field: {type: "..."}}');
    }
    
    const maskValue = (value, settings) => {
        if (value === null || value === undefined) return value;
        const str = String(value);
        
        const type = settings.type || 'custom';
        const maskChar = settings.char || '*';
        const showStart = settings.showStart || settings.show || 0;
        const showEnd = settings.showEnd || 0;
        
        switch (type) {
            case 'email': {
                const atIdx = str.indexOf('@');
                if (atIdx <= 0) return str;
                const local = str.substring(0, atIdx);
                const domain = str.substring(atIdx);
                const show = Math.min(2, local.length);
                return local.substring(0, show) + maskChar.repeat(Math.max(1, local.length - show)) + domain;
            }
            case 'phone': {
                const digits = str.replace(/\D/g, '');
                if (digits.length < 4) return maskChar.repeat(str.length);
                const lastFour = digits.slice(-4);
                return maskChar.repeat(digits.length - 4) + lastFour;
            }
            case 'card': {
                const digits = str.replace(/\D/g, '');
                if (digits.length < 4) return maskChar.repeat(str.length);
                const lastFour = digits.slice(-4);
                return maskChar.repeat(digits.length - 4) + lastFour;
            }
            case 'full':
                return maskChar.repeat(str.length);
            case 'custom':
            default: {
                if (str.length <= showStart + showEnd) return str;
                const start = str.substring(0, showStart);
                const end = str.substring(str.length - showEnd);
                const middle = maskChar.repeat(Math.max(1, str.length - showStart - showEnd));
                return start + middle + end;
            }
        }
    };
    
    const maskFields = (row) => {
        const result = { ...row };
        for (const [field, settings] of Object.entries(config)) {
            if (field in result) {
                result[field] = maskValue(result[field], typeof settings === 'string' ? { type: settings } : settings);
            }
        }
        return result;
    };
    
    const fields = Object.keys(config).join(', ');
    console.error(`File Export: mask fields [${fields}]`);
    
    if (Array.isArray(data)) {
        return data.map(maskFields);
    } else if (typeof data === 'object' && data !== null) {
        return maskFields(data);
    }
    return data;
}

/**
 * Apply unwind transform - explode array field into multiple rows
 * @param {Array} data - Input data array
 * @param {Object|string} config - Field name or {field: "name", preserveEmpty: true}
 * @returns {Array} Expanded data with one row per array element
 */
function transformUnwind(data, config) {
    if (!Array.isArray(data)) {
        console.error('File Export: unwind requires array data, skipping');
        return data;
    }
    
    let field, preserveEmpty = false;
    if (typeof config === 'string') {
        field = config;
    } else if (typeof config === 'object') {
        field = config.field;
        preserveEmpty = config.preserveEmpty || false;
    }
    
    if (!field) {
        throw new Error('unwind requires a field name');
    }
    
    const before = data.length;
    const result = [];
    
    data.forEach(row => {
        const arrayValue = getNestedValue(row, field);
        
        if (!Array.isArray(arrayValue) || arrayValue.length === 0) {
            if (preserveEmpty) {
                result.push({ ...row, [field]: null });
            }
            return;
        }
        
        arrayValue.forEach(item => {
            result.push({ ...row, [field]: item });
        });
    });
    
    console.error(`File Export: unwind '${field}' - ${before} rows → ${result.length} rows`);
    return result;
}

/**
 * Apply addIndex transform - add row number field
 * @param {Array} data - Input data array
 * @param {Object|string} config - Field name or {field: "name", start: 1}
 * @returns {Array} Data with index field added
 */
function transformAddIndex(data, config) {
    if (!Array.isArray(data)) {
        console.error('File Export: addIndex requires array data, skipping');
        return data;
    }
    
    let field = '_index', start = 1;
    if (typeof config === 'string') {
        field = config;
    } else if (typeof config === 'object') {
        field = config.field || '_index';
        start = config.start !== undefined ? config.start : 1;
    }
    
    console.error(`File Export: addIndex '${field}' starting at ${start}`);
    
    return data.map((row, index) => ({
        [field]: start + index,
        ...row
    }));
}

/**
 * Apply coalesce transform - return first non-null value from multiple fields
 * @param {Array|Object} data - Input data
 * @param {Object} config - {field: "target", fields: ["field1", "field2", ...], default: "fallback"}
 * @returns {Array|Object} Data with coalesced field
 */
function transformCoalesce(data, config) {
    if (!config || !config.field || !config.fields) {
        throw new Error('coalesce requires {field: "target", fields: [...]}');
    }
    
    const { field, fields, default: defaultValue = null } = config;
    
    const coalesceFields = (row) => {
        const result = { ...row };
        let value = null;
        
        for (const f of fields) {
            const v = getNestedValue(row, f);
            if (v !== null && v !== undefined && v !== '') {
                value = v;
                break;
            }
        }
        
        result[field] = value !== null ? value : defaultValue;
        return result;
    };
    
    console.error(`File Export: coalesce [${fields.join(', ')}] → '${field}'`);
    
    if (Array.isArray(data)) {
        return data.map(coalesceFields);
    } else if (typeof data === 'object' && data !== null) {
        return coalesceFields(data);
    }
    return data;
}

/**
 * Apply if transform - conditional field assignment
 * @param {Array|Object} data - Input data
 * @param {Object} config - {field: "target", condition: "expr", then: value, else: value}
 * @returns {Array|Object} Data with conditional field
 */
function transformIf(data, config) {
    if (!config || !config.field || !config.condition) {
        throw new Error('if requires {field: "target", condition: "expr", then: value}');
    }
    
    const { field, condition, then: thenValue, else: elseValue = null } = config;
    
    const applyCondition = (row) => {
        const result = { ...row };
        let matches = false;
        
        try {
            matches = evaluateCondition(row, condition);
        } catch (e) {
            console.error(`File Export: if condition error: ${e.message}`);
            matches = false;
        }
        
        // Handle value - can be a field reference (starting with $) or literal
        const getValue = (val) => {
            if (typeof val === 'string' && val.startsWith('$')) {
                return getNestedValue(row, val.substring(1));
            }
            return val;
        };
        
        result[field] = matches ? getValue(thenValue) : getValue(elseValue);
        return result;
    };
    
    console.error(`File Export: if '${condition}' → '${field}'`);
    
    if (Array.isArray(data)) {
        return data.map(applyCondition);
    } else if (typeof data === 'object' && data !== null) {
        return applyCondition(data);
    }
    return data;
}

/**
 * Apply set transform - set field to fixed value
 * @param {Array|Object} data - Input data
 * @param {Object} config - {fieldName: value, ...}
 * @returns {Array|Object} Data with set fields
 */
function transformSet(data, config) {
    if (!config || typeof config !== 'object') {
        throw new Error('set requires {field: value, ...}');
    }
    
    const setFields = (row) => {
        const result = { ...row };
        for (const [field, value] of Object.entries(config)) {
            // Support special values
            if (value === '$now') {
                result[field] = new Date().toISOString();
            } else if (value === '$today') {
                result[field] = new Date().toISOString().split('T')[0];
            } else if (value === '$timestamp') {
                result[field] = Date.now();
            } else if (typeof value === 'string' && value.startsWith('$')) {
                // Reference another field
                result[field] = getNestedValue(row, value.substring(1));
            } else {
                result[field] = value;
            }
        }
        return result;
    };
    
    const fields = Object.keys(config).join(', ');
    console.error(`File Export: set fields [${fields}]`);
    
    if (Array.isArray(data)) {
        return data.map(setFields);
    } else if (typeof data === 'object' && data !== null) {
        return setFields(data);
    }
    return data;
}

/**
 * Apply all transforms in sequence (pipeline)
 * @param {*} data - Input data
 * @param {Array} transforms - Array of transform steps
 * @returns {*} Transformed data
 */
function applyTransforms(data, transforms) {
    if (!transforms || !Array.isArray(transforms) || transforms.length === 0) {
        return data;
    }
    
    let result = data;
    
    console.error(`File Export: Applying ${transforms.length} transform(s)...`);
    
    for (let i = 0; i < transforms.length; i++) {
        const step = transforms[i];
        const stepNum = i + 1;
        
        if (typeof step !== 'object' || step === null) {
            throw new Error(`Transform step ${stepNum} is invalid`);
        }
        
        // Get the transform type (first key in the step object)
        const transformType = Object.keys(step)[0];
        const config = step[transformType];
        
        console.error(`File Export: Step ${stepNum}: ${transformType}`);
        
        switch (transformType) {
            // Core transforms
            case 'filter':
                result = transformFilter(result, config);
                break;
            case 'select':
                result = transformSelect(result, config);
                break;
            case 'exclude':
                result = transformExclude(result, config);
                break;
            case 'rename':
                result = transformRename(result, config);
                break;
            case 'sort':
                result = transformSort(result, config);
                break;
            case 'format':
                result = transformFormat(result, config);
                break;
            // Data manipulation
            case 'limit':
                result = transformLimit(result, config);
                break;
            case 'skip':
                result = transformSkip(result, config);
                break;
            case 'reverse':
                result = transformReverse(result);
                break;
            case 'distinct':
                result = transformDistinct(result, config);
                break;
            case 'flatten':
                result = transformFlatten(result, config);
                break;
            // Computed fields
            case 'compute':
                result = transformCompute(result, config);
                break;
            case 'concat':
                result = transformConcat(result, config);
                break;
            case 'split':
                result = transformSplit(result, config);
                break;
            case 'lookup':
                result = transformLookup(result, config);
                break;
            // Aggregation
            case 'group':
                result = transformGroup(result, config);
                break;
            case 'summarize':
                result = transformSummarize(result, config);
                break;
            // String operations
            case 'truncate':
                result = transformTruncate(result, config);
                break;
            case 'pad':
                result = transformPad(result, config);
                break;
            case 'mask':
                result = transformMask(result, config);
                break;
            // Additional transforms
            case 'unwind':
                result = transformUnwind(result, config);
                break;
            case 'addIndex':
                result = transformAddIndex(result, config);
                break;
            case 'coalesce':
                result = transformCoalesce(result, config);
                break;
            case 'if':
                result = transformIf(result, config);
                break;
            case 'set':
                result = transformSet(result, config);
                break;
            default:
                throw new Error(`Unknown transform type: ${transformType}`);
        }
    }
    
    console.error(`File Export: All transforms completed`);
    return result;
}

// ============================================
// FORMAT CONVERTERS
// ============================================

// Convert data to CSV format
function toCSV(data) {
    if (!data || typeof data !== 'object') {
        return 'No data';
    }
    
    // Handle raw stdout output (single 'output' key with multiline string)
    // Convert each line to a row for better CSV usability
    if (!Array.isArray(data) && Object.keys(data).length === 1 && 
        data.output && typeof data.output === 'string') {
        const lines = data.output.trim().split('\n');
        const csvRows = ['line_number,output'];
        lines.forEach((line, index) => {
            csvRows.push(`${index + 1},${escapeCSV(line)}`);
        });
        return csvRows.join('\n');
    }
    
    // Handle array of objects (most common case)
    if (Array.isArray(data)) {
        if (data.length === 0) {
            return 'No data';
        }
        
        // Flatten each row
        const flattenedRows = data.map(row => flattenObject(row));
        
        // Collect all unique headers
        const headersSet = new Set();
        flattenedRows.forEach(row => {
            Object.keys(row).forEach(key => headersSet.add(key));
        });
        const headers = Array.from(headersSet);
        
        // Build CSV
        const csvRows = [];
        csvRows.push(headers.map(escapeCSV).join(','));
        
        flattenedRows.forEach(row => {
            const values = headers.map(header => escapeCSV(row[header] ?? ''));
            csvRows.push(values.join(','));
        });
        
        return csvRows.join('\n');
    }
    
    // Handle single object
    const flattened = flattenObject(data);
    const headers = Object.keys(flattened);
    const values = Object.values(flattened);
    
    const csvRows = [];
    csvRows.push(headers.map(escapeCSV).join(','));
    csvRows.push(values.map(escapeCSV).join(','));
    
    return csvRows.join('\n');
}

// Escape CSV value
function escapeCSV(value) {
    if (value === null || value === undefined) {
        return '';
    }
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// Convert data to HTML format
function toHTML(data, title = 'Exported Data') {
    const escapeHTML = (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
    
    let tableContent = '';
    let isRawOutput = false;
    
    // Check if this is raw stdout output (single 'output' key with multiline string)
    if (data && typeof data === 'object' && !Array.isArray(data) && 
        Object.keys(data).length === 1 && data.output && typeof data.output === 'string') {
        isRawOutput = true;
    }
    
    if (isRawOutput) {
        // Display raw output as preformatted text
        tableContent = `<tbody><tr><td><pre>${escapeHTML(data.output)}</pre></td></tr></tbody>`;
    } else if (Array.isArray(data) && data.length > 0) {
        // Flatten each row for arrays
        const flattenedRows = data.map(row => flattenObject(row));
        
        // Collect all unique headers
        const headersSet = new Set();
        flattenedRows.forEach(row => {
            Object.keys(row).forEach(key => headersSet.add(key));
        });
        const headers = Array.from(headersSet);
        
        // Build table header
        tableContent += '<thead><tr>';
        headers.forEach(header => {
            tableContent += `<th>${escapeHTML(header)}</th>`;
        });
        tableContent += '</tr></thead>';
        
        // Build table body
        tableContent += '<tbody>';
        flattenedRows.forEach(row => {
            tableContent += '<tr>';
            headers.forEach(header => {
                tableContent += `<td>${escapeHTML(row[header] ?? '')}</td>`;
            });
            tableContent += '</tr>';
        });
        tableContent += '</tbody>';
    } else if (data && typeof data === 'object') {
        // Single object - display as key-value pairs
        const flattened = flattenObject(data);
        
        tableContent += '<thead><tr><th>Key</th><th>Value</th></tr></thead>';
        tableContent += '<tbody>';
        for (const [key, value] of Object.entries(flattened)) {
            tableContent += `<tr><td>${escapeHTML(key)}</td><td>${escapeHTML(value)}</td></tr>`;
        }
        tableContent += '</tbody>';
    } else {
        tableContent = '<tbody><tr><td>No data available</td></tr></tbody>';
    }
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHTML(title)}</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 20px;
            font-size: 24px;
        }
        .meta {
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
        }
        .container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        th {
            background-color: #3498db;
            color: white;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.5px;
        }
        tr:hover {
            background-color: #f8f9fa;
        }
        tr:last-child td {
            border-bottom: none;
        }
        td {
            font-size: 14px;
        }
        .empty {
            padding: 40px;
            text-align: center;
            color: #999;
        }
        pre {
            margin: 0;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 4px;
            overflow-x: auto;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
    </style>
</head>
<body>
    <h1>${escapeHTML(title)}</h1>
    <p class="meta">Generated: ${new Date().toISOString()}</p>
    <div class="container">
        <table>
            ${tableContent}
        </table>
    </div>
</body>
</html>`;
}

// Convert data to pretty JSON
function toJSON(data) {
    return JSON.stringify(data, null, 2);
}

// Convert data to XML format
function toXML(data, rootName = 'data') {
    const escapeXML = (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    };
    
    const toXMLNode = (obj, nodeName, indent = '  ') => {
        if (obj === null || obj === undefined) {
            return `${indent}<${nodeName}/>`;
        }
        
        if (typeof obj !== 'object') {
            return `${indent}<${nodeName}>${escapeXML(obj)}</${nodeName}>`;
        }
        
        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return `${indent}<${nodeName}/>`;
            }
            // For arrays, use singular form for items
            const itemName = nodeName.endsWith('s') ? nodeName.slice(0, -1) : 'item';
            const items = obj.map(item => toXMLNode(item, itemName, indent + '  ')).join('\n');
            return `${indent}<${nodeName}>\n${items}\n${indent}</${nodeName}>`;
        }
        
        // Object
        const entries = Object.entries(obj);
        if (entries.length === 0) {
            return `${indent}<${nodeName}/>`;
        }
        
        const children = entries.map(([key, value]) => {
            // Sanitize key for XML (remove invalid characters, replace spaces)
            const xmlKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^[0-9]/, '_$&');
            return toXMLNode(value, xmlKey, indent + '  ');
        }).join('\n');
        
        return `${indent}<${nodeName}>\n${children}\n${indent}</${nodeName}>`;
    };
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    
    if (Array.isArray(data)) {
        xml += `<${rootName}>\n`;
        const itemName = rootName === 'data' ? 'item' : (rootName.endsWith('s') ? rootName.slice(0, -1) : 'item');
        data.forEach(item => {
            xml += toXMLNode(item, itemName, '  ') + '\n';
        });
        xml += `</${rootName}>`;
    } else {
        xml += toXMLNode(data, rootName, '').trimStart();
    }
    
    return xml;
}

// Convert data to YAML format
function toYAML(data, indent = 0) {
    const spaces = '  '.repeat(indent);
    
    if (data === null || data === undefined) {
        return 'null';
    }
    
    if (typeof data === 'boolean') {
        return data ? 'true' : 'false';
    }
    
    if (typeof data === 'number') {
        return String(data);
    }
    
    if (typeof data === 'string') {
        // Check if string needs quoting
        if (data === '' || 
            data.includes(':') || 
            data.includes('#') || 
            data.includes('\n') ||
            data.startsWith(' ') ||
            data.endsWith(' ') ||
            /^[\[\]{}>&*!|>'"%@`]/.test(data) ||
            ['true', 'false', 'null', 'yes', 'no', 'on', 'off'].includes(data.toLowerCase())) {
            // Use quoted string
            return '"' + data.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
        }
        return data;
    }
    
    if (Array.isArray(data)) {
        if (data.length === 0) {
            return '[]';
        }
        let yaml = '';
        data.forEach((item, index) => {
            const itemYaml = toYAML(item, indent + 1);
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                yaml += `${spaces}- ${itemYaml.trimStart()}`;
            } else {
                yaml += `${spaces}- ${itemYaml}`;
            }
            if (index < data.length - 1) yaml += '\n';
        });
        return yaml;
    }
    
    if (typeof data === 'object') {
        const entries = Object.entries(data);
        if (entries.length === 0) {
            return '{}';
        }
        let yaml = '';
        entries.forEach(([key, value], index) => {
            // Escape key if needed
            let yamlKey = key;
            if (key.includes(':') || key.includes('#') || key.includes(' ')) {
                yamlKey = '"' + key.replace(/"/g, '\\"') + '"';
            }
            
            const valueYaml = toYAML(value, indent + 1);
            
            if (typeof value === 'object' && value !== null && 
                ((Array.isArray(value) && value.length > 0) || 
                 (!Array.isArray(value) && Object.keys(value).length > 0))) {
                yaml += `${spaces}${yamlKey}:\n${valueYaml}`;
            } else {
                yaml += `${spaces}${yamlKey}: ${valueYaml}`;
            }
            if (index < entries.length - 1) yaml += '\n';
        });
        return yaml;
    }
    
    return String(data);
}

// Convert data to plain text table format
function toTXT(data, title = 'Exported Data') {
    let txt = '';
    txt += '=' .repeat(60) + '\n';
    txt += `  ${title}\n`;
    txt += `  Generated: ${new Date().toISOString()}\n`;
    txt += '='.repeat(60) + '\n\n';
    
    // Handle raw stdout output
    if (data && typeof data === 'object' && !Array.isArray(data) &&
        Object.keys(data).length === 1 && data.output && typeof data.output === 'string') {
        txt += data.output + '\n';
        return txt;
    }
    
    if (Array.isArray(data) && data.length > 0) {
        // Flatten for table display
        const flattenedRows = data.map(row => flattenObject(row));
        
        // Collect all headers
        const headersSet = new Set();
        flattenedRows.forEach(row => {
            Object.keys(row).forEach(key => headersSet.add(key));
        });
        const headers = Array.from(headersSet);
        
        // Calculate column widths
        const colWidths = headers.map(h => {
            const maxDataWidth = Math.max(...flattenedRows.map(row => String(row[h] ?? '').length));
            return Math.max(h.length, maxDataWidth, 4);
        });
        
        // Header row
        txt += headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + '\n';
        txt += colWidths.map(w => '-'.repeat(w)).join('-+-') + '\n';
        
        // Data rows
        flattenedRows.forEach(row => {
            txt += headers.map((h, i) => String(row[h] ?? '').padEnd(colWidths[i])).join(' | ') + '\n';
        });
    } else if (data && typeof data === 'object') {
        const flattened = flattenObject(data);
        const maxKeyLen = Math.max(...Object.keys(flattened).map(k => k.length));
        
        for (const [key, value] of Object.entries(flattened)) {
            txt += `${key.padEnd(maxKeyLen)} : ${value}\n`;
        }
    } else {
        txt += 'No data available\n';
    }
    
    txt += '\n' + '='.repeat(60) + '\n';
    return txt;
}

// Convert data to Excel format
async function toExcel(data, title = 'Exported Data') {
    const workbook = new exceljs.Workbook();
    workbook.creator = 'xyOps File Export';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet(title.substring(0, 31)); // Excel sheet name max 31 chars
    
    if (Array.isArray(data) && data.length > 0) {
        // Flatten for table display
        const flattenedRows = data.map(row => flattenObject(row));
        
        // Collect all headers
        const headersSet = new Set();
        flattenedRows.forEach(row => {
            Object.keys(row).forEach(key => headersSet.add(key));
        });
        const headers = Array.from(headersSet);
        
        // Add header row
        worksheet.addRow(headers);
        
        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF3498DB' }
        };
        
        // Add data rows
        flattenedRows.forEach(row => {
            const values = headers.map(h => row[h] ?? '');
            worksheet.addRow(values);
        });
        
        // Auto-fit columns
        worksheet.columns.forEach((column, index) => {
            column.width = Math.min(50, Math.max(10, headers[index]?.length || 10));
        });
    } else if (data && typeof data === 'object') {
        const flattened = flattenObject(data);
        
        worksheet.addRow(['Key', 'Value']);
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        
        for (const [key, value] of Object.entries(flattened)) {
            worksheet.addRow([key, value]);
        }
        
        worksheet.columns = [
            { width: 30 },
            { width: 50 }
        ];
    }
    
    // Return buffer
    return await workbook.xlsx.writeBuffer();
}

// Convert data to PDF format
function toPDF(data, title = 'Exported Data') {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const doc = new PDFDocument({ margin: 50 });
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        
        // Title
        doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').fillColor('gray')
           .text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
        doc.moveDown(1);
        doc.fillColor('black');
        
        if (Array.isArray(data) && data.length > 0) {
            // Flatten for table display
            const flattenedRows = data.map(row => flattenObject(row));
            
            // Collect all headers
            const headersSet = new Set();
            flattenedRows.forEach(row => {
                Object.keys(row).forEach(key => headersSet.add(key));
            });
            const headers = Array.from(headersSet);
            
            // Simple table rendering
            const startX = 50;
            const colWidth = Math.min(100, (doc.page.width - 100) / headers.length);
            let y = doc.y;
            
            // Header
            doc.fontSize(9).font('Helvetica-Bold');
            headers.forEach((h, i) => {
                doc.text(h.substring(0, 15), startX + (i * colWidth), y, {
                    width: colWidth - 5,
                    height: 20,
                    ellipsis: true
                });
            });
            
            y += 20;
            doc.moveTo(startX, y).lineTo(startX + (headers.length * colWidth), y).stroke();
            y += 5;
            
            // Data rows
            doc.font('Helvetica').fontSize(8);
            flattenedRows.forEach((row, rowIndex) => {
                if (y > doc.page.height - 50) {
                    doc.addPage();
                    y = 50;
                }
                
                headers.forEach((h, i) => {
                    const val = String(row[h] ?? '').substring(0, 20);
                    doc.text(val, startX + (i * colWidth), y, {
                        width: colWidth - 5,
                        height: 15,
                        ellipsis: true
                    });
                });
                y += 15;
            });
        } else if (data && typeof data === 'object') {
            const flattened = flattenObject(data);
            
            doc.fontSize(10);
            for (const [key, value] of Object.entries(flattened)) {
                doc.font('Helvetica-Bold').text(`${key}: `, { continued: true });
                doc.font('Helvetica').text(String(value));
            }
        } else {
            doc.text('No data available');
        }
        
        doc.end();
    });
}

// Convert data to HL7 v2.x pipe-delimited format
function toHL7v2(data) {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const messageId = generateUID() + generateUID(); // 16 char message control ID
    
    // HL7 v2.x delimiters
    const fieldSep = '|';
    const compSep = '^';
    const repSep = '~';
    const escChar = '\\';
    const subCompSep = '&';
    
    // Escape HL7 special characters
    const escapeHL7 = (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/\\/g, '\\E\\')
            .replace(/\|/g, '\\F\\')
            .replace(/\^/g, '\\S\\')
            .replace(/&/g, '\\T\\')
            .replace(/~/g, '\\R\\')
            .replace(/\r/g, '')
            .replace(/\n/g, '\\X0A\\');
    };
    
    let segments = [];
    
    // MSH - Message Header
    segments.push([
        'MSH',
        '^~\\&',                    // Encoding characters
        'XYOPS',                    // Sending Application
        'XYOPS_FACILITY',           // Sending Facility  
        'RECEIVING_APP',            // Receiving Application
        'RECEIVING_FACILITY',       // Receiving Facility
        timestamp,                  // Date/Time of Message
        '',                         // Security
        'ORU^R01^ORU_R01',         // Message Type (Observation Result)
        messageId,                  // Message Control ID
        'P',                        // Processing ID (P=Production)
        '2.5.1'                     // Version ID
    ].join(fieldSep));
    
    // PID - Patient Identification (generic placeholder)
    segments.push([
        'PID',
        '1',                        // Set ID
        '',                         // Patient ID (External)
        'XYOPS_DATA^^^XYOPS',      // Patient ID (Internal)
        '',                         // Alternate Patient ID
        'Export^Data^File',         // Patient Name
        '',                         // Mother's Maiden Name
        '',                         // Date of Birth
        '',                         // Sex
        '',                         // Patient Alias
        '',                         // Race
        '',                         // Address
        '',                         // County Code
        '',                         // Phone - Home
        '',                         // Phone - Business
        '',                         // Primary Language
        '',                         // Marital Status
        '',                         // Religion
        '',                         // Patient Account Number
        ''                          // SSN
    ].join(fieldSep));
    
    // OBR - Observation Request
    segments.push([
        'OBR',
        '1',                        // Set ID
        messageId,                  // Placer Order Number
        messageId,                  // Filler Order Number
        'EXPORT^Data Export^XYOPS', // Universal Service ID
        '',                         // Priority
        timestamp,                  // Requested Date/Time
        timestamp                   // Observation Date/Time
    ].join(fieldSep));
    
    // Convert data to OBX segments
    let obxSetId = 0;
    
    const addOBX = (key, value, valueType = 'ST') => {
        obxSetId++;
        // Determine value type based on content
        let vt = valueType;
        let val = escapeHL7(value);
        
        if (typeof value === 'number') {
            vt = Number.isInteger(value) ? 'NM' : 'NM';
            val = String(value);
        } else if (typeof value === 'boolean') {
            vt = 'ST';
            val = value ? 'true' : 'false';
        }
        
        segments.push([
            'OBX',
            String(obxSetId),           // Set ID
            vt,                         // Value Type (ST=String, NM=Numeric)
            `${escapeHL7(key)}^^XYOPS`, // Observation Identifier
            '1',                        // Observation Sub-ID
            val,                        // Observation Value
            '',                         // Units
            '',                         // Reference Range
            '',                         // Abnormal Flags
            '',                         // Probability
            '',                         // Nature of Abnormal Test
            'F',                        // Observation Result Status (F=Final)
            '',                         // Effective Date
            '',                         // User Defined Access Checks
            timestamp                   // Date/Time of Observation
        ].join(fieldSep));
    };
    
    // Process data
    if (Array.isArray(data)) {
        data.forEach((item, rowIndex) => {
            // Add a NTE (Notes) segment to separate rows
            if (rowIndex > 0) {
                segments.push(`NTE|${rowIndex}||--- Row ${rowIndex + 1} ---`);
            }
            
            if (typeof item === 'object' && item !== null) {
                const flattened = flattenObject(item);
                for (const [key, value] of Object.entries(flattened)) {
                    addOBX(`ROW${rowIndex + 1}_${key}`, value);
                }
            } else {
                addOBX(`ROW${rowIndex + 1}`, item);
            }
        });
    } else if (typeof data === 'object' && data !== null) {
        const flattened = flattenObject(data);
        for (const [key, value] of Object.entries(flattened)) {
            addOBX(key, value);
        }
    }
    
    // Join segments with carriage return (HL7 standard)
    return segments.join('\r\n');
}

// Convert data to HL7 FHIR JSON format
function toFHIR(data) {
    const timestamp = new Date().toISOString();
    const bundleId = generateUID() + '-' + generateUID();
    
    // Create FHIR Bundle
    const bundle = {
        resourceType: 'Bundle',
        id: bundleId,
        type: 'collection',
        timestamp: timestamp,
        entry: []
    };
    
    // Helper to create Observation resource
    const createObservation = (key, value, index) => {
        const obsId = `obs-${generateUID()}`;
        
        let valueField = {};
        if (typeof value === 'number') {
            valueField = {
                valueQuantity: {
                    value: value,
                    unit: 'unit',
                    system: 'http://unitsofmeasure.org'
                }
            };
        } else if (typeof value === 'boolean') {
            valueField = { valueBoolean: value };
        } else {
            valueField = { valueString: String(value ?? '') };
        }
        
        return {
            fullUrl: `urn:uuid:${obsId}`,
            resource: {
                resourceType: 'Observation',
                id: obsId,
                status: 'final',
                code: {
                    coding: [{
                        system: 'http://xyops.local/observations',
                        code: key.replace(/[^a-zA-Z0-9_-]/g, '_'),
                        display: key
                    }],
                    text: key
                },
                effectiveDateTime: timestamp,
                issued: timestamp,
                ...valueField
            }
        };
    };
    
    // Process data
    if (Array.isArray(data)) {
        data.forEach((item, rowIndex) => {
            if (typeof item === 'object' && item !== null) {
                // Create a grouped observation or individual observations
                const flattened = flattenObject(item);
                for (const [key, value] of Object.entries(flattened)) {
                    bundle.entry.push(createObservation(`row${rowIndex + 1}_${key}`, value, rowIndex));
                }
            } else {
                bundle.entry.push(createObservation(`row${rowIndex + 1}`, item, rowIndex));
            }
        });
    } else if (typeof data === 'object' && data !== null) {
        const flattened = flattenObject(data);
        let index = 0;
        for (const [key, value] of Object.entries(flattened)) {
            bundle.entry.push(createObservation(key, value, index++));
        }
    }
    
    bundle.total = bundle.entry.length;
    
    return JSON.stringify(bundle, null, 2);
}

// Convert data to Markdown format
function toMarkdown(data, title = 'Exported Data') {
    const escapeMarkdown = (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/\|/g, '\\|')
            .replace(/\n/g, '<br>');
    };
    
    let md = `# ${title}\n\n`;
    md += `*Generated: ${new Date().toISOString()}*\n\n`;
    
    // Handle raw stdout output
    if (data && typeof data === 'object' && !Array.isArray(data) &&
        Object.keys(data).length === 1 && data.output && typeof data.output === 'string') {
        md += '## Output\n\n';
        md += '```\n' + data.output + '\n```\n';
        return md;
    }
    
    if (Array.isArray(data) && data.length > 0) {
        // Flatten for table display
        const flattenedRows = data.map(row => flattenObject(row));
        
        // Collect all headers
        const headersSet = new Set();
        flattenedRows.forEach(row => {
            Object.keys(row).forEach(key => headersSet.add(key));
        });
        const headers = Array.from(headersSet);
        
        // Create markdown table
        md += '## Data Table\n\n';
        md += '| ' + headers.map(h => escapeMarkdown(h)).join(' | ') + ' |\n';
        md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
        
        flattenedRows.forEach(row => {
            const values = headers.map(h => escapeMarkdown(row[h] ?? ''));
            md += '| ' + values.join(' | ') + ' |\n';
        });
    } else if (data && typeof data === 'object') {
        // Single object - display as definition list
        const flattened = flattenObject(data);
        
        md += '## Data\n\n';
        md += '| Key | Value |\n';
        md += '| --- | --- |\n';
        for (const [key, value] of Object.entries(flattened)) {
            md += `| ${escapeMarkdown(key)} | ${escapeMarkdown(value)} |\n`;
        }
    } else {
        md += '*No data available*\n';
    }
    
    return md;
}

// Output success message to xyOps
function outputSuccess(message, filePath) {
    const result = {
        xy: 1,
        code: 0,
        description: message,
        files: [filePath]
    };
    process.stdout.write(JSON.stringify(result) + '\n');
}

// Output error message to xyOps
function outputError(code, message) {
    const result = {
        xy: 1,
        code: code,
        description: message
    };
    process.stdout.write(JSON.stringify(result) + '\n');
}

// Ensure directory exists (cross-platform)
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Main execution
async function main() {
    try {
        // Read input from STDIN
        const input = await readStdin();
        
        // Extract parameters
        const params = input.params || {};
        const outputFormat = (params.outputformat || 'json').toLowerCase();
        const baseFilename = params.filename || 'export';
        // Normalize path - remove trailing slash(es)
        let fileLocation = params.filelocation || input.cwd || process.cwd();
        fileLocation = fileLocation.replace(/\/+$/, '');
        const addTimestamp = params.addtimestamp !== false;
        const addUID = params.adduid === true;
        const reportTitle = params.reporttitle || baseFilename;
        const createFolder = params.createfolder !== false;
        const folderCleanup = params.foldercleanup || 'keep';
        const transformsYaml = params.transforms || '';
        
        // Get input data from job (from previous job in chain)
        // Try multiple possible locations based on xyOps data structure
        let data = null;
        let dataSource = 'none';
        
        // Helper to check if object has content
        const hasContent = (obj) => {
            if (!obj) return false;
            if (typeof obj === 'string') return obj.trim().length > 0;
            if (typeof obj === 'object') return Object.keys(obj).length > 0;
            return true;
        };
        
        // Try various locations where data might be (in order of preference)
        // 1. job.data - where Shell Plugin puts parsed JSON data (when "Interpret JSON" is enabled)
        if (hasContent(input.job?.data)) {
            data = input.job.data;
            dataSource = 'job.data';
        }
        // 2. Structured data from job output (if job outputs JSON with data property)
        else if (hasContent(input.job?.output?.data)) {
            data = input.job.output.data;
            dataSource = 'job.output.data';
        }
        // 3. Structured data passed as input to the job
        else if (hasContent(input.job?.input?.data)) {
            data = input.job.input.data;
            dataSource = 'job.input.data';
        }
        // 4. Raw stdout from the job (common for shell scripts without JSON parsing)
        else if (hasContent(input.job?.output)) {
            // job.output is raw stdout string - wrap it for export
            data = { output: input.job.output };
            dataSource = 'job.output (raw stdout)';
        }
        // 4. Other possible locations
        else if (hasContent(input.output?.data)) {
            data = input.output.data;
            dataSource = 'output.data';
        }
        else if (hasContent(input.input?.data)) {
            data = input.input.data;
            dataSource = 'input.data';
        }
        else if (hasContent(input.data)) {
            data = input.data;
            dataSource = 'data';
        }
        
        // Log data source for troubleshooting
        console.error(`File Export: Using data from '${dataSource}'`);
        console.error(`File Export: Output format: '${outputFormat}'`);
        
        if (!data) {
            outputError(1, 'No input data found. The previous job did not output any data.');
            return;
        }
        
        // Apply data transforms if configured
        if (transformsYaml && transformsYaml.trim() !== '') {
            try {
                const transforms = parseTransformsYaml(transformsYaml);
                if (transforms.length > 0) {
                    data = applyTransforms(data, transforms);
                    console.error(`File Export: Data after transforms: ${Array.isArray(data) ? data.length + ' rows' : 'object'}`);
                }
            } catch (transformError) {
                console.error(`File Export: Transform error: ${transformError.message}`);
                outputError(500, `Transform failed: ${transformError.message}`);
                return;
            }
        }
        
        // Build filename
        let filename = baseFilename;
        
        if (addTimestamp) {
            filename += '_' + generateTimestamp();
        }
        
        if (addUID) {
            filename += '_' + generateUID();
        }
        
        // Add extension based on format
        const extensions = {
            'json': '.json',
            'csv': '.csv',
            'html': '.html',
            'xml': '.xml',
            'md': '.md',
            'yaml': '.yaml',
            'txt': '.txt',
            'xlsx': '.xlsx',
            'pdf': '.pdf',
            'hl7v2': '.hl7',
            'fhir': '.fhir.json'
        };
        const extension = extensions[outputFormat] || '.json';
        filename += extension;
        
        // Check/create output directory
        if (!fs.existsSync(fileLocation)) {
            if (createFolder) {
                console.error(`File Export: Creating folder ${fileLocation}`);
                ensureDirectoryExists(fileLocation);
            } else {
                outputError(1, `Output folder does not exist: ${fileLocation}`);
                return;
            }
        }
        
        // Handle folder cleanup options
        if (folderCleanup === 'delete') {
            console.error(`File Export: WARNING - Deleting all files in ${fileLocation}`);
            try {
                const files = fs.readdirSync(fileLocation);
                for (const file of files) {
                    const filePath = path.join(fileLocation, file);
                    const stat = fs.statSync(filePath);
                    if (stat.isFile()) {
                        fs.unlinkSync(filePath);
                        console.error(`File Export: Deleted ${file}`);
                    }
                }
            } catch (cleanupError) {
                console.error(`File Export: Cleanup error: ${cleanupError.message}`);
            }
        } else if (folderCleanup === 'archive') {
            const oldFolder = path.join(fileLocation, 'OLD');
            try {
                const files = fs.readdirSync(fileLocation);
                const filesToMove = files.filter(f => {
                    const fp = path.join(fileLocation, f);
                    return fs.statSync(fp).isFile();
                });
                
                if (filesToMove.length > 0) {
                    // Create OLD folder if needed
                    if (!fs.existsSync(oldFolder)) {
                        fs.mkdirSync(oldFolder, { recursive: true });
                        console.error(`File Export: Created archive folder ${oldFolder}`);
                    }
                    
                    // Move files to OLD folder
                    for (const file of filesToMove) {
                        const srcPath = path.join(fileLocation, file);
                        const destPath = path.join(oldFolder, file);
                        
                        // If file exists in OLD, add timestamp to avoid overwrite
                        let finalDest = destPath;
                        if (fs.existsSync(destPath)) {
                            const ext = path.extname(file);
                            const base = path.basename(file, ext);
                            const ts = Date.now();
                            finalDest = path.join(oldFolder, `${base}_${ts}${ext}`);
                        }
                        
                        fs.renameSync(srcPath, finalDest);
                        console.error(`File Export: Archived ${file} to OLD/`);
                    }
                }
            } catch (archiveError) {
                console.error(`File Export: Archive error: ${archiveError.message}`);
            }
        }
        
        // Build full file path
        const filePath = path.join(fileLocation, filename);
        
        // Convert data to requested format
        let content;
        try {
            console.error(`File Export: Converting to ${outputFormat}...`);
            switch (outputFormat) {
                case 'csv':
                    content = toCSV(data);
                    break;
                case 'html':
                    content = toHTML(data, reportTitle);
                    break;
                case 'xml':
                    content = toXML(data);
                    break;
                case 'md':
                    content = toMarkdown(data, reportTitle);
                    break;
                case 'yaml':
                    content = toYAML(data);
                    break;
                case 'txt':
                    content = toTXT(data, reportTitle);
                    break;
                case 'xlsx':
                    content = await toExcel(data, reportTitle);
                    break;
                case 'pdf':
                    content = await toPDF(data, reportTitle);
                    break;
                case 'hl7v2':
                    content = toHL7v2(data);
                    break;
                case 'fhir':
                    content = toFHIR(data);
                    break;
                case 'json':
                default:
                    content = toJSON(data);
                    break;
            }
            console.error(`File Export: Conversion successful, content length: ${content?.length || 0}`);
        } catch (convError) {
            console.error(`File Export: Conversion error: ${convError.message}`);
            outputError(500, `Conversion to ${outputFormat} failed: ${convError.message}`);
            return;
        }
        
        // Write file (handle binary formats like xlsx and pdf)
        console.error(`File Export: Writing to ${filePath}`);
        try {
            if (Buffer.isBuffer(content)) {
                fs.writeFileSync(filePath, content);
            } else {
                fs.writeFileSync(filePath, content, 'utf8');
            }
            console.error(`File Export: File written successfully`);
        } catch (writeError) {
            console.error(`File Export: Write error: ${writeError.message}`);
            outputError(500, `Failed to write file: ${writeError.message}`);
            return;
        }
        
        // Output success with file for xyOps to upload
        outputSuccess(`Successfully exported data to ${filename}`, filePath);
        
    } catch (error) {
        outputError(500, `Export failed: ${error.message}`);
    }
}

// Run the plugin
main();
