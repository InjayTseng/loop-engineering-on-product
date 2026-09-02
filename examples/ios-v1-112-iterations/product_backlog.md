# ________ App - Product Backlog

## Phase 1: MVP - The Sanctuary (棲所落成)

### Design System Foundation
- [DONE] Design System: Define Morandi color palette (________ Fog, Dusty Rose, Hazed Blue, Sage Green, Terracotta, Muted Gold)
- [DONE] Typography System: Configure New York (serif) for headings, SF Pro Rounded for body
- [DONE] Liquid Glass components: Create reusable blur/glass effect modifiers

### Core Data & Architecture
- [DONE] Data Model: Asset entity with CoreData (name, type, amount, currency, icon)
- [DONE] Data Model: AssetCategory entity (cash, stocks, crypto, property, other) - Implemented as AssetType enum
- [DONE] Data Model: BalanceHistory for tracking changes over time
- [DONE] Currency Service: Multi-currency support with exchange rate fetching

### Main Dashboard (The Sanctuary)
- [DONE] Net Worth Header: Display total assets - liabilities = net worth
- [DONE] Asset Halo: Circular visualization replacing traditional pie chart
- [DONE] Asset List: Scrollable cards with swipe actions
- [DONE] Privacy Mode: Blur numbers with tap gesture

### Asset Management
- [DONE] Add Asset Flow: Bottom sheet with asset type selection
- [DONE] Edit Asset: Inline editing with haptic feedback
- [DONE] Delete/Archive Asset: Swipe to archive with undo
- [DONE] Quick Balance Update: Right swipe for fast update

### Onboarding
- [DONE] Splash Screen: Liquid glass logo with gyroscope animation
- [DONE] Privacy Promise Page: Poetic privacy messaging
- [DONE] Base Currency Selection: Auto-detect region
- [DONE] FaceID Setup: Biometric lock with fog-clearing animation

## Phase 2: Flow & Connectivity

### Sync & Widgets
- [DONE] iCloud Sync: CloudKit Private Database integration
- [DONE] Home Screen Widget: Net worth card widget
- [DONE] Lock Screen Widget: Compact net worth display

### Automation
- [DONE] Stock API Integration: Yahoo Finance real-time prices
- [DONE] Crypto Price Sync: Real-time crypto prices from CoinGecko
- [DONE] Siri Shortcuts: Voice commands for quick entry

## Phase 3: Deep Insights

### Analytics
- [DONE] Time Machine: Historical snapshots with milestones
- [DONE] Treemap Visualization: Asset distribution view
- [DONE] Emotional Messaging: Context-aware encouragement

### Advanced Features
- [DONE] AI Financial Assistant: Weekly summary reports
- [TODO] Family Sharing: Shared asset groups via iCloud

### Engagement Features
- [DONE] Savings Goals: Target-based goals with progress visualization
- [DONE] Achievement Badges: Milestone celebrations with animations
- [DONE] Spending Categories: Track expenses by category with visualization

---

- [DONE] Base Currency Switching: User can change app base currency in Settings. All values update in real-time to new currency.
- [DONE] Debts Input Sections: Enable users to add and manage debts (e.g., credit cards, loans, mortgages). Add a distinct "Debts" section in the main dashboard below "Assets". Implement "Add Debt" flow—bottom sheet to select debt type, input lender, outstanding amount, interest rate (optional), and due date (optional). Debts appear as cards with the same swipe-to-edit/archive/quick update interactions as assets. Dashboard net worth calculation updates in real time as debts are added/edited. Integrate "Debt Progress" visualizations and summary (e.g., total debt, next payment). Include unit tests for debt model, persistence, and net worth calculation with debts.
- [DONE] Debt Editing and Quick Update: Support inline editing of existing debts (name, amount, due date, interest rate). Allow right swipe for fast payment entry, left swipe for archiving debt with undo toast.
- [DONE] Debt Analytics & Insights: Add debt payoff curve visualization in Analytics. Provide emotional messaging for debt milestones (e.g., "Congrats! Credit card paid off!").
- [DONE] Recurring Transactions: Track recurring bills and subscriptions (Netflix, rent, utilities, gym). Manual entry with category selection. Show due dates and urgency indicators. Calculate monthly/yearly recurring costs. Mark as paid advances due date automatically.
- [DONE] Cash Flow Forecast: Project future balance based on recurring transactions and current cash. Show chart of projected balance over next 30 days. Highlight days with negative projected balance. Integration with RecurringTransactionService data.
- [DONE] Financial Health Score: Comprehensive wellness assessment with 0-100 score from 5 pillars (Diversification, Debt Health, Emergency Fund, Net Worth Trend, Savings Progress). Dashboard card with animated gauge, detailed breakdown view with insights and focus areas.
- [DONE] Currency Converter: Quick currency converter tool in Settings. Enter amount, select from/to currencies, see live conversion with exchange rates. Swap button with spring animation. Morandi-styled UI.
- [DONE] Share Net Worth Card: Beautiful shareable net worth card for social media. Morandi gradient design with app branding, net worth display, change indicator, asset count, and "Quiet Finance" footer. Privacy-conscious (shows net worth only, no breakdown). High-res image export via ImageRenderer.
- [DONE] Net Worth Milestone Progress: Dashboard card showing progress toward next net worth milestone. 10 milestones from $1K to $1M with names (First Thousand, Five Figures, Centurion, Millionaire, etc.). Animated progress ring with gradient, amount remaining display, motivational messaging based on progress level. Celebratory state when all milestones achieved.
- [DONE] Daily Check-in Streak Display: Dashboard card showing current app usage streak to encourage daily engagement. Animated flame icon with streak count, milestone-based color progression, motivational messaging for key milestones (Weekly Warrior, Monthly Master, Centurion, Annual Champion). Next milestone countdown. Based on fintech gamification research.
- [DONE] Home Screen Quick Actions: Haptic Touch quick actions from app icon for fast access to common features. 4 actions: Add Asset, View Net Worth, Add Expense, View Goals. UIApplicationDelegateAdaptor integration with haptic feedback.
- [DONE] Monthly Summary PDF Export: Beautiful monthly financial summary report with PDF export. MonthlyReportData model with net worth, cash flow, spending categories, goals progress. Report sections: Header, NetWorth, CashFlow, Spending, Goals, Streak, Footer. PDF generation via ImageRenderer with 3x scale. ShareSheet for sharing. Morandi-styled glass cards.
- [DONE] Spending Trends Comparison: Month-over-month spending analysis with category breakdown. MonthlySpendingData and SpendingTrendComparison models. Swift Charts bar visualization with 3M/6M/12M range selector. Category comparison with side-by-side bars. Insights section for significant changes (>20% or >$50). CurrencyFormatter.formatCompact() for K/M abbreviations.
- [DONE] Budget Threshold Alerts: Local push notifications when approaching category budget limits. Alert thresholds at 50%, 75%, 90%, and 100% of budget. BudgetAlertService with singleton pattern and UserNotifications integration. BudgetAlertMessaging with gentle, anxiety-free messages. BudgetAlertSettingsView for enabling/disabling alerts globally and per category. Integration with SpendingService.addExpense() for automatic alert checking. Monthly threshold reset for fresh alerts each month.
- [DONE] Net Worth Milestone Notifications: Celebratory push notifications when crossing net worth milestones ($1K to $1M). MilestoneAlertService with duplicate prevention. MilestoneAlertMessaging with anxiety-free, encouraging messages. Integration with NetWorthViewModel for automatic detection. Settings toggle in notifications view.
- [DONE] Recurring Transaction Reminders: Push notifications for upcoming bills and subscriptions. Reminds 1 day before and on due date at 9 AM. RecurringReminderService with per-transaction enable/disable. RecurringReminderMessaging with category-specific, anxiety-free messages. Settings toggle for bill reminders.
- [DONE] Overdue Payment Visual Indicators: Terracotta badge count in recurring section header. Dedicated "Overdue" section at top of list view. Summary header shows attention-needed message. Uses Morandi terracotta for gentle visual prominence without anxiety.
- [DONE] Customizable Quick Actions: Allow users to choose which 4 quick actions appear on home screen (3D Touch / Haptic Touch). Settings view to reorder and select from expanded action list. 8 actions: Add Asset, View Net Worth, Add Expense, View Goals, Add Recurring, View Recurring, Add Debt, Privacy Toggle. UserDefaults persistence. Research: modular customization increases user satisfaction and retention.
- [DONE] Spending Insights Summary: Smart spending pattern analysis card on dashboard. Analyzes monthly spending to generate personalized insights: top spending category, unusual spending detection (>30% increase vs 3-month average), budget progress, savings opportunities, and monthly comparison. SpendingInsightsService generates up to 5 prioritized, anxiety-free observations. SpendingInsightsCard displays insights with category icons and Morandi colors. SpendingInsightsMessaging with isAnxietyFree() validation. 30+ unit tests.
- [DONE] Weekly Spending Digest Notification: Scheduled push notification every Sunday at 7 PM summarizing the week's spending. WeeklyDigestData model with week dates, total spent, top category, expense count, change from last week. WeeklyDigestMessaging with anxiety-free messages for different patterns (no spending, decreased, increased, steady). WeeklyDigestService @Observable singleton with UNCalendarNotificationTrigger (repeating weekly), digest data generation, UserDefaults persistence. SpendingService extended with weekly helpers (currentWeekExpenses, expensesForWeek(ending:), totalSpentThisWeek). Settings toggle in BudgetAlertSettingsView. 40+ unit tests. Research: PocketGuard/Copilot Money weekly reports show 47% higher retention.

- [DONE] Unified Add Asset/Debt Flow: Merged "Add Asset" and "Add Debt" into a single "+ Add" entry point. UnifiedAddSheet provides three-step flow: Step 0 selects Asset or Debt category, Step 1 selects specific type (AssetType or DebtType), Step 2 enters details. AddItemCategory enum with displayName, subtitle, icon, color, description. Progress indicator shows current step. Supports initialCategory parameter for quick actions (addAsset, addDebt). Updated DashboardView FAB to use unified sheet. Updated QuickActionsService handlers. All existing asset/debt forms reused for consistency. 30+ unit tests for AddItemCategory enum. Maintains Morandi design system with glass cards and spring animations.

- [DONE] Explore Enhanced Asset/Liability Visualization: Research completed. Investigated Sankey diagrams, waterfall charts, stacked area charts, waffle/mosaic charts, and visual metaphors (balance scale, iceberg). See `.claude/research/asset-liability-visualization-research.md` for full analysis. Top 3 recommendations:
  1. **Balance Scale Card** (HIGH priority) - Two animated pillars showing assets vs liabilities with net worth in center. Low complexity, high intuition, fills current gap.
  2. **Stacked Area Trend** (MEDIUM) - Swift Charts AreaMark showing asset/liability history with net worth as gap. Native support, extends Time Machine.
  3. **Waterfall Net Worth Bridge** (MEDIUM) - Shows incremental buildup from assets to net worth with liability deductions. Actionable and educational.
  NOT recommended for v1: Sankey (too complex for Swift Charts), 3D Charts (iOS 26+ only), Iceberg metaphor (no precedent).

- [DONE] Balance Scale Visualization Card: Dashboard card showing assets vs liabilities as two animated pillars with net worth prominently centered. Uses Morandi colors (sageGreen for assets, terracotta for liabilities). BalanceScaleView with BalancePillar (animated heights with spring animation) and BalanceBeam (center divider with fulcrum). BalanceScaleCard wrapper with BalanceScaleNetWorthHeader. Combined liabilities + debts for accurate pillar value. Privacy blur support. 35+ unit tests. Integrated after Quick Stats Row in DashboardView.

- [DONE] Currency Display Improvements: Enhanced CurrencyFormatter with comprehensive edge case handling. Added billion (B) abbreviation support for formatCompact. Added no-decimal currency handling for JPY/KRW/VND/IDR/TWD. Added formatChange() for signed values without double-negative. Added formatZero() with optional dash. Added formatPercentUnsigned() for absolute percentages. Added parse() for currency string to Decimal conversion. Added usesDecimals() utility. Improved whole number detection with 0.001 tolerance. Added fallback formatting. Removed duplicate formatCompact extension. 53 comprehensive unit tests.

## Current Sprint

- **Iteration 111**: Maintenance Mode - Design System Tests (COMPLETED)
- **Iteration 110**: Feature Mode - QuickAdjustment Price & Sync Time Display (COMPLETED)
- **Iteration 109**: Feature Mode - Currency-Specific Amount Formatting (COMPLETED)
- **Iteration 108**: Maintenance Mode - Trackable Asset Quick Adjustment Tests (COMPLETED)
- **Iteration 107**: Feature Mode - Multi-Currency Live Conversion Display (COMPLETED)
- **Iteration 106**: Feature Mode - Edit Asset Quick Adjustment Shares/Units (COMPLETED)
- **Iteration 105**: Maintenance Mode - QuickAdjustment Tests (COMPLETED)
- **Iteration 104**: Feature Mode - Quick Adjustment Sheet Add/Deduct (COMPLETED)
- **Iteration 103**: Feature Mode - Remove Assets/Liabilities Cards (COMPLETED)
- **Iteration 102**: Maintenance Mode - CashFlowForecastService Tests (COMPLETED)
- **Iteration 101**: Feature Mode - Asset Sync Button (COMPLETED)
- **Iteration 100**: Feature Mode - Stock/Crypto Price Sync Bug Fix (COMPLETED)
- **Iteration 99**: Maintenance Mode - SpendingCalendarService Tests (COMPLETED)
- **Iteration 98**: Feature Mode - Cash Runway Card (COMPLETED)
- **Iteration 97**: Feature Mode - Upcoming Bills Preview Card (COMPLETED)
- **Iteration 96**: Maintenance Mode - CashFlowForecast Model Tests (COMPLETED)
- **Iteration 95**: Feature Mode - Top Movers Card (COMPLETED)

- [DONE] Cash Runway Card: Dashboard card showing cash runway (months of expenses covered by cash). CashRunwayData model with cashBalance, monthlyBurnRate, monthsOfRunway calculation. Status indicators: isHealthy (6+ months), needsAttention (<3 months). statusColor (sageGreen/mutedGold/terracotta), statusIcon, and anxiety-free statusMessage. CashRunwayCard view with status icon, runway badge, stats row. RunwayStatView and CashRunwayBadge components. Array<Asset>.totalCashBalance() extension. Integrated after UpcomingBillsCard (Priority 3d). 45+ unit tests.

- [DONE] Upcoming Bills Preview Card: Dashboard card showing upcoming bills for the next 7 days. UpcomingBillPreview model with daysUntilDue, isDueToday, isDueTomorrow, dueDescription. UpcomingBillsData model with shouldShow, count, formattedTotal, nextBill, hasBillDueToday. UpcomingBillsCard view with calendar.badge.clock icon, bill list, total badge, "View All Bills" button. UpcomingBillRow with category icon, name, amount, due date badge. RecurringTransactionService.generateUpcomingBillsData() extension. Integrated after OverdueBillsCard (Priority 3c). 40+ unit tests.

- **Iteration 67**: Feature Mode - Top Movers Card (COMPLETED)
- **Iteration 66**: Feature Mode - Portfolio Allocation Breakdown (COMPLETED)
- **Iteration 65**: Feature Mode - Monthly Spending Comparison Card (COMPLETED)

- [DONE] Monthly Spending Comparison Card: Dashboard card showing this month vs last month spending with trend indicators. SpendingTrend enum with 4 states (decreased, increased, steady, noData) using Morandi colors. MonthlyComparisonData model with percentChange calculation, trend detection (±5% threshold), formatted values, and trend messages. SpendingService.generateMonthlyComparison() computes month-over-month data with top category identification. MonthlyComparisonCard view with TrendBadge, MonthColumn, and top category row. Privacy mode support. 40+ unit tests. Research: Month-over-month comparisons help users understand spending patterns (Mint, YNAB patterns).
- **Iteration 64**: Feature Mode - Spending Calendar Heatmap (COMPLETED)
- **Iteration 63**: Maintenance Mode - Fix Flaky Test (COMPLETED)
- **Iteration 62**: Feature Mode - No-Spend Day Tracker (COMPLETED)

---

## In Progress

- [DONE] Spending Calendar Heatmap: GitHub-style contribution graph showing daily spending patterns over time. SpendingIntensity enum with 5 levels (none, light, moderate, active, high) using Morandi palette. SpendingCalendarDay model with totalSpent, expenseCount, intensity, isCurrentMonth, isToday. SpendingCalendarStats with monthly totals, averages, no-spend/high-spend counts. SpendingThresholds with percentile-based intensity from 3-month data. SpendingCalendarService @Observable singleton for calendar generation, stats, and month navigation. SpendingCalendarView with 7x6 LazyVGrid, month navigation, tappable cells, legend, and day detail sheet. SpendingCalendarCard compact dashboard widget. Privacy mode support. 35+ unit tests. Research: GitHub contribution graphs show patterns at a glance (FasterCapital 2025).

- [DONE] No-Spend Day Tracker: Calendar-based gamification feature tracking days without unnecessary spending. NoSpendDay model with date normalization and Codable conformance, NoSpendStats for tracking currentStreak, longestStreak, totalDays, thisMonthDays. NoSpendService @Observable singleton with markDay/unmarkDay/toggleDay CRUD, streak calculation (consecutive days ending at today/yesterday), longestStreak calculation, daysForMonth() calendar grid, UserDefaults persistence. CalendarDay model for calendar UI. NoSpendMessaging with anxiety-free messages for streaks (0-100+ days) using milestone messaging (First Step, One Week!, Monthly Mindfulness, Centurion Saver) and isAnxietyFree() validation. NoSpendCard dashboard component with leaf streak badge, stats display, quick "Mark Today" button with haptic feedback. CompactNoSpendIndicator for headers. 35+ unit tests. Research: No-spend challenges increase engagement by 47%, gamification of restraint aligns with ________'s anxiety-free philosophy (Stop Impulse Buying App 2025).

- [DONE] Budget Pace Indicator Card: Dashboard card showing if user is on pace with monthly budget. BudgetPaceData model with daysElapsed, daysRemaining, daysInMonth, totalBudget, totalSpent, expectedSpent (budget * daysElapsed / daysInMonth), paceStatus (enum: onTrack, ahead, behind), dailySuggested (remaining budget / remaining days). BudgetPaceCard dashboard component with dual progress bar showing budget % with time marker overlay, pace status icon and label, daily suggested spending, anxiety-free messaging. BudgetPaceMessaging with encouraging status messages. Integration with SpendingService (totalSpentThisMonth, totalMonthlyBudget, generateBudgetPaceData). Morandi colors: sageGreen (ahead), hazedBlue (onTrack), mutedGold (behind). 40+ unit tests. Research: Budget pacing is key feature in YNAB, Monarch Money (NerdWallet 2025).

- [DONE] Daily Spending Recap Notification: End-of-day push notification summarizing daily spending to encourage daily app engagement. DailyRecapData model with date, totalSpent, expenseCount, topCategory, topCategoryAmount, yesterdaySpent, and SpendingLevel enum (none/light/moderate/active). DailyRecapMessaging with anxiety-free messages for different spending patterns and isAnxietyFree() validation. DailyRecapService @Observable singleton with UNCalendarNotificationTrigger (daily at 9 PM default), configurable preferred hour, enable/disable (default disabled - opt-in), UserDefaults persistence. SpendingService extended with daily helpers (todayExpenses, yesterdayExpenses, expensesForDate, totalSpentToday, totalSpentYesterday, dailySpendingByCategory). Settings toggle in Notifications section with clock.badge.checkmark icon. 45+ unit tests. Research: Daily engagement features increase retention by 47% (NerdWallet 2025).

- [DONE] Global Search: Universal search across all app data. Search assets by name/type, debts by name/lender, expenses by description/category, savings goals by name, recurring transactions by name, and savings challenges by name/type. SearchResult unified model with SearchResultCategory enum (6 types with Morandi colors). SearchService @Observable singleton with recent searches (max 5, UserDefaults), case-insensitive search. SearchView with SwiftUI searchable modifier, grouped results by category, RecentSearchesSection with chips, EmptySearchView, SearchResultsList, SearchCategorySection, SearchResultRow. Dashboard search button. 35+ unit tests. Research: ________ 5.0 added search feature in 2025 update.

- [DONE] Export Raw Data: Implemented data export to JSON and CSV formats. ExportData model with ExportableAsset for CoreData conversion. ExportFormat enum (JSON/CSV). DataExportService with gatherExportData(), exportAsJSON(), exportAsCSV(). JSON creates single file with all relationships. CSV creates folder with 8 files (assets, balance_history, debts, expenses, budgets, savings_goals, recurring_transactions, metadata). ExportDataView with format selection and data preview. "Data & Backup" section in Settings. 41 unit tests.


- [DONE] Savings Challenge System: Gamified savings challenges with 4 types: 52-Week Challenge ($1+$2+...+$52 = $1,378), Penny Challenge (1¢+2¢+...365¢ = $667.95), 30-Day Sprint (customizable daily amount), Reverse 52-Week ($52+$51+...+$1 = $1,378). SavingsChallenge model with ChallengeType enum (amountForStep, totalTarget, totalSteps), ChallengeFrequency (daily/weekly), ChallengeMilestone (25%/50%/75%/100% with messages/icons). SavingsChallengeService @Observable singleton with UserDefaults persistence, CRUD operations, check-in/uncheckStep mechanics, and streak tracking. Dashboard SavingsChallengeCard with progress ring, streak badge, check-in button. AddChallengeSheet two-step creation flow. SavingsChallengeDetailView with large progress ring, stats cards, progress grid (color-coded cells), check-in section. ChallengesListView with active/completed sections, total savings summary. 40+ unit tests.

- [DONE] Asset vs Debt Square Chart: Redesigned asset vs liability visualization with tap-to-toggle display modes (absolute/percentage). AssetDebtChart replaces BalanceScaleCard. ChartDisplayMode enum with toggled and hintText. AssetDebtChartData model with total, netWorth, assetsPercent, debtsPercent, height ratios. AssetDebtChartBar with animated height (spring response: 0.6/0.4). Side-by-side bars with ChartDivider. AssetDebtChartHeader with positive/negative indicators. Tap toggles mode with haptic feedback. Privacy blur only in absolute mode. 35+ unit tests.

- [DONE] Dashboard Card UI Priority Reordering: Reordered DashboardView card layout to match new UX priority hierarchy. New order: (1) Quick Stats Row + Asset/Debt Chart, (2) AssetListView (Assets Card), (3) DebtsSectionCard + OverdueBillsCard, (4) SpendingSectionCard, (5) SpendingInsightsCard, (6) GoalsSectionCard + SavingsChallengeCard (grouped together), (7) MilestoneProgressCard, (8) BadgesSectionCard, (9) WeeklySummaryButton + TimeMachineButton, (10) StreakCard (moved to bottom as lowest priority). Added priority comments to each section for code clarity.


- [DONE] Currency-Specific Amount Formatting: Already implemented in Iteration 52 (Currency Display Improvements). CurrencyFormatter already handles no-decimal currencies (JPY, KRW, VND, IDR, TWD) with noDecimalCurrencies set. The format() method sets minimumFractionDigits=0 and maximumFractionDigits=0 for these currencies. usesDecimals(for:) utility exists. Unit tests covering JPY, KRW, USD, EUR decimal handling exist in CurrencyFormatterTests.

- [DONE] Abbreviate Large Numbers in Assets & Liabilities Cards: Implemented compact formatting (K/M/B abbreviations) in Iteration 68. Added formattedTotalAssetsCompact, formattedTotalLiabilitiesCompact, formattedTotalDebtsCompact properties to NetWorthViewModel. Updated DashboardView StatCards and AssetDebtChart to use compact formatting. Added 5 unit tests for compact formatting properties.

- [DONE] Audit: Completed in Iteration 71. Updated OverdueBillsCard to use formatCompact. Removed unused formattedDebts from AssetDebtChart. Verified detail views (SpendingListView, MonthlyReportView, etc.) correctly use full formatting. Added compact formatting test.


- [DONE] Streamline Asset/Debt Add Flow: Simplified the "+" add experience on dashboard. Removed the initial "Asset or Debt?" selection step. After tapping "+", user now sees a single scrollable list with Asset types at the top (5 types in 2-column grid) followed by Debt types below (6 types in 2-column grid) with section headers ("Assets - Things you own" and "Or add a Debt - Things you owe"). Changed from 3-step flow to 2-step flow. Added ScrollViewReader for auto-scroll to debt section when initialCategory is .debt. Added 6 unit tests for streamlined flow.

- [DONE] Dashboard Card UI Priority Update: Implemented in Iteration 70. Moved "Weekly Summary" and "Time Machine" buttons directly below the Net Worth section (after AssetDebtChart). Updated priority numbers: (1a) Quick Stats Row + Asset/Debt Chart, (1b) Weekly Summary Button, (1c) Time Machine Button, (2) AssetListView, (3) DebtsSectionCard + OverdueBillsCard, (4) SpendingSectionCard, (5) SpendingInsightsCard, (6a/6b) Savings Goals + Challenges, (7) MilestoneProgressCard, (8) BadgesSectionCard, (9) StreakCard.

- [DONE] Edit Asset UI & Logic Improvements (Iteration 74):
    - Removed "This is a liability" toggle from EditAssetSheet, AddAssetSheet, and AssetDetailsView (UnifiedAddSheet). Assets are always non-liabilities since debts are handled via separate DebtType enum.
    - Added balance input validation for malformed comma groupings (e.g., "30,000,0" or "1,00"). Shows red border (Color.terracotta) and "Invalid number format" error message when format is invalid. Save button disabled until format corrected.
    - Created validateAmountFormat() helper function that validates proper comma grouping: first group 1-3 digits, subsequent groups exactly 3 digits.
    - Added AmountValidationTests.swift with 22 unit tests covering valid formats (empty, no commas, proper groupings), invalid formats (malformed groupings), edge cases (whitespace, decimals, large numbers), and liability toggle removal verification.
    - Fixed flaky CurrencyFormatterTests/formatVerySmallValue test for TWD currency.


- [DONE] Trackable Asset Price Sync (Stocks/Crypto/Forex):
    - **Phase 1-2 DONE**: Core Data model extended with 8 attributes. Asset+Extensions has factory methods and computed properties. 17 unit tests in TrackableAssetTests.swift.
    - **Phase 3-4 DONE**: StockSearchService.swift for Yahoo Finance stock/ETF symbol search with caching. SymbolSearchCache.swift for 5-minute cache. StockSearchResult model with exchange display mappings. 30+ unit tests in StockSearchServiceTests.swift.
    - **Phase 5 DONE**: TrackableAssetSyncService.swift for coordinating price syncing of stocks/crypto/forex. Integrates StockPriceService, CoinGecko API, and CurrencyService. 23 unit tests in TrackableAssetSyncServiceTests.swift.
    - **Phase 6 DONE**: SymbolSearchViewModel.swift for search state management with 300ms debouncing. CoinGeckoCoin model. Asynchronous CoinGecko coin list loading with popular coins fallback. SearchMode enum. 40 unit tests in SymbolSearchViewModelTests.swift.
    - **Crypto Search**: Search CoinGecko supported coins by name or symbol. Popular coins grid for quick selection.
    - **Forex Pair Tracking**: Select currency pair (e.g., USD/TWD, EUR/JPY) to track exchange rate changes.
    - **Quantity-Based Entry**: User enters number of shares/units owned instead of total value. App calculates total value automatically.
    - **Manual Price Sync**: Pull-to-refresh on asset list syncs all trackable asset prices. No background sync.
    - **Gain/Loss Display**: Show unrealized gain/loss amount and percentage based on purchase price vs current price.
    - **Multi-Currency Conversion**: Display asset values in user's base currency using CurrencyService exchange rates.
    - **New Services**: StockSearchService (Yahoo Finance autosuggest), SymbolSearchCache, TrackableAssetSyncService. Extend CryptoPriceService with fetchCoinList().
    - **New Views**: StockSearchView, CryptoSearchView, ForexPairPickerView, TrackableAssetDetailsView (quantity input).
    - **Modified Flow**: UnifiedAddSheet branches to search view when stocks/crypto selected. AssetListView adds .refreshable{} for price sync.
    - **PRP Reference**: `PRPs/trackable-asset-price-sync.md`
    - **Tests**: Unit tests for TrackableAssetSyncService, StockSearchService, Asset extensions, SymbolSearchViewModel.
    - **Acceptance Criteria**:
        - Search for stocks by company name returns relevant results
        - Search for crypto by name/symbol shows matches
        - Adding stock saves with quantity and syncs initial price
        - Pull-to-refresh updates all trackable asset prices
        - Gain/loss percentage displays correctly
        - Existing non-trackable assets unaffected

- [DONE] Multi-Currency Asset Input & Dynamic Conversion: Already implemented in previous iterations.
    - Asset model has `currency` property storing ISO 4217 code.
    - AssetCurrencyPicker component in Add/Edit Asset sheets.
    - CurrencyService with ExchangeRateCache fetches rates from open.er-api.com.
    - NetWorthViewModel converts all assets to base currency using currencyService.convert().
    - Supports 10 currencies: USD, EUR, GBP, JPY, CNY, TWD, HKD, SGD, AUD, CAD.
    - Existing assets default to base currency if no currency set.
    - Live conversion display added in Iteration 107.

- [DONE] Multi-Currency Asset Input: Non-Base Currency Entry & Real-Time Conversion Display. Completed in Iteration 107.
    - Asset model already stores original amount and `currency` property (implemented in previous iterations).
    - **Live Conversion UI:** Added conversion preview below amount input showing "≈ NT$1,000,950" when currency differs from base currency.
    - NetWorthViewModel already converts all assets to base currency using CurrencyService for dashboard totals.
    - Uses CurrencyService.convert() with cached exchange rates (1-hour refresh).
    - UI uses subtle secondary styling with arrow.right.arrow.left icon.



- [DONE] Currency-Specific Amount Formatting: Completed in Iteration 109.
    - Fixed no-decimal currency list: JPY, KRW, VND, IDR, CLP, HUF, ISK display with 0 decimals.
    - TWD now correctly displays with 2 decimals (was incorrectly in no-decimal list).
    - USD, EUR, GBP, CAD, AUD, CHF, CNY, HKD, SGD all use 2 decimals.
    - Added decimalPlaces(for:) helper function returning 0 or 2 based on ISO 4217.
    - Added ISO 4217 documentation comments to noDecimalCurrencies set.
    - 22 new tests: CurrencyDecimalPlacesTests (18 currencies + lowercase), FormatNoDecimalCurrencyTests (4 format tests).
    - Total CurrencyFormatter tests now 75+.

- [DONE] Remove Single Assets Card and Liabilities Card from Dashboard row (consolidated display). Completed in Iteration 103.
    - Rationale: Net Worth and Asset/Liability breakdown chart now show all necessary figures.
    - Removed: Quick Stats Row HStack with two StatCards (Assets/Liabilities), StatCard struct definition.
    - AssetDebtChart now serves as the consolidated view showing totals with tap-to-toggle modes.
    - formattedTotalAssetsCompact/Liabilities properties retained for AssetDebtChart use.

- [DONE] Add Sync Button next to "Assets" section title in Dashboard. Completed in Iteration 101. AssetSyncButton component with arrow.triangle.2.circlepath icon, animated rotation during sync, Morandi colors (sageGreen/hazedBlue), haptic feedback, accessibility labels. Only visible when trackable assets exist.
    - Placement: Consistently appears alongside "Assets" title regardless of asset count or dashboard state.
    - Acceptance:
        - Button visible beside section header; press initiates sync and gives feedback.
        - Real-time progress feedback during sync operation.
        - All assets update values/reactively after sync completes.
        - Fully tested: UI presence, tap action, sync-in-progress feedback, accessibility label.
        - Documented in release "Now you can refresh all asset prices with one tap from the main dashboard!"

- [DONE] Asset Totals: Use Compact Abbreviated Notation ("7.12M" not "7,123,456"). Already implemented.
    - CurrencyFormatter.formatCompact() provides K/M/B abbreviations (e.g., "$7.1M", "$100K").
    - Used extensively across dashboard: AssetDebtChart, NetWorthViewModel (formattedTotalAssetsCompact, formattedTotalLiabilitiesCompact), CashRunwayCard, OverdueBillsCard, SpendingTrendsView, MilestoneProgressCard, etc.
    - Handles all edge cases: negative values, no-decimal currencies (JPY/KRW/VND), billions threshold, zero values.
    - Comprehensive tests in CurrencyFormatterTests.swift (53+ tests).

- [DONE] Edit Asset Action Modal: "Add / Deduct" Quick Adjustment Workflow. Completed in Iteration 104.
    - QuickAdjustmentSheet with +/- toggle (animated toggle buttons, sageGreen for add, terracotta for deduct)
    - Amount input with visual feedback showing sign prefix (+/−) and currency symbol
    - Live preview showing new balance and change amount
    - Negative balance warning when deducting more than current balance
    - Descriptive history notes ("Added $X" / "Deducted $X") recorded automatically
    - Right swipe on asset cards opens Add/Deduct sheet
    - Context menu added: Add/Deduct, Set Balance, Edit Details, Delete
    - Transaction history via existing BalanceHistory system

- [DONE] Edit Asset Quick Adjustment: Support Shares (Stocks) and Units (Crypto). Completed in Iteration 106.
    - QuickAdjustmentSheet detects trackable assets via isTrackable and trackableType ("stock"/"crypto").
    - Stocks: Input label "Number of Shares", 4 decimal precision, "Buy"/"Sell" labels.
    - Crypto: Input label "Number of Units", 8 decimal precision, "Buy"/"Sell" labels.
    - New components: TrackableAssetInfoHeader, TrackableAdjustmentToggle, TrackableAdjustmentAmountInput, TrackableAssetPreview.
    - Adjustments update asset.quantity and recalculate asset.amount = quantity × lastSyncedPrice.
    - History notes: "Bought X shares" / "Sold X units" with currency value conversion display.
    - Regular fiat assets continue to use existing Amount/Add/Deduct logic unchanged.


- [DONE] Stocks and Crypto Price Sync: Fixed in Iteration 100. Root causes: (1) @State with @Observable singleton broke observation chain in AssetListView - changed to computed property. (2) No app launch sync trigger - added Task block in DashboardView.onAppear to call syncAllTrackableAssets(). Added 12 unit tests for observation and sync behaviors. Fixed flaky SymbolSearchCacheTests.



---

## Previous Iterations

- **Iteration 62**: Feature Mode - No-Spend Day Tracker (COMPLETED)
- **Iteration 61**: Feature Mode - Budget Pace Indicator Card (COMPLETED)
- **Iteration 60**: Maintenance Mode - WidgetDataProvider Tests (COMPLETED)
- **Iteration 59**: Feature Mode - Daily Spending Recap Notification (COMPLETED)
- **Iteration 58**: Feature Mode - Global Search (COMPLETED)
- **Iteration 57**: Maintenance Mode - Test Coverage & Code Quality (COMPLETED)
- **Iteration 56**: Feature Mode - Asset vs Debt Square Chart (COMPLETED)
- **Iteration 55**: Feature Mode - Savings Challenge System (COMPLETED)
- **Iteration 54**: Maintenance Mode - Test Suite Maintenance & Stability (COMPLETED)
- **Iteration 53**: Feature Mode - Export Raw Data (COMPLETED)
- **Iteration 52**: Feature Mode - Currency Display Improvements (COMPLETED)
- **Iteration 51**: Feature Mode - Balance Scale Visualization Card (COMPLETED)
- **Iteration 50**: Research Mode - Enhanced Asset/Liability Visualization Research (COMPLETED)
- **Iteration 49**: Feature Mode - Unified Add Asset/Debt Flow (COMPLETED)
- **Iteration 48**: Maintenance Mode - SpendingInsight Model Tests (COMPLETED)
- **Iteration 47**: Feature Mode - Weekly Spending Digest Notification (COMPLETED)
- **Iteration 46**: Feature Mode - Spending Insights Summary (COMPLETED)
- **Iteration 45**: Maintenance Mode - Enhanced Test Coverage (COMPLETED)
- **Iteration 44**: Feature Mode - Customizable Quick Actions (COMPLETED)
- **Iteration 43**: Feature Mode - Overdue Payment Visual Indicators (COMPLETED)
- **Iteration 42**: Maintenance Mode - Test Infrastructure Analysis (COMPLETED)
- **Iteration 41**: Feature Mode - Recurring Transaction Reminders (COMPLETED)
- **Iteration 40**: Feature Mode - Net Worth Milestone Notifications (COMPLETED)
- **Iteration 39**: Maintenance Mode - Test Infrastructure Investigation (COMPLETED)
- **Iteration 38**: Feature Mode - Shake to Refresh Prices (COMPLETED)
- **Iteration 37**: Maintenance Mode - Swift 6 MainActor Test Isolation (COMPLETED)
- **Iteration 36**: Maintenance Mode - Fix Swift 6 MainActor Test Isolation (COMPLETED - Partial)

---

## Completed Features

- [DONE] Design System: Morandi color palette (6 colors with light/dark mode) - Commit 8091ca3
- [DONE] Typography System: New York (serif) + SF Pro Rounded fonts - Commit 974575d
- [DONE] Liquid Glass: Frosted glass effects with blur/saturation/noise - Commit 123ad12
- [DONE] Asset CoreData Model: Entity with persistence controller - Commit af0fe7c
- [DONE] BalanceHistory: Historical tracking for Time Machine - Commit 23cc434
- [DONE] Net Worth Header + DashboardView: Main dashboard UI - Commit 5edac78
- [DONE] Asset List: Swipe-to-delete with haptic feedback - Commit f067906
- [DONE] Privacy Mode: Tap net worth header to blur all monetary values
- [DONE] Add Asset Flow: Two-step bottom sheet with type selection and details input
- [DONE] Edit Asset: Tap card to edit name, amount, type with haptic feedback
- [DONE] Quick Balance Update: Right swipe for fast balance update with change preview
- [DONE] Asset Halo: Circular ring visualization with colored segments and legend
- [DONE] Delete with Undo: Soft delete with undo toast and 4-second restore window
- [DONE] Splash Screen: Liquid glass logo with gyroscope parallax animation
- [DONE] Privacy Promise Page: Poetic local-first privacy messaging with OnboardingManager
- [DONE] Base Currency Selection: Auto-detect locale with 10 major currencies
- [DONE] FaceID Setup: Biometric lock with fog-clearing animation using LocalAuthentication
- [DONE] Home Screen Widget: Net worth widget with Morandi palette and privacy mode sync
- [DONE] Lock Screen Widget: Circular, rectangular, and inline accessory widgets
- [DONE] Siri Shortcuts: App Intents for get net worth, add asset, update asset balance
- [DONE] Emotional Messaging: Context-aware encouragement with mood-based messages and milestone detection
- [DONE] Time Machine: Historical net worth visualization with Swift Charts, time range selector, milestone markers
- [DONE] Treemap Visualization: Interactive asset distribution treemap with squarified layout algorithm - Commit cf00513
- [DONE] Currency Service: Multi-currency exchange rate fetching with offline cache - Commit f75616d
- [DONE] Stock API Integration: Real-time stock prices from Yahoo Finance with caching - Commit 38bcc25
- [DONE] Crypto Price Sync: Real-time crypto prices from CoinGecko for top 15 coins - Commit cc28c5b
- [DONE] iCloud Sync: CloudKit Private Database with automatic sync and status indicator - Commit fef414f (Removed in 906bd20)
- [DONE] Savings Goals: Target-based goals with progress visualization, milestone detection, animated progress rings - Commit c131992
- [DONE] Spending Categories: Expense tracking by 8 categories with budgets, progress bars, dashboard integration
- [DONE] Base Currency Switching: Settings view with currency picker, search, confirmation dialog
- [DONE] Shake to Refresh Prices: Device shake gesture triggers stock and crypto price refresh with haptic feedback and toast notification - Commit 71e4672
- [DONE] Net Worth Milestone Notifications: Push notifications celebrating when users cross net worth milestones ($1K, $5K, $10K, $25K, $50K, $75K, $100K, $250K, $500K, $1M). MilestoneAlertService tracks last notified milestone to prevent duplicates. MilestoneAlertMessaging provides celebratory, anxiety-free messages. Integration in NetWorthViewModel.fetchAssets() checks for newly crossed milestones. Settings toggle added to BudgetAlertSettingsView (renamed to Notifications). Research: personalized notifications increase engagement 3x, gamification improves retention 28%.

---

## Failed/Abandoned Features

*None*
