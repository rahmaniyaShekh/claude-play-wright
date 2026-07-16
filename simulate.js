const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');

// Helper function to ask a question in the terminal
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

(async () => {
  // --- NEW: Multi-Account Selector ---
  console.log("==========================================");
  const accountInput = await askQuestion("Enter Account profile to load (e.g., A, B, C, D): ");
  const accountName = accountInput.trim().toUpperCase() || "DEFAULT";
  
  // Dynamically set the folder based on the user's input
  const userDataDir = `./claude-session-data-${accountName}`;
  console.log("==========================================\n");
  
  if (!fs.existsSync(userDataDir)) {
      console.log(`⚠️ No saved session found for Account [${accountName}].`);
      console.log(`👉 You will be redirected to the login page. Your session will be saved automatically for next time.\n`);
  } else {
      console.log(`✅ Existing session found for Account [${accountName}]. Loading your saved login...\n`);
  }

  console.log(`Step 1: Launching isolated browser for Account ${accountName}...`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ignoreDefaultArgs: ["--enable-automation"], 
    args: [
      '--disable-blink-features=AutomationControlled'
    ]
  });

  console.log("Step 2: Browser connected. Getting active tab...");
  
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  await page.bringToFront();

  console.log("Step 3: Setting up global network interceptors...");

  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    const blocklist = ['chat_conversations_v2', 'discoverable'];
    
    if (blocklist.some(endpoint => url.includes(endpoint))) {
      console.log(`❌ [BLOCKED] Dropped excluded request: ${url}`);
      return route.abort();
    }

    if (url.includes('checkout_capabilities') && method === 'GET') {
      console.log(`✅ [MOCKED] Forcing 'A' UI (Legacy Checkout)`);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ checkout_flow: "legacy" }) 
      });
    }

    if (url.includes('individual_plan_pricing/v2') && method === 'POST') {
      console.log(`✅ [MOCKED] Forcing 'A' Country & Pricing (USD)`);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          country: "IN",
          currency: "USD",
          product_prices_due_today: {
            max_5x_monthly: {
              basePrice: 10000,
              proratedRefund: 9827,
              taxAmount: 31,
              subtotalPrice: 173,
              totalPrice: 204,
              stripeBalanceApplied: 0
            }
          },
          product_prices_per_billing_period: {
            max_5x_monthly: {
              basePrice: 10000,
              proratedRefund: 0,
              taxAmount: 1800,
              subtotalPrice: 10000,
              totalPrice: 11800
            }
          },
          taxDisplay: { show_included: true, tax_label: "GST" }
        })
      });
    }

    if (url.includes('payment_method') && method === 'GET') {
      console.log(`✅ [MOCKED] Injecting 'B' Payment Method`);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          brand: "visa",
          country: "IN", 
          last4: "0582", 
          type: "card"
        })
      });
    }

    if (url.includes('checkout_session') && method === 'POST') {
      console.log(`✅ [MOCKED] Injecting 'B' Checkout Session`);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientSecret: "cs_live_a1tR3JsTRg4AdmVDtjb3xuusHYFRt1mykWyzc2jbh2J39pEgog4ogwoFRx_secret_fidnandhYHdWcXxpYCc",
          sessionId: "cs_live_a1tR3JsTRg4AdmVDtjb3xuusHYFRt1mykWyzc2jbh2J39pEgog4ogwoFRx",
          stripeAccountRegion: "us",
          priceMinorUnitsBase: 13761, 
          baseCurrency: "SGD" 
        })
      });
    }

    console.log(`🌐 [PASSED] ${method} ${url}`);
    return route.continue();
  });

  console.log("Step 4: Interceptors ready. Navigating to Claude...");
  
  try {
    await page.goto('https://claude.ai/upgrade/max', { timeout: 60000 });
    console.log("Step 5: Navigation command finished.");
  } catch (err) {
    console.log("Step 5: Browser taking a while, but you can interact manually.", err.message);
  }
  
  await new Promise(() => {}); 
})();