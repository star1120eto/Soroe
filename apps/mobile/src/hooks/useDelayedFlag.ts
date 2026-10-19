import { useEffect, useState } from 'react';

// trueがdelayMs以上続いたときだけtrueを返す(falseへは即座に戻す)。
// 一瞬で終わる状態(保存がサーバーへ届くまでの数十ms)を画面に出すと、表示が
// ちらついて内容が押し下げられるため、長く続く場合(オフライン等)だけ見せる。
export function useDelayedFlag(flag: boolean, delayMs: number): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!flag) {
      return;
    }
    const timer = setTimeout(() => setDelayed(true), delayMs);
    return () => {
      clearTimeout(timer);
      setDelayed(false);
    };
  }, [flag, delayMs]);

  return flag && delayed;
}
