import { getRandomBytes } from 'expo-crypto';
import { INVITE_TOKEN_BYTES } from '@soroe/shared';

// 招待リンクのドメイン。soroe.appは確定までのプレースホルダ(GitHub Issue #8)。
// 確定後はapp.config.tsのassociatedDomains/intentFiltersと合わせて更新する。
const INVITE_LINK_BASE = 'https://soroe.app/invite';

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 招待トークンを端末のCSPRNGで生成する(256bit、hex 64文字)。サーバーはSHA-256だけを
 * 保存し平文を持たない。このトークンがcreateInviteの冪等性キーも兼ねるため、
 * 共有ボタンを押すたびに新しく生成する。
 */
export function generateInviteToken(randomBytes: (byteCount: number) => Uint8Array = getRandomBytes): string {
  return bytesToHex(randomBytes(INVITE_TOKEN_BYTES));
}

export function buildInviteUrl(token: string): string {
  return `${INVITE_LINK_BASE}/${token}`;
}

export function buildInviteShareMessage(listName: string, url: string): string {
  return `「${listName}」に招待されました。参加はこちら:\n${url}`;
}
