// soroe-functional-specification.md 16章「実装前に確定する運用値」で固定済みの値。
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

// バックログAUTH-04の「メール/IP/端末レート制限」に対応する運用値。仕様書に
// 固定値の記載がないため、乱用を防ぐ妥当な初期値として設定し、実測を見て
// 調整する想定(soroe-functional-specification.md 16章と同じ位置づけ)。
export const RATE_LIMIT_WINDOW_MINUTES = 60;
export const RATE_LIMIT_MAX_PER_EMAIL = 5;
export const RATE_LIMIT_MAX_PER_IP = 20;
export const RATE_LIMIT_MAX_PER_DEVICE = 10;
