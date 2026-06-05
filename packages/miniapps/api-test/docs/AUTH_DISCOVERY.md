# OpenCode Auth Configuration Discovery

## Overview

OpenCode stores provider authentication in multiple locations depending on the provider type. This document records the discovery process and file locations for future reference.

## Auth Configuration Files

### 1. API Key Providers (`~/.config/opencode/opencode.json`)

Standard API key-based providers are configured in the main config file under the `provider` key:

```json
{
  "provider": {
    "volcengine": {
      "api": "openai",
      "name": "Volcengine Claude",
      "options": {
        "apiKey": "ark-xxx",
        "baseURL": "https://ark.cn-beijing.volces.com/api/coding/v1"
      },
      "models": { ... }
    }
  }
}
```

**Providers using this method:**
- volcengine (Volcengine Claude)
- zhipu (Zhipu GLM)
- kimi (Kimi Code)
- mimo (Xiaomi MiMo)
- deepseek (DeepSeek)

### 2. Google OAuth (`~/.config/opencode/antigravity-accounts.json`)

Google accounts are authenticated via the antigravity plugin using OAuth2 refresh tokens:

```json
{
  "version": 4,
  "accounts": [
    {
      "email": "user@gmail.com",
      "refreshToken": "1//0xxx...",
      "projectId": "1",
      "enabled": true,
      "cachedQuota": {
        "gemini-flash": { "remainingFraction": 0.4 },
        "gemini-pro": { "remainingFraction": 0.4 },
        "claude": { "remainingFraction": 1 }
      }
    }
  ]
}
```

**Key fields:**
- `email`: Google account email
- `refreshToken`: OAuth2 refresh token
- `projectId`: Account ID (used for provider ID)
- `cachedQuota`: Rate limit information per model family

### 3. OpenAI/ChatGPT OAuth (`~/.local/share/opencode/auth.json`)

ChatGPT Pro/Plus accounts are authenticated via OAuth through the codex plugin:

```json
{
  "openai": {
    "type": "oauth",
    "access": "eyJhbGciOiJSUzI1NiIs...",
    "refresh": "rt_xxx...",
    "expires": 1780413078016,
    "accountId": "4b1864f6-8ada-4aa9-8952-0c278221fbf6"
  },
  "codex": {
    "type": "oauth",
    "access": "eyJhbGciOiJSUzI1NiIs...",
    "refresh": "rt_xxx...",
    "expires": 1769773347104
  }
}
```

**Key fields:**
- `type`: Always "oauth" for ChatGPT accounts
- `access`: JWT access token (contains user info)
- `refresh`: Refresh token for token renewal
- `expires`: Token expiration timestamp (milliseconds)

## JWT Token Structure

OpenAI JWT tokens contain claims in nested namespaces:

### `https://api.openai.com/auth`
```json
{
  "chatgpt_account_id": "4b1864f6-8ada-4aa9-8952-0c278221fbf6",
  "chatgpt_plan_type": "plus",
  "chatgpt_user_id": "user-xxx",
  "amr": ["otp", "mfa"]
}
```

### `https://api.openai.com/profile`
```json
{
  "email": "user@gmail.com",
  "email_verified": true
}
```

## Discovery Process

1. **Initial search**: Looked for `openai`/`chatgpt` in `~/.config/opencode/`
2. **Found antigravity accounts**: `~/.config/opencode/antigravity-accounts.json` (Google OAuth)
3. **Traced auth storage**: Found `auth.json` path in `packages/opencode/src/cli/cmd/providers.ts:258`
4. **Located auth.json**: `~/.local/share/opencode/auth.json`
5. **Analyzed JWT**: Decoded access tokens to extract email and plan info

## Provider ID Mapping

| Provider | Auth File | Auth Type | Display Name |
|----------|-----------|-----------|--------------|
| volcengine | opencode.json | API Key | Volcengine Claude |
| zhipu | opencode.json | API Key | Zhipu GLM |
| kimi | opencode.json | API Key | Kimi Code |
| mimo | opencode.json | API Key | Xiaomi MiMo |
| deepseek | opencode.json | API Key | DeepSeek |
| google-{projectId} | antigravity-accounts.json | OAuth | google:{email} |
| openai | auth.json | OAuth | chatgpt:{email} |
| codex | auth.json | OAuth | codex:{email} |

## Testing Auth Status

### API Key Providers
- Test `/models` endpoint with Bearer token
- Check for HTTP 200 response

### Google OAuth
- Check `cachedQuota` in antigravity accounts
- Verify `remainingFraction > 0`

### OpenAI OAuth
- Check JWT expiration (`expires` timestamp)
- Verify access token exists
