const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-zA-Z0-9._-]+$/;

const DEFAULT_FALLBACK =
	"We couldn't complete that request. Please try again.";

const CODE_MESSAGES: Record<string, string> = {
	invalid_credentials: "Invalid email or password.",
	user_not_found: "We couldn't find an account with that email.",
	account_already_exists: "An account already exists for that email.",
	account_exists: "An account already exists for that email.",
	password_too_short: "Choose a longer password (at least 8 characters).",
	rate_limited: "Too many attempts. Wait a moment and try again.",
};

const TEXT_PATTERNS: Array<{ regex: RegExp; message: string }> = [
	{
		regex: /invalid (email|password)|invalid credentials|incorrect password/i,
		message: "Invalid email or password.",
	},
	{
		regex: /(user|account).*(not found|doesn't exist|no user)/i,
		message: "We couldn't find an account with that email.",
	},
	{
		regex: /(already|existing).*(account|user|email)|duplicate/i,
		message: "An account already exists for that email.",
	},
	{
		regex: /password.*(short|length)/i,
		message: "Choose a longer password (at least 8 characters).",
	},
	{
		regex: /(too many|rate|throttle)/i,
		message: "Too many attempts. Wait a moment and try again.",
	},
];

const NESTED_ERROR_KEYS = ["error", "body", "data", "details", "response"];

export type AuthMode = "signIn" | "signUp";

export type AuthFormValues = {
	email: string;
	password: string;
	username?: string | null;
};

export type SanitizedAuthValues = {
	email: string;
	password: string;
	username?: string;
};

export type AuthValidationResult =
	| { ok: true; values: SanitizedAuthValues }
	| { ok: false; error: string };

export type UsernameValidationResult =
	| { ok: true; value: string }
	| { ok: false; error: string };

type ErrorParts = {
	code?: string;
	status?: number;
	message?: string;
};

export function validateAuthForm(
	mode: AuthMode,
	values: AuthFormValues
): AuthValidationResult {
	const email = values.email.trim().toLowerCase();
	if (!email || !emailPattern.test(email)) {
		return { ok: false, error: "Enter a valid email address." };
	}

	const password = values.password ?? "";
	if (!password.trim()) {
		return { ok: false, error: "Enter your password." };
	}

	if (mode === "signUp" && password.length < 8) {
		return {
			ok: false,
			error: "Choose a password that's at least 8 characters long.",
		};
	}

	let username: string | undefined;
	if (mode === "signUp") {
		const usernameResult = validateUsername(values.username);
		if (!usernameResult.ok) {
			return usernameResult;
		}
		username = usernameResult.value;
	}

	return {
		ok: true,
		values: {
			email,
			password,
			...(mode === "signUp" && username ? { username } : {}),
		},
	};
}

export function validateUsername(
	input: string | null | undefined
): UsernameValidationResult {
	const username = (input ?? "").trim();
	if (!username) {
		return {
			ok: false,
			error: "Pick a username so we know what to call you.",
		};
	}
	if (username.length < 3) {
		return {
			ok: false,
			error: "Usernames need at least 3 characters.",
		};
	}
	if (username.length > 32) {
		return {
			ok: false,
			error: "Usernames can be up to 32 characters long.",
		};
	}
	if (!usernamePattern.test(username)) {
		return {
			ok: false,
			error:
				"Usernames can only use letters, numbers, dots, underscores, and hyphens.",
		};
	}

	return { ok: true, value: username };
}

export function extractResultError(result: unknown): unknown {
	if (!result || typeof result !== "object") {
		return null;
	}

	if (Array.isArray(result)) {
		for (const entry of result) {
			const nested = extractResultError(entry);
			if (nested) {
				return nested;
			}
		}
		return null;
	}

	const record = result as Record<string, unknown>;
	if ("error" in record && record.error) {
		return record.error;
	}

	return null;
}

export function friendlyAuthError(
	error: unknown,
	fallback = DEFAULT_FALLBACK
): string {
	const parts = collectErrorParts(error, new Set<object>());

	const fromCode = parts.code ? messageFromCode(parts.code) : undefined;
	if (fromCode) {
		return fromCode;
	}

	const fromStatus = parts.status ? messageFromStatus(parts.status) : undefined;
	if (fromStatus) {
		return fromStatus;
	}

	if (parts.message) {
		const fromMessage = messageFromText(parts.message);
		return fromMessage ?? parts.message;
	}

	return fallback;
}

function messageFromCode(code: string): string | undefined {
	if (!code) {
		return undefined;
	}

	const normalized = code.toLowerCase().replace(/[^a-z0-9]+/g, "_");
	return CODE_MESSAGES[normalized];
}

function messageFromStatus(status: number): string | undefined {
	if (status === 401 || status === 403) {
		return "Invalid email or password.";
	}
	if (status === 404) {
		return "We couldn't find an account with that email.";
	}
	if (status === 409) {
		return "An account already exists for that email.";
	}
	if (status === 429) {
		return "Too many attempts. Wait a moment and try again.";
	}
	return undefined;
}

function messageFromText(text: string): string | undefined {
	const normalized = text.trim();
	if (!normalized) {
		return undefined;
	}

	for (const pattern of TEXT_PATTERNS) {
		if (pattern.regex.test(normalized)) {
			return pattern.message;
		}
	}

	return undefined;
}

function collectErrorParts(source: unknown, seen: Set<object>): ErrorParts {
	const parts: ErrorParts = {};

	if (source == null) {
		return parts;
	}

	if (typeof source === "string") {
		return { message: source };
	}

	if (typeof source === "number") {
		return { status: Number.isFinite(source) ? source : undefined };
	}

	if (source instanceof Error) {
		parts.message = source.message;
	}

	if (typeof source !== "object") {
		return parts;
	}

	const reference = source as Record<string, unknown>;
	if (seen.has(reference)) {
		return parts;
 	}
	seen.add(reference);

	if (Array.isArray(source)) {
		for (const entry of source) {
			mergeErrorParts(parts, collectErrorParts(entry, seen));
		}
		return parts;
	}

	if (typeof reference.message === "string" && !parts.message) {
		parts.message = reference.message;
	}
	if (typeof reference.code === "string" && !parts.code) {
		parts.code = reference.code;
	}
	if (typeof reference.status === "number" && !parts.status) {
		parts.status = reference.status;
	}
	if (typeof reference.statusCode === "number" && !parts.status) {
		parts.status = reference.statusCode;
	}
	if (typeof reference.reason === "string" && !parts.message) {
		parts.message = reference.reason;
	}

	if (
		"response" in reference &&
		reference.response &&
		typeof reference.response === "object"
	) {
		const response = reference.response as Record<string, unknown>;
		if (typeof response.status === "number" && !parts.status) {
			parts.status = response.status;
		}
		if (typeof response.statusText === "string" && !parts.message) {
			parts.message = response.statusText;
		}
	}

	for (const key of NESTED_ERROR_KEYS) {
		if (key in reference) {
			const nested = reference[key];
			if (nested != null) {
				mergeErrorParts(parts, collectErrorParts(nested, seen));
			}
		}
	}

	return parts;
}

function mergeErrorParts(target: ErrorParts, incoming: ErrorParts) {
	if (!target.code && incoming.code) {
		target.code = incoming.code;
	}
	if (!target.status && incoming.status) {
		target.status = incoming.status;
	}
	if (!target.message && incoming.message) {
		target.message = incoming.message;
	}
}
