# Demo Users Environment Migration Guide

For security and audit readiness, all hardcoded plain-text passwords and default credentials have been removed from the codebase.

## Configuring Demo Users

To set up demo users for local testing or staging environments, add the `DEMO_USERS_JSON` variable to your `.env` file. This variable takes a JSON string mapping usernames to passwords, roles, and display names.

### Roles Available

- `PFL_OFFICER`
- `PFL_MANAGER`
- `PFL_ADMIN`

### Example Configuration

Add the following entry to your local `.env` file:

```bash
DEMO_USERS_JSON='{"officer": {"password": "your_secure_officer_password_here", "role": "PFL_OFFICER", "name": "Officer Demo"}, "manager": {"password": "your_secure_manager_password_here", "role": "PFL_MANAGER", "name": "Manager Demo"}, "admin": {"password": "your_secure_admin_password_here", "role": "PFL_ADMIN", "name": "Admin Demo"}}'
```

Make sure the JSON string is properly enclosed in single quotes `'...'` to prevent standard shell/environment parsing issues.
