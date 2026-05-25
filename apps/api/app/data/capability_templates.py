"""Industry capability map templates — Level 1 domains, Level 2 capabilities (Option A scoped names)."""

from typing import TypedDict


class TemplateDomain(TypedDict):
    name: str
    icon: str
    capabilities: list[str]


class CapabilityTemplate(TypedDict):
    id: str
    name: str
    description: str
    icon: str
    domain_count: int
    capability_count: int
    domains: list[TemplateDomain]


def _count(template: CapabilityTemplate) -> CapabilityTemplate:
    domains = template["domains"]
    cap_count = sum(len(d["capabilities"]) for d in domains)
    template["domain_count"] = len(domains)
    template["capability_count"] = cap_count
    return template


SAAS_TEMPLATE: CapabilityTemplate = _count(
    {
        "id": "saas",
        "name": "SaaS / Software",
        "description": "B2B/B2C software companies with customer-facing products and subscription billing.",
        "icon": "cloud",
        "domain_count": 0,
        "capability_count": 0,
        "domains": [
            {
                "name": "Customer",
                "icon": "users",
                "capabilities": [
                    "Acquisition",
                    "Onboarding",
                    "Profile management",
                    "Support",
                    "Success management",
                ],
            },
            {
                "name": "Product",
                "icon": "box",
                "capabilities": [
                    "Catalog management",
                    "Feature flagging",
                    "Roadmap planning",
                    "Release management",
                ],
            },
            {
                "name": "Billing",
                "icon": "credit-card",
                "capabilities": [
                    "Subscription management",
                    "Invoicing",
                    "Revenue recognition",
                    "Tax & compliance",
                    "Dunning",
                ],
            },
            {
                "name": "Engineering",
                "icon": "code",
                "capabilities": [
                    "Build & deploy",
                    "Monitoring & alerting",
                    "Incident response",
                    "Security & compliance",
                    "CI/CD pipeline",
                    "Performance optimization",
                    "Developer experience",
                    "Authentication",
                ],
            },
            {
                "name": "Sales",
                "icon": "trending-up",
                "capabilities": [
                    "Lead management",
                    "Pipeline management",
                    "Quote & proposal",
                    "Sales reporting",
                    "Partner management",
                ],
            },
            {
                "name": "Finance",
                "icon": "calculator",
                "capabilities": [
                    "Financial planning",
                    "Accounts payable",
                    "Accounts receivable",
                    "Finance reporting",
                    "Audit & controls",
                ],
            },
            {
                "name": "IT",
                "icon": "server",
                "capabilities": [
                    "Identity & access",
                    "Endpoint management",
                    "IT service desk",
                    "Vendor management",
                ],
            },
        ],
    }
)

MARKETPLACE_TEMPLATE: CapabilityTemplate = _count(
    {
        "id": "marketplace",
        "name": "Marketplace",
        "description": "Two-sided platforms connecting buyers and sellers with trust and payments.",
        "icon": "store",
        "domain_count": 0,
        "capability_count": 0,
        "domains": [
            {
                "name": "Buyer",
                "icon": "users",
                "capabilities": ["Discovery", "Search & browse", "Checkout", "Buyer support", "Reviews & ratings"],
            },
            {
                "name": "Seller",
                "icon": "briefcase",
                "capabilities": ["Seller onboarding", "Listing management", "Order fulfillment", "Seller payouts"],
            },
            {
                "name": "Trust & Safety",
                "icon": "shield",
                "capabilities": ["Identity verification", "Fraud prevention", "Dispute resolution", "Policy enforcement"],
            },
            {
                "name": "Payments",
                "icon": "credit-card",
                "capabilities": ["Payment processing", "Escrow", "Refunds", "Tax calculation"],
            },
            {
                "name": "Platform",
                "icon": "layers",
                "capabilities": ["API management", "Analytics", "Platform reporting", "Feature flags"],
            },
            {
                "name": "Marketing",
                "icon": "megaphone",
                "capabilities": ["Campaign management", "Promotions", "Marketing reporting"],
            },
            {
                "name": "Operations",
                "icon": "settings",
                "capabilities": ["Logistics coordination", "Customer operations", "Vendor management"],
            },
            {
                "name": "Compliance",
                "icon": "scale",
                "capabilities": ["Regulatory reporting", "Data privacy", "Compliance reporting"],
            },
        ],
    }
)

BANKING_TEMPLATE: CapabilityTemplate = _count(
    {
        "id": "banking",
        "name": "Banking",
        "description": "Retail and commercial banking aligned with BIAN reference architecture.",
        "icon": "landmark",
        "domain_count": 0,
        "capability_count": 0,
        "domains": [
            {"name": "Customer", "icon": "users", "capabilities": ["Customer onboarding", "KYC", "Relationship management"]},
            {"name": "Products", "icon": "box", "capabilities": ["Product catalog", "Pricing", "Product lifecycle"]},
            {"name": "Accounts", "icon": "wallet", "capabilities": ["Account opening", "Account servicing", "Statements"]},
            {"name": "Lending", "icon": "hand-coins", "capabilities": ["Credit assessment", "Loan origination", "Loan servicing"]},
            {"name": "Payments", "icon": "credit-card", "capabilities": ["Payment initiation", "Clearing", "Settlement"]},
            {"name": "Risk", "icon": "alert-triangle", "capabilities": ["Credit risk", "Operational risk", "Risk reporting"]},
            {"name": "Compliance", "icon": "scale", "capabilities": ["AML monitoring", "Regulatory reporting", "Audit"]},
            {"name": "Finance", "icon": "calculator", "capabilities": ["General ledger", "Finance reporting", "Treasury"]},
            {"name": "Technology", "icon": "server", "capabilities": ["Core banking integration", "Authentication", "IT operations"]},
        ],
    }
)

RETAIL_TEMPLATE: CapabilityTemplate = _count(
    {
        "id": "retail",
        "name": "Retail / E-commerce",
        "description": "Online and omnichannel retail covering inventory and fulfillment.",
        "icon": "shopping-cart",
        "domain_count": 0,
        "capability_count": 0,
        "domains": [
            {"name": "Merchandising", "icon": "tag", "capabilities": ["Assortment planning", "Pricing", "Promotions"]},
            {"name": "Commerce", "icon": "store", "capabilities": ["Catalog", "Cart & checkout", "Order management"]},
            {"name": "Customer", "icon": "users", "capabilities": ["Loyalty", "Customer support", "Personalization"]},
            {"name": "Inventory", "icon": "package", "capabilities": ["Stock management", "Replenishment", "Allocation"]},
            {"name": "Fulfillment", "icon": "truck", "capabilities": ["Pick & pack", "Shipping", "Returns"]},
            {"name": "Marketing", "icon": "megaphone", "capabilities": ["Campaigns", "Email marketing", "Marketing reporting"]},
            {"name": "Finance", "icon": "calculator", "capabilities": ["Revenue accounting", "Finance reporting", "Tax"]},
            {"name": "Store Operations", "icon": "map-pin", "capabilities": ["Store staffing", "POS operations", "Loss prevention"]},
        ],
    }
)

INSURANCE_TEMPLATE: CapabilityTemplate = _count(
    {
        "id": "insurance",
        "name": "Insurance",
        "description": "P&C and life insurance covering policy lifecycle and claims.",
        "icon": "shield-check",
        "domain_count": 0,
        "capability_count": 0,
        "domains": [
            {"name": "Distribution", "icon": "users", "capabilities": ["Agent management", "Quote & bind", "Renewals"]},
            {"name": "Underwriting", "icon": "clipboard-check", "capabilities": ["Risk assessment", "Pricing", "Policy issuance"]},
            {"name": "Policy Admin", "icon": "file-text", "capabilities": ["Policy servicing", "Endorsements", "Billing"]},
            {"name": "Claims", "icon": "heart-pulse", "capabilities": ["First notice of loss", "Claims adjudication", "Payments"]},
            {"name": "Customer", "icon": "headphones", "capabilities": ["Customer onboarding", "Self-service", "Support"]},
            {"name": "Finance", "icon": "calculator", "capabilities": ["Premium accounting", "Reserving", "Finance reporting"]},
            {"name": "Compliance", "icon": "scale", "capabilities": ["Regulatory filing", "Compliance reporting", "Audit"]},
            {"name": "Data & Analytics", "icon": "bar-chart", "capabilities": ["Actuarial analysis", "Fraud detection", "Analytics reporting"]},
            {"name": "Technology", "icon": "server", "capabilities": ["Core policy admin", "Authentication", "Integration"]},
        ],
    }
)

HEALTHCARE_TEMPLATE: CapabilityTemplate = _count(
    {
        "id": "healthcare",
        "name": "Healthcare",
        "description": "Providers and payers covering patient care and clinical operations.",
        "icon": "heart-pulse",
        "domain_count": 0,
        "capability_count": 0,
        "domains": [
            {"name": "Patient Access", "icon": "users", "capabilities": ["Scheduling", "Registration", "Eligibility"]},
            {"name": "Clinical", "icon": "stethoscope", "capabilities": ["Care delivery", "Clinical documentation", "Orders & results"]},
            {"name": "Revenue Cycle", "icon": "credit-card", "capabilities": ["Coding", "Claims submission", "Payment posting"]},
            {"name": "Population Health", "icon": "activity", "capabilities": ["Care coordination", "Quality measures", "Outreach"]},
            {"name": "Pharmacy", "icon": "pill", "capabilities": ["Medication management", "Formulary", "Dispensing"]},
            {"name": "Supply Chain", "icon": "package", "capabilities": ["Procurement", "Inventory", "Distribution"]},
            {"name": "Compliance", "icon": "scale", "capabilities": ["HIPAA privacy", "Compliance reporting", "Audit"]},
            {"name": "Finance", "icon": "calculator", "capabilities": ["Budgeting", "Cost accounting", "Finance reporting"]},
            {"name": "Human Resources", "icon": "user-cog", "capabilities": ["Credentialing", "Workforce planning", "Training"]},
            {"name": "Technology", "icon": "server", "capabilities": ["EHR integration", "Authentication", "Interoperability"]},
        ],
    }
)

TEMPLATES: dict[str, CapabilityTemplate] = {
    t["id"]: t
    for t in [
        SAAS_TEMPLATE,
        MARKETPLACE_TEMPLATE,
        BANKING_TEMPLATE,
        RETAIL_TEMPLATE,
        INSURANCE_TEMPLATE,
        HEALTHCARE_TEMPLATE,
    ]
}


def list_templates() -> list[CapabilityTemplate]:
    return list(TEMPLATES.values())


def get_template(template_id: str) -> CapabilityTemplate | None:
    return TEMPLATES.get(template_id)
