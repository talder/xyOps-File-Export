#!/usr/bin/env node

/**
 * Test script for xyOps File Export Plugin
 * 
 * Run: node test.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Sample xyOps Action Plugin input (simulating job completion context)
const testInput = {
    xy: 1,
    type: "action",
    condition: "success",
    params: {
        outputformat: "csv",
        filename: "test_export",
        filelocation: path.join(__dirname, "test_output"),
        addtimestamp: true,
        adduid: true
    },
    job: {
        id: "test123",
        input: {
            data: [
                { name: "Alice", email: "alice@example.com", role: "admin", meta: { level: 5 } },
                { name: "Bob", email: "bob@example.com", role: "user", meta: { level: 2 } },
                { name: "Charlie", email: "charlie@example.com", role: "guest", meta: { level: 1 } }
            ]
        }
    }
};

console.log("Testing xyOps File Export Plugin...\n");
console.log("Input data:", JSON.stringify(testInput, null, 2));
console.log("\n" + "=".repeat(50) + "\n");

// Spawn the plugin process
const plugin = spawn('node', [path.join(__dirname, 'index.js')], {
    stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

plugin.stdout.on('data', (data) => {
    stdout += data.toString();
});

plugin.stderr.on('data', (data) => {
    stderr += data.toString();
});

plugin.on('close', (code) => {
    console.log("Exit code:", code);
    
    if (stderr) {
        console.log("Stderr:", stderr);
    }
    
    console.log("Plugin output:", stdout);
    
    try {
        const result = JSON.parse(stdout.trim());
        console.log("\nParsed result:", JSON.stringify(result, null, 2));
        
        if (result.code === 0 && result.files && result.files.length > 0) {
            console.log("\n✅ Test PASSED!");
            console.log("Generated file:", result.files[0]);
            
            // Show file contents
            if (fs.existsSync(result.files[0])) {
                console.log("\nFile contents:");
                console.log("-".repeat(40));
                console.log(fs.readFileSync(result.files[0], 'utf8'));
            }
        } else {
            console.log("\n❌ Test FAILED!");
        }
    } catch (e) {
        console.log("Failed to parse output:", e.message);
    }
});

// Send input to plugin
plugin.stdin.write(JSON.stringify(testInput));
plugin.stdin.end();
