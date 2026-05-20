# Auth Account Lifecycle

## Password Reset

- Password reset uses one-time random tokens.
- Only SHA-256 token hashes are stored in `VerificationToken`.
- Reset tokens expire after 30 minutes.
- Successful reset updates the password hash, records `passwordChangedAt`, consumes the token, and deletes existing DB sessions for that user.
- Reset request responses are intentionally generic so account existence is not disclosed.

## Email Verification

- Email verification uses one-time random tokens stored as hashes.
- Verification tokens expire after 24 hours.
- The user model includes `emailVerified` so production deployments can enable `AUTH_REQUIRE_EMAIL_VERIFICATION=true`.
- Existing users are backfilled as verified by migration. Invite-accepted users are treated as verified because the invite itself is a trust gate.

## Sessions

- Auth sessions use secure HTTP-only cookies.
- Production session cookies use the `__Secure-` prefix and require HTTPS.
- Session max age is 8 hours with a 15-minute update window.
- Password reset deletes persisted sessions for the reset user when the session store supports it.

## MFA Groundwork

- User records include MFA lifecycle fields, but MFA enforcement is intentionally deferred.
- Future MFA enforcement should gate session issuance after password validation and before workspace access is granted.

## Delivery

Token delivery depends on the deployment email provider. The product routes and one-time token store are implemented; production deployments must connect the request flow to a mailer before enabling public self-service reset/verification.
