import type { AiGenerationInput } from "@soroe/shared";

// AI生成の呼び出し口。実際のOpenAIクライアントは別チケットで差し替える。Emulator・CIでは偽の実装を使い、
// 未設定のときは生成を断る(回数は戻る)。
export type AiClientResult = { kind: "ok"; raw: unknown } | { kind: "refusal"; message: string };

export interface AiClient {
  generate(input: AiGenerationInput, options: { model: string; signal: AbortSignal }): Promise<AiClientResult>;
}

export function createUnconfiguredAiClient(): AiClient {
  return {
    async generate() {
      throw new Error("AI client is not configured");
    },
  };
}

export function getAiClient(env: Record<string, string | undefined> = process.env): AiClient {
  return env.AI_CLIENT === "fake" ? createFakeAiClient() : createUnconfiguredAiClient();
}

// ---- 偽の実装(Emulator・CI用)。同じ入力には同じ結果を返す ----

type Base = { ja: string; en: string; quantity: number | null; unitJa: string | null; unitEn: string | null; perPerson: boolean; priority: "essential" | "nice-to-have" };
const b = (ja: string, en: string, quantity: number | null = null, unitJa: string | null = null, unitEn: string | null = null, perPerson = false, priority: Base["priority"] = "essential"): Base => ({ ja, en, quantity, unitJa, unitEn, perPerson, priority });

const BASE_BY_USE_CASE: Record<AiGenerationInput["useCase"], { titleJa: string; titleEn: string; listType: "shopping" | "packing" | "task"; items: Base[] }> = {
  hiking: {
    titleJa: "日帰り登山の持ち物", titleEn: "Day hike packing list", listType: "packing",
    items: [b("水", "Water", 1, "L", "L", true), b("行動食", "Trail snacks", 1, "食", "serving", true), b("地図", "Map"), b("ヘッドライト", "Headlamp", 1, "個", "pcs", true), b("救急セット", "First aid kit"), b("レインウェア", "Rain gear", 1, "着", "set", true), b("帽子", "Hat", 1, "個", "pcs", true, "nice-to-have"), b("モバイルバッテリー", "Power bank", null, null, null, false, "nice-to-have")],
  },
  travel: {
    titleJa: "旅行の持ち物", titleEn: "Trip packing list", listType: "packing",
    items: [b("チケット・予約確認", "Tickets and reservations"), b("財布・現金", "Wallet and cash"), b("スマホ・充電器", "Phone and charger"), b("洗面用具", "Toiletries", 1, "組", "set", true), b("常備薬", "Medicine"), b("折りたたみ傘", "Compact umbrella", null, null, null, false, "nice-to-have"), b("ウェットティッシュ", "Wet wipes", null, null, null, false, "nice-to-have")],
  },
  shopping: {
    titleJa: "買い物リスト", titleEn: "Shopping list", listType: "shopping",
    items: [b("米", "Rice", 1, "kg", "kg", true), b("卵", "Eggs", 2, "個", "pcs", true), b("牛乳", "Milk", 1, "本", "bottle"), b("野菜", "Vegetables", 1, "袋", "bag"), b("肉・魚", "Meat and fish", 1, "パック", "pack", true), b("パン", "Bread", 1, "袋", "bag", false, "nice-to-have")],
  },
  school: {
    titleJa: "学校行事の持ち物", titleEn: "School event checklist", listType: "packing",
    items: [b("お弁当", "Lunch box", 1, "個", "pcs", true), b("水筒", "Water bottle", 1, "本", "pcs", true), b("ハンカチ・ティッシュ", "Handkerchief and tissues", 1, "組", "set", true), b("レジャーシート", "Picnic blanket"), b("名前の記入の確認", "Check the name tags"), b("雨具", "Rain gear", 1, "着", "set", true, "nice-to-have")],
  },
  custom: {
    titleJa: "おでかけの持ち物", titleEn: "Outing checklist", listType: "packing",
    items: [b("飲み物", "Drinks", 1, "本", "bottle", true), b("財布・現金", "Wallet and cash"), b("スマホ・充電器", "Phone and charger"), b("ハンカチ・ティッシュ", "Handkerchief and tissues", 1, "組", "set", true), b("ゴミ袋", "Trash bags", null, null, null, false, "nice-to-have")],
  },
};

function extras(input: AiGenerationInput): Base[] {
  const list: Base[] = [];
  if (input.season === "winter") list.push(b("防寒着", "Warm layer", 1, "着", "pcs", true));
  if (input.season === "summer") list.push(b("日焼け止め", "Sunscreen"), b("虫よけ", "Bug spray", null, null, null, false, "nice-to-have"));
  if (input.season === "spring" || input.season === "autumn") list.push(b("羽織るもの", "Light jacket", 1, "着", "pcs", true, "nice-to-have"));
  if (input.features.includes("rain")) list.push(b("タオル", "Towel", 1, "枚", "pcs", true));
  if (input.features.includes("hot-spring")) list.push(b("入浴セット", "Bath set", 1, "組", "set", true));
  if (input.features.includes("car")) list.push(b("ドライブ用の飲み物", "Drinks for the drive"));
  if (input.features.includes("beginner")) list.push(b("計画の共有", "Share the plan with someone"));
  if (input.ageBands.includes("infant")) list.push(b("おむつ", "Diapers", 4, "枚", "pcs"), b("ミルク・離乳食", "Formula and baby food"));
  if (input.ageBands.includes("preschool")) list.push(b("着替え(子ども)", "Spare clothes for kids", 2, "組", "sets"));
  if (input.nights > 0) list.push(b("着替え", "Change of clothes", input.nights + 1, "組", "sets", true));
  return list;
}

export function createFakeAiClient(): AiClient {
  return {
    async generate(input, { signal }) {
      const notes = input.notes ?? "";
      // テスト用の合言葉(notes): 失敗・拒否・形式不正・遅延・大量を再現する。
      if (notes.includes("FAIL")) {
        throw new Error("fake upstream error");
      }
      if (notes.includes("REFUSE")) {
        return { kind: "refusal", message: "この内容ではリストを作成できません" };
      }
      if (notes.includes("BADFORMAT")) {
        return { kind: "ok", raw: { title: 123, items: "none" } };
      }
      if (notes.includes("SLOW")) {
        await new Promise<void>((_resolve, reject) => {
          if (signal.aborted) reject(new Error("aborted"));
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }

      const en = input.language === "en";
      const base = BASE_BY_USE_CASE[input.useCase];
      const people = input.adults + input.children;
      const items = [...base.items, ...extras(input)].map((item) => ({
        name: en ? item.en : item.ja,
        quantity: item.quantity === null ? null : item.perPerson ? item.quantity * people : item.quantity,
        unit: en ? item.unitEn : item.unitJa,
        category: null,
        reason: null,
        priority: item.priority,
      }));
      if (notes.includes("MANY")) {
        for (let index = 0; index < 100; index += 1) {
          items.push({ name: `追加の項目${index}`, quantity: null, unit: null, category: null, reason: null, priority: "nice-to-have" });
        }
      }

      return {
        kind: "ok",
        raw: {
          title: en ? base.titleEn : base.titleJa,
          listType: base.listType,
          category: null,
          safetyNotice: input.useCase === "hiking",
          items,
        },
      };
    },
  };
}
