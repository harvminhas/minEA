# Stripe billing (legacy)

Self-serve Solo checkout has been **disabled**. Business plans are contact-only — see **[how-to-manage-plans.md](how-to-manage-plans.md)**.

Stripe webhooks remain wired for **legacy** subscriptions:

- `checkout.session.completed` → upgrades org to Business (legacy Solo checkouts map to Business)
- `customer.subscription.deleted` → downgrades to Free (unless org is already on Business via manual assignment)

Manual plan changes always use `set_org_plan.py` or `set-org-plan.ps1`.
