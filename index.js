#!/usr/bin/env node

/**
 * xyOps File Export Action Plugin
 * 
 * Exports job input data to CSV, HTML, or JSON file format.
 * Supports optional timestamp and unique identifier in filename.
 * Cross-platform compatible (Linux, Windows, macOS).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Optional dependencies (loaded on demand)
let exceljs = null;
let PDFDocument = null;

// Get plugin directory for npm install
const pluginDir = __dirname;

// Try to install a package
function tryInstallPackage(packageName) {
    try {
        console.error(`File Export: Installing ${packageName}...`);
        execSync(`npm install ${packageName} --save`, {
            cwd: pluginDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 120000 // 2 minute timeout
        });
        console.error(`File Export: ${packageName} installed successfully`);
        return true;
    } catch (e) {
        console.error(`File Export: Failed to install ${packageName}: ${e.message}`);
        return false;
    }
}

// Try to load optional dependencies (auto-install if missing)
function loadExcelJS() {
    if (exceljs === null) {
        try {
            exceljs = require('exceljs');
        } catch (e) {
            // Try to auto-install
            if (tryInstallPackage('exceljs')) {
                try {
                    exceljs = require('exceljs');
                } catch (e2) {
                    return false;
                }
            } else {
                return false;
            }
        }
    }
    return true;
}

function loadPDFKit() {
    if (PDFDocument === null) {
        try {
            PDFDocument = require('pdfkit');
        } catch (e) {
            // Try to auto-install
            if (tryInstallPackage('pdfkit')) {
                try {
                    PDFDocument = require('pdfkit');
                } catch (e2) {
                    return false;
                }
            } else {
                return false;
            }
        }
    }
    return true;
}

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

// Convert data to Excel format (requires exceljs)
async function toExcel(data, title = 'Exported Data') {
    if (!loadExcelJS()) {
        throw new Error('Excel export requires exceljs. Run: npm install exceljs');
    }
    
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

// Convert data to PDF format (requires pdfkit)
function toPDF(data, title = 'Exported Data') {
    if (!loadPDFKit()) {
        throw new Error('PDF export requires pdfkit. Run: npm install pdfkit');
    }
    
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
