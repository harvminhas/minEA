/** Same list as tools.json. The unit runner cannot import JSON, so the app reads this module. */
export const TOOL_CATALOG = [
  { name: "Salesforce", aliases: ["salesforce", "sfdc"], vendor: "Salesforce", category: "CRM", hosting: "saas", kind: "app", typicalAnnual: 18000, unit: "year" },
  { name: "QuickBooks Online", aliases: ["quickbooks", "quickbooks online", "qbo"], vendor: "Intuit", category: "Finance", hosting: "saas", kind: "app", typicalAnnual: 900, unit: "year" },
  { name: "Microsoft 365", aliases: ["microsoft 365", "m365", "office 365"], vendor: "Microsoft", category: "Productivity", hosting: "saas", kind: "app", typicalAnnual: 15000, unit: "year" },
  { name: "Shopify", aliases: ["shopify"], vendor: "Shopify", category: "Commerce", hosting: "saas", kind: "app", typicalAnnual: 348, unit: "year" },
  { name: "AS400", aliases: ["as400", "as/400", "ibm i"], vendor: "IBM", category: "Server", hosting: "own", kind: "server", typicalAnnual: null, unit: "year" },
  { name: "SPS Commerce", aliases: ["sps commerce", "edi"], vendor: "SPS Commerce", category: "Integration", hosting: "either", kind: "app", typicalAnnual: null, unit: "year" },
  { name: "TrueCommerce", aliases: ["truecommerce", "edi"], vendor: "TrueCommerce", category: "Integration", hosting: "either", kind: "app", typicalAnnual: null, unit: "year" },
  { name: "Cleo", aliases: ["cleo", "cleo integration cloud", "edi"], vendor: "Cleo", category: "Integration", hosting: "either", kind: "app", typicalAnnual: null, unit: "year" },
  { name: "BarTender", aliases: ["bartender", "bar tender"], vendor: "Seagull", category: "Operations", hosting: "either", kind: "app", typicalAnnual: 1200, unit: "year", hints: ["label", "printing", "barcode"] },
  { name: "Zoom Workplace", aliases: ["zoom", "zoom workplace"], vendor: "Zoom", category: "Meetings", hosting: "saas", kind: "app", typicalAnnual: 1800, unit: "year" },
  { name: "Oracle NetSuite", aliases: ["netsuite", "oracle netsuite"], vendor: "Oracle", category: "Finance", hosting: "saas", kind: "app", typicalAnnual: 12000, unit: "year" },
  { name: "Slack", aliases: ["slack"], vendor: "Salesforce", category: "Productivity", hosting: "saas", kind: "app", typicalAnnual: 900, unit: "year" },
  { name: "Dropbox", aliases: ["dropbox"], vendor: "Dropbox", category: "Files", hosting: "saas", kind: "app", typicalAnnual: 720, unit: "year" },
  { name: "HubSpot", aliases: ["hubspot"], vendor: "HubSpot", category: "Marketing", hosting: "saas", kind: "app", typicalAnnual: 10800, unit: "year" },
];
