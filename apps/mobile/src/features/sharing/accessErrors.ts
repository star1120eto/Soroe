// 削除・退出でmembers/{uid}が消えると、購読中の端末はFirestoreから
// permission-deniedを受け取り購読が終了する(SHARE-004「権限喪失後は購読できない」)。
// 通信断などの一時エラーと区別し、「アクセスできなくなりました」を出すために使う。
export function isAccessDeniedError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === 'firestore/permission-denied' || code === 'permission-denied';
}
