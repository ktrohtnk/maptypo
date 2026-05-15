const puppeteer = require('puppeteer');
const express = require('express');
const app = express();
app.use(express.static('.'));
const server = app.listen(8080, async () => {
  console.log("Server started on 8080");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/index.html');
  
  // Wait for the trace to finish and save to localStorage
  console.log("Waiting for generation...");
  await page.waitForFunction(() => {
    return Object.keys(localStorage).some(k => k.startsWith('maptypo_cache_'));
  }, { timeout: 60000 });
  
  const cacheStr = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('maptypo_cache_'));
    return localStorage.getItem(key);
  });
  
  const fs = require('fs');
  fs.writeFileSync('initial_trace.js', `const INITIAL_TRACE_CACHE = ${JSON.stringify(cacheStr)};\n`);
  console.log("Cache saved to initial_trace.js");
  
  await browser.close();
  server.close();
  process.exit(0);
});
