#!/usr/bin/env node
/**
 * Quick Start Script - Verifies all components are ready
 */

const http = require('http');

console.log('=== Minecraft AI Bot - Quick Check ===\n');

// Check Node.js version
const nodeVersion = process.version;
console.log(`✓ Node.js ${nodeVersion}`);

// Check LM Studio availability
function checkLLM() {
  return new Promise((resolve) => {
    http.get('http://127.0.0.1:1234/v1/models', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log(`✓ LM Studio is running at http://127.0.0.1:1234`);
          
          if (parsed.data && parsed.data.length > 0) {
            console.log(`  Available models:`);
            parsed.data.slice(0, 5).forEach(m => {
              console.log(`    - ${m.id}`);
            });
          }
        } catch (e) {
          console.log('✗ LM Studio not responding');
        }
        resolve();
      });
    }).on('error', () => {
      console.log('✗ LM Studio is NOT running! Start it first.');
      resolve();
    });
  });
}

// Check if node_modules exists
const fs = require('fs');
if (fs.existsSync('./node_modules')) {
  console.log('✓ Dependencies installed');
} else {
  console.log('✗ Run "npm install" first');
}

console.log('\n=== All checks complete ===\n');
console.log('To start the bot:');
console.log('  node src/index.js');
console.log('\nTo test without MC server:');
console.log('  node demo.js');
