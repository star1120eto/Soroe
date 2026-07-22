// soroe-technology-stack-evaluation.md 6章: 「Provider interface + Resend等を
// deliverability PoCで決定」。Providerを差し替え可能にし、domain層はSDKへ
// 直結しない。実プロバイダ未選定のため、開発用にログ出力する実装を既定にする。
export interface EmailProvider {
  sendOtpEmail(to: string, code: string): Promise<void>;
}

export class ConsoleEmailProvider implements EmailProvider {
  async sendOtpEmail(to: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[ConsoleEmailProvider] OTP for ${to}: ${code}`);
  }
}
