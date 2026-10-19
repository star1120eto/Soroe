import functions from '@react-native-firebase/functions';
import {
  createListFromTemplateResponseSchema,
  saveMyTemplateResponseSchema,
  type CreateListFromTemplateRequest,
  type CreateListFromTemplateResponse,
  type SaveMyTemplateRequest,
  type SaveMyTemplateResponse,
} from '@soroe/shared';

// マイテンプレートの保存と、テンプレートからのリスト作成のCallable Functions(オンライン必須)。
// 上限・冪等性の判定をクライアントに持たせないため、Functions経由にする。
// ネイティブとWebで共通(RN Firebaseのfunctionsはweb実装を持つ)。

export async function saveMyTemplate(request: SaveMyTemplateRequest): Promise<SaveMyTemplateResponse> {
  const callable = functions().httpsCallable<SaveMyTemplateRequest, SaveMyTemplateResponse>('saveMyTemplate');
  const result = await callable(request);
  return saveMyTemplateResponseSchema.parse(result.data);
}

export async function createListFromTemplate(
  request: CreateListFromTemplateRequest
): Promise<CreateListFromTemplateResponse> {
  const callable = functions().httpsCallable<CreateListFromTemplateRequest, CreateListFromTemplateResponse>(
    'createListFromTemplate'
  );
  const result = await callable(request);
  return createListFromTemplateResponseSchema.parse(result.data);
}
