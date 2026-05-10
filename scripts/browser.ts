import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  args: ['--remote-debugging-port=9222'],
  defaultViewport: null,
  devtools: true,
  headless: false,
});

const pages = await browser.pages();
pages[0].goto('https://store.steampowered.com');
