/**
 * Natural-language cues used to decide whether the media MCPs should be
 * exposed to the model for the current conversation.
 *
 * Keep this separate from claude-client.ts so the gate can be tested without
 * importing the SDK client (which has substantial runtime side effects).
 */
export const MEDIA_INTENT_KEYWORDS = /生成图片|(?:生成|做|画|绘制|创作|制作)(?:一张|一幅|一个|个)?\s*[\s\S]{0,20}(?:图|图片|图像|插画|头像|海报|壁纸|照片|素材|封面|图标|logo|标志|banner)|画一|保存.*素材|(?:导入|保存|归档).*?(?:图片|图像|视频|音频|素材)|import.*(?:library|media|image|asset)|save.*(?:library|media|image|asset)|codepilot_(?:import_media|generate_image)|\b(?:generate|create|draw|render|make)\b[\s\S]{0,60}\b(?:image|picture|illustration|portrait|poster|wallpaper|photo|artwork|avatar|logo|icon|banner)\b/i;

/** Decide whether media import or image-generation tools are useful here. */
export function promptNeedsMediaMcp(
  prompt: string,
  conversationHistory?: ReadonlyArray<{ content: string }>,
): boolean {
  if (MEDIA_INTENT_KEYWORDS.test(prompt)) return true;
  if (conversationHistory?.some((message) => MEDIA_INTENT_KEYWORDS.test(message.content))) return true;
  return false;
}
