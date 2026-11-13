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
// applies it to every transaction as it's written. The list itself is the
// browser's (shared/categories.ts).
// ---------------------------------------------------------------------------

// The list, and what a category id may be, are shared/categories.ts's, built
// for the hooks into lib/gen/categories.js (scripts/gen-hooks.mjs).
var shared = require(`${__hooks}/lib/gen/categories.js`)

/** Every category, in the order Spending lists them. `spending: false` is money that isn't spent. */
var CATEGORIES = shared.CATEGORIES

/** A category the person made: "c-" and its record id in custom_categories. Its name is theirs. */
var isCustomId = shared.isCustomId

/** A custom category's name, trimmed to one line, or "" if it can't be one. */
function cleanName(name) {
  // eslint-disable-next-line no-control-regex
  var n = String(name === undefined || name === null ? "" : name).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()
  return n.length <= 40 ? n : ""
}

var isCategory = shared.isCategory

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
// Each phrase as its words: [["whole", "foods"], ["grocer*"], ...].
var PHRASES = WORDS.map(function (w) { return [w[0], w[1].split("|").map(function (p) { return p.split(" ") })] })

/** Whether `phrase` (words, a trailing * on one matching any ending) appears in `words` in order. */
function hasPhrase(words, phrase) {
  for (var i = 0; i + phrase.length <= words.length; i++) {
    var all = true
    for (var j = 0; j < phrase.length && all; j++) {
      var want = phrase[j]
      var got = words[i + j]
      all = want.charAt(want.length - 1) === "*" ? got.indexOf(want.slice(0, -1)) === 0 : got === want
    }
    if (all) return true
  }
  return false
}

/** Lower case, letters and digits only, single spaces: "SQ *Blue-Bottle #12" -> "sq blue bottle 12". */
function plain(text) {
  return String(text || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
}

/** What a description says it is, or "". */
function fromWords(text) {
  var t = plain(text)
  if (!t) return ""
  var words = t.split(" ")
  for (var i = 0; i < PHRASES.length; i++) {
    for (var k = 0; k < PHRASES[i][1].length; k++) if (hasPhrase(words, PHRASES[i][1][k])) return PHRASES[i][0]
  }
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
 * category for its merchant (or ""), built in or one they made (the caller
 * checks a custom one still exists).
 */
function categorize(t, rule) {
  if (rule && (isCategory(rule) || isCustomId(rule))) return { category: rule, by: "rule" }
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
  isCustomId: isCustomId,
  cleanName: cleanName,
  fromBank: fromBank,
  fromWords: fromWords,
  merchantKey: merchantKey,
  categorize: categorize,
}
