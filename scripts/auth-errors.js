// Backend error text in the site language. Keys are the exact English `detail` strings from backend/main.py and
// backend/auth.py (a test diffs them). Unknown details show as received. The backend itself is unchanged.
import { t } from "/scripts/i18n.js";

export const BACKEND_ERRORS = {
  "Invalid or expired token": `errors.invalidToken`,
  "Account with this username or email already exists": `errors.accountExists`,
  "Account with this username or email doesn't exist": `errors.accountMissing`,
  "Password is incorrect": `errors.passwordIncorrect`,
  "Confirm password is incorrect": `errors.confirmPasswordIncorrect`,
  "Username or email is already taken": `errors.alreadyTaken`,
  "Finish the previous target first": `errors.finishPrevious`,
  "Invalid local_date": `errors.invalidDate`,
  "local_date is too far from the server date": `errors.dateTooFar`,
  "Too many events, slow down": `errors.tooManyEvents`,
};

export function mapBackendError(detail) {
    const key = BACKEND_ERRORS[detail];
    return key ? t(key) : detail;
}

// Turns a backend error response into a readable message in the site language
export function getErrorMessage(data) {
    // Errors raised with HTTPException are already strings
    if (typeof data.detail === `string`) return mapBackendError(data.detail);

    // Pydantic validation errors are a list, so use the first failed field
    if (Array.isArray(data.detail) && data.detail.length > 0) {
        const loc = data.detail[0].loc;
        const field = String(loc[loc.length - 1]);

        if (field.includes(`email`)) return t(`errors.invalidEmail`);
        if (field.includes(`username`)) return t(`errors.invalidUsername`);
        if (field.includes(`password`)) return t(`errors.needPassword`);
    }

    return t(`errors.generic`);
}
