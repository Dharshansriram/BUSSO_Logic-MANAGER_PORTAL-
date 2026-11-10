# BUSSOLOGIC Manager Portal — Gmail API setup

Gmail API OAuth is integrated into the Manager Portal. Employee Portal code is not changed.

## Railway variables (Manager Portal service only)
- `PORTAL_MODE=manager`
- `GOOGLE_CLIENT_ID` — OAuth web client ID
- `GOOGLE_CLIENT_SECRET` — OAuth web client secret
- `GOOGLE_REDIRECT_URI=https://busso-logic-managerportal-production.up.railway.app/auth/google/callback`
- `GOOGLE_SENDER_EMAIL=dharshansriram.r@gmail.com`
- `GOOGLE_TOKEN_ENCRYPTION_KEY` — existing stable 64-character hex key (32 bytes). Do not regenerate after connecting Gmail.

Keep the existing `MONGODB_URI` and other project variables. Do not add these Gmail variables to the Employee Portal service.

## Google Cloud OAuth
Authorized redirect URI must exactly match `GOOGLE_REDIRECT_URI`.
Required scopes: `openid`, `email`, `https://www.googleapis.com/auth/gmail.send`.
The configured sender Gmail account must be a Google OAuth test user while the consent screen is in Testing.

## Connect Gmail after deployment
1. Sign in to the Manager Portal as a manager/admin.
2. Visit `/auth/google/start` on the Manager Portal domain.
3. Select the configured sender Gmail account and approve access.
4. The server stores only an AES-256-GCM encrypted refresh token in MongoDB collection `gmail_oauth_tokens`.

Invitation email delivery uses Gmail API when `GOOGLE_CLIENT_ID` is configured. SMTP remains available when Gmail OAuth is not configured.

## Important
Google OAuth apps in External + Testing status can issue refresh tokens that expire after 7 days. For ongoing production use, move the consent screen to Production and complete any Google verification requirements for the Gmail send scope. Do not share OAuth secrets, tokens, authorization codes, encryption keys, or `.env` files.
