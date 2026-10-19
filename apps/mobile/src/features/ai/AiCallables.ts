import functions from '@react-native-firebase/functions';
import {
  cancelGenerationResponseSchema,
  generateListResponseSchema,
  getAiQuotaResponseSchema,
  rateAiResultResponseSchema,
  saveAiResultResponseSchema,
  type AiQuota,
  type CancelGenerationRequest,
  type CancelGenerationResponse,
  type GenerateListRequest,
  type GenerateListResponse,
  type RateAiResultRequest,
  type RateAiResultResponse,
  type SaveAiResultRequest,
  type SaveAiResultResponse,
} from '@soroe/shared';

// AI生成のCallable Functions(オンライン必須)。回数・上限・冪等性の判定をクライアントに持たせないため、
// すべてFunctions経由にする。ネイティブとWebで共通(RN Firebaseのfunctionsはweb実装を持つ)。

export async function generateList(request: GenerateListRequest): Promise<GenerateListResponse> {
  const callable = functions().httpsCallable<GenerateListRequest, GenerateListResponse>('generateList');
  return generateListResponseSchema.parse((await callable(request)).data);
}

export async function cancelGeneration(request: CancelGenerationRequest): Promise<CancelGenerationResponse> {
  const callable = functions().httpsCallable<CancelGenerationRequest, CancelGenerationResponse>('cancelGeneration');
  return cancelGenerationResponseSchema.parse((await callable(request)).data);
}

export async function getAiQuota(): Promise<AiQuota> {
  const callable = functions().httpsCallable<undefined, AiQuota>('getAiQuota');
  return getAiQuotaResponseSchema.parse((await callable()).data);
}

export async function saveAiResult(request: SaveAiResultRequest): Promise<SaveAiResultResponse> {
  const callable = functions().httpsCallable<SaveAiResultRequest, SaveAiResultResponse>('saveAiResult');
  return saveAiResultResponseSchema.parse((await callable(request)).data);
}

export async function rateAiResult(request: RateAiResultRequest): Promise<RateAiResultResponse> {
  const callable = functions().httpsCallable<RateAiResultRequest, RateAiResultResponse>('rateAiResult');
  return rateAiResultResponseSchema.parse((await callable(request)).data);
}
