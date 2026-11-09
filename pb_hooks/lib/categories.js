/// <reference path="../../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Spending categories, and how a transaction finds its own, with no setup:
//
//   1. the person's own rule for the merchant, learned the last time they
//      moved one of its transactions to another category;
//   2. else the bank's category, when Plaid sent one
//      (personal_finance_category);
//   3. else what the description says ("WHOLE FOODS" is groceries);
//   4. else money in is income (a card's is a payment to it), and money out
//      is Other.
//
// Plain values in and out, so Node can run it; pb_hooks/categories.pb.js
// applies it to every transaction as it's written. The list is the browser's
// too (shared/categories.ts), and a unit test keeps the two the same.
// ---------------------------------------------------------------------------

/** Every category, in the order Spending lists them. `spending: false` is money that isn't spent. */
var CATEGORIES = [
  { id: "housing", label: "Housing", spending: true },
  { id: "utilities", label: "Utilities", spending: true },
  { id: "groceries", label: "Groceries", spending: true },
  { id: "dining", label: "Dining and drinks", spending: true },
  { id: "transport", label: "Transportation", spending: true },
  { id: "travel", label: "Travel", spending: true },
  { id: "shopping", label: "Shopping", spending: true },
  { id: "entertainment", label: "Entertainment", spending: true },
  { id: "health", label: "Health", spending: true },
  { id: "personal", label: "Personal care", spending: true },
  { id: "insurance", label: "Insurance", spending: true },
  { id: "education", label: "Education", spending: true },
  { id: "gifts", label: "Gifts and donations", spending: true },
  { id: "fees", label: "Fees and interest", spending: true },
  { id: "taxes", label: "Taxes", spending: true },
  { id: "loans", label: "Loan payments", spending: true },
  { id: "other", label: "Other", spending: true },
  { id: "income", label: "Income", spending: false },
  { id: "transfer", label: "Transfers", spending: false },
]

function isCategory(id) {
  for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return true
  return false
}

// Plaid's personal_finance_category: a few detailed ones first, then by primary.
var PLAID_DETAILED = {
  FOOD_AND_DRINK_GROCERIES: "groceries",
  RENT_AND_UTILITIES_RENT: "housing",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "housing",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "transfer",
  LOAN_PAYMENTS_CAR_PAYMENT: "transport",
  GENERAL_SERVICES_AUTOMOTIVE: "transport",
  GENERAL_SERVICES_EDUCATION: "education",
  GENERAL_SERVICES_INSURANCE: "insurance",
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: "fees",
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: "gifts",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "taxes",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "health",
}
var PLAID_PRIMARY = {
  INCOME: "income",
  TRANSFER_IN: "transfer",
  TRANSFER_OUT: "transfer",
  LOAN_PAYMENTS: "loans",
  BANK_FEES: "fees",
  ENTERTAINMENT: "entertainment",
  FOOD_AND_DRINK: "dining",
  GENERAL_MERCHANDISE: "shopping",
  HOME_IMPROVEMENT: "housing",
  MEDICAL: "health",
  PERSONAL_CARE: "personal",
  GENERAL_SERVICES: "other",
  GOVERNMENT_AND_NON_PROFIT: "other",
  TRANSPORTATION: "transport",
  TRAVEL: "travel",
  RENT_AND_UTILITIES: "utilities",
}
var PRIMARIES = Object.keys(PLAID_PRIMARY).sort(function (a, b) { return b.length - a.length })

/** Cheddar's category for a Plaid category ("FOOD_AND_DRINK_COFFEE", or a bare primary), or "". */
function fromBank(code) {
  var c = String(code || "").toUpperCase()
  if (!c) return ""
  if (PLAID_DETAILED[c]) return PLAID_DETAILED[c]
  // The longest primary it starts with: TRANSFER_IN_ before a shorter one.
  for (var i = 0; i < PRIMARIES.length; i++) {
    var p = PRIMARIES[i]
    if (c === p || c.indexOf(p + "_") === 0) return PLAID_PRIMARY[p]
  }
  return ""
}

// What a description says, tried in order: the first match wins. Each is
// whole words, and a * stands for the rest of a word: "grocer*" finds
// "GROCERY" and "GROCERS", while "pub" never finds "PUBLIX".
var WORDS = [
  ["transfer", "transfer*|xfer|autopay|auto pay|payment thank you|online payment|mobile payment|card payment|credit card payment|ach payment|epay|zelle"],
  ["income", "payroll|direct dep*|salary|paycheck|dividend*|interest paid|interest earned|tax refund|irs treas*"],
  ["taxes", "irs|franchise tax|dept of revenue|tax payment|property tax"],
  ["dining", "uber eats|ubereats|doordash|grubhub|postmates|restaurant*|cafe|coffee|starbucks|dunkin|peets|mcdonald*|burger*|chipotle|pizza*|taco*|sushi|ramen|grill|diner|bistro|baker*|kitchen|tavern|pub|brewing|brewery|bar|deli|chick fil a|wendys|panera|kfc|dominos|shake shack"],
  ["groceries", "grocer*|supermarket*|whole foods|wholefds|trader joe*|safeway|kroger|aldi|publix|wegmans|albertsons|sprouts|food lion|heb|h e b|giant eagle|stop shop|meijer|winco|harris teeter|ralphs|vons|market basket|instacart"],
  ["transport", "uber|lyft|parking|parkmobile|park mobile|toll*|ez pass|e zpass|fastrak|transit|metro|mta|bart|clipper|shell|chevron|exxon*|mobil|texaco|valero|sunoco|arco|citgo|gas station|fuel|dmv|car wash|jiffy lube|autozone|supercharger"],
  ["travel", "airline*|air lines|airways|delta air|united air|american air|southwest|jetblue|alaska air|spirit air|frontier air|hotel*|motel*|marriott|hilton|hyatt|airbnb|vrbo|expedia|booking com|hertz|avis|enterprise rent*|national car|amtrak|greyhound"],
  ["utilities", "electric*|power co|energy|utility|utilities|water dept|water bill|sewer|pg e|con ed|comcast|xfinity|spectrum|verizon|at t|t mobile|tmobile|internet|cox comm*|centurylink"],
  ["housing", "rent|mortgage|hoa|property mgmt|home depot|lowes|ace hardware|menards"],
  ["insurance", "insurance|geico|state farm|progressive|allstate|liberty mutual|nationwide"],
  ["health", "pharmac*|cvs|walgreens|rite aid|doctor*|dental|dentist*|clinic|hospital|medical|optometr*|kaiser|labcorp|quest diag*|gym|fitness|peloton"],
  ["personal", "salon|barber*|spa|nails|beauty|sephora|ulta|dry clean*|laundr*"],
  ["entertainment", "streaming|netflix*|spotify*|hulu*|disney plus|disneyplus|hbo*|youtube*|apple music|paramount|peacock|audible|steam*|playstation*|xbox*|nintendo*|cinema*|theater*|theatre*|amc|regal|ticketmaster|stubhub|eventbrite"],
  ["education", "tuition|school|university|college|coursera|udemy|bookstore|textbook*"],
  ["gifts", "donation*|charity|church|gofundme|red cross|unicef|patreon"],
  ["loans", "loan|navient|sallie mae|nelnet|mohela"],
  ["fees", "fee|fees|overdraft|interest charge*|finance charge*|late charge*|atm"],
  ["shopping", "amazon*|amzn*|target|walmart|wal mart|costco|ebay|etsy|best buy|apple com|ikea|wayfair|macys|nordstrom*|kohls|tj maxx|marshalls|old navy|nike|zara|uniqlo|shein|temu|dollar tree|dollar general|five below"],
]
var PATTERNS = WORDS.map(function (w) { return [w[0], new RegExp("(^| )(" + w[1].replace(/\*/g, "[a-z0-9]*") + ")( |$)")] })

/** Lower case, letters and digits only, single spaces: "SQ *Blue-Bottle #12" -> "sq blue bottle 12". */
function plain(text) {
  return String(text || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
}

/** What a description says it is, or "". */
function fromWords(text) {
  var t = plain(text)
  if (!t) return ""
  for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i][1].test(t)) return PATTERNS[i][0]
  return ""
}

// Card processors and bank wording in front of the merchant's own name.
var NOISE = /^(sq|tst|sp|py|pp|paypal|pos|ach|dbt|debit|card|purchase|recurring|checkcard|check card|visa|pmt|web|online|the|www)( |$)/

/**
 * The merchant a transaction is from, as the key a learned rule matches:
 * the payee if the bank named one, else the description without what
 * changes from one charge to the next (store numbers, card processors'
 * prefixes, dates, reference codes). Its first two words, so
 * "STARBUCKS STORE #1234 SEATTLE" and "STARBUCKS STORE #88 PORTLAND" are one
 * merchant, and "UBER EATS" stays apart from "UBER TRIP". "" when there's
 * nothing to go on.
 */
function merchantKey(payee, description) {
  var t = plain(payee) || plain(description)
  var prev
  do {
    prev = t
    t = t.replace(NOISE, "")
  } while (t !== prev)
  var words = t.split(" ").filter(function (w) { return w && !/\d/.test(w) && w.length > 1 })
  return words.slice(0, 2).join(" ").slice(0, 100)
}

/**
 * A transaction's category: { category, by }, where `by` says how it was
 * found ("rule", "bank", "match" or "default"). `t` is { amount_cents,
 * description, payee, bank_category, liability }, `rule` the person's own
 * category for its merchant (or "").
 */
function categorize(t, rule) {
  if (rule && isCategory(rule)) return { category: rule, by: "rule" }
  var bank = fromBank(t.bank_category)
  if (bank) return { category: bank, by: "bank" }
  var words = fromWords((t.payee || "") + " " + (t.description || ""))
  // Money in that reads as a shop is a refund, which goes back against that
  // category; money out never reads as income.
  if (words && !(words === "income" && t.amount_cents < 0)) return { category: words, by: "match" }
  if (t.amount_cents > 0) return { category: t.liability ? "transfer" : "income", by: "default" }
  return { category: "other", by: "default" }
}

module.exports = {
  CATEGORIES: CATEGORIES,
  isCategory: isCategory,
  fromBank: fromBank,
  fromWords: fromWords,
  merchantKey: merchantKey,
  categorize: categorize,
}
