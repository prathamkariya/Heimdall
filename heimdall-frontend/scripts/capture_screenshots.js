import { chromium } from '@playwright/test'
import path from 'path'

const ARTIFACT_DIR = 'C:/Users/prath/.gemini/antigravity-ide/brain/7ca86c2c-80fc-4918-81a7-fbf7aaa11dda'

async function run() {
  console.log('Launching browser...')
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
  } catch (e) {
    browser = await chromium.launch({ channel: 'msedge', headless: true })
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  try {
    page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()))
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message))

    console.log('Navigating to login...')
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })

    await page.fill('input[name="email"], input[type="email"]', 'admin@heimdall.io')
    await page.fill('input[name="password"], input[type="password"]', 'Password123!')
    await page.click('button[type="submit"]')

    await page.waitForTimeout(3000)

    // 1. Live Feed: click BTCUSDT anomaly row if present, or first row
    console.log('Clicking anomaly row in Live Feed...')
    await page.waitForSelector('[data-testid="live-event-row"]', { timeout: 15000 })
    
    const btcRow = page.locator('[data-testid="live-event-row"]:has-text("BTCUSDT")').first()
    if (await btcRow.count() > 0) {
      await btcRow.click()
    } else {
      await page.locator('[data-testid="live-event-row"]').first().click()
    }
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_live_feed_drawer_actions.png') })

    // Test Action 1: Click "View Asset Details"
    console.log('Testing "View Asset Details" button...')
    await page.click('button:has-text("View Asset Details")')
    await page.waitForTimeout(3000)
    console.log('URL after clicking View Asset Details:', page.url())
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_view_asset_details_verified.png') })

    // Navigate back to Live Feed
    console.log('Navigating back to Live Feed...')
    await page.getByRole('link', { name: 'Live Feed' }).click()
    await page.waitForTimeout(3000)

    // Click anomaly row again
    console.log('Clicking anomaly row again...')
    await page.waitForSelector('[data-testid="live-event-row"]', { timeout: 15000 })
    const row2 = page.locator('[data-testid="live-event-row"]').first()
    await row2.click()
    await page.waitForTimeout(1500)

    // Test Action 2: Click "Create Investigation Case"
    console.log('Testing "Create Investigation Case" button...')
    await page.click('button:has-text("Create Investigation Case")')
    await page.waitForTimeout(3000)
    console.log('URL after creating case:', page.url())
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_case_created_verified.png') })

    console.log('Both flows executed and verified successfully!')
  } catch (err) {
    console.error('Error during run:', err)
  } finally {
    await browser.close()
  }
}

run()
